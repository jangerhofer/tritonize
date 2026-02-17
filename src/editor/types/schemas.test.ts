import { describe, expect, it } from 'vitest'
import {
  OperationSchema,
  RotateOperationSchema,
  TritonizerOperationSchema,
} from './schemas'
import { decodeUnknownEither, decodeUnknownSync } from './schema_tools'

describe('editor schemas', () => {
  it('decodes a valid tritonizer operation', () => {
    const decoded = decodeUnknownSync(TritonizerOperationSchema, {
      type: 'tritonizer',
      params: {
        colors: [
          [198, 12, 48],
          [255, 255, 255],
          [0, 0, 0],
        ],
        sigmoidMidpoint: 0.5,
        sigmoidStrength: 1.2,
      },
    })

    expect(decoded.type).toBe('tritonizer')
    expect(decoded.params.colors).toHaveLength(3)
  })

  it('rejects invalid rotate degrees', () => {
    const decoded = decodeUnknownEither(RotateOperationSchema, {
      type: 'rotate',
      params: {
        degrees: 45,
      },
    })

    expect(decoded.ok).toBe(false)
  })

  it('keeps discriminated unions exhaustive', () => {
    const decoded = decodeUnknownSync(OperationSchema, {
      type: 'contrast',
      params: { value: 0.25 },
    })

    expect(decoded.type).toBe('contrast')
  })
})
