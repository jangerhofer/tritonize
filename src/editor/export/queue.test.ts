import { describe, expect, it } from 'vitest'
import { SequentialTaskQueue } from './queue'

describe('SequentialTaskQueue', () => {
  it('runs queued tasks in order', async () => {
    const queue = new SequentialTaskQueue()
    const trace: string[] = []

    await Promise.all([
      queue.enqueue(async () => {
        trace.push('a-start')
        await new Promise((resolve) => setTimeout(resolve, 10))
        trace.push('a-end')
        return 'a'
      }),
      queue.enqueue(async () => {
        trace.push('b-start')
        trace.push('b-end')
        return 'b'
      }),
    ])

    expect(trace).toEqual(['a-start', 'a-end', 'b-start', 'b-end'])
  })
})
