import type { Schema } from 'effect'
import {
  AssetIdSchema,
  DocIdSchema,
  EditorDocumentSchema,
  ExportOptionsSchema,
  JobIdSchema,
  NodeIdSchema,
  OperationSchema,
  PipelineNodeSchema,
  RGBSchema,
  RenderStatsSchema,
} from './schemas'

export type RGB = Schema.Schema.Type<typeof RGBSchema>

export type DocId = Schema.Schema.Type<typeof DocIdSchema>
export type NodeId = Schema.Schema.Type<typeof NodeIdSchema>
export type AssetId = Schema.Schema.Type<typeof AssetIdSchema>
export type JobId = Schema.Schema.Type<typeof JobIdSchema>

export type Operation = Schema.Schema.Type<typeof OperationSchema>
export type PipelineNode = Schema.Schema.Type<typeof PipelineNodeSchema>
export type EditorDocument = Schema.Schema.Type<typeof EditorDocumentSchema>
export type ExportOptions = Schema.Schema.Type<typeof ExportOptionsSchema>
export type RenderStats = Schema.Schema.Type<typeof RenderStatsSchema>

export function assertNever(value: never, message: string): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`)
}
