import { ref } from 'vue'

export interface LiveLapState {
  currentLap: number | null
  lapsCompleted: number | null
  lapsValid: number | null
  lapValid: boolean | null
  lastLapTimeMs: number | null
}

const EMPTY_LAP_STATE: LiveLapState = {
  currentLap: null,
  lapsCompleted: null,
  lapsValid: null,
  lapValid: null,
  lastLapTimeMs: null,
}

const MAX_CONSECUTIVE_ERRORS = 3
// Gating freschezza (PIP-94): live_state.json resta su disco dopo la chiusura
// del logger; senza un ts recente il lap counter mostrerebbe dati fantasma.
// Il logger scrive "ts" piu' volte al secondo: 10s di tolleranza bastano.
const LIVE_STATE_FRESH_MS = 10_000

function isLiveStateFresh(ts: unknown): boolean {
  if (typeof ts !== 'string') return false
  const parsed = Date.parse(ts)
  return Number.isFinite(parsed) && Date.now() - parsed <= LIVE_STATE_FRESH_MS
}

/**
 * @description Polls the Electron IPC API at a fixed interval to keep live lap state
 * (currentLap, lapsCompleted, lapsValid, lapValid) up to date. Stops automatically
 * after too many consecutive errors.
 * @param getApi - Factory that returns the current Electron API instance, or null if unavailable.
 * @returns Object with liveLap ref, isPollingActive ref, startLiveStatePolling, stopLiveStatePolling, resetLiveLap.
 */
export function useLiveStatePoller(getApi: () => any | null) {
  const liveLap = ref<LiveLapState>({ ...EMPTY_LAP_STATE })
  const isPollingActive = ref(false)
  let liveStateInterval: ReturnType<typeof setInterval> | null = null

  function startLiveStatePolling() {
    stopLiveStatePolling()

    const api = getApi()
    if (!api?.getLiveState) {
      isPollingActive.value = false
      return
    }

    let errorCount = 0

    async function pollOnce() {
      try {
        const state = await api.getLiveState()
        errorCount = 0
        isPollingActive.value = true
        if (state && typeof state === 'object' && isLiveStateFresh(state.ts)) {
          liveLap.value = {
            currentLap: typeof state.current_lap === 'number' ? state.current_lap : null,
            lapsCompleted: typeof state.laps_completed === 'number' ? state.laps_completed : null,
            lapsValid: typeof state.laps_valid === 'number' ? state.laps_valid : null,
            lapValid: typeof state.lap_valid === 'boolean' ? state.lap_valid : null,
            lastLapTimeMs: typeof state.last_lap_time_ms === 'number' ? state.last_lap_time_ms : null,
          }
        } else {
          liveLap.value = { ...EMPTY_LAP_STATE }
        }
      } catch (err: any) {
        errorCount++
        console.warn(`[LiveStatePoller] IPC error (attempt ${errorCount}):`, err?.message ?? err)
        if (errorCount >= MAX_CONSECUTIVE_ERRORS) {
          isPollingActive.value = false
          stopLiveStatePolling()
        }
      }
    }

    void pollOnce()
    liveStateInterval = setInterval(pollOnce, 2000)
  }

  function stopLiveStatePolling() {
    if (liveStateInterval) {
      clearInterval(liveStateInterval)
      liveStateInterval = null
    }
  }

  function resetLiveLap() {
    liveLap.value = { ...EMPTY_LAP_STATE }
  }

  return { liveLap, isPollingActive, startLiveStatePolling, stopLiveStatePolling, resetLiveLap }
}
