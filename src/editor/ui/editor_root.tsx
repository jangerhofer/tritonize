import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from 'solid-js'
import { createEditorGraphState, type EditorGraphState } from '@/editor/domain'
import { createAssetId, createNodeId } from '@/editor/domain/ids'
import { EditorRenderOrchestrator } from '@/editor/engine'
import {
  capabilityForFormat,
  detectExportCapabilities,
  type ExportCapabilities,
} from '@/editor/export'
import { decodeUnknownSync } from '@/editor/types/schema_tools'
import { ExportOptionsSchema } from '@/editor/types/schemas'
import type { PipelineNode, RGB } from '@/editor/types/domain'
import './editor_root.css'

const DEFAULT_EXPORT_CAPABILITIES: ExportCapabilities = {
  jpeg: false,
  png: true,
  webp: false,
  avif: false,
  tiff: false,
}

const MAX_COLORS = 8
const MAX_PERMUTATION_INPUT = 6
const PERMUTATION_CARD_LIMIT = 9
const PERMUTATION_VIEWPORT = 200
const PREVIEW_DEBOUNCE_MS = 12
const PERMUTATION_DEBOUNCE_MS = 95
const FILE_INPUT_ACCEPT =
  'image/png,image/jpeg,image/webp,image/avif,image/tiff,image/x-tiff'
const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/tiff',
  'image/x-tiff',
])
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.tif', '.tiff'] as const

function isSupportedImageFile(file: File): boolean {
  if (IMAGE_TYPES.has(file.type.toLowerCase())) {
    return true
  }

  const filename = file.name.toLowerCase()
  return IMAGE_EXTENSIONS.some((extension) => filename.endsWith(extension))
}

const devicePixelRatio = (): number => {
  if (typeof window === 'undefined') {
    return 1
  }

  return Number.isFinite(window.devicePixelRatio) ? Math.max(1, window.devicePixelRatio) : 1
}

interface Permutation {
  readonly id: string
  readonly colors: readonly RGB[]
  readonly label: string
  readonly url: string | null
  readonly loading: boolean
  readonly selected: boolean
}

interface SourceDimensions {
  readonly width: number
  readonly height: number
}

interface TritonizerParams {
  readonly sigmoidMidpoint: number
  readonly sigmoidStrength: number
}

const initialPalette: readonly RGB[] = [
  [205, 34, 45],
  [10, 12, 16],
  [255, 255, 255],
]

function palettesMatch(left: readonly RGB[], right: readonly RGB[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((color, index) => {
    const other = right[index]
    if (!other) {
      return false
    }

    return (
      other[0] === color[0] &&
      other[1] === color[1] &&
      other[2] === color[2]
    )
  })
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

function makePermutationLabel(colors: readonly RGB[]): string {
  return colors.map(rgbToHex).join(' | ')
}

function readImageDimensions(blob: Blob): Promise<SourceDimensions> {
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

const invalidFormatMessage =
  'Unsupported image format. Use PNG, JPEG, WebP, AVIF, or TIFF.'

function createTritonizerPath(
  state: EditorGraphState,
  params: TritonizerParams,
  colors: readonly RGB[]
): readonly PipelineNode[] {
  const rootNode = state.nodes.get(state.document.rootNodeId)
  if (!rootNode) {
    return []
  }

  return [
    rootNode,
    {
      id: createNodeId(),
      parentId: rootNode.id,
      op: {
        type: 'tritonizer',
        params: {
          colors,
          sigmoidMidpoint: params.sigmoidMidpoint,
          sigmoidStrength: params.sigmoidStrength,
        },
      },
      createdAt: Date.now(),
    },
  ]
}

function generatePermutations(
  values: readonly RGB[],
  limit: number
): readonly RGB[][] {
  if (values.length <= 1) {
    return [values.slice()]
  }

  const output: RGB[][] = []
  const used: boolean[] = new Array(values.length).fill(false)
  const active: RGB[] = []

  const backtrack = (): void => {
    if (output.length >= limit) {
      return
    }

    if (active.length === values.length) {
      output.push([...active])
      return
    }

    for (let index = 0; index < values.length; index += 1) {
      if (output.length >= limit) {
        return
      }

      if (used[index]) {
        continue
      }

      const color = values[index]
      if (!color) {
        continue
      }

      used[index] = true
      active.push(color)
      backtrack()
      active.pop()
      used[index] = false
    }
  }

  backtrack()
  return output
}

function buildPermutationCards(
  colors: readonly RGB[],
  selectedColors: readonly RGB[]
): readonly Permutation[] {
  if (colors.length < 2) {
    return []
  }

  const variableCount = Math.min(colors.length, MAX_PERMUTATION_INPUT)
  const head = colors.slice(0, variableCount)
  const fixedTail = colors.slice(variableCount)
  const permutations = generatePermutations(head, PERMUTATION_CARD_LIMIT)

  return permutations.map((entry, index) => {
    const fullPalette = [...entry, ...fixedTail]
    const selected = fullPalette.length === selectedColors.length &&
      fullPalette.every((color, position) => {
        const selectedColor = selectedColors[position]
        if (!selectedColor) {
          return false
        }

        return (
          selectedColor[0] === color[0] &&
          selectedColor[1] === color[1] &&
          selectedColor[2] === color[2]
        )
      })

    return {
      id: `perm-${index}`,
      colors: fullPalette,
      label: makePermutationLabel(fullPalette),
      loading: true,
      url: null,
      selected,
    }
  })
}

function normalizePaletteForRender(colors: readonly RGB[]): readonly RGB[] {
  const normalized = [...colors]
  return normalized.slice(0, MAX_COLORS)
}

export const EditorRoot: Component = () => {
  const orchestrator = new EditorRenderOrchestrator()

  const [graphState, setGraphState] = createSignal<EditorGraphState | null>(null)
  const [assetId, setAssetId] = createSignal<ReturnType<typeof createAssetId> | null>(
    null
  )
  const [status, setStatus] = createSignal('Load an image to begin')
  const [error, setError] = createSignal<string | null>(null)
  const [isRendering, setIsRendering] = createSignal(false)
  const [isExporting, setIsExporting] = createSignal(false)
  const [sourceDimensions, setSourceDimensions] = createSignal<SourceDimensions | null>(
    null
  )
  const [palette, setPalette] = createSignal<readonly RGB[]>(initialPalette)
  const [sigmoidMidpoint, setSigmoidMidpoint] = createSignal(0.5)
  const [sigmoidStrength, setSigmoidStrength] = createSignal(1)
  const [previewStats, setPreviewStats] = createSignal('')
  const [exportStats, setExportStats] = createSignal('')
  const [permutationCards, setPermutationCards] =
    createSignal<readonly Permutation[]>([])
  const [capabilities, setCapabilities] =
    createSignal<ExportCapabilities>(DEFAULT_EXPORT_CAPABILITIES)
  const [exportFormat, setExportFormat] =
    createSignal<'jpeg' | 'png' | 'webp' | 'avif' | 'tiff'>('png')
  const [exportQuality, setExportQuality] = createSignal(0.92)
  const [exportLongEdge, setExportLongEdge] = createSignal<number | null>(null)
  const [viewportSize, setViewportSize] = createSignal({ width: 960, height: 640 })
  const [isPermutationDrawerOpen, setIsPermutationDrawerOpen] = createSignal(false)
  const [isDragActive, setIsDragActive] = createSignal(false)

  let viewportRef: HTMLDivElement | undefined
  let canvasRef: HTMLCanvasElement | undefined
  let fileInputRef: HTMLInputElement | undefined
  let previewDebounceTimer: number | undefined
  let permutationDebounceTimer: number | undefined
  let latestPreviewRequest = 0
  let latestPermutationRequest = 0

  const params = (): TritonizerParams => ({
    sigmoidMidpoint: sigmoidMidpoint(),
    sigmoidStrength: sigmoidStrength(),
  })

  const releasePermutationUrls = (nextCards: readonly Permutation[]): void => {
    for (const card of permutationCards()) {
      const nextCard = nextCards.find((entry) => entry.id === card.id)
      if (!nextCard && card.url) {
        URL.revokeObjectURL(card.url)
      }
    }
  }

  const setPermutationCardsWithCleanup = (
    nextCards: readonly Permutation[]
  ): void => {
    releasePermutationUrls(nextCards)
    setPermutationCards(nextCards)
  }

  const refreshPermutationSelection = (nextColors: readonly RGB[]): void => {
    const selectedColors = normalizePaletteForRender(nextColors)
    setPermutationCards((previous) =>
      previous.map((card) => ({
        ...card,
        selected: palettesMatch(card.colors, selectedColors),
      }))
    )
  }

  const drawPreviewBitmap = (
    bitmap: ImageBitmap,
    cssWidth: number,
    cssHeight: number
  ): void => {
    if (!canvasRef) {
      bitmap.close()
      return
    }

    const safeCssWidth = Math.max(1, Math.floor(cssWidth))
    const safeCssHeight = Math.max(1, Math.floor(cssHeight))

    canvasRef.width = bitmap.width
    canvasRef.height = bitmap.height
    canvasRef.style.width = `${safeCssWidth}px`
    canvasRef.style.height = `${safeCssHeight}px`

    const context = canvasRef.getContext('2d')
    if (!context) {
      bitmap.close()
      return
    }

    context.drawImage(bitmap, 0, 0)
    bitmap.close()
  }

  const requestBitmapToDataUrl = async (
    bitmap: ImageBitmap,
    width: number,
    height: number,
    cssWidth: number,
    cssHeight: number
  ): Promise<string> => {
    const canvas = document.createElement('canvas')
    const safeCssWidth = Math.max(1, Math.floor(cssWidth))
    const safeCssHeight = Math.max(1, Math.floor(cssHeight))
    canvas.width = Math.max(1, Math.floor(width))
    canvas.height = Math.max(1, Math.floor(height))
    canvas.style.width = `${safeCssWidth}px`
    canvas.style.height = `${safeCssHeight}px`

    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      throw new Error('Unable to draw preview output')
    }

    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (!nextBlob) {
          reject(new Error('Unable to encode preview output'))
          return
        }

        resolve(nextBlob)
      }, 'image/png')
    })

    return URL.createObjectURL(blob)
  }

  const requestPreview = async (path: readonly PipelineNode[]): Promise<void> => {
    const currentAssetId = assetId()
    if (!currentAssetId || path.length === 0) {
      return
    }

    const state = graphState()
    if (!state) {
      return
    }

    const { width, height } = viewportSize()
    if (width <= 0 || height <= 0) {
      return
    }

    const requestId = ++latestPreviewRequest
    setIsRendering(true)

    try {
      const scale = devicePixelRatio()
      const cssWidth = width
      const cssHeight = height
      const renderWidth = Math.max(1, Math.floor(width * scale))
      const renderHeight = Math.max(1, Math.floor(height * scale))

      const result = await orchestrator.renderPreview({
        assetId: currentAssetId,
        nodePath: path,
        width: renderWidth,
        height: renderHeight,
        zoom: 1,
        panX: 0,
        panY: 0,
      })

      if (requestId !== latestPreviewRequest) {
        result.bitmap.close()
        return
      }

      drawPreviewBitmap(result.bitmap, cssWidth, cssHeight)
      setPreviewStats(
        `${result.stats.backend} ${Math.round(result.stats.elapsedMs)}ms @ ${result.stats.width}x${result.stats.height}`
      )
    } catch (renderError) {
      const message =
        renderError instanceof Error
          ? renderError.message
          : 'Preview render failed unexpectedly'

      if (!message.toLowerCase().includes('cancel')) {
        setError(message)
      }
    } finally {
      if (requestId === latestPreviewRequest) {
        setIsRendering(false)
      }
    }
  }

  const requestPermutationPreviews = async (
    state: EditorGraphState,
    params: TritonizerParams,
    baseColors: readonly RGB[]
  ): Promise<void> => {
    const currentAssetId = assetId()
    if (!currentAssetId) {
      return
    }

    if (baseColors.length < 2) {
      setPermutationCards([])
      return
    }

    const cards = permutationCards()
    if (cards.length === 0) {
      return
    }

    const requestId = ++latestPermutationRequest
    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i]
      if (!card) {
        continue
      }

      if (!card.loading || card.url) {
        continue
      }

      try {
        const result = await orchestrator.renderPreview({
          assetId: currentAssetId,
          nodePath: createTritonizerPath(state, params, card.colors),
          width: Math.floor(PERMUTATION_VIEWPORT * devicePixelRatio()),
          height: Math.floor(PERMUTATION_VIEWPORT * devicePixelRatio()),
          zoom: 1,
          panX: 0,
          panY: 0,
        })

        if (requestId !== latestPermutationRequest) {
          result.bitmap.close()
          return
        }

        const url = await requestBitmapToDataUrl(
          result.bitmap,
          result.bitmap.width,
          result.bitmap.height,
          PERMUTATION_VIEWPORT,
          PERMUTATION_VIEWPORT
        )

        setPermutationCards((previous) => {
          const next = [...previous]
          const existing = next[i]
          if (!existing) {
            return previous
          }

          if (existing.url) {
            URL.revokeObjectURL(existing.url)
          }

          next[i] = {
            ...existing,
            loading: false,
            url,
          }
          return next
        })
      } catch {
        if (requestId !== latestPermutationRequest) {
          return
        }

        setPermutationCards((previous) => {
          const next = [...previous]
          const existing = next[i]
          if (!existing) {
            return previous
          }

          next[i] = {
            ...existing,
            loading: false,
          }
          return next
        })
      }
    }
  }

  const scheduleLiveRender = (options?: {
    refreshCards?: boolean
  }): void => {
    const refreshCards = options?.refreshCards ?? true

    if (previewDebounceTimer !== undefined) {
      window.clearTimeout(previewDebounceTimer)
    }
    if (permutationDebounceTimer !== undefined) {
      window.clearTimeout(permutationDebounceTimer)
    }

    previewDebounceTimer = window.setTimeout(() => {
      const state = graphState()
      if (!state) {
        return
      }

      const baseParams = params()
      const basePalette = normalizePaletteForRender(palette())
      void requestPreview(createTritonizerPath(state, baseParams, basePalette))
      if (refreshCards) {
        const cards = buildPermutationCards(basePalette, basePalette)
        setPermutationCardsWithCleanup(cards)
      } else {
        refreshPermutationSelection(basePalette)
      }

      permutationDebounceTimer = window.setTimeout(() => {
        void requestPermutationPreviews(
          state,
          baseParams,
          basePalette
        )
      }, PERMUTATION_DEBOUNCE_MS)
    }, PREVIEW_DEBOUNCE_MS)
  }

  const applyPalette = (colors: readonly RGB[]): void => {
    setPalette([...colors])
    scheduleLiveRender({ refreshCards: false })
  }

  const handleColorChange = (index: number, event: Event): void => {
    const next = [...palette()]
    const nextColor = hexToRgb((event.currentTarget as HTMLInputElement).value)
    next[index] = nextColor
    setPalette(next)
    scheduleLiveRender()
  }

  const shiftColor = (from: number, to: number): void => {
    const next = [...palette()]
    if (to < 0 || to >= next.length || from < 0 || from >= next.length) {
      return
    }

    const value = next[from]
    if (!value) {
      return
    }

    const destination = next[to]
    if (!destination) {
      return
    }

    next[from] = destination
    next[to] = value
    setPalette(next)
    scheduleLiveRender()
  }

  const addColor = (): void => {
    if (palette().length >= MAX_COLORS) {
      return
    }

    const next = [...palette()]
    next.push([0, 0, 0])
    setPalette(next)
    scheduleLiveRender()
  }

  const removeColor = (index: number): void => {
    if (palette().length <= 2) {
      return
    }

    const next = [...palette()]
    next.splice(index, 1)
    setPalette(next)
    scheduleLiveRender()
  }

  const requestExport = async (): Promise<void> => {
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
    setError(null)

    try {
      const maybeQuality =
        format === 'png' || format === 'tiff' ? undefined : exportQuality()
      const maybeTargetLongEdge = exportLongEdge() ?? undefined
      const options = decodeUnknownSync(ExportOptionsSchema, {
        format,
        colorProfile: 'srgb',
        metadataPolicy: 'preserve-when-possible',
        ...(maybeQuality === undefined ? {} : { quality: maybeQuality }),
        ...(maybeTargetLongEdge === undefined ? {} : { targetLongEdge: maybeTargetLongEdge }),
      })

      const result = await orchestrator.queueExport({
        assetId: currentAssetId,
        nodePath: createTritonizerPath(state, params(), normalizePaletteForRender(palette())),
        exportOptions: options,
      })

      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `tritonizer-${format === 'jpeg' ? 'jpg' : format}`
      anchor.click()
      URL.revokeObjectURL(url)

      setExportStats(
        `${result.stats.backend} ${Math.round(result.stats.elapsedMs)}ms (${Math.round(result.blob.size / 1024)} KB)`
      )
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : 'Export failed unexpectedly'
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

      setSourceDimensions(dimensions)
      setAssetId(nextAssetId)
      setGraphState(nextState)
      setStatus(`Loaded ${dimensions.width}x${dimensions.height}`)
      await orchestrator.loadAsset(nextAssetId, blob)
      releasePermutationUrls([])
      setPermutationCards([])
      scheduleLiveRender()
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load file')
    }
  }

  onMount(() => {
    void orchestrator.init()
    void detectExportCapabilities().then((nextCapabilities) => {
      setCapabilities(nextCapabilities)
      if (!capabilityForFormat(nextCapabilities, exportFormat())) {
        if (nextCapabilities.png) {
          setExportFormat('png')
        } else if (nextCapabilities.jpeg) {
          setExportFormat('jpeg')
        }
      }
    })

    const updateViewportFromRef = (): void => {
      if (!viewportRef) {
        return
      }

      const rect = viewportRef.getBoundingClientRect()
      setViewportSize({
        width: Math.max(320, Math.floor(rect.width)),
        height: Math.max(240, Math.floor(rect.height)),
      })
      scheduleLiveRender({ refreshCards: false })
    }

    if (viewportRef) {
      const observer = new ResizeObserver(updateViewportFromRef)
      observer.observe(viewportRef)
      onCleanup(() => observer.disconnect())
      window.addEventListener('resize', updateViewportFromRef)
      onCleanup(() => {
        window.removeEventListener('resize', updateViewportFromRef)
      })
    }
  })

  createEffect(() => {
    const state = graphState()
    const loadedAssetId = assetId()
    const colorState = palette()
    const midpoint = sigmoidMidpoint()
    const strength = sigmoidStrength()
    const viewport = viewportSize()

    void state
    void loadedAssetId
    void colorState
    void midpoint
    void strength
    void viewport
    if (viewport.width > 0 && viewport.height > 0) {
      scheduleLiveRender({ refreshCards: false })
    }
  })

  createEffect(() => {
    setIsPermutationDrawerOpen(Boolean(assetId()) && palette().length >= 2)
  })

  const openImageFromFile = (file: File): void => {
    if (!isSupportedImageFile(file)) {
      setError(invalidFormatMessage)
      return
    }

    setError(null)
    void handleFileLoad(file)
  }

  const handleOpenImage = (event: Event): void => {
    const inputElement = event.currentTarget
    if (!inputElement || !(inputElement instanceof HTMLInputElement)) {
      return
    }

    const files = inputElement.files
    if (!files || files.length === 0) {
      return
    }

    const nextFile = files[0]
    if (!nextFile) {
      return
    }

    openImageFromFile(nextFile)
    inputElement.value = ''
  }

  const handleViewportDragEnter = (event: DragEvent): void => {
    event.preventDefault()
    event.stopPropagation()

    if (!event.dataTransfer) {
      return
    }

    const hasFiles = event.dataTransfer.types.includes('Files')
    if (!hasFiles) {
      return
    }

    setIsDragActive(true)
  }

  const handleViewportDragOver = (event: DragEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    if (!event.dataTransfer) {
      return
    }

    event.dataTransfer.dropEffect = 'copy'
    setIsDragActive(true)
  }

  const handleViewportDragLeave = (event: DragEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    const currentTarget = event.currentTarget as HTMLDivElement | null
    const relatedTarget = event.relatedTarget
    if (
      !currentTarget ||
      !relatedTarget ||
      (relatedTarget !== currentTarget &&
        !currentTarget.contains(relatedTarget as Node))
    ) {
      setIsDragActive(false)
    }
  }

  const handleViewportDrop = (event: DragEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragActive(false)

    const files = event.dataTransfer?.files
    if (!files || files.length === 0) {
      setError('Drop a valid image file to continue.')
      return
    }

    const nextFile = files[0]
    if (!nextFile) {
      setError('Drop a valid image file to continue.')
      return
    }

    if (!isSupportedImageFile(nextFile)) {
      setError(invalidFormatMessage)
      return
    }

    setError(null)
    void handleFileLoad(nextFile)
  }

  const openImagePicker = (): void => {
    if (!fileInputRef) {
      return
    }

    fileInputRef.click()
  }

  onCleanup(() => {
    orchestrator.dispose()
    if (previewDebounceTimer !== undefined) {
      window.clearTimeout(previewDebounceTimer)
    }
    if (permutationDebounceTimer !== undefined) {
      window.clearTimeout(permutationDebounceTimer)
    }
    releasePermutationUrls([])
  })

  return (
    <main class="editor-shell">
      <header class="editor-topbar">
        <div>
          <p class="eyebrow">Tritonizer</p>
          <h1>Tritonizer</h1>
          <p class="meta">{status()}</p>
          <Show when={sourceDimensions()}>
            {(dimensions) => <p class="meta">{dimensions().width}x{dimensions().height}</p>}
          </Show>
          <Show when={previewStats()}>
            <p class="stats">Preview • {previewStats()}</p>
          </Show>
          <Show when={exportStats()}>
            <p class="stats">Export • {exportStats()}</p>
          </Show>
          <Show when={error()}>
            {(message) => <p class="error">{message()}</p>}
          </Show>
        </div>
      </header>

      <section class="editor-viewport-wrap">
        <section class="panel viewport-panel">
          <div class="viewport-header">
            <h2>Preview</h2>
            <span class="status-chip" classList={{ ready: !isRendering(), rendering: isRendering() }}>
              <span class="live-dot" />
              {isRendering() ? 'Live' : 'Ready'}
            </span>
          </div>
          <div
            class="viewport"
            classList={{ dragActive: isDragActive() }}
            ref={viewportRef}
            onClick={openImagePicker}
            onDragEnter={handleViewportDragEnter}
            onDragOver={handleViewportDragOver}
            onDragLeave={handleViewportDragLeave}
            onDrop={handleViewportDrop}
            role="button"
            tabIndex={0}
          >
            <canvas ref={canvasRef} />
            <Show when={!assetId()}>
              <div class="viewport-overlay">
                <p>Drop an image here to load</p>
                <p>or click to choose a file</p>
              </div>
            </Show>
            <Show when={isDragActive() && !assetId()}>
              <div class="viewport-overlay drag">
                <p>Drop image to load</p>
              </div>
            </Show>
            <Show when={isDragActive() && assetId()}>
              <div class="viewport-overlay drag">
                <p>Drop image to replace</p>
              </div>
            </Show>
          </div>
        </section>
      </section>
      <input
        ref={fileInputRef}
        class="hidden-file-input"
        type="file"
        accept={FILE_INPUT_ACCEPT}
        onChange={handleOpenImage}
      />

      <aside
        class="panel permutations-panel"
        classList={{ open: isPermutationDrawerOpen() }}
      >
        <h2>Permutations</h2>
        <Show when={!assetId()}>
          <p class="helper">Load an image to generate permutation previews.</p>
        </Show>
        <Show when={assetId() && palette().length < 2}>
          <p class="helper">Add a second color to generate permutations.</p>
        </Show>
        <Show when={assetId() && palette().length >= 2}>
          <Show when={palette().length === 2}>
            <p class="helper">Add one more color to generate permutations</p>
          </Show>

          <div class="permutation-grid">
            <For each={permutationCards()}>
              {(card) => (
                <button
                  classList={{
                    'perm-card': true,
                    selected: card.selected,
                  }}
                  onClick={() => applyPalette(card.colors)}
                >
                  <Show
                    when={card.url}
                    fallback={
                      <div class="perm-fallback">
                        <span>{card.loading ? 'Preparing…' : 'Unavailable'}</span>
                      </div>
                    }
                  >
                    {(url) => <img src={url()} alt={card.label} />}
                  </Show>
                  <span class="perm-label">{card.label}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </aside>

      <footer class="editor-toolbar panel">
        <div class="toolbar-groups">
          <section class="toolbar-group">
            <h3>Palette</h3>
            <div class="palette-grid">
              <For each={palette()}>
                {(color, index) => (
                  <div class="palette-entry">
                    <label>
                      <span>Color {index() + 1}</span>
                      <input
                        type="color"
                        value={rgbToHex(color)}
                        onInput={(event) => handleColorChange(index(), event)}
                      />
                    </label>
                    <div class="palette-actions">
                      <button
                        class="inline"
                        onClick={() => shiftColor(index(), index() - 1)}
                        disabled={index() === 0}
                        title="Move Left"
                      >
                        ←
                      </button>
                      <button
                        class="inline"
                        onClick={() => shiftColor(index(), index() + 1)}
                        disabled={index() === palette().length - 1}
                        title="Move Right"
                      >
                        →
                      </button>
                      <button
                        class="inline danger"
                        onClick={() => removeColor(index())}
                        disabled={palette().length <= 2}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>

            <div class="inline-actions">
              <button onClick={addColor} disabled={palette().length >= MAX_COLORS}>
                Add Color
              </button>
            </div>
          </section>

          <section class="toolbar-group">
            <h3>Tweak</h3>
            <label>
              <span>Sigmoid midpoint ({sigmoidMidpoint().toFixed(2)})</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sigmoidMidpoint()}
                onInput={(event) => {
                  setSigmoidMidpoint(Number(event.currentTarget.value))
                  scheduleLiveRender()
                }}
              />
            </label>
            <label>
              <span>Sigmoid strength ({sigmoidStrength().toFixed(2)})</span>
              <input
                type="range"
                min={0.05}
                max={4}
                step={0.05}
                value={sigmoidStrength()}
                onInput={(event) => {
                  setSigmoidStrength(Number(event.currentTarget.value))
                  scheduleLiveRender()
                }}
              />
            </label>
          </section>

          <section class="toolbar-group">
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
                placeholder="auto"
                value={exportLongEdge() ?? ''}
                onInput={(event) => {
                  const value = event.currentTarget.value
                  setExportLongEdge(value === '' ? null : Number(value))
                }}
              />
            </label>

            <button
              class="primary"
              onClick={() => void requestExport()}
              disabled={!graphState() || isExporting()}
            >
              {isExporting() ? 'Exporting...' : 'Export Current'}
            </button>
          </section>
        </div>
      </footer>
    </main>
  )
}
