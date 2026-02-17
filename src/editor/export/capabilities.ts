import type { ExportOptions } from '@/editor/types/domain'

export interface ExportCapabilities {
  readonly jpeg: boolean
  readonly png: boolean
  readonly webp: boolean
  readonly avif: boolean
  readonly tiff: boolean
}

const MIME_MAP: Record<ExportOptions['format'], string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  tiff: 'image/tiff',
}

async function supportsMimeType(mimeType: string): Promise<boolean> {
  if (typeof OffscreenCanvas === 'undefined') {
    return false
  }

  try {
    const canvas = new OffscreenCanvas(2, 2)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return false
    }

    ctx.fillStyle = '#101820'
    ctx.fillRect(0, 0, 2, 2)

    const blob = await canvas.convertToBlob({ type: mimeType, quality: 0.9 })
    return blob.type === mimeType
  } catch {
    return false
  }
}

export async function detectExportCapabilities(): Promise<ExportCapabilities> {
  const [jpeg, png, webp, avif, tiff] = await Promise.all([
    supportsMimeType(MIME_MAP.jpeg),
    supportsMimeType(MIME_MAP.png),
    supportsMimeType(MIME_MAP.webp),
    supportsMimeType(MIME_MAP.avif),
    supportsMimeType(MIME_MAP.tiff),
  ])

  return {
    jpeg,
    png,
    webp,
    avif,
    tiff,
  }
}

export function capabilityForFormat(
  caps: ExportCapabilities,
  format: ExportOptions['format']
): boolean {
  switch (format) {
    case 'jpeg':
      return caps.jpeg
    case 'png':
      return caps.png
    case 'webp':
      return caps.webp
    case 'avif':
      return caps.avif
    case 'tiff':
      return caps.tiff
    default: {
      const neverFormat: never = format
      throw new Error(`Unsupported format ${neverFormat}`)
    }
  }
}
