#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const host = process.env.PERF_HOST ?? '127.0.0.1'
const port = Number(process.env.PERF_PORT ?? 4174)
const baseUrl = `http://${host}:${port}`

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(url, timeoutMs = 30_000) {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // wait and retry
    }

    await wait(250)
  }

  throw new Error(`Timed out waiting for server at ${url}`)
}

async function withServer(run) {
  const preview = spawn(
    'bunx',
    ['--bun', 'vite', 'preview', '--host', host, '--port', String(port), '--strictPort'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    }
  )

  preview.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
  })

  preview.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
  })

  try {
    await waitForServer(`${baseUrl}/perf.html`)
    return await run()
  } finally {
    preview.kill('SIGTERM')
    await wait(200)
    if (!preview.killed) {
      preview.kill('SIGKILL')
    }
  }
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', (error) => reject(error))
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`Command failed: ${command} ${args.join(' ')} (exit ${code})`))
    })
  })
}

async function launchBrowser() {
  const launchOptions = {
    headless: true,
    args: [
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--use-angle=swiftshader',
      '--use-gl=angle',
    ],
  }

  try {
    return await chromium.launch(launchOptions)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes("Executable doesn't exist")) {
      throw error
    }

    process.stdout.write(
      'Chromium browser binary not found, installing Playwright Chromium...\n'
    )
    await runCommand('npx', ['playwright', 'install', 'chromium'])
    return chromium.launch(launchOptions)
  }
}

function resolveNumber(name, fallback) {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function main() {
  const config = {
    sourceWidth: resolveNumber('PERF_SOURCE_WIDTH', 8000),
    sourceHeight: resolveNumber('PERF_SOURCE_HEIGHT', 6000),
    previewWidth: resolveNumber('PERF_PREVIEW_WIDTH', 1600),
    previewHeight: resolveNumber('PERF_PREVIEW_HEIGHT', 900),
    warmupIterations: resolveNumber('PERF_WARMUP_ITERATIONS', 2),
    previewIterations: resolveNumber('PERF_PREVIEW_ITERATIONS', 5),
    exportIterations: resolveNumber('PERF_EXPORT_ITERATIONS', 3),
    previewP95TargetMs: resolveNumber('PERF_PREVIEW_P95_MS', 120),
    exportP95TargetMs: resolveNumber('PERF_EXPORT_P95_MS', 8000),
    maxLongTaskMsTarget: resolveNumber('PERF_MAX_LONG_TASK_MS', 50),
  }

  const result = await withServer(async () => {
    const browser = await launchBrowser()
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await page.goto(`${baseUrl}/perf.html`, { waitUntil: 'networkidle' })
      await page.waitForFunction(() => typeof window.runPerfBenchmarks === 'function', {
        timeout: 30_000,
      })

      const benchmarkResult = await page.evaluate(async (runtimeConfig) => {
        const run = window.runPerfBenchmarks
        if (!run) {
          throw new Error('Perf harness function missing')
        }

        return run(runtimeConfig)
      }, config)

      return benchmarkResult
    } finally {
      await context.close()
      await browser.close()
    }
  })

  await mkdir(path.join(process.cwd(), 'perf-results'), { recursive: true })
  await writeFile(
    path.join(process.cwd(), 'perf-results', 'latest.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8'
  )

  process.stdout.write('\nPerf summary\n')
  process.stdout.write(`Preview p95: ${result.preview.p95Ms.toFixed(2)}ms\n`)
  process.stdout.write(`Export p95: ${result.export.p95Ms.toFixed(2)}ms\n`)
  process.stdout.write(`Max long task: ${result.longTasks.maxMs.toFixed(2)}ms\n`)

  if (!result.passed) {
    for (const failure of result.failures) {
      process.stderr.write(`FAIL: ${failure}\n`)
    }

    process.exit(1)
  }

  process.stdout.write('Performance gate passed\n')
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
