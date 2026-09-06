/** Compare semantic state, independent of object key order and timestamps. */
export function stablePitwallValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stablePitwallValue).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stablePitwallValue(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** Coalesce local changes; never retry a failed write on a periodic timer. */
export function createPitwallChangePublisher<T>(publish: (value: T) => Promise<void>, onError: (error: unknown) => void, delayMs = 100) {
  let last = ''
  let latest: T | undefined
  let timer: ReturnType<typeof setTimeout> | null = null
  let busy = false
  let stopped = false
  let generation = 0
  async function flush() {
    timer = null
    if (stopped || busy || latest === undefined) return
    const value = latest
    latest = undefined
    const signature = stablePitwallValue(value)
    if (signature === last) return
    const epoch = generation
    busy = true
    try { await publish(value); if (epoch === generation) last = signature }
    catch (error) { onError(error) }
    finally { busy = false; if (!stopped && latest !== undefined) schedule() }
  }
  function schedule() { if (!timer && !busy && !stopped) timer = setTimeout(() => { void flush() }, delayMs) }
  return {
    offer(value: T) { if (!stopped) { latest = value; schedule() } },
    reset() { generation++; last = ''; latest = undefined; if (timer) clearTimeout(timer); timer = null },
    stop() { stopped = true; latest = undefined; if (timer) clearTimeout(timer); timer = null },
  }
}
