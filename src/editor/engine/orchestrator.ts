import type { AssetId, ExportOptions, JobId, PipelineNode } from '@/editor/types/domain'
import { EditorEngineClient, type ExportResult, type PreviewResult } from './worker/client'

export interface PreviewJobRequest {
  readonly assetId: AssetId
  readonly nodePath: readonly PipelineNode[]
  readonly width: number
  readonly height: number
  readonly zoom: number
  readonly panX: number
  readonly panY: number
}

export interface ExportJobRequest {
  readonly assetId: AssetId
  readonly nodePath: readonly PipelineNode[]
  readonly exportOptions: ExportOptions
}

export class EditorRenderOrchestrator {
  private readonly client: EditorEngineClient
  private activePreviewJobId: JobId | null = null
  private exportChain: Promise<ExportResult | null> = Promise.resolve(null)

  constructor(client?: EditorEngineClient) {
    this.client = client ?? new EditorEngineClient()
  }

  init(maxTextureSizeHint?: number): Promise<void> {
    return this.client.init(maxTextureSizeHint)
  }

  async loadAsset(assetId: AssetId, blob: Blob): Promise<void> {
    await this.client.loadAsset(assetId, blob)
    await this.client.buildPreviewPyramid(assetId)
  }

  async renderPreview(request: PreviewJobRequest): Promise<PreviewResult> {
    if (this.activePreviewJobId) {
      this.client.cancelJob(this.activePreviewJobId)
    }

    const result = await this.client.renderPreview(request)
    this.activePreviewJobId = result.jobId
    return result
  }

  queueExport(request: ExportJobRequest): Promise<ExportResult> {
    const next = this.exportChain.then(() => this.client.renderExport(request))
    this.exportChain = next.then((result) => result)
    return next
  }

  cancelPreview(): void {
    if (!this.activePreviewJobId) {
      return
    }

    this.client.cancelJob(this.activePreviewJobId)
    this.activePreviewJobId = null
  }

  async disposeAsset(assetId: AssetId): Promise<void> {
    await this.client.disposeAsset(assetId)
  }

  dispose(): void {
    this.client.dispose()
  }
}
