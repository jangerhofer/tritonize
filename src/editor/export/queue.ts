export class SequentialTaskQueue {
  private chain: Promise<unknown> = Promise.resolve()

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(() => task())
    this.chain = run.then(
      () => undefined,
      () => undefined
    )

    return run
  }
}
