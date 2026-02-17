import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from 'solid-js'
import {
  applyOperation,
  createEditorGraphState,
  getNodePath,
  redo,
  resetToRoot,
  undo,
  type EditorGraphState,
} from '@/editor/domain'
import { createAssetId } from '@/editor/domain/ids'
import { EditorRenderOrchestrator } from '@/editor/engine'
import {
  capabilityForFormat,
  detectExportCapabilities,
  type ExportCapabilities,
} from '@/editor/export'
import { EditorRepository } from '@/editor/storage/repository'
import { decodeUnknownEither, decodeUnknownSync } from '@/editor/types/schema_tools'
import { DocIdSchema, ExportOptionsSchema } from '@/editor/types/schemas'
import type { Operation, RGB } from '@/editor/types/domain'
import './editor_root.css'

const DEFAULT_EXPORT_CAPABILITIES: ExportCapabilities = {
  jpeg: false,
  png: true,
  webp: false,
  avif: false,
  tiff: false,
}

interface AdjustmentValues {
  readonly exposure: number
  readonly contrast: number
  readonly saturation: number
  readonly vibrance: number
  readonly temperature: number
  readonly tint: number
  readonly blur: number
  readonly rotate: 0 | 90 | 180 | 270
  readonly cropX: number
  readonly cropY: number
  readonly cropWidth: number
  readonly cropHeight: number
  readonly cropEnabled: boolean
  readonly sigmoidMidpoint: number
  readonly sigmoidStrength: number
}

const initialAdjustmentValues: AdjustmentValues = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  blur: 0,
  rotate: 0,
  cropX: 0,
  cropY: 0,
  cropWidth: 1024,
  cropHeight: 768,
  cropEnabled: false,
  sigmoidMidpoint: 0.5,
  sigmoidStrength: 1,
}

const OP_LABELS: Record<Operation['type'], string> = {
  tritonizer: 'Tritonizer',
  exposure: 'Exposure',
  contrast: 'Contrast',
  saturation: 'Saturation',
  vibrance: 'Vibrance',
  temperature: 'Temperature',
  tint: 'Tint',
  blur: 'Blur',
  crop: 'Crop',
  rotate: 'Rotate',
}

function hexToRgb(hexColor: string): RGB {
  const normalized = hexColor.replace('#', '')
  if (normalized.length !== 6) {
    return [255, 255, 255]
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)

  return [r, g, b]
}

function rgbToHex(color: RGB): string {
  return `#${color
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      const width = image.naturalWidth
      const height = image.naturalHeight
      URL.revokeObjectURL(url)
      resolve({ width, height })
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to read image dimensions'))
    }

    image.src = url
  })
}

export const EditorRoot: Component = () => {
  const repository = new EditorRepository()
  const orchestrator = new EditorRenderOrchestrator()

  const [graphState, setGraphState] = createSignal<EditorGraphState | null>(null)
  const [assetId, setAssetId] = createSignal<ReturnType<typeof createAssetId> | null>(
    null
  )
  const [status, setStatus] = createSignal('Load an image to start editing')
  const [error, setError] = createSignal<string | null>(null)
  const [isRendering, setIsRendering] = createSignal(false)
  const [isExporting, setIsExporting] = createSignal(false)
  const [previewStats, setPreviewStats] = createSignal<string>('')
  const [exportStats, setExportStats] = createSignal<string>('')
  const [adjustments, setAdjustments] = createSignal(initialAdjustmentValues)
  const [palette, setPalette] = createSignal<readonly RGB[]>([
    [198, 12, 48],
    [255, 255, 255],
    [0, 0, 0],
  ])
  const [capabilities, setCapabilities] =
    createSignal<ExportCapabilities>(DEFAULT_EXPORT_CAPABILITIES)
  const [exportFormat, setExportFormat] =
    createSignal<'jpeg' | 'png' | 'webp' | 'avif' | 'tiff'>('png')
  const [exportQuality, setExportQuality] = createSignal(0.92)
  const [exportLongEdge, setExportLongEdge] = createSignal<number | null>(null)
  const [viewportSize, setViewportSize] = createSignal({ width: 960, height: 640 })

  const nodePath = createMemo(() => {
    const state = graphState()
    if (!state) {
      return [] as const
    }

    return getNodePath(state)
  })

  let viewportRef: HTMLDivElement | undefined
  let canvasRef: HTMLCanvasElement | undefined
  let persistTimer: number | undefined
  let latestRenderRequest = 0

  const schedulePersist = (nextState: EditorGraphState): void => {
    if (persistTimer !== undefined) {
      window.clearTimeout(persistTimer)
    }

    persistTimer = window.setTimeout(() => {
      void repository.saveGraphState(nextState)
    }, 500)
  }

  const commitGraphState = (nextState: EditorGraphState): void => {
    setGraphState(nextState)
    localStorage.setItem('editor:lastDocId', nextState.document.id)
    schedulePersist(nextState)
  }

  const drawPreviewBitmap = (bitmap: ImageBitmap): void => {
    if (!canvasRef) {
      bitmap.close()
      return
    }

    canvasRef.width = bitmap.width
    canvasRef.height = bitmap.height

    const context = canvasRef.getContext('2d')
    if (!context) {
      bitmap.close()
      return
    }

    context.drawImage(bitmap, 0, 0)
    bitmap.close()
  }

  const requestPreview = async (nextState: EditorGraphState): Promise<void> => {
    const currentAssetId = assetId()
    if (!currentAssetId) {
      return
    }

    const { width, height } = viewportSize()
    if (width <= 0 || height <= 0) {
      return
    }

    const requestId = ++latestRenderRequest
    setIsRendering(true)

    try {
      const result = await orchestrator.renderPreview({
        assetId: currentAssetId,
        nodePath: getNodePath(nextState),
        width,
        height,
        zoom: 1,
        panX: 0,
        panY: 0,
      })

      if (requestId !== latestRenderRequest) {
        result.bitmap.close()
        return
      }

      drawPreviewBitmap(result.bitmap)
      setPreviewStats(
        `${result.stats.backend} ${Math.round(result.stats.elapsedMs)}ms @ ${result.stats.width}x${result.stats.height}`
      )
    } catch (renderError) {
      const message =
        renderError instanceof Error
          ? renderError.message
          : 'Preview rendering failed unexpectedly'

      if (!message.toLowerCase().includes('cancelled')) {
        setError(message)
      }
    } finally {
      if (requestId === latestRenderRequest) {
        setIsRendering(false)
      }
    }
  }

  const applyAndRender = (operation: Operation): void => {
    const state = graphState()
    if (!state) {
      return
    }

    const nextState = applyOperation(state, operation)
    commitGraphState(nextState)
    void requestPreview(nextState)
  }

  const handleUndo = (): void => {
    const state = graphState()
    if (!state) {
      return
    }

    const nextState = undo(state)
    commitGraphState(nextState)
    void requestPreview(nextState)
  }

  const handleRedo = (): void => {
    const state = graphState()
    if (!state) {
      return
    }

    const nextState = redo(state)
    commitGraphState(nextState)
    void requestPreview(nextState)
  }

  const handleReset = (): void => {
    const state = graphState()
    if (!state) {
      return
    }

    const nextState = resetToRoot(state)
    commitGraphState(nextState)
    void requestPreview(nextState)
  }

  const handleAdjustmentCommit = (
    type: Extract<
      Operation['type'],
      'exposure' | 'contrast' | 'saturation' | 'vibrance' | 'temperature' | 'tint'
    >,
    value: number
  ): void => {
    applyAndRender({
      type,
      params: { value },
    })
  }

  const handleBlurCommit = (radius: number): void => {
    applyAndRender({
      type: 'blur',
      params: { radius },
    })
  }

  const handleRotateCommit = (degrees: 0 | 90 | 180 | 270): void => {
    applyAndRender({
      type: 'rotate',
      params: { degrees },
    })
  }

  const handleApplyCrop = (): void => {
    const values = adjustments()
    if (!values.cropEnabled) {
      return
    }

    applyAndRender({
      type: 'crop',
      params: {
        x: values.cropX,
        y: values.cropY,
        width: values.cropWidth,
        height: values.cropHeight,
      },
    })
  }

  const handleApplyTritonizer = (): void => {
    const values = adjustments()
    applyAndRender({
      type: 'tritonizer',
      params: {
        colors: palette(),
        sigmoidMidpoint: values.sigmoidMidpoint,
        sigmoidStrength: values.sigmoidStrength,
      },
    })
  }

  const handleExport = async (): Promise<void> => {
    const state = graphState()
    const currentAssetId = assetId()
    if (!state || !currentAssetId) {
      return
    }

    const format = exportFormat()
    const caps = capabilities()
    if (!capabilityForFormat(caps, format)) {
      setError(`Format ${format.toUpperCase()} is not available in this browser`)
      return
    }

    setIsExporting(true)

    try {
      const values = {
        format,
        colorProfile: 'srgb',
        metadataPolicy: 'preserve-when-possible',
        quality: format === 'png' || format === 'tiff' ? undefined : exportQuality(),
        targetLongEdge: exportLongEdge() ?? undefined,
      }

      const options = decodeUnknownSync(ExportOptionsSchema, values)

      const result = await orchestrator.queueExport({
        assetId: currentAssetId,
        nodePath: getNodePath(state),
        exportOptions: options,
      })

      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `tritonizer-export.${format === 'jpeg' ? 'jpg' : format}`
      anchor.click()
      URL.revokeObjectURL(url)

      setExportStats(
        `${result.stats.backend} ${Math.round(result.stats.elapsedMs)}ms (${Math.round(result.blob.size / 1024)} KB)`
      )
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : 'Export failed unexpectedly'
      )
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileLoad = async (blob: Blob): Promise<void> => {
    setError(null)
    setStatus('Loading image...')

    try {
      const dimensions = await readImageDimensions(blob)
      const nextAssetId = createAssetId()
      const nextState = createEditorGraphState({
        assetId: nextAssetId,
        width: dimensions.width,
        height: dimensions.height,
      })

      setAssetId(nextAssetId)
      commitGraphState(nextState)

      await orchestrator.loadAsset(nextAssetId, blob)
      await repository.saveAsset(nextAssetId, blob)
      await repository.saveGraphState(nextState)
      setStatus('Image loaded. Add operations from the control panel.')

      setAdjustments((previous) => ({
        ...previous,
        cropWidth: dimensions.width,
        cropHeight: dimensions.height,
      }))

      void requestPreview(nextState)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load file')
    }
  }

  const maybeRestoreLastDocument = async (): Promise<void> => {
    const rawDocId = localStorage.getItem('editor:lastDocId')
    if (!rawDocId) {
      return
    }

    const parsed = decodeUnknownEither(DocIdSchema, rawDocId)
    if (!parsed.ok) {
      return
    }

    const loaded = await repository.loadGraphState(parsed.value)
    if (!loaded) {
      return
    }

    const blob = await repository.loadAsset(loaded.state.document.sourceAssetId)
    if (!blob) {
      return
    }

    setGraphState(loaded.state)
    setAssetId(loaded.state.document.sourceAssetId)

    await orchestrator.loadAsset(loaded.state.document.sourceAssetId, blob)
    void requestPreview(loaded.state)

    if (loaded.recovered) {
      setStatus('Recovered project from local storage with cleanup')
      if (loaded.recoveryReason) {
        setError(loaded.recoveryReason)
      }
    } else {
      setStatus('Restored last local project')
    }
  }

  onMount(() => {
    void orchestrator.init()

    void detectExportCapabilities().then((nextCaps) => {
      setCapabilities(nextCaps)
      if (!capabilityForFormat(nextCaps, exportFormat())) {
        if (nextCaps.png) {
          setExportFormat('png')
        } else if (nextCaps.jpeg) {
          setExportFormat('jpeg')
        }
      }
    })

    void maybeRestoreLastDocument()

    if (viewportRef) {
      const observer = new ResizeObserver((entries) => {
        const first = entries[0]
        if (!first) {
          return
        }

        const width = Math.max(320, Math.floor(first.contentRect.width))
        const height = Math.max(240, Math.floor(first.contentRect.height))
        setViewportSize({ width, height })
      })

      observer.observe(viewportRef)
      onCleanup(() => observer.disconnect())
    }
  })

  createEffect(() => {
    const state = graphState()
    const currentAssetId = assetId()
    const size = viewportSize()

    if (!state || !currentAssetId || size.width <= 0 || size.height <= 0) {
      return
    }

    void requestPreview(state)
  })

  onCleanup(() => {
    orchestrator.dispose()
    if (persistTimer !== undefined) {
      window.clearTimeout(persistTimer)
    }
  })

  return (
    <main class="editor-shell">
      <header class="editor-topbar">
        <div>
          <p class="eyebrow">Local-first / Worker-driven</p>
          <h1>Tritonizer Editor</h1>
          <p>{status()}</p>
          <Show when={previewStats()}>
            <p class="stats">Preview: {previewStats()}</p>
          </Show>
          <Show when={exportStats()}>
            <p class="stats">Export: {exportStats()}</p>
          </Show>
          <Show when={error()}>
            {(message) => <p class="error">{message()}</p>}
          </Show>
        </div>

        <div class="topbar-actions">
          <label class="file-input">
            <span>Open Image</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif,image/tiff,image/tif"
              onChange={(event) => {
                const files = event.currentTarget.files
                if (!files || files.length === 0) {
                  return
                }

                const nextFile = files[0]
                if (!nextFile) {
                  return
                }

                void handleFileLoad(nextFile)
              }}
            />
          </label>

          <button onClick={handleUndo} disabled={!graphState()}>
            Undo
          </button>
          <button onClick={handleRedo} disabled={!graphState()}>
            Redo
          </button>
          <button onClick={handleReset} disabled={!graphState()}>
            Reset
          </button>
        </div>
      </header>

      <div class="editor-layout">
        <aside class="panel controls-panel">
          <h2>Controls</h2>

          <section>
            <h3>Tritonizer</h3>
            <div class="palette-grid">
              <For each={palette()}>
                {(color, index) => (
                  <label>
                    <span>Color {index() + 1}</span>
                    <input
                      type="color"
                      value={rgbToHex(color)}
                      onInput={(event) => {
                        const next = [...palette()]
                        next[index()] = hexToRgb(event.currentTarget.value)
                        setPalette(next)
                      }}
                    />
                  </label>
                )}
              </For>
            </div>

            <label>
              <span>Sigmoid midpoint ({adjustments().sigmoidMidpoint.toFixed(2)})</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={adjustments().sigmoidMidpoint}
                onInput={(event) =>
                  setAdjustments((previous) => ({
                    ...previous,
                    sigmoidMidpoint: Number(event.currentTarget.value),
                  }))
                }
              />
            </label>

            <label>
              <span>Sigmoid strength ({adjustments().sigmoidStrength.toFixed(2)})</span>
              <input
                type="range"
                min="0.05"
                max="4"
                step="0.05"
                value={adjustments().sigmoidStrength}
                onInput={(event) =>
                  setAdjustments((previous) => ({
                    ...previous,
                    sigmoidStrength: Number(event.currentTarget.value),
                  }))
                }
              />
            </label>

            <button onClick={handleApplyTritonizer} disabled={!graphState()}>
              Apply Tritonizer
            </button>
          </section>

          <section>
            <h3>Global Adjustments</h3>
            <For
              each={[
                ['exposure', 'Exposure', -1, 1, 0.01],
                ['contrast', 'Contrast', -1, 1, 0.01],
                ['saturation', 'Saturation', -1, 1, 0.01],
                ['vibrance', 'Vibrance', -1, 1, 0.01],
                ['temperature', 'Temperature', -1, 1, 0.01],
                ['tint', 'Tint', -1, 1, 0.01],
              ] as const}
            >
              {(config) => (
                <label>
                  <span>
                    {config[1]} ({adjustments()[config[0]].toFixed(2)})
                  </span>
                  <input
                    type="range"
                    min={config[2]}
                    max={config[3]}
                    step={config[4]}
                    value={adjustments()[config[0]]}
                    onInput={(event) =>
                      setAdjustments((previous) => ({
                        ...previous,
                        [config[0]]: Number(event.currentTarget.value),
                      }))
                    }
                    onChange={() =>
                      handleAdjustmentCommit(config[0], adjustments()[config[0]])
                    }
                  />
                </label>
              )}
            </For>

            <label>
              <span>Blur ({adjustments().blur.toFixed(2)})</span>
              <input
                type="range"
                min="0"
                max="8"
                step="0.1"
                value={adjustments().blur}
                onInput={(event) =>
                  setAdjustments((previous) => ({
                    ...previous,
                    blur: Number(event.currentTarget.value),
                  }))
                }
                onChange={() => handleBlurCommit(adjustments().blur)}
              />
            </label>
          </section>

          <section>
            <h3>Geometry</h3>
            <label>
              <span>Rotate</span>
              <select
                value={adjustments().rotate}
                onChange={(event) => {
                  const degrees = Number(event.currentTarget.value) as
                    | 0
                    | 90
                    | 180
                    | 270

                  setAdjustments((previous) => ({
                    ...previous,
                    rotate: degrees,
                  }))
                  handleRotateCommit(degrees)
                }}
              >
                <option value="0">0 deg</option>
                <option value="90">90 deg</option>
                <option value="180">180 deg</option>
                <option value="270">270 deg</option>
              </select>
            </label>

            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={adjustments().cropEnabled}
                onChange={(event) =>
                  setAdjustments((previous) => ({
                    ...previous,
                    cropEnabled: event.currentTarget.checked,
                  }))
                }
              />
              <span>Enable crop parameters</span>
            </label>

            <Show when={adjustments().cropEnabled}>
              <div class="crop-grid">
                <label>
                  <span>X</span>
                  <input
                    type="number"
                    value={adjustments().cropX}
                    onInput={(event) =>
                      setAdjustments((previous) => ({
                        ...previous,
                        cropX: Number(event.currentTarget.value),
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Y</span>
                  <input
                    type="number"
                    value={adjustments().cropY}
                    onInput={(event) =>
                      setAdjustments((previous) => ({
                        ...previous,
                        cropY: Number(event.currentTarget.value),
                      }))
                    }
                  />
                </label>
                <label>
                  <span>W</span>
                  <input
                    type="number"
                    value={adjustments().cropWidth}
                    onInput={(event) =>
                      setAdjustments((previous) => ({
                        ...previous,
                        cropWidth: Number(event.currentTarget.value),
                      }))
                    }
                  />
                </label>
                <label>
                  <span>H</span>
                  <input
                    type="number"
                    value={adjustments().cropHeight}
                    onInput={(event) =>
                      setAdjustments((previous) => ({
                        ...previous,
                        cropHeight: Number(event.currentTarget.value),
                      }))
                    }
                  />
                </label>
              </div>
              <button onClick={handleApplyCrop} disabled={!graphState()}>
                Apply Crop
              </button>
            </Show>
          </section>

          <section>
            <h3>Export</h3>
            <label>
              <span>Format</span>
              <select
                value={exportFormat()}
                onChange={(event) =>
                  setExportFormat(
                    event.currentTarget.value as
                      | 'jpeg'
                      | 'png'
                      | 'webp'
                      | 'avif'
                      | 'tiff'
                  )
                }
              >
                <For each={['jpeg', 'png', 'webp', 'avif', 'tiff'] as const}>
                  {(format) => (
                    <option
                      value={format}
                      disabled={!capabilityForFormat(capabilities(), format)}
                    >
                      {format.toUpperCase()}
                    </option>
                  )}
                </For>
              </select>
            </label>

            <label>
              <span>Quality ({exportQuality().toFixed(2)})</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.01"
                value={exportQuality()}
                onInput={(event) => setExportQuality(Number(event.currentTarget.value))}
              />
            </label>

            <label>
              <span>Target long edge (px)</span>
              <input
                type="number"
                placeholder="Original size"
                value={exportLongEdge() ?? ''}
                onInput={(event) => {
                  const value = event.currentTarget.value
                  setExportLongEdge(value === '' ? null : Number(value))
                }}
              />
            </label>

            <button
              class="primary"
              disabled={!graphState() || isExporting()}
              onClick={() => void handleExport()}
            >
              {isExporting() ? 'Exporting...' : 'Export'}
            </button>
          </section>
        </aside>

        <section class="panel viewport-panel">
          <div class="viewport-header">
            <h2>Viewport</h2>
            <span>{isRendering() ? 'Rendering...' : 'Ready'}</span>
          </div>
          <div class="viewport" ref={viewportRef}>
            <canvas ref={canvasRef} />
          </div>
        </section>

        <aside class="panel history-panel">
          <h2>History</h2>
          <Show when={nodePath().length > 0} fallback={<p>No operations yet.</p>}>
            <ol>
              <For each={nodePath()}>
                {(node, index) => (
                  <li>
                    <span>{index() + 1}.</span> {OP_LABELS[node.op.type]}
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </aside>
      </div>
    </main>
  )
}
