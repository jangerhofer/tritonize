import { Schema } from 'effect'
import type { EditorDocument, PipelineNode } from '@/editor/types/domain'
import {
  EditorDocumentSchema,
  PersistedDocumentSchema,
  PersistedNodeSchema,
  PipelineNodeSchema,
} from '@/editor/types/schemas'
import { decodeUnknownEither, decodeUnknownSync } from '@/editor/types/schema_tools'

const EditorDocumentV0Schema = Schema.Struct({
  id: EditorDocumentSchema.fields.id,
  version: Schema.Literal(1),
  sourceAssetId: EditorDocumentSchema.fields.sourceAssetId,
  width: EditorDocumentSchema.fields.width,
  height: EditorDocumentSchema.fields.height,
  rootNodeId: EditorDocumentSchema.fields.rootNodeId,
  headNodeId: EditorDocumentSchema.fields.headNodeId,
  branches: EditorDocumentSchema.fields.branches,
  createdAt: EditorDocumentSchema.fields.createdAt,
  updatedAt: EditorDocumentSchema.fields.updatedAt,
})

const PersistedDocumentV0Schema = Schema.Struct({
  schemaVersion: Schema.Literal(0),
  document: EditorDocumentV0Schema,
})

const PersistedNodeV0Schema = Schema.Struct({
  schemaVersion: Schema.Literal(0),
  node: PipelineNodeSchema,
  docId: PersistedNodeSchema.fields.docId,
})

export type PersistedDocumentV1 = Schema.Schema.Type<typeof PersistedDocumentSchema>
export type PersistedNodeV1 = Schema.Schema.Type<typeof PersistedNodeSchema>

export function migratePersistedDocument(input: unknown): PersistedDocumentV1 {
  const asV1 = decodeUnknownEither(PersistedDocumentSchema, input)
  if (asV1.ok) {
    return asV1.value
  }

  const asV0 = decodeUnknownEither(PersistedDocumentV0Schema, input)
  if (asV0.ok) {
    return {
      schemaVersion: 1,
      document: {
        ...asV0.value.document,
        colorSpace: 'srgb',
      },
    }
  }

  throw new Error(
    `Unable to migrate persisted document to v1: ${asV1.error}; ${asV0.ok ? '' : asV0.error}`
  )
}

export function migratePersistedNode(input: unknown): PersistedNodeV1 {
  const asV1 = decodeUnknownEither(PersistedNodeSchema, input)
  if (asV1.ok) {
    return asV1.value
  }

  const asV0 = decodeUnknownEither(PersistedNodeV0Schema, input)
  if (asV0.ok) {
    return {
      schemaVersion: 1,
      node: asV0.value.node,
      docId: asV0.value.docId,
    }
  }

  throw new Error(
    `Unable to migrate persisted node to v1: ${asV1.error}; ${asV0.ok ? '' : asV0.error}`
  )
}

export function toPersistedDocument(document: EditorDocument): PersistedDocumentV1 {
  return decodeUnknownSync(PersistedDocumentSchema, {
    schemaVersion: 1,
    document,
  })
}

export function toPersistedNode(docId: EditorDocument['id'], node: PipelineNode): PersistedNodeV1 {
  return decodeUnknownSync(PersistedNodeSchema, {
    schemaVersion: 1,
    docId,
    node,
  })
}
