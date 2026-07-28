import { computed, ref } from 'vue'
import type { TrackReferencePhase } from '~/services/spotter/trackVoiceReferences'
import {
  emptyTyreSetupViewModel,
  normalizeTyreSetupViewModel,
  type TyreSetupViewModel,
} from '~/services/overlay/tyreSetupViewModel'

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
  pressureLossPsi: number | null
  coreTempC: number | null
  brakeTempC: number | null
  brakeCompound: number | null
  padLifePct: number | null
  discLifePct: number | null
}

export interface FastStateLapPressureAverage {
  status: 'waiting_for_full_lap' | 'available'
  lap: number | null
  tyreSet: number | null
  values: Record<FastStateTyre['id'], number | null>
}

export interface FastStateContext {
  track: string | null
  car: string | null
  sessionType: number | null
  sessionIndex: number | null
  sessionUid: string | null
  serverId: string | null
}

export interface FastStateInfo {
  delta: {
    ms: number
    available: boolean
    side: 'negative' | 'positive' | 'zero'
    ratio: number
    purple: boolean
  }
  stintTimeLeftMs: number | null
  fuelLabel: string
  fuelNeededL: number | null
  fuelLeftTimeMs: number | null
  incidents: number
  grip: string | null
  pitExitTraffic: number | null
  optimalLapTimeMs: number | null
  bestLapTimeMs: number | null
  damageTimeMs: number | null
  currentLapTimeMs: number
  lastLapTimeMs: number | null
  lapValid: boolean
  lastLapValid: boolean | null
  lapsCompleted: number
}

export interface FastOverlayState {
  context: FastStateContext | null
  info: FastStateInfo | null
  flag: number | null
  lapsCompleted: number
  currentLapTimeMs: number | null
  lastLapTimeMs: number | null
  bestLapTimeMs: number | null
  lapValid: boolean
  isFresh: boolean
  isLive: boolean
  ignitionOn: boolean
  isEngineRunning: boolean
  pitLimiterOn: boolean
  sessionType: number | null
  normalizedCarPosition: number | null
  speedKmh: number | null
  speedDeltaKmh: number | null
  referenceSpeedKmh: number | null
  referenceRpm: number | null
  referenceGear: number | null
  referenceEngineMap: number | null
  referenceTractionControl: number | null
  referenceTractionControl2: number | null
  referenceAbs: number | null
  gas: number | null
  brake: number | null
  rpm: number | null
  maxRpm: number | null
  gear: number | null
  fuelL: number | null
  fuelPerLapL: number | null
  fuelLapsRemaining: number | null
  fuelLeftTimeMs: number | null
  sessionLapsRemaining: number | null
  sessionTimeLeftMs: number | null
  engineMap: number | null
  tractionControl: number | null
  tractionControl2: number | null
  abs: number | null
  brakeBiasPct: number | null
  cornerSpeedKmh: number | null
  directionLightsLeft: boolean
  directionLightsRight: boolean
  lightsStage: number | null
  rainLights: boolean
  currentTyreSet: number | null
  tyreSetAvailable: boolean
  tyreCompound: 'DRY' | 'WET' | null
  rainIntensity: number | null
  rainIntensity10Min: number | null
  rainIntensity30Min: number | null
  lapPressureAverage: FastStateLapPressureAverage
  tyreSetup: TyreSetupViewModel
  trackReferencePhase: TrackReferencePhase | null
  trackReferencesEligible: boolean
  tyres: FastStateTyre[]
}

const EMPTY_FAST_STATE: FastOverlayState = {
  context: null,
  info: null,
  flag: null,
  lapsCompleted: 0,
  currentLapTimeMs: null,
  lastLapTimeMs: null,
  bestLapTimeMs: null,
  lapValid: false,
  isFresh: false,
  isLive: false,
  ignitionOn: false,
  isEngineRunning: false,
  pitLimiterOn: false,
  sessionType: null,
  normalizedCarPosition: null,
  speedKmh: null,
  speedDeltaKmh: null,
  referenceSpeedKmh: null,
  referenceRpm: null,
  referenceGear: null,
  referenceEngineMap: null,
  referenceTractionControl: null,
  referenceTractionControl2: null,
  referenceAbs: null,
  gas: null,
  brake: null,
  rpm: null,
  maxRpm: null,
  gear: null,
  fuelL: null,
  fuelPerLapL: null,
  fuelLapsRemaining: null,
  fuelLeftTimeMs: null,
  sessionLapsRemaining: null,
  sessionTimeLeftMs: null,
  engineMap: null,
  tractionControl: null,
  tractionControl2: null,
  abs: null,
  brakeBiasPct: null,
  cornerSpeedKmh: null,
  directionLightsLeft: false,
  directionLightsRight: false,
  lightsStage: null,
  rainLights: false,
  currentTyreSet: null,
  tyreSetAvailable: false,
  tyreCompound: null,
  rainIntensity: null,
  rainIntensity10Min: null,
  rainIntensity30Min: null,
  lapPressureAverage: {
    status: 'waiting_for_full_lap',
    lap: null,
    tyreSet: null,
    values: { FL: null, FR: null, RL: null, RR: null },
  },
  tyreSetup: emptyTyreSetupViewModel(),
  trackReferencePhase: null,
  trackReferencesEligible: false,
  tyres: [],
}

const FAST_STATE_FRESH_MS = 2_000
const FAST_STATE_POLL_MS = 250
const MAX_CONSECUTIVE_ERRORS = 3
const VALID_BANDS = new Set<FastStateSlipBand>(['white', 'green', 'yellow', 'orange', 'red'])
const VALID_SLIP_STATES = new Set<FastStateSlipState>(['ok', 'limit', 'sliding', 'wheelspin', 'lockup'])
const VALID_TRACK_REFERENCE_PHASES = new Set<TrackReferencePhase>(['garage', 'outlap', 'active', 'pit_lane_active', 'pit_lane_outlap'])

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeContext(raw: any): FastStateContext | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    track: toStringOrNull(raw.track),
    car: toStringOrNull(raw.car),
    sessionType: toNumber(raw.session_type),
    sessionIndex: toNumber(raw.session_index),
    sessionUid: toStringOrNull(raw.session_uid),
    serverId: toStringOrNull(raw.server_id),
  }
}

function normalizeInfo(raw: any): FastStateInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const delta = raw.delta && typeof raw.delta === 'object' ? raw.delta : {}
  const side = ['negative', 'positive', 'zero'].includes(delta.side)
    ? delta.side as FastStateInfo['delta']['side']
    : 'zero'
  return {
    delta: {
      ms: toNumber(delta.ms) ?? 0,
      available: delta.available === true,
      side,
      ratio: Math.min(Math.max(toNumber(delta.ratio) ?? 0, 0), 1),
      purple: delta.purple === true,
    },
    stintTimeLeftMs: toNumber(raw.stint_time_left_ms),
    fuelLabel: toStringOrNull(raw.fuel_label) || 'Q-Fuel',
    fuelNeededL: toNumber(raw.fuel_needed_l),
    fuelLeftTimeMs: toNumber(raw.fuel_left_time_ms),
    incidents: toNumber(raw.incidents) ?? 0,
    grip: toStringOrNull(raw.grip),
    pitExitTraffic: toNumber(raw.pit_exit_traffic),
    optimalLapTimeMs: toNumber(raw.optimal_lap_time_ms),
    bestLapTimeMs: toNumber(raw.best_lap_time_ms),
    damageTimeMs: toNumber(raw.damage_time_ms),
    currentLapTimeMs: toNumber(raw.current_lap_time_ms) ?? 0,
    lastLapTimeMs: toNumber(raw.last_lap_time_ms),
    lapValid: raw.lap_valid === true,
    lastLapValid: typeof raw.last_lap_valid === 'boolean' ? raw.last_lap_valid : null,
    lapsCompleted: toNumber(raw.laps_completed) ?? 0,
  }
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

function normalizeTrackReferencePhase(value: unknown): TrackReferencePhase | null {
  return typeof value === 'string' && VALID_TRACK_REFERENCE_PHASES.has(value as TrackReferencePhase)
    ? value as TrackReferencePhase
    : null
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
    pressureLossPsi: toNumber(raw.pressure_loss_psi),
    coreTempC: toNumber(raw.core_temp_c),
    brakeTempC: toNumber(raw.brake_temp_c),
    brakeCompound: toNumber(raw.brake_compound),
    padLifePct: toNumber(raw.pad_life_pct),
    discLifePct: toNumber(raw.disc_life_pct),
  }
}

function normalizeLapPressureAverage(raw: any): FastStateLapPressureAverage {
  const average = raw?.last_average
  const values = average?.values
  return {
    status: raw?.status === 'available' && average ? 'available' : 'waiting_for_full_lap',
    lap: toNumber(average?.lap),
    tyreSet: toNumber(average?.tyre_set),
    values: {
      FL: toNumber(values?.FL),
      FR: toNumber(values?.FR),
      RL: toNumber(values?.RL),
      RR: toNumber(values?.RR),
    },
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
    context: normalizeContext(state.context),
    info: normalizeInfo(state.info),
    flag: toNumber(state.flag),
    lapsCompleted: toNumber(state.laps_completed) ?? 0,
    currentLapTimeMs: toNumber(state.current_lap_time_ms),
    lastLapTimeMs: toNumber(state.last_lap_time_ms),
    bestLapTimeMs: toNumber(state.best_lap_time_ms),
    lapValid: state.lap_valid === true,
    isFresh: true,
    isLive: state.is_live === true,
    ignitionOn: state.ignition_on === true,
    isEngineRunning: state.is_engine_running === true,
    pitLimiterOn: state.pit_limiter_on === true,
    sessionType: toNumber(state.session_type),
    normalizedCarPosition: toNumber(state.normalized_car_position),
    speedKmh: toNumber(state.speed_kmh),
    speedDeltaKmh: toNumber(state.speed_delta_kmh),
    referenceSpeedKmh: toNumber(state.reference_speed_kmh),
    referenceRpm: toNumber(state.reference_rpm),
    referenceGear: toNumber(state.reference_gear),
    referenceEngineMap: toNumber(state.reference_engine_map),
    referenceTractionControl: toNumber(state.reference_traction_control),
    referenceTractionControl2: toNumber(state.reference_traction_control_2),
    referenceAbs: toNumber(state.reference_abs),
    gas: toNumber(state.gas),
    brake: toNumber(state.brake),
    rpm: toNumber(state.rpm),
    maxRpm: toNumber(state.max_rpm),
    gear: toNumber(state.gear),
    fuelL: toNumber(state.fuel_l),
    fuelPerLapL: toNumber(state.fuel_per_lap_l),
    fuelLapsRemaining: toNumber(state.fuel_laps_remaining),
    fuelLeftTimeMs: toNumber(state.fuel_left_time_ms),
    sessionLapsRemaining: toNumber(state.session_laps_remaining),
    sessionTimeLeftMs: toNumber(state.session_time_left_ms),
    engineMap: toNumber(state.engine_map),
    tractionControl: toNumber(state.traction_control),
    tractionControl2: toNumber(state.traction_control_2),
    abs: toNumber(state.abs),
    brakeBiasPct: toNumber(state.brake_bias_pct),
    cornerSpeedKmh: toNumber(state.corner_speed_kmh),
    directionLightsLeft: state.direction_lights_left === true,
    directionLightsRight: state.direction_lights_right === true,
    lightsStage: toNumber(state.lights_stage),
    rainLights: state.rain_lights === true,
    currentTyreSet: toNumber(state.current_tyre_set),
    tyreSetAvailable: state.tyre_set_available === true,
    tyreCompound: state.tyre_compound === 'WET'
      ? 'WET'
      : state.tyre_compound === 'DRY' ? 'DRY' : null,
    rainIntensity: toNumber(state.rain_intensity),
    rainIntensity10Min: toNumber(state.rain_intensity_10min),
    rainIntensity30Min: toNumber(state.rain_intensity_30min),
    lapPressureAverage: normalizeLapPressureAverage(state.lap_pressure_avg),
    tyreSetup: normalizeTyreSetupViewModel(state.tyre_setup),
    trackReferencePhase: normalizeTrackReferencePhase(state.track_reference_phase),
    trackReferencesEligible: state.track_references_eligible === true,
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

