/** Renderer-local registry. API function identity also works across region bridges. */
export function createTelemetryRegistry<T>() {
  const entries = new WeakMap<object, { source: T, users: number }>()
  return {
    acquire(key: object, create: () => T, dispose: (source: T) => void) {
      let entry = entries.get(key)
      if (!entry) { entry = { source: create(), users: 0 }; entries.set(key, entry) }
      entry.users++
      let released = false
      return {
        source: entry.source,
        release() {
          if (released) return
          released = true
          if (--entry.users === 0) { entries.delete(key); dispose(entry.source) }
        },
      }
    },
  }
}
