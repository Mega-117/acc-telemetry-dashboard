import { nextTick } from 'vue'
import { readCommonLive } from '../telemetry/commonLive'

type Receipt = { version: number; bootId: string; sequence: number; valid?: boolean }
const applied: Record<string, Receipt | null> = { fast: null, live: null }
const deliveries: Record<string, Receipt | null> = { fast: null, live: null }
const received: Record<string, number> = { fast: 0, live: 0 }
export function appliedTelemetry(stream: 'fast' | 'live' = 'fast') { return applied[stream] }
export function receivedTelemetry() { return { fast: deliveries.fast, live: deliveries.live } }
export function withRecoveryDeadline<T>(operation: () => Promise<T>, fallback: T, timeoutMs = 10000): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs)
    Promise.resolve().then(operation).then(resolve, () => resolve(fallback)).finally(() => clearTimeout(timer))
  })
}
// Called only after a consumer assigned its normalized Vue state.
export function telemetryApplied(raw: any, valid = true, stream: 'fast' | 'live' = 'fast') {
  // An authoritative fresh OFF frame is valid presentation, not valid driving data.
  // Consumers keep their normalized empty state; only the post-Vue receipt is healthy.
  const common = !valid ? readCommonLive(raw?.live ?? raw) : null
  const presentationValid = valid || !!(common?.fresh && !common.connected && common.lifecycle === 'off')
  const token = received[stream] = (received[stream] ?? 0) + 1
  const receipt = raw?.hud_transport
  if (receipt?.version !== 1 || typeof receipt.bootId !== 'string'
    || receipt.bootId.length > 100 || !Number.isSafeInteger(receipt.sequence)) return
  deliveries[stream] = { version: 1, bootId: receipt.bootId, sequence: receipt.sequence }
  void nextTick(() => {
    if (token === received[stream]) applied[stream] = { version: 1, bootId: receipt.bootId, sequence: receipt.sequence, valid: presentationValid }
  })
}

/** Deadline ends an attempt, never its push subscription. Late results are discarded. */
export function createTelemetryPull<T>(read: () => Promise<T>, apply: (value: T) => void,
  report: (reason: string) => void = () => {}, deadlineMs = 10000) {
  let generation = 0, pending = false, stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let finish: (() => void) | null = null
  function invalidate() { generation++ }
  function poll(): Promise<void> {
    if (pending || stopped) return Promise.resolve()
    pending = true
    const attempt = generation
    return new Promise(resolve => {
      const complete = () => {
        if (timer !== null) clearTimeout(timer)
        timer = null; pending = false; finish = null; resolve()
      }
      finish = complete
      timer = setTimeout(() => {
        generation++; report('ipc-timeout'); complete()
      }, deadlineMs)
      let result: Promise<T>
      try { result = read() } catch { report('ipc-error'); complete(); return }
      Promise.resolve(result).then(value => {
        if (attempt === generation && !stopped) apply(value)
      }).catch(() => { if (attempt === generation && !stopped) report('ipc-error') })
        .finally(() => { if (finish === complete) complete() })
    })
  }
  return { poll, invalidate, stop() { stopped = true; invalidate(); finish?.() } }
}
