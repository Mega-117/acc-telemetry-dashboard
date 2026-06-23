import { computed, ref } from 'vue'

export type FastStateSlipBand = 'white' | 'green' | 'yellow' | 'orange' | 'red'
export type FastStateSlipState = 'ok' | 'limit' | 'sliding' | 'wheelspin' | 'lockup'

export interface FastStateTyre {
  id: 'FL' | 'FR' | 'RL' | 'RR'
  wheelSlip: number | null
  wheelSlipScaled: number | null
  slipBand: FastStateSlipBand
  slipState: FastStateSlipState
  slipRatio: number | null
  pressurePsi: number | null
  coreTempC: number | null
}

export interface FastOverlayState {
  isLive: boolean
  normalizedCarPosition: number | null
  speedKmh: number | null
  gas: number | null
  brake: number | null
  tyres: FastStateTyre[]
}

const EMPTY_FAST_STATE: FastOverlayState = {
  isLive: false,
  normalizedCarPosition: null,
  speedKmh: null,
  gas: null,
  brake: null,
  tyres: [],
}

const FAST_STATE_FRESH_MS = 2_000
const FAST_STATE_POLL_MS = 250
const MAX_CONSECUTIVE_ERRORS = 3
const VALID_BANDS = new Set<FastStateSlipBand>(['white', 'green', 'yellow', 'orange', 'red'])
const VALID_SLIP_STATES = new Set<FastStateSlipState>(['ok', 'limit', 'sliding', 'wheelspin', 'lockup'])

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeBand(value: unknown): FastStateSlipBand {
  return typeof value === 'string' && VALID_BANDS.has(value as FastStateSlipBand)
    ? value as FastStateSlipBand
    : 'white'
}

function normalizeSlipState(value: unknown): FastStateSlipState {
  return typeof value === 'string' && VALID_SLIP_STATES.has(value as FastStateSlipState)
    ? value as FastStateSlipState
    : 'ok'
}

function isFastStateFresh(ts: unknown): boolean {
  const value = toNumber(ts)
  return value !== null && Date.now() - value * 1000 <= FAST_STATE_FRESH_MS
}

function normalizeTyre(raw: any): FastStateTyre | null {
  if (!raw || typeof raw !== 'object') return null
  if (!['FL', 'FR', 'RL', 'RR'].includes(raw.id)) return null
  return {
    id: raw.id,
    wheelSlip: toNumber(raw.wheel_slip),
    wheelSlipScaled: toNumber(raw.wheel_slip_scaled),
    slipBand: normalizeBand(raw.slip_band),
    slipState: normalizeSlipState(raw.slip_state),
    slipRatio: toNumber(raw.slip_ratio),
    pressurePsi: toNumber(raw.pressure_psi),
    coreTempC: toNumber(raw.core_temp_c),
  }
}

function normalizeFastState(state: any): FastOverlayState {
  if (!state || typeof state !== 'object' || !isFastStateFresh(state.ts)) {
    return { ...EMPTY_FAST_STATE }
  }

  const tyres = Array.isArray(state.tyres)
    ? state.tyres.map(normalizeTyre).filter(Boolean) as FastStateTyre[]
    : []

  return {
    isLive: state.is_live === true,
    normalizedCarPosition: toNumber(state.normalized_car_position),
    speedKmh: toNumber(state.speed_kmh),
    gas: toNumber(state.gas),
    brake: toNumber(state.brake),
    tyres,
  }
}

export function useFastStatePoller(getApi: () => any | null) {
  const fastState = ref<FastOverlayState>({ ...EMPTY_FAST_STATE })
  const isFastStateActive = computed(() => fastState.value.isLive && fastState.value.tyres.length === 4)
  let fastStateInterval: ReturnType<typeof setInterval> | null = null
  let removePushListener: (() => void) | null = null

  function applyState(state: any) {
    fastState.value = normalizeFastState(state)
  }

  function startFastStatePolling() {
    stopFastStatePolling()

    const api = getApi()
    if (!api?.getFastState) {
      applyState(null)
      return
    }

    if (typeof api.onFastStateUpdate === 'function') {
      removePushListener = api.onFastStateUpdate(applyState)
    }

    let errorCount = 0

    async function pollOnce() {
      try {
        const state = await api.getFastState()
        errorCount = 0
        applyState(state)
      } catch (err: any) {
        errorCount++
        console.warn(`[FastStatePoller] IPC error (attempt ${errorCount}):`, err?.message ?? err)
        if (errorCount >= MAX_CONSECUTIVE_ERRORS) {
          stopFastStatePolling()
          applyState(null)
        }
      }
    }

    void pollOnce()
    fastStateInterval = setInterval(pollOnce, FAST_STATE_POLL_MS)
  }

  function stopFastStatePolling() {
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

