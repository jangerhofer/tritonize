/// <reference lib="webworker" />

import type { AssetId, JobId, Operation } from '@/editor/types/domain'
import { decodeUnknownEither, decodeUnknownSync } from '@/editor/types/schema_tools'
import {
  EngineRequestSchema,
  EngineResponseSchema,
  type EngineRequest,
  type EngineResponse,
} from '@/editor/engine/protocol'
import { WebGL2Backend } from '@/editor/engine/worker/backends/webgl2_backend'
import { Canvas2DBackend } from '@/editor/engine/worker/backends/canvas2d_backend'
import type { RendererBackend } from '@/editor/engine/worker/backends/backend'
import { renderBitmapToSize } from '@/editor/engine/worker/pipeline'

const workerScope = self as DedicatedWorkerGlobalScope

const assets = new Map<AssetId, ImageBitmap>()
const pyramids = new Map<AssetId, readonly ImageBitmap[]>()
const cancelledJobs = new Set<JobId>()

const webglBackend = new WebGL2Backend()
const fallbackBackend = new Canvas2DBackend()

function selectBackend(): RendererBackend {
  try {
    const canvas = new OffscreenCanvas(1, 1)
    const gl = canvas.getContext('webgl2')
    if (gl) {
      return webglBackend
    }
  } catch {
    // ignore backend probing failures
  }

  return fallbackBackend
}

const backend = selectBackend()

function send(response: EngineResponse, transfer: Transferable[] = []): void {
  const validated = decodeUnknownSync(EngineResponseSchema, response)
  workerScope.postMessage(validated, transfer)
}

function sendReady(): void {
  send({ kind: 'ready' })
}

function sendError(message: string, code: string, jobId?: JobId): void {
  if (jobId) {
    send({ kind: 'error', code, message, jobId })
    return
  }

  send({ kind: 'error', code, message })
}

function ensureAsset(assetId: AssetId): ImageBitmap {
  const source = assets.get(assetId)
  if (!source) {
    throw new Error(`Asset not loaded: ${assetId}`)
  }

  return source
}

function releaseBitmapList(list: readonly ImageBitmap[]): void {
  for (const bitmap of list) {
    bitmap.close()
  }
}

function buildPyramid(source: ImageBitmap): readonly ImageBitmap[] {
  const levels: ImageBitmap[] = [source]
  let current = source

  while (Math.max(current.width, current.height) > 1024) {
    const nextWidth = Math.max(1, Math.floor(current.width / 2))
    const nextHeight = Math.max(1, Math.floor(current.height / 2))
    const level = renderBitmapToSize(current, nextWidth, nextHeight)
    levels.push(level)
    current = level
  }

  return levels
}

function choosePreviewSource(
  assetId: AssetId,
  targetWidth: number,
  targetHeight: number
): ImageBitmap {
  const levels = pyramids.get(assetId)
  if (!levels || levels.length === 0) {
    return ensureAsset(assetId)
  }

  const targetLongEdge = Math.max(targetWidth, targetHeight)
  let candidate = levels[levels.length - 1]
  if (!candidate) {
    return ensureAsset(assetId)
  }

  for (const level of levels) {
    if (Math.max(level.width, level.height) >= targetLongEdge) {
      candidate = level
      continue
    }

    break
  }

  return candidate
}

function operationPathFromRequest(request: {
  readonly nodePath: readonly { readonly op: Operation }[]
}): readonly Operation[] {
  const ops = request.nodePath.map((entry) => entry.op)

  if (
    ops.length > 0 &&
    ops[0]?.type === 'rotate' &&
    ops[0].params.degrees === 0
  ) {
    return ops.slice(1)
  }

  return ops
}

async function handleRequest(request: EngineRequest): Promise<void> {
  switch (request.kind) {
    case 'init': {
      sendReady()
      return
    }
    case 'loadAsset': {
      if (!(request.blob instanceof Blob)) {
        throw new Error('loadAsset requires a Blob payload')
      }

      const bitmap = await createImageBitmap(request.blob)
      const previous = assets.get(request.assetId)
      if (previous) {
        previous.close()
      }

      const previousLevels = pyramids.get(request.assetId)
      if (previousLevels) {
        releaseBitmapList(previousLevels.slice(1))
      }

      assets.set(request.assetId, bitmap)
      pyramids.set(request.assetId, [bitmap])
      sendReady()
      return
    }
    case 'buildPreviewPyramid': {
      const source = ensureAsset(request.assetId)
      const previousLevels = pyramids.get(request.assetId)
      if (previousLevels) {
        releaseBitmapList(previousLevels.slice(1))
      }

      pyramids.set(request.assetId, buildPyramid(source))
      sendReady()
      return
    }
    case 'renderPreview': {
      const source = choosePreviewSource(
        request.assetId,
        request.dimensions.width,
        request.dimensions.height
      )

      const jobId = request.jobId
      const operations = operationPathFromRequest(request)
      const result = await backend.renderPreview({
        source,
        operations,
        targetWidth: request.dimensions.width,
        targetHeight: request.dimensions.height,
        cancelToken: {
          isCancelled: () => cancelledJobs.has(jobId),
        },
      })

      if (cancelledJobs.has(jobId)) {
        cancelledJobs.delete(jobId)
        result.bitmap.close()
        send({ kind: 'jobCancelled', jobId })
        return
      }

      send(
        {
          kind: 'previewComplete',
          jobId,
          bitmap: result.bitmap,
          stats: result.stats,
        },
        [result.bitmap]
      )

      return
    }
    case 'renderExport': {
      const source = ensureAsset(request.assetId)
      const jobId = request.jobId
      const operations = operationPathFromRequest(request)

      const result = await backend.renderExport({
        source,
        operations,
        exportOptions: request.exportOptions,
        cancelToken: {
          isCancelled: () => cancelledJobs.has(jobId),
        },
      })

      if (cancelledJobs.has(jobId)) {
        cancelledJobs.delete(jobId)
        send({ kind: 'jobCancelled', jobId })
        return
      }

      send({
        kind: 'exportComplete',
        jobId,
        blob: result.blob,
        stats: result.stats,
      })

      return
    }
    case 'cancelJob': {
      cancelledJobs.add(request.jobId)
      send({ kind: 'jobCancelled', jobId: request.jobId })
      return
    }
    case 'disposeAsset': {
      const source = assets.get(request.assetId)
      if (source) {
        source.close()
      }

      assets.delete(request.assetId)
      const levels = pyramids.get(request.assetId)
      if (levels) {
        releaseBitmapList(levels.slice(1))
      }
      pyramids.delete(request.assetId)
      sendReady()
      return
    }
    default: {
      const _never: never = request
      throw new Error(`Unhandled request ${( _never as { kind: string }).kind}`)
    }
  }
}

workerScope.onmessage = async (event: MessageEvent<unknown>) => {
  const decoded = decodeUnknownEither(EngineRequestSchema, event.data)

  if (!decoded.ok) {
    sendError(decoded.error, 'E_INVALID_PAYLOAD')
    return
  }

  try {
    await handleRequest(decoded.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker error'
    const withJobId =
      decoded.value.kind === 'renderPreview' || decoded.value.kind === 'renderExport'
        ? decoded.value.jobId
        : undefined

    sendError(message, 'E_ENGINE_RUNTIME', withJobId)
  }
}
