import { describe, expect, it } from 'vitest'
import {
  applyOperation,
  createEditorGraphState,
  redo,
  undo,
} from './history'
import { createAssetId } from './ids'

describe('editor graph commands', () => {
  it('applies operations by appending child nodes', () => {
    const initial = createEditorGraphState({
      assetId: createAssetId('asset_seed'),
      width: 4000,
      height: 3000,
      now: 100,
    })

    const next = applyOperation(
      initial,
      {
        type: 'exposure',
        params: { value: 0.4 },
      },
      101
    )

    expect(next.document.headNodeId).not.toBe(initial.document.headNodeId)
    expect(next.nodes.size).toBe(initial.nodes.size + 1)
  })

  it('supports linear undo and redo', () => {
    const initial = createEditorGraphState({
      assetId: createAssetId('asset_seed_2'),
      width: 1200,
      height: 800,
      now: 200,
    })

    const applied = applyOperation(
      initial,
      {
        type: 'contrast',
        params: { value: 0.5 },
      },
      201
    )

    const undone = undo(applied, 202)
    expect(undone.document.headNodeId).toBe(initial.document.headNodeId)
    expect(undone.redoStack).toHaveLength(1)

    const redone = redo(undone, 203)
    expect(redone.document.headNodeId).toBe(applied.document.headNodeId)
    expect(redone.redoStack).toHaveLength(0)
  })

  it('captures hidden branch pointers when branching after undo', () => {
    const initial = createEditorGraphState({
      assetId: createAssetId('asset_seed_3'),
      width: 1200,
      height: 800,
      now: 300,
    })

    const first = applyOperation(
      initial,
      {
        type: 'saturation',
        params: { value: 0.2 },
      },
      301
    )

    const second = applyOperation(
      first,
      {
        type: 'blur',
        params: { radius: 1.3 },
      },
      302
    )

    const undone = undo(second, 303)
    const branched = applyOperation(
      undone,
      {
        type: 'temperature',
        params: { value: -0.3 },
      },
      304
    )

    expect(Object.keys(branched.document.branches).length).toBe(1)
    expect(branched.redoStack).toHaveLength(0)
  })
})
