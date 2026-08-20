import type {
  FastOverlayState,
  FastStateInfo,
} from '~/composables/useFastStatePoller'
import type {
  SectorHudEntry,
  SectorHudState,
} from '~/composables/useLiveStatePoller'
import { emptyTyreSetupViewModel } from '~/services/overlay/tyreSetupViewModel'
import type {
  StandingsCarSnapshot,
  StandingsLapSnapshot,
  StandingsSessionSnapshot,
  StandingsStateEnvelope,
} from '~/services/overlay/standingsPresentation'
import { ACC_BROADCASTING_SESSION_TYPES } from '~/services/overlay/standingsPresentation'

export type OverlayTelemetrySource = 'local' | 'focused'

const DELTA_ELIGIBLE_SESSION_TYPES: ReadonlySet<number> = new Set(
  Object.values(ACC_BROADCASTING_SESSION_TYPES),
)

export interface FocusedInfoDeltaAccumulator {
  key: string | null
  negativeExtremeMs: number
  positiveExtremeMs: number
}

export interface FocusedInfoDeltaResult {
  accumulator: FocusedInfoDeltaAccumulator
  delta: FastStateInfo['delta']
}

export interface RoutedOverlayTelemetry {
  source: OverlayTelemetrySource
  fastState: FastOverlayState
  sectorHud: SectorHudState | null
  focusedCar: StandingsCarSnapshot | null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonNegativeInteger(value: unknown): number | null {
  const numeric = finiteNumber(value)
  return numeric !== null && Number.isInteger(numeric) && numeric >= 0 ? numeric : null
}

function positiveTime(value: unknown): number | null {
  const numeric = finiteNumber(value)
  return numeric !== null && numeric > 0 ? Math.round(numeric) : null
}

function lapTime(lap: StandingsLapSnapshot | null | undefined, legacy: unknown): number | null {
  return positiveTime(lap?.time_ms) ?? positiveTime(legacy)
}

function lapSplits(lap: StandingsLapSnapshot | null | undefined): Array<number | null> {
  const raw = Array.isArray(lap?.splits_ms) ? lap.splits_ms : []
  return [0, 1, 2].map(index => positiveTime(raw[index]))
}

const DELTA_INVALID_LIMIT_MS = 9900
const DELTA_FIXED_SCALE_MS = 500
const PREDICTED_LAP_MIN_MS = 79_000

function normalizeBroadcastingSessionType(value: unknown): number | null {
  const sessionType = nonNegativeInteger(value)
  if (sessionType === ACC_BROADCASTING_SESSION_TYPES.PRACTICE) return 0
  if (sessionType === ACC_BROADCASTING_SESSION_TYPES.QUALIFYING
    || sessionType === ACC_BROADCASTING_SESSION_TYPES.SUPERPOLE) return 1
  if (sessionType === ACC_BROADCASTING_SESSION_TYPES.RACE) return 2
  return null
}

function focusedDelta(
  car: StandingsCarSnapshot | null,
  session: StandingsSessionSnapshot | null | undefined,
): FastStateInfo['delta'] {
  const raw = finiteNumber(car?.delta_ms)
  const location = finiteNumber(car?.car_location)
  const lapType = car?.current_lap?.lap_type
  const sessionType = nonNegativeInteger(session?.session_type)
  const predictedLapMs = positiveTime(car?.predicted_lap_ms)
  const absoluteSessionBestLapMs = positiveTime(session?.best_session_lap_ms)
  const engineRunning = car?.engine_running === true
  const available = car?.has_realtime === true
    && location === 1
    && lapType !== 'outlap'
    && lapType !== 'inlap'
    && raw !== null
    && raw !== 0
    && Math.abs(raw) <= DELTA_INVALID_LIMIT_MS
  const ms = available ? Math.round(raw) : 0
  const purple = available
    && engineRunning
    && sessionType !== null
    && DELTA_ELIGIBLE_SESSION_TYPES.has(sessionType)
    && predictedLapMs !== null
    && predictedLapMs > PREDICTED_LAP_MIN_MS
    && absoluteSessionBestLapMs !== null
    && predictedLapMs < absoluteSessionBestLapMs
  return {
    ms,
    available,
    side: ms < 0 ? 'negative' : ms > 0 ? 'positive' : 'zero',
    ratio: available ? 1 : 0,
    purple,
  }
}

function focusedPitExitTraffic(state: StandingsStateEnvelope | null): number | null {
  const traffic = state?.snapshot?.focused_pit_exit_traffic
  if (traffic?.available !== true) return null
  return nonNegativeInteger(traffic.count)
}

export function emptyFocusedInfoDeltaAccumulator(): FocusedInfoDeltaAccumulator {
  return { key: null, negativeExtremeMs: 0, positiveExtremeMs: 0 }
}

export function trackFocusedInfoDelta(
  previous: FocusedInfoDeltaAccumulator,
  state: StandingsStateEnvelope | null | undefined,
  car: StandingsCarSnapshot | null,
): FocusedInfoDeltaResult {
  const snapshot = state?.status === 'available' ? state.snapshot : null
  const delta = focusedDelta(car, snapshot?.session)
  const location = finiteNumber(car?.car_location)
  const lapType = car?.current_lap?.lap_type
  if (!snapshot || !car || location !== 1 || lapType === 'outlap' || lapType === 'inlap') {
    return { accumulator: emptyFocusedInfoDeltaAccumulator(), delta }
  }

  const session = snapshot.session
  const key = [
    nonNegativeInteger(session.event_index) ?? 'event',
    nonNegativeInteger(session.session_index) ?? 'session',
    nonNegativeInteger(session.focused_car_index) ?? 'focus',
    nonNegativeInteger(car.laps) ?? 'lap',
  ].join(':')
  let negativeExtremeMs = previous.key === key ? previous.negativeExtremeMs : 0
  let positiveExtremeMs = previous.key === key ? previous.positiveExtremeMs : 0
  if (delta.available && delta.ms < 0) negativeExtremeMs = Math.min(negativeExtremeMs, delta.ms)
  if (delta.available && delta.ms > 0) positiveExtremeMs = Math.max(positiveExtremeMs, delta.ms)
  const sideExtreme = delta.ms < 0 ? Math.abs(negativeExtremeMs) : positiveExtremeMs
  const denominator = Math.max(DELTA_FIXED_SCALE_MS, sideExtreme)

  return {
    accumulator: { key, negativeExtremeMs, positiveExtremeMs },
    delta: {
      ...delta,
      ratio: delta.available && denominator > 0 ? Math.min(1, Math.abs(delta.ms) / denominator) : 0,
    },
  }
}

function focusedInfo(
  car: StandingsCarSnapshot | null,
  state: StandingsStateEnvelope | null,
): FastStateInfo {
  const sessionType = normalizeBroadcastingSessionType(state?.snapshot?.session.session_type)
  return {
    delta: focusedDelta(car, state?.snapshot?.session),
    stintTimeLeftMs: nonNegativeInteger(car?.stint_elapsed_ms),
    fuelLabel: sessionType === 2 ? 'Stint-Fuel' : 'Q-Fuel',
    fuelNeededL: null,
    fuelLeftTimeMs: null,
    fuelLeftReferenceLapMs: null,
    incidents: null,
    grip: null,
    pitExitTraffic: focusedPitExitTraffic(state),
    optimalLapTimeMs: null,
    bestLapTimeMs: lapTime(car?.best_lap, car?.best_lap_ms),
    damageTimeMs: null,
    currentLapTimeMs: lapTime(car?.current_lap, car?.current_lap_ms),
    lastLapTimeMs: lapTime(car?.last_lap, car?.last_lap_ms),
    lapValid: car?.current_lap?.is_invalid === false,
    lastLapValid: typeof car?.last_lap?.is_invalid === 'boolean'
      ? car.last_lap?.is_invalid === false
      : null,
    lapsCompleted: car ? nonNegativeInteger(car.laps) ?? 0 : 0,
  }
}

function localFastStateWithFocusedFacts(
  local: FastOverlayState,
  state: StandingsStateEnvelope,
  car: StandingsCarSnapshot | null,
): FastOverlayState {
  if (!local.info) return local

  return {
    ...local,
    info: {
      ...local.info,
      // ACC Drive owns these two facts in its per-car broadcast model. Keep
      // shared-memory values authoritative for every other local Info field.
      stintTimeLeftMs: nonNegativeInteger(car?.stint_elapsed_ms),
      pitExitTraffic: focusedPitExitTraffic(state),
    },
  }
}

function sessionTimeLeftMs(session: StandingsSessionSnapshot | null | undefined): number | null {
  const current = finiteNumber(session?.session_time_ms)
  const remaining = finiteNumber(session?.session_end_time_ms)
  if (current === null || remaining === null) return null
  // ACC Broadcasting already exposes session_end_time_ms as the remaining
  // countdown. Subtracting the elapsed session clock a second time drifts.
  return Math.max(0, Math.round(remaining))
}

function focusedFastState(
  local: FastOverlayState,
  state: StandingsStateEnvelope | null,
  car: StandingsCarSnapshot | null,
): FastOverlayState {
  const snapshot = state?.snapshot ?? null
  const sessionType = normalizeBroadcastingSessionType(snapshot?.session.session_type)
  const rainLevel = finiteNumber(snapshot?.session.weather?.rain_level)
  const info = focusedInfo(car, state)

  return {
    dataSource: 'focused',
    localDriver: null,
    context: {
      track: local.context?.track ?? null,
      car: null,
      sessionType,
      sessionIndex: nonNegativeInteger(snapshot?.session.session_index),
      sessionUid: null,
      serverId: local.context?.serverId ?? null,
    },
    info,
    flag: null,
    lapsCompleted: info.lapsCompleted,
    currentLapTimeMs: info.currentLapTimeMs,
    lastLapTimeMs: info.lastLapTimeMs,
    bestLapTimeMs: info.bestLapTimeMs,
    lapValid: info.lapValid,
    isFresh: snapshot !== null && car !== null,
    isLive: true,
    ignitionOn: false,
    isEngineRunning: false,
    pitLimiterOn: false,
    isInPitLane: car !== null && finiteNumber(car.car_location) === 2,
    sessionType,
    normalizedCarPosition: finiteNumber(car?.spline_position),
    speedKmh: finiteNumber(car?.kmh),
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
    gear: finiteNumber(car?.gear),
    fuelL: null,
    fuelPerLapL: null,
    fuelLapsRemaining: null,
    fuelLeftTimeMs: null,
    sessionLapsRemaining: null,
    sessionTimeLeftMs: sessionTimeLeftMs(snapshot?.session),
    engineMap: null,
    tractionControl: null,
    tractionControl2: null,
    abs: null,
    tractionControlInAction: false,
    absInAction: false,
    brakeBiasPct: null,
    cornerSpeedKmh: null,
    directionLightsLeft: false,
    directionLightsRight: false,
    lightsStage: null,
    rainLights: false,
    currentTyreSet: null,
    tyreSetAvailable: false,
    tyreCompound: null,
    rainIntensity: rainLevel,
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
}

export function buildFocusedSectorHud(car: StandingsCarSnapshot): SectorHudState {
  const current = lapSplits(car.current_lap)
  const last = lapSplits(car.last_lap)
  const best = lapSplits(car.best_lap)
  const completedCount = current.findIndex(value => value === null)
  const completed = completedCount === -1 ? 3 : completedCount
  const runningIndex = Math.min(completed, 2)
  const currentLapTimeMs = lapTime(car.current_lap, car.current_lap_ms)

  const sectors = ([0, 1, 2] as const).map((index): SectorHudEntry => {
    const isComplete = index < completed
    const isRunning = index === runningIndex && completed < 3 && currentLapTimeMs !== null
    const currentMs = isComplete ? (current[index] ?? null) : null
    const referenceMs = last[index] ?? null
    const deltaMs = currentMs !== null && referenceMs !== null
      ? currentMs - referenceMs
      : null
    return {
      index: (index + 1) as 1 | 2 | 3,
      state: isComplete ? 'complete' : isRunning ? 'running' : 'pending',
      currentMs,
      referenceMs,
      bestMs: best[index] ?? null,
      bestReferenceMs: best[index] ?? null,
      deltaMs,
      color: deltaMs === null ? 'grey' : deltaMs <= 0 ? 'green' : 'yellow',
    }
  })

  return {
    version: 1,
    mode: 'running',
    lap: nonNegativeInteger(car.laps),
    referenceLap: null,
    currentSectorIndex: runningIndex,
    currentLapTimeMs,
    lastLapTimeMs: lapTime(car.last_lap, car.last_lap_ms),
    bestLapTimeMs: lapTime(car.best_lap, car.best_lap_ms),
    lapValid: car.current_lap?.is_invalid === false,
    awaitingFlyingLap: car.current_lap?.lap_type === 'outlap',
    sectors,
  }
}

function focusedUnavailable(
  local: FastOverlayState,
  state: StandingsStateEnvelope | null,
): RoutedOverlayTelemetry {
  return {
    source: 'focused',
    fastState: focusedFastState(local, state, null),
    sectorHud: null,
    focusedCar: null,
  }
}

export function routeOverlayTelemetry(
  local: FastOverlayState,
  focusedState: StandingsStateEnvelope | null | undefined,
  focusWasRemote = false,
): RoutedOverlayTelemetry {
  if (focusedState?.status !== 'available' || !focusedState.snapshot) {
    if (focusWasRemote) return focusedUnavailable(local, null)
    return { source: 'local', fastState: local, sectorHud: null, focusedCar: null }
  }
  const snapshot = focusedState.snapshot
  const localIndex = nonNegativeInteger(snapshot.session.local_car_index)
  const focusedIndex = nonNegativeInteger(snapshot.session.focused_car_index)
  if (localIndex === null || focusedIndex === null) {
    if (focusWasRemote) return focusedUnavailable(local, focusedState)
    return { source: 'local', fastState: local, sectorHud: null, focusedCar: null }
  }
  if (focusedIndex === localIndex) {
    const localCar = snapshot.cars.find(car => car.car_index === localIndex) ?? null
    return {
      source: 'local',
      fastState: localFastStateWithFocusedFacts(local, focusedState, localCar),
      sectorHud: null,
      focusedCar: null,
    }
  }

  const focusedCar = snapshot.cars.find(car => car.car_index === focusedIndex) ?? null
  if (!focusedCar) {
    return focusedUnavailable(local, focusedState)
  }

  return {
    source: 'focused',
    fastState: focusedFastState(local, focusedState, focusedCar),
    sectorHud: buildFocusedSectorHud(focusedCar),
    focusedCar,
  }
}
