import type {
  AssetId,
  ExportOptions,
  JobId,
  PipelineNode,
  RenderStats,
} from '@/editor/types/domain'
import { createJobId } from '@/editor/domain/ids'
import { decodeUnknownEither, decodeUnknownSync } from '@/editor/types/schema_tools'
import {
  EngineRequestSchema,
  EngineResponseSchema,
  type EngineResponse,
} from '@/editor/engine/protocol'

interface PendingRenderRequest<T> {
  readonly resolve: (value: T) => void
  readonly reject: (error: Error) => void
}

interface RenderPreviewParams {
  readonly assetId: AssetId
  readonly nodePath: readonly PipelineNode[]
  readonly width: number
  readonly height: number
  readonly zoom: number
  readonly panX: number
  readonly panY: number
}

interface RenderExportParams {
  readonly assetId: AssetId
  readonly nodePath: readonly PipelineNode[]
  readonly exportOptions: ExportOptions
}

export interface PreviewResult {
  readonly jobId: JobId
  readonly bitmap: ImageBitmap
  readonly stats: RenderStats
}

export interface ExportResult {
  readonly jobId: JobId
  readonly blob: Blob
  readonly stats: RenderStats
}

export class EditorEngineClient {
  private readonly worker: Worker
  private readonly pendingReady: Array<{
    readonly resolve: () => void
    readonly reject: (error: Error) => void
  }> = []

  private readonly pendingPreview = new Map<JobId, PendingRenderRequest<PreviewResult>>()
  private readonly pendingExport = new Map<JobId, PendingRenderRequest<ExportResult>>()

  constructor(worker?: Worker) {
    this.worker =
      worker ??
      new Worker(new URL('./entry.ts', import.meta.url), {
        type: 'module',
      })

    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      this.handleMessage(event.data)
    }
  }

  private postMessage(payload: unknown, transfer: Transferable[] = []): void {
    const validated = decodeUnknownSync(EngineRequestSchema, payload)
    this.worker.postMessage(validated, transfer)
  }

  private sendReadyRequest(payload: unknown, transfer: Transferable[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pendingReady.push({ resolve, reject })
      this.postMessage(payload, transfer)
    })
  }

  private handleMessage(message: unknown): void {
    const decoded = decodeUnknownEither(EngineResponseSchema, message)

    if (!decoded.ok) {
      const nextReady = this.pendingReady.shift()
      if (nextReady) {
        nextReady.reject(new Error(decoded.error))
      }
      return
    }

    this.routeResponse(decoded.value)
  }

  private routeResponse(response: EngineResponse): void {
    switch (response.kind) {
      case 'ready': {
        const nextReady = this.pendingReady.shift()
        if (nextReady) {
          nextReady.resolve()
        }
        return
      }
      case 'previewComplete': {
        const pending = this.pendingPreview.get(response.jobId)
        if (!pending) {
          if (response.bitmap instanceof ImageBitmap) {
            response.bitmap.close()
          }
          return
        }

        this.pendingPreview.delete(response.jobId)
        if (!(response.bitmap instanceof ImageBitmap)) {
          pending.reject(new Error('Worker returned invalid bitmap payload'))
          return
        }

        pending.resolve({
          jobId: response.jobId,
          bitmap: response.bitmap,
          stats: response.stats,
        })
        return
      }
      case 'exportComplete': {
        const pending = this.pendingExport.get(response.jobId)
        if (!pending) {
          return
        }

        this.pendingExport.delete(response.jobId)
        if (!(response.blob instanceof Blob)) {
          pending.reject(new Error('Worker returned invalid export blob payload'))
          return
        }

        pending.resolve({
          jobId: response.jobId,
          blob: response.blob,
          stats: response.stats,
        })
        return
      }
      case 'jobCancelled': {
        const preview = this.pendingPreview.get(response.jobId)
        if (preview) {
          this.pendingPreview.delete(response.jobId)
          preview.reject(new Error(`Preview job cancelled: ${response.jobId}`))
        }

        const exportPending = this.pendingExport.get(response.jobId)
        if (exportPending) {
          this.pendingExport.delete(response.jobId)
          exportPending.reject(new Error(`Export job cancelled: ${response.jobId}`))
        }
        return
      }
      case 'error': {
        if (response.jobId) {
          const preview = this.pendingPreview.get(response.jobId)
          if (preview) {
            this.pendingPreview.delete(response.jobId)
            preview.reject(new Error(response.message))
            return
          }

          const exportPending = this.pendingExport.get(response.jobId)
          if (exportPending) {
            this.pendingExport.delete(response.jobId)
            exportPending.reject(new Error(response.message))
            return
          }
        }

        const nextReady = this.pendingReady.shift()
        if (nextReady) {
          nextReady.reject(new Error(response.message))
        }
        return
      }
      default: {
        const neverResponse: never = response
        throw new Error(`Unhandled response ${(neverResponse as { kind: string }).kind}`)
      }
    }
  }

  async init(maxTextureSizeHint?: number): Promise<void> {
    await this.sendReadyRequest({
      kind: 'init',
      maxTextureSizeHint,
    })
  }

  async loadAsset(assetId: AssetId, blob: Blob): Promise<void> {
    await this.sendReadyRequest({
      kind: 'loadAsset',
      assetId,
      blob,
    })
  }

  async buildPreviewPyramid(assetId: AssetId): Promise<void> {
    await this.sendReadyRequest({
      kind: 'buildPreviewPyramid',
      assetId,
    })
  }

  async renderPreview(params: RenderPreviewParams): Promise<PreviewResult> {
    const jobId = createJobId()

    return new Promise((resolve, reject) => {
      this.pendingPreview.set(jobId, { resolve, reject })
      this.postMessage({
        kind: 'renderPreview',
        jobId,
        assetId: params.assetId,
        nodePath: params.nodePath,
        viewport: {
          zoom: params.zoom,
          panX: params.panX,
          panY: params.panY,
        },
        dimensions: {
          width: params.width,
          height: params.height,
        },
      })
    })
  }

  async renderExport(params: RenderExportParams): Promise<ExportResult> {
    const jobId = createJobId()

    return new Promise((resolve, reject) => {
      this.pendingExport.set(jobId, { resolve, reject })
      this.postMessage({
        kind: 'renderExport',
        jobId,
        assetId: params.assetId,
        nodePath: params.nodePath,
        exportOptions: params.exportOptions,
      })
    })
  }

  cancelJob(jobId: JobId): void {
    this.postMessage({
      kind: 'cancelJob',
      jobId,
    })
  }

  async disposeAsset(assetId: AssetId): Promise<void> {
    await this.sendReadyRequest({
      kind: 'disposeAsset',
      assetId,
    })
  }

  dispose(): void {
    this.worker.terminate()
  }
}
