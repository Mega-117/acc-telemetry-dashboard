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

export interface StandingsBridgeMethods {
  pull: string
  subscribe: string
}

const DEFAULT_BRIDGE_METHODS: StandingsBridgeMethods = {
  pull: 'getStandingsState',
  subscribe: 'onStandingsStateUpdate',
}

/**
 * Renderer lifecycle for standings.json. Electron performs the authoritative
 * validation; this composable owns subscription symmetry, a 1s stale-safety
 * pull, and explicit reset on every unavailable/error envelope.
 */
export function useStandingsState(
  getApi: () => any | null,
  pollIntervalMs = 1000,
  bridgeMethods: StandingsBridgeMethods = DEFAULT_BRIDGE_METHODS,
) {
  const state = ref<StandingsStateEnvelope>(unavailable('not-started'))
  const nowMs = ref(Date.now())
  let unsubscribe: (() => void) | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let requestVersion = 0
  let lastPushAtMs: number | null = null

  function apply(value: unknown): void {
    nowMs.value = Date.now()
    state.value = normalizeBridgeEnvelope(value)
  }

  async function refresh(): Promise<StandingsStateEnvelope> {
    const bridge = getApi()
    const pull = bridge?.[bridgeMethods.pull]
    if (typeof pull !== 'function') {
      apply(unavailable('bridge-unavailable'))
      return state.value
    }
    const version = ++requestVersion
    try {
      const value = await pull.call(bridge)
      if (version === requestVersion) apply(value)
    } catch {
      if (version === requestVersion) apply(unavailable('bridge-error'))
    }
    return state.value
  }

  function start(): void {
    stop()
    const safePollIntervalMs = Math.max(250, pollIntervalMs)
    const bridge = getApi()
    const subscribe = bridge?.[bridgeMethods.subscribe]
    if (typeof subscribe === 'function') {
      unsubscribe = subscribe.call(bridge, (value: unknown) => {
        requestVersion += 1
        lastPushAtMs = Date.now()
        apply(value)
      })
    }
    void refresh()
    pollTimer = setInterval(() => {
      const tickMs = Date.now()
      nowMs.value = tickMs
      if (lastPushAtMs === null || tickMs - lastPushAtMs >= safePollIntervalMs) {
        void refresh()
      }
    }, safePollIntervalMs)
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
    lastPushAtMs = null
  }

  return { state, nowMs, refresh, start, stop }
}
