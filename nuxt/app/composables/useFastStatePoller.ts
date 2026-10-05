import { computed, shallowRef } from 'vue'
import { readCommonLive } from '~/services/telemetry/commonLive'
import { normalizeFastState } from '~/services/telemetry/fastStateIngress'
import { EMPTY_FAST_STATE } from '~/services/telemetry/emptyFastState'
import { isFastStateFresh } from '~/services/sim/acc/fastStateAdapter'
import { usePresentationActivity } from './usePresentationVisibility'
import { retainUnchanged } from '~/services/overlay/stableTelemetry'
import { createTelemetryRegistry } from '~/services/overlay/sharedTelemetryLease'
import type { FastOverlayState } from '~/types/liveTelemetry'
export { normalizePitPrediction } from '~/services/sim/acc/fastStateAdapter'
export type { FastStateSlipBand, FastStateSlipState, FastStateTyre, FastStateLapPressureAverage, FastStateContext, FastStateLocalDriver, FastStateInfo, FastStateDamageBodyZone, FastStateDamageSuspensionCorner, FastStateDamage, FastStatePitConfidence, FastStatePitPrediction, FastOverlayState } from '~/types/liveTelemetry'
const FAST_STATE_POLL_MS = 250
const MAX_CONSECUTIVE_ERRORS = 3

function createFastStatePoller(getApi: () => any | null) {
  const fastState = shallowRef<FastOverlayState>({ ...EMPTY_FAST_STATE })
  const isFastStateActive = computed(() => fastState.value.isLive && fastState.value.tyres.length === 4)
  let fastStateInterval: ReturnType<typeof setInterval> | null = null
  let removePushListener: (() => void) | null = null
  let revision = 0
  let lastRaw: { ts?: unknown; live?: unknown; schema?: unknown } | null = null
  let lastPushAt = -Infinity

  function applyState(state: any) {
    lastRaw = state
    fastState.value = retainUnchanged(fastState.value, normalizeFastState(state))
  }

  function startFastStatePolling(): Promise<void> {
    stopFastStatePolling()

    const api = getApi()
    if (!api?.getFastState) {
      applyState(null)
      return Promise.resolve()
    }

    if (typeof api.onFastStateUpdate === 'function') {
      removePushListener = api.onFastStateUpdate((state: any) => {
        revision++
        lastPushAt = Date.now()
        applyState(state)
      })
    }

    let errorCount = 0
    let inFlight = false

    async function pollOnce() {
      if (inFlight) return
      inFlight = true
      const requestRevision = revision
      try {
        const state = await api.getFastState()
        if (requestRevision !== revision) return
        errorCount = 0
        applyState(state)
      } catch (err: any) {
        if (requestRevision !== revision) return
        errorCount++
        console.warn(`[FastStatePoller] IPC error (attempt ${errorCount}):`, err?.message ?? err)
        if (errorCount >= MAX_CONSECUTIVE_ERRORS) {
          stopFastStatePolling()
          applyState(null)
        }
      } finally {
        inFlight = false
      }
    }

    const firstPoll = pollOnce()
    fastStateInterval = setInterval(() => {
      // Expiry remains active even with a stalled pull. Healthy pushes need no pull.
      if (lastRaw) {
        const common = readCommonLive(lastRaw.live ?? lastRaw)
        if (common) {
          if (!common.fresh) applyState(lastRaw)
        } else if (!isFastStateFresh(lastRaw.ts)) applyState(null)
      }
      if (Date.now() - lastPushAt >= FAST_STATE_POLL_MS) void pollOnce()
    }, FAST_STATE_POLL_MS)
    return firstPoll
  }

  function stopFastStatePolling() {
    revision++
    lastPushAt = -Infinity
    if (fastStateInterval) {
      clearInterval(fastStateInterval)
      fastStateInterval = null
    }
    if (removePushListener) {
      removePushListener()
      removePushListener = null
    }
  }

  return { fastState, isFastStateActive, startFastStatePolling, stopFastStatePolling }
}

type FastSource = ReturnType<typeof createFastStatePoller> & { ready: Promise<void> }
const fastSources = createTelemetryRegistry<FastSource>()

export function useFastStatePoller(getApi: Parameters<typeof createFastStatePoller>[0], background = false) {
  const attached = shallowRef<FastSource | null>(null)
  const frozen = shallowRef<FastOverlayState>({ ...EMPTY_FAST_STATE })
  let release: (() => void) | null = null
  const fastState = computed(() => attached.value?.fastState.value ?? frozen.value)
  const isFastStateActive = computed(() => fastState.value.isLive && fastState.value.tyres.length === 4)
  function stopFastStatePolling() {
    frozen.value = fastState.value
    release?.()
    release = null
    attached.value = null
  }
  function startFastStatePolling(): Promise<void> {
    stopFastStatePolling()
    const api = getApi()
    const key = typeof api?.getFastState === 'function' ? api.getFastState : getApi
    const lease = fastSources.acquire(key, () => {
      const source = createFastStatePoller(() => api)
      return { ...source, ready: source.startFastStatePolling() }
    }, source => source.stopFastStatePolling())
    attached.value = lease.source
    release = lease.release
    return lease.source.ready
  }
  const activity = usePresentationActivity(startFastStatePolling, stopFastStatePolling, background)
  return { fastState, isFastStateActive,
    startFastStatePolling: () => Promise.resolve(activity.start()).then(() => {}),
    stopFastStatePolling: activity.stop }
}

