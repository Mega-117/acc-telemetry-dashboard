import { computed, shallowRef, ref } from 'vue'
import { createTelemetryRegistry } from '~/services/overlay/sharedTelemetryLease'
import { retainUnchanged } from '~/services/overlay/stableTelemetry'
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
function createStandingsState(
  getApi: () => any | null,
  pollIntervalMs = 1000,
  bridgeMethods: StandingsBridgeMethods = DEFAULT_BRIDGE_METHODS,
) {
  const state = shallowRef<StandingsStateEnvelope>(unavailable('not-started'))
  const nowMs = ref(Date.now())
  let unsubscribe: (() => void) | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let requestVersion = 0
  let lastPushAtMs: number | null = null
  let pending: Promise<StandingsStateEnvelope> | null = null
  let intervalMs = Math.max(250, pollIntervalMs)

  function apply(value: unknown): void {
    nowMs.value = Date.now()
    state.value = retainUnchanged(state.value, normalizeBridgeEnvelope(value))
  }

  async function performRefresh(): Promise<StandingsStateEnvelope> {
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

  function refresh(): Promise<StandingsStateEnvelope> {
    if (!pending) {
      const request = performRefresh()
      pending = request
      void request.finally(() => { if (pending === request) pending = null })
    }
    return pending
  }

  function start(): void {
    stop()
    const safePollIntervalMs = intervalMs
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
    pending = null
  }

  function tightenInterval(ms: number) {
    const next = Math.max(250, ms)
    if (next < intervalMs) { intervalMs = next; start() }
  }
  return { state, nowMs, refresh, start, stop, tightenInterval }
}

type StandingsSource = ReturnType<typeof createStandingsState> & { started: boolean }
const sources = createTelemetryRegistry<StandingsSource>()

export function useStandingsState(getApi: Parameters<typeof createStandingsState>[0], pollIntervalMs = 1000,
  bridgeMethods: StandingsBridgeMethods = DEFAULT_BRIDGE_METHODS) {
  const attached = shallowRef<StandingsSource | null>(null)
  const frozen = shallowRef(unavailable('not-started'))
  const frozenNow = ref(Date.now())
  let release: (() => void) | null = null
  const state = computed(() => attached.value?.state.value ?? frozen.value)
  const nowMs = computed(() => attached.value?.nowMs.value ?? frozenNow.value)
  function stop() {
    frozen.value = state.value
    frozenNow.value = nowMs.value
    release?.()
    release = null
    attached.value = null
  }
  function start() {
    stop()
    acquire(true)
  }
  function acquire(poll: boolean) {
    const api = getApi()
    const key = typeof api?.[bridgeMethods.pull] === 'function' ? api[bridgeMethods.pull] : getApi
    const lease = sources.acquire(key, () => {
      const source = createStandingsState(() => api, pollIntervalMs, bridgeMethods)
      return { ...source, started: false }
    }, source => source.stop())
    attached.value = lease.source
    release = lease.release
    if (poll) {
      if (!lease.source.started) { lease.source.started = true; lease.source.start() }
      lease.source.tightenInterval(pollIntervalMs)
    }
  }
  function refresh() {
    if (!release) acquire(false)
    return attached.value!.refresh()
  }
  return { state, nowMs, refresh, start, stop }
}
