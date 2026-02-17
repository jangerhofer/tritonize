import {
  AssetIdSchema,
  DocIdSchema,
  JobIdSchema,
  NodeIdSchema,
} from '@/editor/types/schemas'
import { decodeUnknownSync } from '@/editor/types/schema_tools'
import type { AssetId, DocId, JobId, NodeId } from '@/editor/types/domain'

function randomId(prefix: string): string {
  const random =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`

  return `${prefix}_${random}`
}

export function createDocId(seed?: string): DocId {
  return decodeUnknownSync(DocIdSchema, seed ?? randomId('doc'))
}

export function createNodeId(seed?: string): NodeId {
  return decodeUnknownSync(NodeIdSchema, seed ?? randomId('node'))
}

export function createAssetId(seed?: string): AssetId {
  return decodeUnknownSync(AssetIdSchema, seed ?? randomId('asset'))
}

export function createJobId(seed?: string): JobId {
  return decodeUnknownSync(JobIdSchema, seed ?? randomId('job'))
}
