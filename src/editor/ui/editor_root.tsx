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
const MIN_PREVIEW_LIMIT = 2
const MAX_PREVIEW_LIMIT = 24
const PERMUTATION_VIEWPORT = 200
const PREVIEW_DEBOUNCE_MS = 12
const PERMUTATION_DEBOUNCE_MS = 95
const SETTINGS_STORAGE_KEY = 'tritonize.settings.v1'
const DEFAULT_SIGMOID_MIDPOINT = 0.5
const DEFAULT_SIGMOID_STRENGTH = 1
const DEFAULT_EXPORT_QUALITY = 0.92
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

type ExportFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff'

interface PersistedSettings {
  readonly palette: readonly RGB[]
  readonly sigmoidMidpoint: number
  readonly sigmoidStrength: number
  readonly previewLimit: number
  readonly previewPermutationDepth: number
  readonly exportFormat: ExportFormat
  readonly exportQuality: number
  readonly exportLongEdge: number | null
  readonly exportAllPermutations: boolean
}

const initialPalette: readonly RGB[] = [
  [205, 34, 45],
  [10, 12, 16],
  [255, 255, 255],
]

const exportFormats: readonly ExportFormat[] = ['jpeg', 'png', 'webp', 'avif', 'tiff']

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseRgbTuple(value: unknown): RGB | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null
  }

  const red = value[0]
  const green = value[1]
  const blue = value[2]
  if (
    typeof red !== 'number' ||
    typeof green !== 'number' ||
    typeof blue !== 'number'
  ) {
    return null
  }

  return [
    clampNumber(Math.round(red), 0, 255),
    clampNumber(Math.round(green), 0, 255),
    clampNumber(Math.round(blue), 0, 255),
  ]
}

function normalizePalette(value: unknown): readonly RGB[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const next: RGB[] = []
  for (const entry of value) {
    const color = parseRgbTuple(entry)
    if (!color) {
      return null
    }
    next.push(color)
  }

  if (next.length < 2) {
    return null
  }

  return next.slice(0, MAX_COLORS)
}

function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && exportFormats.includes(value as ExportFormat)
}

function loadPersistedSettings(): PersistedSettings | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const palette = normalizePalette(parsed['palette'])
    if (!palette) {
      return null
    }

    const midpoint =
      typeof parsed['sigmoidMidpoint'] === 'number'
        ? clampNumber(parsed['sigmoidMidpoint'], 0, 1)
        : DEFAULT_SIGMOID_MIDPOINT
    const strength =
      typeof parsed['sigmoidStrength'] === 'number'
        ? clampNumber(parsed['sigmoidStrength'], 0.05, 4)
        : DEFAULT_SIGMOID_STRENGTH
    const previewLimit =
      typeof parsed['previewLimit'] === 'number'
        ? clampNumber(
          Math.round(parsed['previewLimit']),
          MIN_PREVIEW_LIMIT,
          MAX_PREVIEW_LIMIT
        )
        : PERMUTATION_CARD_LIMIT
    const previewPermutationDepth =
      typeof parsed['previewPermutationDepth'] === 'number'
        ? clampNumber(Math.round(parsed['previewPermutationDepth']), 2, MAX_PERMUTATION_INPUT)
        : MAX_PERMUTATION_INPUT
    const format = isExportFormat(parsed['exportFormat']) ? parsed['exportFormat'] : 'png'
    const quality =
      typeof parsed['exportQuality'] === 'number'
        ? clampNumber(parsed['exportQuality'], 0.1, 1)
        : DEFAULT_EXPORT_QUALITY
    const exportLongEdge =
      typeof parsed['exportLongEdge'] === 'number' && parsed['exportLongEdge'] >= 1
        ? Math.round(parsed['exportLongEdge'])
        : null
    const exportAllPermutations = parsed['exportAllPermutations'] === true

    return {
      palette,
      sigmoidMidpoint: midpoint,
      sigmoidStrength: strength,
      previewLimit,
      previewPermutationDepth,
      exportFormat: format,
      exportQuality: quality,
      exportLongEdge,
      exportAllPermutations,
    }
  } catch {
    return null
  }
}

function persistSettings(settings: PersistedSettings): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore storage failures (private mode, quota, or blocked storage).
  }
}

function clearPersistedSettings(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

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
  selectedColors: readonly RGB[],
  limit: number,
  permutationDepth: number
): readonly Permutation[] {
  if (colors.length < 2) {
    return []
  }

  const variableCount = Math.max(
    2,
    Math.min(colors.length, MAX_PERMUTATION_INPUT, permutationDepth)
  )
  const head = colors.slice(0, variableCount)
  const fixedTail = colors.slice(variableCount)
  const permutations = generatePermutations(head, limit)

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
  const persistedSettings = loadPersistedSettings()

  const [graphState, setGraphState] = createSignal<EditorGraphState | null>(null)
  const [assetId, setAssetId] = createSignal<ReturnType<typeof createAssetId> | null>(
    null
  )
  const [error, setError] = createSignal<string | null>(null)
  const [isExporting, setIsExporting] = createSignal(false)
  const [palette, setPalette] = createSignal<readonly RGB[]>(
    persistedSettings?.palette ?? initialPalette
  )
  const [sigmoidMidpoint, setSigmoidMidpoint] = createSignal(
    persistedSettings?.sigmoidMidpoint ?? DEFAULT_SIGMOID_MIDPOINT
  )
  const [sigmoidStrength, setSigmoidStrength] = createSignal(
    persistedSettings?.sigmoidStrength ?? DEFAULT_SIGMOID_STRENGTH
  )
  const [permutationCards, setPermutationCards] =
    createSignal<readonly Permutation[]>([])
  const [capabilities, setCapabilities] =
    createSignal<ExportCapabilities>(DEFAULT_EXPORT_CAPABILITIES)
  const [exportFormat, setExportFormat] =
    createSignal<ExportFormat>(persistedSettings?.exportFormat ?? 'png')
  const [exportQuality, setExportQuality] = createSignal(
    persistedSettings?.exportQuality ?? DEFAULT_EXPORT_QUALITY
  )
  const [exportLongEdge, setExportLongEdge] = createSignal<number | null>(
    persistedSettings?.exportLongEdge ?? null
  )
  const [exportAllPermutations, setExportAllPermutations] =
    createSignal(persistedSettings?.exportAllPermutations ?? false)
  const [previewLimit, setPreviewLimit] = createSignal(
    persistedSettings?.previewLimit ?? PERMUTATION_CARD_LIMIT
  )
  const [previewPermutationDepth, setPreviewPermutationDepth] =
    createSignal(persistedSettings?.previewPermutationDepth ?? MAX_PERMUTATION_INPUT)
  const [viewportSize, setViewportSize] = createSignal({ width: 960, height: 640 })
  const [isPermutationDrawerOpen, setIsPermutationDrawerOpen] = createSignal(false)
  const [isDragActive, setIsDragActive] = createSignal(false)
  const [isExportMenuOpen, setIsExportMenuOpen] = createSignal(false)
  const [isAdvancedMenuOpen, setIsAdvancedMenuOpen] = createSignal(false)

  let viewportRef: HTMLDivElement | undefined
  let canvasRef: HTMLCanvasElement | undefined
  let fileInputRef: HTMLInputElement | undefined
  let exportMenuRef: HTMLDivElement | undefined
  let exportButtonRef: HTMLButtonElement | undefined
  let advancedMenuRef: HTMLDivElement | undefined
  let advancedButtonRef: HTMLButtonElement | undefined
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
      console.info(
        `[preview] backend=${result.stats.backend} elapsedMs=${Math.round(result.stats.elapsedMs)} size=${result.stats.width}x${result.stats.height}`
      )
    } catch (renderError) {
      const message =
        renderError instanceof Error
          ? renderError.message
          : 'Preview render failed unexpectedly'

      if (!message.toLowerCase().includes('cancel')) {
        setError(message)
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
      const currentPreviewLimit = Math.max(1, previewLimit())
      const currentPermutationDepth = Math.max(2, previewPermutationDepth())
      void requestPreview(createTritonizerPath(state, baseParams, basePalette))
      const existingCards = permutationCards()
      const shouldBuildCards =
        refreshCards ||
        (existingCards.length === 0 && basePalette.length >= 2)
      if (shouldBuildCards) {
        const cards = buildPermutationCards(
          basePalette,
          basePalette,
          currentPreviewLimit,
          currentPermutationDepth
        )
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

  const buildExportOptions = () => {
    const format = exportFormat()
    const maybeQuality =
      format === 'png' || format === 'tiff' ? undefined : exportQuality()
    const maybeTargetLongEdge = exportLongEdge() ?? undefined

    return decodeUnknownSync(ExportOptionsSchema, {
      format,
      colorProfile: 'srgb',
      metadataPolicy: 'preserve-when-possible',
      ...(maybeQuality === undefined ? {} : { quality: maybeQuality }),
      ...(maybeTargetLongEdge === undefined ? {} : { targetLongEdge: maybeTargetLongEdge }),
    })
  }

  const buildExportTargets = (): readonly (readonly RGB[])[] => {
    const basePalette = normalizePaletteForRender(palette())
    if (exportAllPermutations() && basePalette.length >= 2) {
      return buildPermutationCards(
        basePalette,
        basePalette,
        Math.max(1, previewLimit()),
        Math.max(2, previewPermutationDepth())
      ).map((card) => card.colors)
    }

    return [basePalette]
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

    const normalizedTargets = buildExportTargets()
    const options = buildExportOptions()
    let exportMs = 0
    let exportBytes = 0

    try {
      for (let i = 0; i < normalizedTargets.length; i += 1) {
        const targetPalette = normalizedTargets[i]
        if (!targetPalette) {
          continue
        }

        const result = await orchestrator.queueExport({
          assetId: currentAssetId,
          nodePath: createTritonizerPath(state, params(), targetPalette),
          exportOptions: options,
        })

        exportMs = Math.round(result.stats.elapsedMs)
        exportBytes += result.blob.size

        const fileSuffix =
          normalizedTargets.length > 1
            ? `-${i + 1}-of-${normalizedTargets.length}`
            : ''
        const url = URL.createObjectURL(result.blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `tritonizer${fileSuffix}.${format === 'jpeg' ? 'jpg' : format}`
        anchor.click()
        URL.revokeObjectURL(url)
      }

      if (normalizedTargets.length > 1) {
        console.info(
          `[export] format=${format} count=${normalizedTargets.length} totalKB=${Math.round(exportBytes / 1024)} elapsedMs=${exportMs}`
        )
      } else {
        console.info(
          `[export] format=${format} count=1 totalKB=${Math.round(exportBytes / 1024)} elapsedMs=${exportMs}`
        )
      }
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : 'Export failed unexpectedly'
      )
    } finally {
      setIsExporting(false)
      setIsExportMenuOpen(false)
    }
  }

  const isExportControlDisabled = (): boolean => !graphState() || isExporting()
  const isExportAllPermutationsDisabled = (): boolean =>
    isExportControlDisabled() || palette().length < 2

  const handleExportButtonToggle = (event: Event): void => {
    if (isExportControlDisabled()) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setIsAdvancedMenuOpen(false)
    setIsExportMenuOpen((open) => !open)
  }

  const closeExportMenu = (): void => {
    setIsExportMenuOpen(false)
  }

  const handleAdvancedButtonToggle = (event: Event): void => {
    event.preventDefault()
    event.stopPropagation()
    setIsExportMenuOpen(false)
    setIsAdvancedMenuOpen((open) => !open)
  }

  const closeAdvancedMenu = (): void => {
    setIsAdvancedMenuOpen(false)
  }

  const handleFileLoad = async (blob: Blob): Promise<void> => {
    setError(null)

    try {
      const dimensions = await readImageDimensions(blob)
      const nextAssetId = createAssetId()
      const nextState = createEditorGraphState({
        assetId: nextAssetId,
        width: dimensions.width,
        height: dimensions.height,
      })

      setAssetId(nextAssetId)
      setGraphState(nextState)
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

    const closeMenusOnOutsideInteraction = (event: PointerEvent): void => {
      const target = event.target
      if (!target || !(target instanceof Node)) {
        return
      }

      if (
        isExportMenuOpen() &&
        exportMenuRef &&
        exportButtonRef &&
        !exportMenuRef.contains(target) &&
        !exportButtonRef.contains(target)
      ) {
        closeExportMenu()
      }

      if (
        isAdvancedMenuOpen() &&
        advancedMenuRef &&
        advancedButtonRef &&
        !advancedMenuRef.contains(target) &&
        !advancedButtonRef.contains(target)
      ) {
        closeAdvancedMenu()
      }
    }

    window.addEventListener('pointerdown', closeMenusOnOutsideInteraction)
    onCleanup(() => {
      window.removeEventListener('pointerdown', closeMenusOnOutsideInteraction)
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
    const limit = previewLimit()
    const depth = previewPermutationDepth()
    const viewport = viewportSize()

    void state
    void loadedAssetId
    void colorState
    void midpoint
    void strength
    void limit
    void depth
    void viewport
    if (viewport.width > 0 && viewport.height > 0) {
      scheduleLiveRender({ refreshCards: false })
    }
  })

  createEffect(() => {
    persistSettings({
      palette: palette(),
      sigmoidMidpoint: sigmoidMidpoint(),
      sigmoidStrength: sigmoidStrength(),
      previewLimit: previewLimit(),
      previewPermutationDepth: previewPermutationDepth(),
      exportFormat: exportFormat(),
      exportQuality: exportQuality(),
      exportLongEdge: exportLongEdge(),
      exportAllPermutations: exportAllPermutations(),
    })
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

  const permutationReadyCount = (): number => {
    const cards = permutationCards()
    let ready = 0
    for (const card of cards) {
      if (card.url) {
        ready += 1
      }
    }

    return ready
  }

  const resetSettingsToDefaults = (): void => {
    setPalette(initialPalette)
    setSigmoidMidpoint(DEFAULT_SIGMOID_MIDPOINT)
    setSigmoidStrength(DEFAULT_SIGMOID_STRENGTH)
    setPreviewLimit(PERMUTATION_CARD_LIMIT)
    setPreviewPermutationDepth(MAX_PERMUTATION_INPUT)
    setExportFormat('png')
    setExportQuality(DEFAULT_EXPORT_QUALITY)
    setExportLongEdge(null)
    setExportAllPermutations(false)
    setIsAdvancedMenuOpen(false)
    clearPersistedSettings()
    scheduleLiveRender()
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
        <h1 class="editor-title">Tritonize</h1>
      </header>

      <section
        class="editor-viewport-wrap"
        classList={{ 'drawer-open': isPermutationDrawerOpen() }}
      >
        <section class="viewport-panel">
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
            <Show when={assetId()}>
              <div class="export-menu-wrapper viewport-export-menu">
                <button
                  ref={exportButtonRef}
                  class="viewport-export-icon"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    handleExportButtonToggle(event)
                  }}
                  title="Export options"
                  aria-label="Open export options"
                  aria-haspopup="true"
                  aria-expanded={isExportMenuOpen()}
                  disabled={isExportControlDisabled()}
                >
                  <span aria-hidden="true">⤓</span>
                </button>

                <Show when={isExportMenuOpen()}>
                  <div
                    class="export-tooltip"
                    ref={exportMenuRef}
                    role="menu"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        closeExportMenu()
                      }
                    }}
                  >
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
                        <For each={exportFormats}>
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

                    <label class="export-all-option">
                      <input
                        type="checkbox"
                        checked={exportAllPermutations()}
                        disabled={isExportAllPermutationsDisabled()}
                        onChange={(event) =>
                          setExportAllPermutations(event.currentTarget.checked)
                        }
                      />
                      <span>Export all previews</span>
                    </label>

                    <button
                      class="primary"
                      onClick={() => {
                        closeExportMenu()
                        void requestExport()
                      }}
                      disabled={isExportControlDisabled()}
                    >
                      {exportAllPermutations() ? 'Export all' : 'Export'}
                    </button>
                  </div>
                </Show>
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
            <Show when={error()}>
              {(message) => <p class="viewport-error">{message()}</p>}
            </Show>
          </div>
        </section>

        <aside
          class="panel permutations-panel"
          classList={{ open: isPermutationDrawerOpen() }}
        >
          <div class="permutations-header">
            <h2>Previews</h2>
            <Show when={permutationCards().length > 0}>
              <span class="permutations-count">
                {permutationReadyCount()}/{permutationCards().length}
              </span>
            </Show>
          </div>
          <Show when={!assetId()}>
            <p class="helper">Load an image to generate preview variants.</p>
          </Show>
          <Show when={assetId() && palette().length < 2}>
            <p class="helper">Add a second color to generate preview variants.</p>
          </Show>
          <Show
            when={
              assetId() &&
              permutationCards().length > 0 &&
              permutationReadyCount() < permutationCards().length
            }
          >
            <p class="helper permutation-progress">
              Rendering {permutationReadyCount()} of {permutationCards().length}
            </p>
          </Show>
          <Show when={assetId() && palette().length >= 2}>
            <Show when={palette().length === 2}>
              <p class="helper">Add one more color to generate preview variants</p>
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
                    <div class="perm-swatches" aria-hidden="true">
                      <For each={card.colors}>
                        {(color) => (
                          <span style={{ 'background-color': rgbToHex(color) }} />
                        )}
                      </For>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </aside>
      </section>
      <input
        ref={fileInputRef}
        class="hidden-file-input"
        type="file"
        accept={FILE_INPUT_ACCEPT}
        onChange={handleOpenImage}
      />

      <footer class="editor-toolbar panel">
        <div class="toolbar-groups">
          <section class="toolbar-group">
            <h3>Palette</h3>
            <div class="palette-grid">
              <For each={palette()}>
                {(color, index) => (
                  <div class="palette-entry">
                    <label>
                      <span class="palette-label">#{index() + 1}</span>
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
              <button class="subtle" onClick={resetSettingsToDefaults}>
                Defaults
              </button>

              <div class="advanced-trigger-wrap">
                <button
                  ref={advancedButtonRef}
                  class="advanced-trigger"
                  onClick={handleAdvancedButtonToggle}
                  aria-haspopup="true"
                  aria-expanded={isAdvancedMenuOpen()}
                >
                  Advanced
                </button>

                <Show when={isAdvancedMenuOpen()}>
                  <div
                    class="advanced-panel"
                    ref={advancedMenuRef}
                    role="menu"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        closeAdvancedMenu()
                      }
                    }}
                  >
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
                    <label>
                      <span>Preview count ({previewLimit()})</span>
                      <input
                        type="range"
                        min={MIN_PREVIEW_LIMIT}
                        max={MAX_PREVIEW_LIMIT}
                        step={1}
                        value={previewLimit()}
                        onInput={(event) => {
                          setPreviewLimit(Number(event.currentTarget.value))
                          scheduleLiveRender()
                        }}
                      />
                    </label>
                    <label>
                      <span>
                        Permutation depth (
                        {Math.min(
                          palette().length,
                          MAX_PERMUTATION_INPUT,
                          Math.max(2, previewPermutationDepth())
                        )}
                        )
                      </span>
                      <input
                        type="range"
                        min={2}
                        max={Math.max(2, Math.min(palette().length, MAX_PERMUTATION_INPUT))}
                        step={1}
                        value={Math.min(
                          Math.max(2, previewPermutationDepth()),
                          Math.max(2, Math.min(palette().length, MAX_PERMUTATION_INPUT))
                        )}
                        onInput={(event) => {
                          setPreviewPermutationDepth(Number(event.currentTarget.value))
                          scheduleLiveRender()
                        }}
                      />
                    </label>
                  </div>
                </Show>
              </div>
            </div>
          </section>

        </div>
      </footer>
    </main>
  )
}
