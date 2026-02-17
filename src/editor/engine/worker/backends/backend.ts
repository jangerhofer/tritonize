import type { ExportOptions, Operation, RenderStats } from '@/editor/types/domain'

export interface CancelToken {
  readonly isCancelled: () => boolean
}

export interface RenderPreviewInput {
  readonly source: ImageBitmap
  readonly operations: readonly Operation[]
  readonly targetWidth: number
  readonly targetHeight: number
  readonly cancelToken: CancelToken
}

export interface RenderPreviewResult {
  readonly bitmap: ImageBitmap
  readonly stats: RenderStats
}

export interface RenderExportInput {
  readonly source: ImageBitmap
  readonly operations: readonly Operation[]
  readonly exportOptions: ExportOptions
  readonly cancelToken: CancelToken
}

export interface RenderExportResult {
  readonly blob: Blob
  readonly stats: RenderStats
}

export interface RendererBackend {
  readonly name: RenderStats['backend']
  renderPreview(input: RenderPreviewInput): Promise<RenderPreviewResult>
  renderExport(input: RenderExportInput): Promise<RenderExportResult>
  dispose(): void
}
