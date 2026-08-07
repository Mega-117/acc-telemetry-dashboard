import { ref } from 'vue'
import type { StandingsStateEnvelope } from '~/services/overlay/standingsPresentation'

function unavailable(reason: string): StandingsStateEnvelope {
  return { status: 'unavailable', reason, snapshot: null }
}

function normalizeBridgeEnvelope(value: unknown): StandingsStateEnvelope {
  if (!value || typeof value !== 'object') return unavailable('invalid-bridge-envelope')
  const candidate = value as Partial<StandingsStateEnvelope>
  if (candidate.status === 'unavailable') {
    return unavailable(typeof candidate.reason === 'string' ? candidate.reason : 'unavailable')
  }
  if (candidate.status !== 'available' || !candidate.snapshot || typeof candidate.snapshot !== 'object') {
    return unavailable('invalid-bridge-envelope')
  }
  return {
    status: 'available',
    reason: null,
    snapshot: candidate.snapshot,
  }
}

/**
 * Renderer lifecycle for standings.json. Electron performs the authoritative
 * validation; this composable owns subscription symmetry, a 1s stale-safety
 * pull, and explicit reset on every unavailable/error envelope.
 */
export function useStandingsState(getApi: () => any | null, pollIntervalMs = 1000) {
  const state = ref<StandingsStateEnvelope>(unavailable('not-started'))
  const nowMs = ref(Date.now())
  let unsubscribe: (() => void) | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let requestVersion = 0

  function apply(value: unknown): void {
    nowMs.value = Date.now()
    state.value = normalizeBridgeEnvelope(value)
  }

  async function refresh(): Promise<StandingsStateEnvelope> {
    const bridge = getApi()
    if (typeof bridge?.getStandingsState !== 'function') {
      apply(unavailable('bridge-unavailable'))
      return state.value
    }
    const version = ++requestVersion
    try {
      const value = await bridge.getStandingsState()
      if (version === requestVersion) apply(value)
    } catch {
      if (version === requestVersion) apply(unavailable('bridge-error'))
    }
    return state.value
  }

  function start(): void {
    stop()
    const bridge = getApi()
    if (typeof bridge?.onStandingsStateUpdate === 'function') {
      unsubscribe = bridge.onStandingsStateUpdate((value: unknown) => {
        requestVersion += 1
        apply(value)
      })
    }
    void refresh()
    pollTimer = setInterval(() => {
      nowMs.value = Date.now()
      void refresh()
    }, Math.max(250, pollIntervalMs))
  }

  function stop(): void {
    requestVersion += 1
    if (unsubscribe) {
      try { unsubscribe() } catch { /* listener already removed */ }
      unsubscribe = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  return { state, nowMs, refresh, start, stop }
}
