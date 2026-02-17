import type {
  ExportOptions,
  Operation,
  RGB,
  RenderStats,
} from '@/editor/types/domain'
import { assertNever } from '@/editor/types/domain'

const MAX_COLOR_COUNT = 16
type TritonizerOperation = Extract<Operation, { readonly type: 'tritonizer' }>

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function createCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)))
}

function create2DContext(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', {
    alpha: false,
    colorSpace: 'srgb',
    desynchronized: true,
  })

  if (!ctx) {
    throw new Error('Unable to create 2d context in worker')
  }

  return ctx
}

export function renderBitmapToSize(
  source: ImageBitmap,
  width: number,
  height: number
): ImageBitmap {
  const canvas = createCanvas(width, height)
  const ctx = create2DContext(canvas)
  ctx.drawImage(source, 0, 0, width, height)
  return canvas.transferToImageBitmap()
}

function applyPixelTransform(
  canvas: OffscreenCanvas,
  transform: (pixels: Uint8ClampedArray) => void
): OffscreenCanvas {
  const ctx = create2DContext(canvas)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  transform(imageData.data)
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function grayscale(pixelR: number, pixelG: number, pixelB: number): number {
  return pixelR * 0.299 + pixelG * 0.587 + pixelB * 0.114
}

function applyTritonizerCPU(
  canvas: OffscreenCanvas,
  colors: readonly RGB[],
  sigmoidMidpoint: number,
  sigmoidStrength: number
): OffscreenCanvas {
  const activeColors = colors.slice(0, MAX_COLOR_COUNT)
  const strength = Math.max(0.01, sigmoidStrength * 0.125)

  return applyPixelTransform(canvas, (pixels) => {
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0
      const g = pixels[index + 1] ?? 0
      const b = pixels[index + 2] ?? 0

      const luminance = grayscale(r, g, b) / 255
      const sigmoid = 1 / (1 + Math.exp(-((luminance - sigmoidMidpoint) / strength)))
      const colorIndex = Math.min(
        activeColors.length - 1,
        Math.floor(sigmoid * activeColors.length)
      )

      const color = activeColors[colorIndex]
      if (!color) {
        continue
      }

      pixels[index] = color[0]
      pixels[index + 1] = color[1]
      pixels[index + 2] = color[2]
    }
  })
}

function applyExposure(canvas: OffscreenCanvas, value: number): OffscreenCanvas {
  const amount = value * 255
  return applyPixelTransform(canvas, (pixels) => {
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = clamp((pixels[index] ?? 0) + amount, 0, 255)
      pixels[index + 1] = clamp((pixels[index + 1] ?? 0) + amount, 0, 255)
      pixels[index + 2] = clamp((pixels[index + 2] ?? 0) + amount, 0, 255)
    }
  })
}

function applyContrast(canvas: OffscreenCanvas, value: number): OffscreenCanvas {
  const contrast = clamp(value, -1, 1) * 255
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))

  return applyPixelTransform(canvas, (pixels) => {
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = clamp(factor * ((pixels[index] ?? 0) - 128) + 128, 0, 255)
      pixels[index + 1] = clamp(
        factor * ((pixels[index + 1] ?? 0) - 128) + 128,
        0,
        255
      )
      pixels[index + 2] = clamp(
        factor * ((pixels[index + 2] ?? 0) - 128) + 128,
        0,
        255
      )
    }
  })
}

function applySaturation(canvas: OffscreenCanvas, value: number): OffscreenCanvas {
  const amount = 1 + value

  return applyPixelTransform(canvas, (pixels) => {
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0
      const g = pixels[index + 1] ?? 0
      const b = pixels[index + 2] ?? 0
      const gray = grayscale(r, g, b)

      pixels[index] = clamp(gray + (r - gray) * amount, 0, 255)
      pixels[index + 1] = clamp(gray + (g - gray) * amount, 0, 255)
      pixels[index + 2] = clamp(gray + (b - gray) * amount, 0, 255)
    }
  })
}

function applyVibrance(canvas: OffscreenCanvas, value: number): OffscreenCanvas {
  return applyPixelTransform(canvas, (pixels) => {
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0
      const g = pixels[index + 1] ?? 0
      const b = pixels[index + 2] ?? 0

      const maxChannel = Math.max(r, g, b)
      const avg = (r + g + b) / 3
      const saturation = maxChannel - avg
      const vibrance = 1 + value * (1 - saturation / 255)

      pixels[index] = clamp(avg + (r - avg) * vibrance, 0, 255)
      pixels[index + 1] = clamp(avg + (g - avg) * vibrance, 0, 255)
      pixels[index + 2] = clamp(avg + (b - avg) * vibrance, 0, 255)
    }
  })
}

function applyTemperature(canvas: OffscreenCanvas, value: number): OffscreenCanvas {
  const shift = value * 64
  return applyPixelTransform(canvas, (pixels) => {
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = clamp((pixels[index] ?? 0) + shift, 0, 255)
      pixels[index + 2] = clamp((pixels[index + 2] ?? 0) - shift, 0, 255)
    }
  })
}

function applyTint(canvas: OffscreenCanvas, value: number): OffscreenCanvas {
  const shift = value * 64
  return applyPixelTransform(canvas, (pixels) => {
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index + 1] = clamp((pixels[index + 1] ?? 0) + shift, 0, 255)
    }
  })
}

function applyBlur(canvas: OffscreenCanvas, radius: number): OffscreenCanvas {
  if (radius <= 0) {
    return canvas
  }

  const output = createCanvas(canvas.width, canvas.height)
  const outputCtx = create2DContext(output)
  outputCtx.filter = `blur(${radius}px)`
  outputCtx.drawImage(canvas, 0, 0)
  outputCtx.filter = 'none'
  return output
}

function applyCrop(
  canvas: OffscreenCanvas,
  x: number,
  y: number,
  width: number,
  height: number
): OffscreenCanvas {
  const cropX = clamp(x, 0, canvas.width - 1)
  const cropY = clamp(y, 0, canvas.height - 1)
  const cropWidth = clamp(width, 1, canvas.width - cropX)
  const cropHeight = clamp(height, 1, canvas.height - cropY)

  const output = createCanvas(cropWidth, cropHeight)
  const ctx = create2DContext(output)

  ctx.drawImage(
    canvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  )

  return output
}

function applyRotate(canvas: OffscreenCanvas, degrees: 0 | 90 | 180 | 270): OffscreenCanvas {
  if (degrees === 0) {
    return canvas
  }

  const turns = (degrees / 90) % 4
  const swapDimensions = turns % 2 !== 0

  const output = createCanvas(
    swapDimensions ? canvas.height : canvas.width,
    swapDimensions ? canvas.width : canvas.height
  )

  const ctx = create2DContext(output)
  ctx.translate(output.width / 2, output.height / 2)
  ctx.rotate((degrees * Math.PI) / 180)
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)

  return output
}

export function operationIsTritonizer(
  operation: Operation
): operation is TritonizerOperation {
  return operation.type === 'tritonizer'
}

export function applyCanvasOperation(
  source: ImageBitmap,
  operation: Operation
): ImageBitmap {
  let canvas = createCanvas(source.width, source.height)
  let ctx = create2DContext(canvas)
  ctx.drawImage(source, 0, 0)

  switch (operation.type) {
    case 'tritonizer': {
      canvas = applyTritonizerCPU(
        canvas,
        operation.params.colors,
        operation.params.sigmoidMidpoint,
        operation.params.sigmoidStrength
      )
      break
    }
    case 'exposure': {
      canvas = applyExposure(canvas, operation.params.value)
      break
    }
    case 'contrast': {
      canvas = applyContrast(canvas, operation.params.value)
      break
    }
    case 'saturation': {
      canvas = applySaturation(canvas, operation.params.value)
      break
    }
    case 'vibrance': {
      canvas = applyVibrance(canvas, operation.params.value)
      break
    }
    case 'temperature': {
      canvas = applyTemperature(canvas, operation.params.value)
      break
    }
    case 'tint': {
      canvas = applyTint(canvas, operation.params.value)
      break
    }
    case 'blur': {
      canvas = applyBlur(canvas, operation.params.radius)
      break
    }
    case 'crop': {
      canvas = applyCrop(
        canvas,
        operation.params.x,
        operation.params.y,
        operation.params.width,
        operation.params.height
      )
      break
    }
    case 'rotate': {
      canvas = applyRotate(canvas, operation.params.degrees)
      break
    }
    default:
      assertNever(operation, 'Unhandled operation variant')
  }

  ctx = create2DContext(canvas)
  return ctx.canvas.transferToImageBitmap()
}

export function fitBitmap(
  source: ImageBitmap,
  width: number,
  height: number
): ImageBitmap {
  const target = createCanvas(width, height)
  const ctx = create2DContext(target)

  const scale = Math.min(width / source.width, height / source.height)
  const renderWidth = source.width * scale
  const renderHeight = source.height * scale
  const offsetX = (width - renderWidth) / 2
  const offsetY = (height - renderHeight) / 2

  ctx.fillStyle = '#0f1318'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, offsetX, offsetY, renderWidth, renderHeight)

  return target.transferToImageBitmap()
}

function exportMimeType(format: ExportOptions['format']): string {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'avif':
      return 'image/avif'
    case 'tiff':
      return 'image/tiff'
    default:
      return assertNever(format, 'Unknown export format')
  }
}

export async function bitmapToBlob(
  source: ImageBitmap,
  options: ExportOptions
): Promise<Blob> {
  let canvas = createCanvas(source.width, source.height)
  const ctx = create2DContext(canvas)
  ctx.drawImage(source, 0, 0)

  if (options.targetLongEdge) {
    const longEdge = Math.max(source.width, source.height)
    const ratio = options.targetLongEdge / longEdge
    if (ratio > 0 && ratio < 1) {
      canvas = createCanvas(source.width * ratio, source.height * ratio)
      const resizedCtx = create2DContext(canvas)
      resizedCtx.drawImage(source, 0, 0, canvas.width, canvas.height)
    }
  }

  const mimeType = exportMimeType(options.format)

  try {
    const encodeOptions: ImageEncodeOptions = {
      type: mimeType,
    }

    if (options.quality !== undefined) {
      encodeOptions.quality = options.quality
    }

    return await canvas.convertToBlob(encodeOptions)
  } catch {
    return canvas.convertToBlob({
      type: 'image/png',
    })
  }
}

export function makeStats(
  elapsedMs: number,
  width: number,
  height: number,
  backend: RenderStats['backend']
): RenderStats {
  return {
    elapsedMs,
    width,
    height,
    backend,
  }
}
