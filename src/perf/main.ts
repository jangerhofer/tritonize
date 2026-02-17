import { applyOperation, createEditorGraphState, getNodePath } from '@/editor/domain'
import { createAssetId } from '@/editor/domain/ids'
import { EditorRenderOrchestrator } from '@/editor/engine'
import { decodeUnknownSync } from '@/editor/types/schema_tools'
import { ExportOptionsSchema } from '@/editor/types/schemas'
import type { Operation, PipelineNode } from '@/editor/types/domain'

interface PerfHarnessConfig {
  readonly sourceWidth: number
  readonly sourceHeight: number
  readonly previewWidth: number
  readonly previewHeight: number
  readonly warmupIterations: number
  readonly previewIterations: number
  readonly exportIterations: number
  readonly previewP95TargetMs: number
  readonly exportP95TargetMs: number
  readonly maxLongTaskMsTarget: number
}

interface PerfSeriesResult {
  readonly samplesMs: readonly number[]
  readonly p95Ms: number
  readonly meanMs: number
  readonly maxMs: number
}

interface PerfHarnessResult {
  readonly config: PerfHarnessConfig
  readonly preview: PerfSeriesResult
  readonly export: PerfSeriesResult
  readonly longTasks: {
    readonly count: number
    readonly maxMs: number
  }
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly timestamp: string
}

declare global {
  interface Window {
    runPerfBenchmarks?: (override?: Partial<PerfHarnessConfig>) => Promise<PerfHarnessResult>
    latestPerfResult?: PerfHarnessResult
  }
}

const defaultConfig: PerfHarnessConfig = {
  sourceWidth: 8000,
  sourceHeight: 6000,
  previewWidth: 1600,
  previewHeight: 900,
  warmupIterations: 2,
  previewIterations: 5,
  exportIterations: 3,
  previewP95TargetMs: 120,
  exportP95TargetMs: 8000,
  maxLongTaskMsTarget: 50,
}

function percentile95(samples: readonly number[]): number {
  if (samples.length === 0) {
    return 0
  }

  const sorted = [...samples].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  )

  return sorted[index] ?? 0
}

function mean(samples: readonly number[]): number {
  if (samples.length === 0) {
    return 0
  }

  const total = samples.reduce((sum, sample) => sum + sample, 0)
  return total / samples.length
}

function maxValue(samples: readonly number[]): number {
  if (samples.length === 0) {
    return 0
  }

  return Math.max(...samples)
}

function toSeries(samples: readonly number[]): PerfSeriesResult {
  return {
    samplesMs: samples,
    p95Ms: percentile95(samples),
    meanMs: mean(samples),
    maxMs: maxValue(samples),
  }
}

function createLongTaskTracker(): {
  readonly stop: () => { readonly count: number; readonly maxMs: number }
} {
  const durations: number[] = []

  if (!('PerformanceObserver' in window)) {
    return {
      stop: () => ({ count: 0, maxMs: 0 }),
    }
  }

  let observer: PerformanceObserver | null = null

  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        durations.push(entry.duration)
      }
    })

    observer.observe({ entryTypes: ['longtask'] })
  } catch {
    observer = null
  }

  return {
    stop: () => {
      observer?.disconnect()
      return {
        count: durations.length,
        maxMs: maxValue(durations),
      }
    },
  }
}

function buildOperationPath(): readonly Operation[] {
  return [
    {
      type: 'tritonizer',
      params: {
        colors: [
          [198, 12, 48],
          [255, 255, 255],
          [0, 0, 0],
        ],
        sigmoidMidpoint: 0.5,
        sigmoidStrength: 1,
      },
    },
  ]
}

function buildNodePath(
  sourceAssetId: ReturnType<typeof createAssetId>,
  width: number,
  height: number
): readonly PipelineNode[] {
  let graph = createEditorGraphState({
    assetId: sourceAssetId,
    width,
    height,
  })

  for (const operation of buildOperationPath()) {
    graph = applyOperation(graph, operation)
  }

  return getNodePath(graph)
}

async function createSyntheticSourceBlob(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create 2d context for perf source image')
  }

  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#1c3f78')
  gradient.addColorStop(0.4, '#83a2c8')
  gradient.addColorStop(0.7, '#f9d7b6')
  gradient.addColorStop(1, '#61241f')

  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)

  context.globalAlpha = 0.08
  for (let y = 0; y < height; y += 256) {
    context.fillStyle = y % 512 === 0 ? '#ffffff' : '#000000'
    context.fillRect(0, y, width, 96)
  }
  context.globalAlpha = 1

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error('Failed to create synthetic perf blob'))
        return
      }

      resolve(value)
    }, 'image/png')
  })

  return blob
}

async function runPerfBenchmarks(
  override: Partial<PerfHarnessConfig> = {}
): Promise<PerfHarnessResult> {
  const config: PerfHarnessConfig = {
    ...defaultConfig,
    ...override,
  }

  const orchestrator = new EditorRenderOrchestrator()
  const assetId = createAssetId('perf_asset')

  await orchestrator.init()

  const sourceBlob = await createSyntheticSourceBlob(
    config.sourceWidth,
    config.sourceHeight
  )

  await orchestrator.loadAsset(assetId, sourceBlob)

  const nodePath = buildNodePath(assetId, config.sourceWidth, config.sourceHeight)
  const tracker = createLongTaskTracker()

  for (let index = 0; index < config.warmupIterations; index++) {
    const warmup = await orchestrator.renderPreview({
      assetId,
      nodePath,
      width: config.previewWidth,
      height: config.previewHeight,
      zoom: 1,
      panX: 0,
      panY: 0,
    })

    warmup.bitmap.close()
  }

  const previewSamples: number[] = []

  for (let index = 0; index < config.previewIterations; index++) {
    const preview = await orchestrator.renderPreview({
      assetId,
      nodePath,
      width: config.previewWidth,
      height: config.previewHeight,
      zoom: 1,
      panX: 0,
      panY: 0,
    })
    preview.bitmap.close()
    previewSamples.push(preview.stats.elapsedMs)
  }

  const exportOptions = decodeUnknownSync(ExportOptionsSchema, {
    format: 'png',
    colorProfile: 'srgb',
    metadataPolicy: 'strip',
  })

  const exportSamples: number[] = []

  for (let index = 0; index < config.exportIterations; index++) {
    const exported = await orchestrator.queueExport({
      assetId,
      nodePath,
      exportOptions,
    })
    exportSamples.push(exported.stats.elapsedMs)

    if (exported.blob.size <= 0) {
      throw new Error('Export produced an empty blob')
    }
  }

  const preview = toSeries(previewSamples)
  const exportSeries = toSeries(exportSamples)
  const longTasks = tracker.stop()

  const failures: string[] = []
  if (preview.p95Ms > config.previewP95TargetMs) {
    failures.push(
      `Preview p95 ${preview.p95Ms.toFixed(2)}ms > ${config.previewP95TargetMs}ms`
    )
  }

  if (exportSeries.p95Ms > config.exportP95TargetMs) {
    failures.push(
      `Export p95 ${exportSeries.p95Ms.toFixed(2)}ms > ${config.exportP95TargetMs}ms`
    )
  }

  if (longTasks.maxMs > config.maxLongTaskMsTarget) {
    failures.push(
      `Max main-thread long task ${longTasks.maxMs.toFixed(2)}ms > ${config.maxLongTaskMsTarget}ms`
    )
  }

  await orchestrator.disposeAsset(assetId)
  orchestrator.dispose()

  const result: PerfHarnessResult = {
    config,
    preview,
    export: exportSeries,
    longTasks,
    passed: failures.length === 0,
    failures,
    timestamp: new Date().toISOString(),
  }

  window.latestPerfResult = result
  return result
}

function mountPerfUi(): void {
  const root = document.getElementById('root')
  if (!root) {
    return
  }

  const runButton = document.createElement('button')
  runButton.textContent = 'Run Perf Benchmarks'

  const output = document.createElement('pre')
  output.style.whiteSpace = 'pre-wrap'

  runButton.onclick = () => {
    output.textContent = 'Running...'
    void runPerfBenchmarks()
      .then((result) => {
        output.textContent = JSON.stringify(result, null, 2)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Unknown benchmark error'
        output.textContent = message
      })
  }

  root.append(runButton, output)
}

window.runPerfBenchmarks = runPerfBenchmarks
mountPerfUi()
