import { describe, expect, it } from 'vitest'
import {
  EngineRequestSchema,
  EngineResponseSchema,
} from './protocol'
import { decodeUnknownEither, decodeUnknownSync } from '@/editor/types/schema_tools'

describe('engine protocol schemas', () => {
  it('decodes valid renderPreview request', () => {
    const decoded = decodeUnknownSync(EngineRequestSchema, {
      kind: 'renderPreview',
      jobId: 'job_1',
      assetId: 'asset_1',
      nodePath: [],
      viewport: {
        zoom: 1,
        panX: 0,
        panY: 0,
      },
      dimensions: {
        width: 1280,
        height: 720,
      },
    })

    expect(decoded.kind).toBe('renderPreview')
  })

  it('rejects unsupported request kind', () => {
    const decoded = decodeUnknownEither(EngineRequestSchema, {
      kind: 'refreshEverything',
    })

    expect(decoded.ok).toBe(false)
  })

  it('decodes protocol error responses', () => {
    const decoded = decodeUnknownSync(EngineResponseSchema, {
      kind: 'error',
      code: 'E_INVALID_PAYLOAD',
      message: 'Invalid payload',
      jobId: 'job_2',
    })

    expect(decoded.kind).toBe('error')
  })
})
