import { Schema } from 'effect'

const ChannelSchema = Schema.Int.pipe(
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(255)
)

export const RGBSchema = Schema.Tuple(
  ChannelSchema,
  ChannelSchema,
  ChannelSchema
)

export const DocIdSchema = Schema.String.pipe(Schema.brand('DocId'))
export const NodeIdSchema = Schema.String.pipe(Schema.brand('NodeId'))
export const AssetIdSchema = Schema.String.pipe(Schema.brand('AssetId'))
export const JobIdSchema = Schema.String.pipe(Schema.brand('JobId'))

const NumericAdjustmentSchema = Schema.Struct({
  value: Schema.Number,
})

export const TritonizerOperationSchema = Schema.Struct({
  type: Schema.Literal('tritonizer'),
  params: Schema.Struct({
    colors: Schema.Array(RGBSchema).pipe(
      Schema.minItems(2),
      Schema.maxItems(16)
    ),
    sigmoidMidpoint: Schema.Number,
    sigmoidStrength: Schema.Number,
  }),
})

export const ExposureOperationSchema = Schema.Struct({
  type: Schema.Literal('exposure'),
  params: NumericAdjustmentSchema,
})

export const ContrastOperationSchema = Schema.Struct({
  type: Schema.Literal('contrast'),
  params: NumericAdjustmentSchema,
})

export const SaturationOperationSchema = Schema.Struct({
  type: Schema.Literal('saturation'),
  params: NumericAdjustmentSchema,
})

export const VibranceOperationSchema = Schema.Struct({
  type: Schema.Literal('vibrance'),
  params: NumericAdjustmentSchema,
})

export const TemperatureOperationSchema = Schema.Struct({
  type: Schema.Literal('temperature'),
  params: NumericAdjustmentSchema,
})

export const TintOperationSchema = Schema.Struct({
  type: Schema.Literal('tint'),
  params: NumericAdjustmentSchema,
})

export const BlurOperationSchema = Schema.Struct({
  type: Schema.Literal('blur'),
  params: Schema.Struct({
    radius: Schema.Number.pipe(Schema.greaterThanOrEqualTo(0)),
  }),
})

export const CropOperationSchema = Schema.Struct({
  type: Schema.Literal('crop'),
  params: Schema.Struct({
    x: Schema.Number.pipe(Schema.greaterThanOrEqualTo(0)),
    y: Schema.Number.pipe(Schema.greaterThanOrEqualTo(0)),
    width: Schema.Number.pipe(Schema.greaterThanOrEqualTo(1)),
    height: Schema.Number.pipe(Schema.greaterThanOrEqualTo(1)),
  }),
})

export const RotateOperationSchema = Schema.Struct({
  type: Schema.Literal('rotate'),
  params: Schema.Struct({
    degrees: Schema.Literal(0, 90, 180, 270),
  }),
})

export const OperationSchema = Schema.Union(
  TritonizerOperationSchema,
  ExposureOperationSchema,
  ContrastOperationSchema,
  SaturationOperationSchema,
  VibranceOperationSchema,
  TemperatureOperationSchema,
  TintOperationSchema,
  BlurOperationSchema,
  CropOperationSchema,
  RotateOperationSchema
)

export const PipelineNodeSchema = Schema.Struct({
  id: NodeIdSchema,
  parentId: Schema.NullOr(NodeIdSchema),
  op: OperationSchema,
  createdAt: Schema.Number,
})

export const BranchesSchema = Schema.Record({
  key: Schema.String,
  value: NodeIdSchema,
})

export const EditorDocumentSchema = Schema.Struct({
  id: DocIdSchema,
  version: Schema.Literal(1),
  sourceAssetId: AssetIdSchema,
  width: Schema.Number.pipe(Schema.greaterThanOrEqualTo(1)),
  height: Schema.Number.pipe(Schema.greaterThanOrEqualTo(1)),
  colorSpace: Schema.Literal('srgb'),
  rootNodeId: NodeIdSchema,
  headNodeId: NodeIdSchema,
  branches: BranchesSchema,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
})

export const PersistedDocumentSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  document: EditorDocumentSchema,
})

export const PersistedNodeSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  node: PipelineNodeSchema,
  docId: DocIdSchema,
})

export const MetadataPolicySchema = Schema.Literal(
  'strip',
  'preserve-when-possible'
)

export const ExportFormatSchema = Schema.Literal(
  'jpeg',
  'png',
  'webp',
  'avif',
  'tiff'
)

export const ExportOptionsSchema = Schema.Struct({
  format: ExportFormatSchema,
  quality: Schema.optionalWith(Schema.Number.pipe(Schema.between(0, 1)), {
    exact: true,
  }),
  chromaSubsampling: Schema.optionalWith(Schema.Literal('420', '444'), {
    exact: true,
  }),
  colorProfile: Schema.Literal('srgb'),
  metadataPolicy: MetadataPolicySchema,
  targetLongEdge: Schema.optionalWith(
    Schema.Number.pipe(Schema.greaterThanOrEqualTo(1)),
    {
      exact: true,
    }
  ),
})

export const RenderStatsSchema = Schema.Struct({
  elapsedMs: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  backend: Schema.Literal('webgl2', 'webgl2-fallback', 'canvas2d'),
})
