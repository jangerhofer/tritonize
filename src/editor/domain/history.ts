import type {
  AssetId,
  DocId,
  EditorDocument,
  NodeId,
  Operation,
  PipelineNode,
} from '@/editor/types/domain'
import { createDocId, createNodeId } from './ids'

export interface EditorGraphState {
  readonly document: EditorDocument
  readonly nodes: ReadonlyMap<NodeId, PipelineNode>
  readonly redoStack: readonly NodeId[]
}

export interface CreateEditorDocumentParams {
  readonly assetId: AssetId
  readonly width: number
  readonly height: number
  readonly now?: number
  readonly docId?: DocId
}

function ensureNode(
  nodes: ReadonlyMap<NodeId, PipelineNode>,
  nodeId: NodeId
): PipelineNode {
  const node = nodes.get(nodeId)
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`)
  }

  return node
}

function makeRootNode(now: number): PipelineNode {
  return {
    id: createNodeId(),
    parentId: null,
    op: {
      type: 'rotate',
      params: {
        degrees: 0,
      },
    },
    createdAt: now,
  }
}

export function createEditorGraphState(
  params: CreateEditorDocumentParams
): EditorGraphState {
  const now = params.now ?? Date.now()
  const rootNode = makeRootNode(now)

  const document: EditorDocument = {
    id: params.docId ?? createDocId(),
    version: 1,
    sourceAssetId: params.assetId,
    width: params.width,
    height: params.height,
    colorSpace: 'srgb',
    rootNodeId: rootNode.id,
    headNodeId: rootNode.id,
    branches: {},
    createdAt: now,
    updatedAt: now,
  }

  return {
    document,
    nodes: new Map([[rootNode.id, rootNode]]),
    redoStack: [],
  }
}

export function getNodePath(
  state: EditorGraphState,
  nodeId: NodeId = state.document.headNodeId
): readonly PipelineNode[] {
  const path: PipelineNode[] = []
  let current: NodeId | null = nodeId

  while (current) {
    const node = ensureNode(state.nodes, current)
    path.push(node)
    current = node.parentId
  }

  return path.reverse()
}

export function checkout(
  state: EditorGraphState,
  nodeId: NodeId,
  now = Date.now()
): EditorGraphState {
  ensureNode(state.nodes, nodeId)

  return {
    ...state,
    document: {
      ...state.document,
      headNodeId: nodeId,
      updatedAt: now,
    },
    redoStack: [],
  }
}

export function undo(
  state: EditorGraphState,
  now = Date.now()
): EditorGraphState {
  const headNode = ensureNode(state.nodes, state.document.headNodeId)

  if (!headNode.parentId) {
    return state
  }

  return {
    ...state,
    document: {
      ...state.document,
      headNodeId: headNode.parentId,
      updatedAt: now,
    },
    redoStack: [state.document.headNodeId, ...state.redoStack],
  }
}

export function redo(
  state: EditorGraphState,
  now = Date.now()
): EditorGraphState {
  const [nextHead, ...rest] = state.redoStack
  if (!nextHead) {
    return state
  }

  ensureNode(state.nodes, nextHead)

  return {
    ...state,
    document: {
      ...state.document,
      headNodeId: nextHead,
      updatedAt: now,
    },
    redoStack: rest,
  }
}

export function applyOperation(
  state: EditorGraphState,
  operation: Operation,
  now = Date.now()
): EditorGraphState {
  const nextNode: PipelineNode = {
    id: createNodeId(),
    parentId: state.document.headNodeId,
    op: operation,
    createdAt: now,
  }

  const nextNodes = new Map(state.nodes)
  nextNodes.set(nextNode.id, nextNode)

  const nextBranches: Record<string, NodeId> = {
    ...state.document.branches,
  }

  if (state.redoStack.length > 0) {
    const branchKey = `branch_${now}`
    const previousFutureHead = state.redoStack[0]
    if (previousFutureHead) {
      nextBranches[branchKey] = previousFutureHead
    }
  }

  return {
    document: {
      ...state.document,
      headNodeId: nextNode.id,
      branches: nextBranches,
      updatedAt: now,
    },
    nodes: nextNodes,
    redoStack: [],
  }
}

export function resetToRoot(
  state: EditorGraphState,
  now = Date.now()
): EditorGraphState {
  return {
    ...state,
    document: {
      ...state.document,
      headNodeId: state.document.rootNodeId,
      updatedAt: now,
    },
    redoStack: [],
  }
}

export interface EditorCommands {
  readonly getState: () => EditorGraphState
  readonly applyOperation: (operation: Operation) => EditorGraphState
  readonly undo: () => EditorGraphState
  readonly redo: () => EditorGraphState
  readonly checkout: (nodeId: NodeId) => EditorGraphState
  readonly resetToRoot: () => EditorGraphState
}

export function createEditorCommands(
  initialState: EditorGraphState
): EditorCommands {
  let currentState = initialState

  return {
    getState() {
      return currentState
    },
    applyOperation(operation) {
      currentState = applyOperation(currentState, operation)
      return currentState
    },
    undo() {
      currentState = undo(currentState)
      return currentState
    },
    redo() {
      currentState = redo(currentState)
      return currentState
    },
    checkout(nodeId) {
      currentState = checkout(currentState, nodeId)
      return currentState
    },
    resetToRoot() {
      currentState = resetToRoot(currentState)
      return currentState
    },
  }
}
