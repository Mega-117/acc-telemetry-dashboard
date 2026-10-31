// PIP-701: "at the wheel" changes reach the room only once they have held for a moment. In the pit
// box or in a pause the force feedback can drop and return within a second: without this every flicker
// would be a database write and a status change on the engineer's screen.

export interface SteadyDrivingOptions {
  holdMs?: number
  now?: () => number
  /** Called when a pending change has held long enough, so the caller reads it again. */
  onSettle?: () => void
  schedule?: (callback: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
}

export function createSteadyDriving({ holdMs = 2500, now = () => Date.now(), onSettle,
  schedule = (callback, ms) => setTimeout(callback, ms),
  cancel = handle => clearTimeout(handle as ReturnType<typeof setTimeout>) }: SteadyDrivingOptions = {}) {
  let shown: boolean | null = null
  let pending: boolean | null = null
  let since = 0
  let timer: unknown = null
  const clear = () => { if (timer !== null) cancel(timer); timer = null }
  return {
    /** The value to publish for the raw reading `driving`. */
    read(driving: boolean): boolean {
      if (shown === null) { shown = driving; return shown }
      if (driving === shown) { pending = null; clear(); return shown }
      if (pending !== driving) {
        pending = driving; since = now(); clear()
        if (onSettle) timer = schedule(() => { timer = null; onSettle() }, holdMs + 50)
      }
      if (now() - since >= holdMs) { shown = driving; pending = null; clear() }
      return shown
    },
    reset() { shown = null; pending = null; clear() },
  }
}
