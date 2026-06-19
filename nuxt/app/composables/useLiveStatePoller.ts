import { ref } from 'vue'

export interface LiveLapState {
  currentLap: number | null
  lapsCompleted: number | null
  lapsValid: number | null
  lapValid: boolean | null
  lastLapTimeMs: number | null
  sectorHud: SectorHudState | null
  // Contesto sessione dal logger: servono al Training Tracker (PIP-95).
  track: string | null
  car: string | null
}

export type SectorHudColor = 'purple' | 'green' | 'yellow' | 'red' | 'white' | 'grey'
export type SectorHudMode = 'running' | 'last_lap'
export type SectorHudEntryState = 'pending' | 'running' | 'complete'

export interface SectorHudEntry {
  index: 1 | 2 | 3
  state: SectorHudEntryState
  currentMs: number | null
  referenceMs: number | null
  bestMs: number | null
  deltaMs: number | null
  color: SectorHudColor
}

export interface SectorHudState {
  version: number
  mode: SectorHudMode
  lap: number | null
  referenceLap: number | null
  currentSectorIndex: number | null
  currentLapTimeMs: number | null
  lastLapTimeMs: number | null
  bestLapTimeMs: number | null
  lapValid: boolean | null
  awaitingFlyingLap: boolean
  sectors: SectorHudEntry[]
}

const EMPTY_LAP_STATE: LiveLapState = {
  currentLap: null,
  lapsCompleted: null,
  lapsValid: null,
  lapValid: null,
  lastLapTimeMs: null,
  sectorHud: null,
  track: null,
  car: null,
}

const MAX_CONSECUTIVE_ERRORS = 3
// Gating freschezza (PIP-94/PIP-140): live_state.json resta su disco dopo la
// chiusura del logger; senza un ts recente il lap counter mostrerebbe dati
// fantasma. In pista pero' live_state e' event-driven sui settori/giri: teniamo
// il dato abbastanza a lungo da non far sparire il confronto tra due settori.
const LIVE_STATE_FRESH_MS = 120_000

function isLiveStateFresh(ts: unknown): boolean {
  if (typeof ts !== 'string') return false
  const parsed = Date.parse(ts)
  return Number.isFinite(parsed) && Date.now() - parsed <= LIVE_STATE_FRESH_MS
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeSectorColor(value: unknown): SectorHudColor {
  return ['purple', 'green', 'yellow', 'red', 'white', 'grey'].includes(String(value))
    ? value as SectorHudColor
    : 'grey'
}

function normalizeSectorState(value: unknown): SectorHudEntryState {
  return ['pending', 'running', 'complete'].includes(String(value))
    ? value as SectorHudEntryState
    : 'pending'
}

function normalizeSectorHud(raw: any): SectorHudState | null {
  if (!raw || typeof raw !== 'object') return null
  if (!Array.isArray(raw.sectors)) return null

  const sectors = raw.sectors
    .map((sector: any) => {
      const index = toNumber(sector?.index)
      if (![1, 2, 3].includes(index ?? 0)) return null
      return {
        index: index as 1 | 2 | 3,
        state: normalizeSectorState(sector.state),
        currentMs: toNumber(sector.current_ms),
        referenceMs: toNumber(sector.reference_ms),
        bestMs: toNumber(sector.best_ms),
        deltaMs: toNumber(sector.delta_ms),
        color: normalizeSectorColor(sector.color),
      } satisfies SectorHudEntry
    })
    .filter(Boolean) as SectorHudEntry[]

  if (sectors.length === 0) return null

  return {
    version: toNumber(raw.version) ?? 1,
    mode: raw.mode === 'last_lap' ? 'last_lap' : 'running',
    lap: toNumber(raw.lap),
    referenceLap: toNumber(raw.reference_lap),
    currentSectorIndex: toNumber(raw.current_sector_index),
    currentLapTimeMs: toNumber(raw.current_lap_time_ms),
    lastLapTimeMs: toNumber(raw.last_lap_time_ms),
    bestLapTimeMs: toNumber(raw.best_lap_time_ms),
    lapValid: typeof raw.lap_valid === 'boolean' ? raw.lap_valid : null,
    awaitingFlyingLap: raw.awaiting_flying_lap === true,
    sectors,
  }
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
  let removePushListener: (() => void) | null = null

  function applyState(state: any) {
    if (state && typeof state === 'object' && isLiveStateFresh(state.ts)) {
      liveLap.value = {
        currentLap: typeof state.current_lap === 'number' ? state.current_lap : null,
        lapsCompleted: typeof state.laps_completed === 'number' ? state.laps_completed : null,
        lapsValid: typeof state.laps_valid === 'number' ? state.laps_valid : null,
        lapValid: typeof state.lap_valid === 'boolean' ? state.lap_valid : null,
        lastLapTimeMs: typeof state.last_lap_time_ms === 'number' ? state.last_lap_time_ms : null,
        sectorHud: normalizeSectorHud(state.sector_hud),
        track: typeof state.track === 'string' && state.track ? state.track : null,
        car: typeof state.car === 'string' && state.car ? state.car : null,
      }
    } else {
      liveLap.value = { ...EMPTY_LAP_STATE }
    }
  }

  function startLiveStatePolling() {
    stopLiveStatePolling()

    const api = getApi()
    if (!api?.getLiveState) {
      isPollingActive.value = false
      return
    }

    // Push dal watcher del main (PIP-102): aggiornamento immediato al
    // traguardo; il polling sotto resta come rete di sicurezza e per il
    // gating freschezza quando il file smette di essere scritto.
    if (typeof api.onLiveStateUpdate === 'function') {
      removePushListener = api.onLiveStateUpdate(applyState)
    }

    let errorCount = 0

    async function pollOnce() {
      try {
        const state = await api.getLiveState()
        errorCount = 0
        isPollingActive.value = true
        applyState(state)
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
    if (removePushListener) {
      removePushListener()
      removePushListener = null
    }
  }

  function resetLiveLap() {
    liveLap.value = { ...EMPTY_LAP_STATE }
  }

  return { liveLap, isPollingActive, startLiveStatePolling, stopLiveStatePolling, resetLiveLap }
}
