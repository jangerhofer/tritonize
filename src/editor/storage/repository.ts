import { createEditorGraphState, type EditorGraphState } from '@/editor/domain/history'
import type { AssetId, DocId, NodeId, PipelineNode } from '@/editor/types/domain'
import { createAssetId } from '@/editor/domain/ids'
import { openEditorDB } from './db'
import {
  migratePersistedDocument,
  migratePersistedNode,
  toPersistedDocument,
  toPersistedNode,
} from './migrations'

export interface LoadResult {
  readonly state: EditorGraphState
  readonly recovered: boolean
  readonly recoveryReason?: string
}

interface PersistedAssetRecord {
  readonly assetId: AssetId
  readonly schemaVersion: 1
  readonly blob: Blob
  readonly createdAt: number
}

function normalizeGraph(
  state: EditorGraphState,
  rawNodes: readonly PipelineNode[]
): LoadResult {
  const candidateNodes = new Map<NodeId, PipelineNode>()

  for (const node of rawNodes) {
    candidateNodes.set(node.id, node)
  }

  const rootNode = candidateNodes.get(state.document.rootNodeId)
  if (!rootNode) {
    return {
      state: createEditorGraphState({
        assetId: state.document.sourceAssetId,
        width: state.document.width,
        height: state.document.height,
        now: Date.now(),
        docId: state.document.id,
      }),
      recovered: true,
      recoveryReason: 'Root node was corrupt or missing. Document was reset.',
    }
  }

  const pruned = new Map<NodeId, PipelineNode>()
  pruned.set(rootNode.id, rootNode)

  let changed = false
  let progressed = true

  while (progressed) {
    progressed = false
    for (const node of candidateNodes.values()) {
      if (pruned.has(node.id)) {
        continue
      }

      if (node.parentId === null || pruned.has(node.parentId)) {
        pruned.set(node.id, node)
        progressed = true
      }
    }
  }

  if (pruned.size !== candidateNodes.size) {
    changed = true
  }

  let headNodeId = state.document.headNodeId
  if (!pruned.has(headNodeId)) {
    headNodeId = state.document.rootNodeId
    changed = true
  }

  const nextState: EditorGraphState = {
    ...state,
    document: {
      ...state.document,
      headNodeId,
    },
    nodes: pruned,
  }

  if (changed) {
    return {
      state: nextState,
      recovered: true,
      recoveryReason:
        'Invalid nodes were removed and head was recovered to a valid ancestor.',
    }
  }

  return {
    state: nextState,
    recovered: false,
  }
}

export class EditorRepository {
  async saveGraphState(state: EditorGraphState): Promise<void> {
    const db = await openEditorDB()

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['documents', 'nodes'], 'readwrite')

      tx.objectStore('documents').put({
        id: state.document.id,
        ...toPersistedDocument(state.document),
      })

      const nodesStore = tx.objectStore('nodes')
      for (const node of state.nodes.values()) {
        nodesStore.put(toPersistedNode(state.document.id, node))
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async loadGraphState(docId: DocId): Promise<LoadResult | null> {
    const db = await openEditorDB()

    const persistedDocument = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(['documents'], 'readonly')
      const request = tx.objectStore('documents').get(docId)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    if (!persistedDocument) {
      return null
    }

    const migratedDocument = migratePersistedDocument(persistedDocument)

    const persistedNodes = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(['nodes'], 'readonly')
      const index = tx.objectStore('nodes').index('docId')
      const request = index.getAll(docId)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    const nodes = persistedNodes.map((entry) => migratePersistedNode(entry).node)
    const graphState: EditorGraphState = {
      document: migratedDocument.document,
      nodes: new Map(nodes.map((node) => [node.id, node])),
      redoStack: [],
    }

    return normalizeGraph(graphState, nodes)
  }

  async saveAsset(assetId: AssetId, blob: Blob): Promise<void> {
    const db = await openEditorDB()

    const record: PersistedAssetRecord = {
      assetId,
      schemaVersion: 1,
      blob,
      createdAt: Date.now(),
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['assets'], 'readwrite')
      tx.objectStore('assets').put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async loadAsset(assetId: AssetId): Promise<Blob | null> {
    const db = await openEditorDB()

    const result = await new Promise<PersistedAssetRecord | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(['assets'], 'readonly')
        const request = tx.objectStore('assets').get(assetId)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }
    )

    return result?.blob ?? null
  }

  async createEmptyDocument(width: number, height: number): Promise<EditorGraphState> {
    return createEditorGraphState({
      assetId: createAssetId(),
      width,
      height,
      now: Date.now(),
    })
  }
}
