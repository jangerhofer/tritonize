import type { RendererBackend, RenderExportInput, RenderPreviewInput } from './backend'
import {
  applyCanvasOperation,
  bitmapToBlob,
  fitBitmap,
  makeStats,
} from '@/editor/engine/worker/pipeline'

export class Canvas2DBackend implements RendererBackend {
  readonly name = 'canvas2d' as const

  async renderPreview(input: RenderPreviewInput) {
    const startedAt = performance.now()
    let current = input.source

    for (const operation of input.operations) {
      if (input.cancelToken.isCancelled()) {
        break
      }

      const next = applyCanvasOperation(current, operation)
      if (current !== input.source) {
        current.close()
      }
      current = next
    }

    const fitted = fitBitmap(current, input.targetWidth, input.targetHeight)
    if (current !== input.source) {
      current.close()
    }

    const elapsedMs = performance.now() - startedAt
    return {
      bitmap: fitted,
      stats: makeStats(elapsedMs, fitted.width, fitted.height, this.name),
    }
  }

  async renderExport(input: RenderExportInput) {
    const startedAt = performance.now()
    let current = input.source

    for (const operation of input.operations) {
      if (input.cancelToken.isCancelled()) {
        break
      }

      const next = applyCanvasOperation(current, operation)
      if (current !== input.source) {
        current.close()
      }
      current = next
    }

    const blob = await bitmapToBlob(current, input.exportOptions)
    const elapsedMs = performance.now() - startedAt

    if (current !== input.source) {
      current.close()
    }

    return {
      blob,
      stats: makeStats(elapsedMs, input.source.width, input.source.height, this.name),
    }
  }

  dispose(): void {
    // no-op
  }
}
