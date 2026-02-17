import { describe, expect, it } from 'vitest'
import { migratePersistedDocument, migratePersistedNode } from './migrations'

describe('storage migrations', () => {
  it('migrates v0 persisted document to v1', () => {
    const migrated = migratePersistedDocument({
      schemaVersion: 0,
      document: {
        id: 'doc_1',
        version: 1,
        sourceAssetId: 'asset_1',
        width: 1024,
        height: 768,
        rootNodeId: 'node_root',
        headNodeId: 'node_head',
        branches: {},
        createdAt: 1,
        updatedAt: 1,
      },
    })

    expect(migrated.schemaVersion).toBe(1)
    expect(migrated.document.colorSpace).toBe('srgb')
  })

  it('keeps v1 persisted node stable', () => {
    const migrated = migratePersistedNode({
      schemaVersion: 1,
      docId: 'doc_1',
      node: {
        id: 'node_1',
        parentId: null,
        op: {
          type: 'rotate',
          params: {
            degrees: 0,
          },
        },
        createdAt: 123,
      },
    })

    expect(migrated.schemaVersion).toBe(1)
    expect(migrated.node.op.type).toBe('rotate')
  })

  it('throws for unknown persisted formats', () => {
    expect(() => {
      migratePersistedDocument({ schemaVersion: 99 })
    }).toThrowError()
  })
})
