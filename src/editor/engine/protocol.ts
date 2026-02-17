import { Schema } from 'effect'
import {
  AssetIdSchema,
  ExportOptionsSchema,
  JobIdSchema,
  PipelineNodeSchema,
  RenderStatsSchema,
} from '@/editor/types/schemas'

const ViewportSchema = Schema.Struct({
  zoom: Schema.Number,
  panX: Schema.Number,
  panY: Schema.Number,
})

const ImageDimensionsSchema = Schema.Struct({
  width: Schema.Number.pipe(Schema.greaterThanOrEqualTo(1)),
  height: Schema.Number.pipe(Schema.greaterThanOrEqualTo(1)),
})

const BitmapPayloadSchema =
  typeof globalThis.ImageBitmap === 'function'
    ? Schema.instanceOf(globalThis.ImageBitmap)
    : Schema.Unknown

const BlobPayloadSchema =
  typeof globalThis.Blob === 'function'
    ? Schema.instanceOf(globalThis.Blob)
    : Schema.Unknown

const InitRequestSchema = Schema.Struct({
  kind: Schema.Literal('init'),
  maxTextureSizeHint: Schema.optionalWith(
    Schema.Number.pipe(Schema.greaterThanOrEqualTo(1)),
    { exact: true }
  ),
})

const LoadAssetRequestSchema = Schema.Struct({
  kind: Schema.Literal('loadAsset'),
  assetId: AssetIdSchema,
  blob: Schema.Unknown,
})

const BuildPreviewPyramidRequestSchema = Schema.Struct({
  kind: Schema.Literal('buildPreviewPyramid'),
  assetId: AssetIdSchema,
})

const RenderPreviewRequestSchema = Schema.Struct({
  kind: Schema.Literal('renderPreview'),
  jobId: JobIdSchema,
  assetId: AssetIdSchema,
  nodePath: Schema.Array(PipelineNodeSchema),
  viewport: ViewportSchema,
  dimensions: ImageDimensionsSchema,
})

const RenderExportRequestSchema = Schema.Struct({
  kind: Schema.Literal('renderExport'),
  jobId: JobIdSchema,
  assetId: AssetIdSchema,
  nodePath: Schema.Array(PipelineNodeSchema),
  exportOptions: ExportOptionsSchema,
})

const CancelJobRequestSchema = Schema.Struct({
  kind: Schema.Literal('cancelJob'),
  jobId: JobIdSchema,
})

const DisposeAssetRequestSchema = Schema.Struct({
  kind: Schema.Literal('disposeAsset'),
  assetId: AssetIdSchema,
})

export const EngineRequestSchemaMap = {
  init: InitRequestSchema,
  loadAsset: LoadAssetRequestSchema,
  buildPreviewPyramid: BuildPreviewPyramidRequestSchema,
  renderPreview: RenderPreviewRequestSchema,
  renderExport: RenderExportRequestSchema,
  cancelJob: CancelJobRequestSchema,
  disposeAsset: DisposeAssetRequestSchema,
} as const

export const EngineRequestSchema = Schema.Union(
  ...Object.values(EngineRequestSchemaMap)
)

const ReadyResponseSchema = Schema.Struct({
  kind: Schema.Literal('ready'),
})

const PreviewCompleteResponseSchema = Schema.Struct({
  kind: Schema.Literal('previewComplete'),
  jobId: JobIdSchema,
  bitmap: BitmapPayloadSchema,
  stats: RenderStatsSchema,
})

const ExportCompleteResponseSchema = Schema.Struct({
  kind: Schema.Literal('exportComplete'),
  jobId: JobIdSchema,
  blob: BlobPayloadSchema,
  stats: RenderStatsSchema,
})

const JobCancelledResponseSchema = Schema.Struct({
  kind: Schema.Literal('jobCancelled'),
  jobId: JobIdSchema,
})

const ErrorResponseSchema = Schema.Struct({
  kind: Schema.Literal('error'),
  code: Schema.String,
  message: Schema.String,
  jobId: Schema.optionalWith(JobIdSchema, { exact: true }),
})

export const EngineResponseSchemaMap = {
  ready: ReadyResponseSchema,
  previewComplete: PreviewCompleteResponseSchema,
  exportComplete: ExportCompleteResponseSchema,
  jobCancelled: JobCancelledResponseSchema,
  error: ErrorResponseSchema,
} as const

export const EngineResponseSchema = Schema.Union(
  ...Object.values(EngineResponseSchemaMap)
)

export type EngineRequestMap = {
  [K in keyof typeof EngineRequestSchemaMap]: Schema.Schema.Type<
    (typeof EngineRequestSchemaMap)[K]
  >
}

export type EngineResponseMap = {
  [K in keyof typeof EngineResponseSchemaMap]: Schema.Schema.Type<
    (typeof EngineResponseSchemaMap)[K]
  >
}

export type EngineRequest = EngineRequestMap[keyof EngineRequestMap]
export type EngineResponse = EngineResponseMap[keyof EngineResponseMap]

export type EngineRequestKind = keyof EngineRequestMap
export type EngineResponseKind = keyof EngineResponseMap
