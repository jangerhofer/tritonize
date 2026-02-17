import { describe, expectTypeOf, it } from 'vitest'
import type { DocId, NodeId, Operation } from './domain'
import { decodeUnknownSync } from './schema_tools'
import { DocIdSchema, OperationSchema } from './schemas'

describe('type-level constraints', () => {
  it('brands ids', () => {
    const id = decodeUnknownSync(DocIdSchema, 'doc_1')

    expectTypeOf(id).toMatchTypeOf<DocId>()
    expectTypeOf(id).not.toMatchTypeOf<NodeId>()
  })

  it('keeps operation union discriminated', () => {
    const operation = decodeUnknownSync(OperationSchema, {
      type: 'exposure',
      params: { value: 0.2 },
    })

    expectTypeOf(operation).toMatchTypeOf<Operation>()
  })
})
