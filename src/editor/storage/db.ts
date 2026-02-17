const DB_NAME = 'tritonizer_editor_v1'
const DB_VERSION = 1

const STORES = {
  documents: 'documents',
  nodes: 'nodes',
  assets: 'assets',
  thumbnails: 'thumbnails',
  sessions: 'sessions',
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

export function getStoreNames(): readonly StoreName[] {
  return Object.values(STORES)
}

export async function openEditorDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error)
    }

    request.onupgradeneeded = () => {
      const db = request.result
      const existing = new Set(Array.from(db.objectStoreNames))

      if (!existing.has(STORES.documents)) {
        db.createObjectStore(STORES.documents, { keyPath: 'id' })
      }

      if (!existing.has(STORES.nodes)) {
        const nodesStore = db.createObjectStore(STORES.nodes, {
          keyPath: ['docId', 'node.id'],
        })
        nodesStore.createIndex('docId', 'docId', { unique: false })
      }

      if (!existing.has(STORES.assets)) {
        db.createObjectStore(STORES.assets, { keyPath: 'assetId' })
      }

      if (!existing.has(STORES.thumbnails)) {
        db.createObjectStore(STORES.thumbnails, { keyPath: 'docId' })
      }

      if (!existing.has(STORES.sessions)) {
        db.createObjectStore(STORES.sessions, { keyPath: 'docId' })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}
