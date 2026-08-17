export interface OwnerOperationTracker {
  track<T>(operation: Promise<T>): Promise<T>
  drain(): Promise<void>
  size(): number
}

export function createOwnerOperationTracker(): OwnerOperationTracker {
  const active = new Set<Promise<unknown>>()

  function track<T>(operation: Promise<T>): Promise<T> {
    let tracked!: Promise<T>
    tracked = Promise.resolve(operation).finally(() => {
      active.delete(tracked)
    })
    active.add(tracked)
    return tracked
  }

  async function drain(): Promise<void> {
    while (active.size > 0) {
      await Promise.allSettled([...active])
    }
  }

  return {
    track,
    drain,
    size: () => active.size
  }
}
