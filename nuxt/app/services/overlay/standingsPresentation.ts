import { usesLegacyHudInput } from '~/services/sim/hudSourceAdapter'
import { EMPTY_STANDINGS_LAYOUT, normalizeStandingsLayout, type StandingsLayout } from './standingsLayout'
import { commonValue, commonBoolean, type CommonLive } from '~/services/telemetry/commonLive'
import {
  standingsManufacturerLogo,
  standingsManufacturerFromModel,
  type StandingsPublicPathResolver,
} from './standingsManufacturer'

export interface StandingsDriverSnapshot {
  first_name?: unknown
  last_name?: unknown
}

export interface StandingsLapSnapshot {
  time_ms?: unknown
  splits_ms?: unknown
  is_invalid?: unknown
  is_valid_for_best?: unknown
  lap_type?: unknown
}

export interface StandingsCarSnapshot {
  car_index: number
  car_class: string | null
  manufacturer_key?: unknown
  race_number?: unknown
  cup_category?: unknown
  current_driver_index?: unknown
  drivers: StandingsDriverSnapshot[]
  cup_position?: unknown
  position?: unknown
  delta_ms?: unknown
  relative_gap_kind?: unknown
  relative_gap_ms?: unknown
  relative_gap_laps?: unknown
  relative_gap_reason?: unknown
  predicted_lap_ms?: unknown
  engine_running?: unknown
  kmh?: unknown
  gear?: unknown
  laps?: unknown
  spline_position?: unknown
  best_lap_ms?: unknown
  last_lap_ms?: unknown
  best_lap?: StandingsLapSnapshot | null
  current_lap_ms?: unknown
  last_lap?: StandingsLapSnapshot | null
  car_location?: unknown
  stint_elapsed_ms?: unknown
  current_lap?: StandingsLapSnapshot | null
  realtime_updated_at_ms?: unknown
  has_identity: boolean
  has_realtime: boolean
}

export interface StandingsSessionSnapshot {
  session_kind?: unknown
  remaining_time_ms?: unknown
  event_index?: unknown
  session_index?: unknown
  focused_car_index: number
  is_replay: boolean
  local_car_index?: unknown
  session_type?: unknown
  phase?: unknown
  session_time_ms?: unknown
  session_end_time_ms?: unknown
  best_session_lap_ms?: unknown
  weather?: {
    ambient_temp?: unknown
    track_temp?: unknown
    rain_level?: unknown
  }
}

export interface FocusedPitExitTrafficSnapshot {
  // ACC Drive-style prediction around the focused car.
  available?: unknown
  reason?: unknown
  count?: unknown
  rear_window?: unknown
  front_window?: unknown
}

export interface StandingsSnapshot {
  schema?: string
  game_id?: string
  session_id?: string
  identity?: { track?: string | null; variant?: string | null; car?: string | null }
  focused_flag?: { available?: unknown, reason?: unknown, flag?: unknown }
  freshness: { generated_at_ms: number, ttl_ms: number }
  session: StandingsSessionSnapshot
  cars: StandingsCarSnapshot[]
  focused_pit_exit_traffic?: FocusedPitExitTrafficSnapshot
  roster?: {
    entry_list_received?: unknown
    expected_cars?: unknown
    identified_cars?: unknown
    realtime_cars?: unknown
    complete?: unknown
  }
}

export interface StandingsLocalDriverSnapshot {
  isFresh: boolean
  isLive: boolean
  carIndex: number | null
  firstName: string | null
  lastName: string | null
  position: number | null
  personal?: {
    carModel: string | null; bestLapMs: number | null; lastLapMs: number | null
    inPitLane: boolean; progress: number | null; sessionKind: string | null
    timeLeftMs: number | null; airTemp: number | null; roadTemp: number | null
  }
}

export interface StandingsStateEnvelope {
  status: 'available' | 'unavailable'
  reason: string | null
  snapshot: StandingsSnapshot | null
}

export function scopeStandingsForLive(state: StandingsStateEnvelope, live: CommonLive | null | undefined, now = Date.now()): StandingsStateEnvelope {
  const denied: StandingsStateEnvelope = { status: 'unavailable', reason: 'source-context-mismatch', snapshot: null }
  const snapshot = state.snapshot
  if (snapshot?.schema !== 'racercore.standings') return !usesLegacyHudInput(live) ? denied : state
  const age = now - snapshot.freshness.generated_at_ms
  return live?.connected && live.fresh && ['live', 'paused'].includes(live.lifecycle || '')
    && live.capabilities.standings === true && live.gameId === snapshot.game_id && live.sessionId === snapshot.session_id
    && age >= -1000 && age <= snapshot.freshness.ttl_ms
    && (['track', 'variant', 'car'] as const).every(key => (live.identity?.[key] ?? null) === (snapshot.identity?.[key] ?? null))
    ? state : denied
}

export function commonStandingsLocal(state: StandingsStateEnvelope, now: number, live?: CommonLive | null): StandingsLocalDriverSnapshot | null {
  const snapshot = state.status === 'available' ? state.snapshot : null
  if (live?.capabilities.personal_standings === true && live.capabilities.standings !== true) {
    if (!live.fresh || !live.connected || live.lifecycle !== 'live' || !live.sessionId) return null
    const value = (name: string, unit: string) => commonValue(live, name, unit)
    return { isFresh: true, isLive: true, carIndex: null,
      firstName: safeText(live.driver?.firstName, 60), lastName: safeText(live.driver?.lastName, 60),
      // A personal feed does not certify a classified position or opponent gap.
      position: null,
      personal: { carModel: safeText(live.identity?.car), bestLapMs: value('best_lap_time', 'ms'),
        lastLapMs: value('last_lap_time', 'ms'), inPitLane: commonBoolean(live, 'in_pit_lane') === true || commonBoolean(live, 'in_pit_box') === true,
        progress: value('normalized_position', 'ratio'), sessionKind: live.sessionKind ?? null,
        timeLeftMs: value('session_time_remaining', 'ms'), airTemp: value('air_temperature', 'C'), roadTemp: value('road_temperature', 'C') } }
  }
  if (snapshot?.schema !== 'racercore.standings') return null
  const local = snapshot.cars.find(car => car.car_index === snapshot.session.local_car_index)
  if (!local?.has_identity || !local.has_realtime || !isFreshCar(local, now, snapshot.freshness.ttl_ms)) return null
  const index = local.current_driver_index
  const driver = typeof index === 'number' && Number.isInteger(index) ? local.drivers[index] : null
  return { isFresh: true, isLive: true, carIndex: local.car_index, firstName: safeText(driver?.first_name, 60),
    lastName: safeText(driver?.last_name, 60), position: finiteNumber(local.position) }
}

export interface StandingsPresentationOptions {
  topCars: number
  carsAhead: number
  carsBehind: number
  showCarNumber: boolean
  showFastestLap: boolean
  showLastLap: boolean
  showLapProgressBar: boolean
  standingsLayout: StandingsLayout | null
}

export type StandingsPositionFlash = 'improved' | 'worsened'
export type StandingsPersonalBestFlash = 'focused' | 'other'
export type StandingsNumberPlateVariant = 'pro' | 'pro-am' | 'am' | 'silver' | 'neutral'
export type StandingsRelativeGapTone = 'ahead' | 'behind' | 'neutral'

export interface StandingsRowHighlight {
  positionFlash: StandingsPositionFlash | null
  lastLapPersonalBest: StandingsPersonalBestFlash | null
}

export type StandingsHighlightMap = Readonly<Record<number, StandingsRowHighlight>>

export interface StandingsPresentationRow {
  carIndex: number | null
  position: number | null
  positionFlash: StandingsPositionFlash | null
  carNumber: string | null
  carNumberVariant: StandingsNumberPlateVariant
  manufacturerLogoSrc: string
  manufacturerName: string
  driverName: string
  carModel?: string | null
  inPitLane: boolean
  relativeGap: string
  relativeGapTone: StandingsRelativeGapTone
  lastLap: string | null
  bestLap: string | null
  fastestInClass: boolean
  lastLapPersonalBest: StandingsPersonalBestFlash | null
  progressPercent: number | null
  hasProgress: boolean
  local: boolean
  focused: boolean
}

export interface StandingsPresentation {
  visible: boolean
  message: string | null
  header: {
    sessionType: string | null
    timeLeft: string | null
    temperatures: string | null
  }
  rows: StandingsPresentationRow[]
  columns: {
    carNumber: boolean
    lastLap: boolean
    bestLap: boolean
    progress: boolean
  }
  layout: StandingsLayout
}

export const DEFAULT_STANDINGS_OPTIONS: Readonly<StandingsPresentationOptions> = Object.freeze({
  topCars: 3,
  carsAhead: 3,
  carsBehind: 3,
  showCarNumber: true,
  showFastestLap: true,
  showLastLap: true,
  showLapProgressBar: true,
  standingsLayout: null,
})

const FUTURE_TOLERANCE_MS = 1000
export const ACC_BROADCASTING_SESSION_TYPES = Object.freeze({
  PRACTICE: 0,
  QUALIFYING: 4,
  SUPERPOLE: 9,
  RACE: 10,
})

function hiddenPresentation(options: StandingsPresentationOptions): StandingsPresentation {
  return {
    visible: false,
    message: null,
    header: {
      sessionType: null,
      timeLeft: null,
      temperatures: null,
    },
    rows: [],
    columns: {
      carNumber: options.showCarNumber,
      lastLap: options.showLastLap,
      bestLap: options.showFastestLap,
      progress: options.showLapProgressBar,
    },
    layout: options.standingsLayout ?? EMPTY_STANDINGS_LAYOUT,
  }
}

function clampCarCount(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 3
  return Math.round(Math.min(Math.max(numeric, 0), 5))
}

function safeText(value: unknown, maxLength = 120): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

/** ACC Broadcasting CupCategory controls the entry's number-plate palette. */
export function standingsNumberPlateVariant(value: unknown): StandingsNumberPlateVariant {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 'neutral'
  if (value === 0) return 'pro'
  if (value === 1) return 'pro-am'
  if (value === 2) return 'am'
  if (value === 3) return 'silver'
  return 'neutral'
}

function positiveLapTime(value: unknown): number | null {
  const numeric = finiteNumber(value)
  return numeric !== null && numeric > 0 ? Math.round(numeric) : null
}

function lapTime(car: StandingsCarSnapshot, kind: 'best' | 'last'): number | null {
  const detailed = kind === 'best' ? car.best_lap?.time_ms : car.last_lap?.time_ms
  const legacy = kind === 'best' ? car.best_lap_ms : car.last_lap_ms
  return positiveLapTime(detailed) ?? positiveLapTime(legacy)
}

function isFreshCar(car: StandingsCarSnapshot, nowMs: number, ttlMs: number): boolean {
  const updatedAtMs = finiteNumber(car.realtime_updated_at_ms)
  if (updatedAtMs === null) return false
  const ageMs = nowMs - updatedAtMs
  return ageMs >= -FUTURE_TOLERANCE_MS && ageMs <= ttlMs
}

export function formatStandingsDriverName(car: StandingsCarSnapshot): string {
  if (car.current_driver_index === null || car.current_driver_index === undefined) return 'NoData'
  const index = Number(car.current_driver_index)
  if (!Number.isInteger(index) || index < 0 || index >= car.drivers.length) return 'NoData'
  const driver = car.drivers[index]
  if (!driver || typeof driver !== 'object') return 'NoData'
  const firstName = safeText(driver.first_name, 60)
  const lastName = safeText(driver.last_name, 60)
  if (!lastName) return 'NoData'
  return `${firstName?.charAt(0).toUpperCase() ?? ''}. ${lastName}`
}

export function formatStandingsLapTime(value: unknown): string | null {
  const totalMs = positiveLapTime(value)
  if (totalMs === null) return null
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const milliseconds = totalMs % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

const SESSION_TYPE_LABELS: Readonly<Record<number, string>> = Object.freeze({
  [ACC_BROADCASTING_SESSION_TYPES.PRACTICE]: 'Practice',
  [ACC_BROADCASTING_SESSION_TYPES.QUALIFYING]: 'Qualifying',
  [ACC_BROADCASTING_SESSION_TYPES.SUPERPOLE]: 'Superpole',
  [ACC_BROADCASTING_SESSION_TYPES.RACE]: 'Race',
})

export function formatStandingsSessionType(value: unknown): string | null {
  const sessionType = finiteNumber(value)
  if (sessionType === null || !Number.isInteger(sessionType)) return null
  return SESSION_TYPE_LABELS[sessionType] ?? null
}

export function formatStandingsRemainingTime(sessionTimeMs: unknown, sessionEndTimeMs: unknown): string | null {
  const sessionTime = finiteNumber(sessionTimeMs)
  const sessionEndTime = finiteNumber(sessionEndTimeMs)
  if (sessionTime === null || sessionEndTime === null) return null
  // ACC Broadcasting espone session_end_time_ms come countdown residuo.
  // session_time_ms valida la coppia ma non va sottratto una seconda volta.
  const totalSeconds = Math.floor(Math.max(0, sessionEndTime) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map(part => String(part).padStart(2, '0')).join(':')
}

export function formatStandingsTemperatures(weather: StandingsSessionSnapshot['weather']): string | null {
  const ambient = finiteNumber(weather?.ambient_temp)
  const track = finiteNumber(weather?.track_temp)
  if (ambient === null || track === null) return null
  return `${Math.round(ambient)}/${Math.round(track)}°`
}

export function selectStandingsCars(
  eligible: StandingsCarSnapshot[],
  localIndex: number,
  options: Pick<StandingsPresentationOptions, 'topCars' | 'carsAhead' | 'carsBehind'>,
): StandingsCarSnapshot[] {
  if (localIndex < 0 || localIndex >= eligible.length) return []

  const target = Math.min(
    eligible.length,
    options.topCars + options.carsAhead + options.carsBehind + 1,
  )
  if (target === 0) return []

  const selected = new Set<number>()
  const addAt = (index: number) => {
    const car = eligible[index]
    if (car) selected.add(car.car_index)
  }

  for (let index = 0; index < Math.min(options.topCars, eligible.length); index += 1) addAt(index)

  const windowSize = Math.min(eligible.length, options.carsAhead + options.carsBehind + 1)
  const windowStart = Math.min(
    Math.max(0, localIndex - options.carsAhead),
    eligible.length - windowSize,
  )
  const windowEnd = windowStart + windowSize
  for (let index = windowStart; index < windowEnd; index += 1) addAt(index)

  // Top/window overlap and either roster edge can reduce the union. Extend the
  // focus window towards available cars until the configured target is met.
  let right = windowEnd
  let left = windowStart - 1
  while (selected.size < target && (right < eligible.length || left >= 0)) {
    if (right < eligible.length) addAt(right++)
    else if (left >= 0) addAt(left--)
  }
  for (let index = 0; selected.size < target && index < eligible.length; index += 1) addAt(index)

  return eligible.filter(car => selected.has(car.car_index))
}

export function formatStandingsRelativeGap(
  value: unknown,
  kind: unknown = 'time',
  laps: unknown = null,
): {
  text: string
  tone: StandingsRelativeGapTone
} {
  if (kind === 'laps') {
    const lapCount = finiteNumber(laps)
    if (lapCount === null || !Number.isInteger(lapCount) || lapCount < 1) {
      return { text: '--.-', tone: 'neutral' }
    }
    return {
      text: `${lapCount} ${lapCount === 1 ? 'Lap' : 'Laps'}`,
      tone: 'neutral',
    }
  }
  if (kind !== 'time') return { text: '--.-', tone: 'neutral' }
  const gapMs = finiteNumber(value)
  if (gapMs === null || gapMs === 0) return { text: '--.-', tone: 'neutral' }
  const seconds = Math.abs(gapMs) / 1000
  return {
    text: `${gapMs > 0 ? '+' : '-'}${seconds.toFixed(1)}`,
    tone: gapMs > 0 ? 'ahead' : 'behind',
  }
}

function standingsProgressPercent(
  car: Pick<StandingsCarSnapshot, 'car_location' | 'spline_position'> | null,
  visible: boolean,
): number | null {
  if (!visible) return null
  if (finiteNumber(car?.car_location) === 2) return 0
  const spline = finiteNumber(car?.spline_position)
  if (spline === null) return 0
  return Math.round(Math.min(Math.max(spline, 0), 1) * 1000) / 10
}

/**
 * Ordina una sola volta la classe autorevole dell'auto locale usando la posizione
 * assoluta ACC. Il chiamante usa l'indice risultante come posizione di classe;
 * cup_position appartiene alla cup category e non e' un surrogato valido.
 */
export function selectFreshLocalClassCars(
  snapshot: StandingsSnapshot,
  nowMs: number,
  localCarIndexOverride?: number | null,
): StandingsCarSnapshot[] {
  const localCarIndex = finiteNumber(localCarIndexOverride ?? snapshot.session.local_car_index)
  const local = Number.isInteger(localCarIndex)
    ? snapshot.cars.find(car => car.car_index === localCarIndex)
    : null
  const localClass = safeText(local?.car_class, 80)
  const ttlMs = finiteNumber(snapshot.freshness?.ttl_ms)
  const clockMs = finiteNumber(nowMs)
  if (!local || !localClass || ttlMs === null || ttlMs <= 0 || clockMs === null) return []

  return snapshot.cars
    .filter(car => (
      car.has_identity === true
      && car.has_realtime === true
      && safeText(car.car_class, 80) === localClass
      && Number.isInteger(Number(car.position))
      && Number(car.position) > 0
      && isFreshCar(car, clockMs, ttlMs)
    ))
    .sort((left, right) => Number(left.position) - Number(right.position) || left.car_index - right.car_index)
}

/** Build only the V2 cells backed by authoritative application providers. */
export function buildStandingsPresentation(
  state: StandingsStateEnvelope | null | undefined,
  optionsInput: Partial<StandingsPresentationOptions> = {},
  nowMs = Date.now(),
  highlights: StandingsHighlightMap = {},
  localDriverInput: StandingsLocalDriverSnapshot | null = null,
  resolvePublicPath?: StandingsPublicPathResolver,
): StandingsPresentation {
  const options: StandingsPresentationOptions = {
    topCars: clampCarCount(optionsInput.topCars ?? DEFAULT_STANDINGS_OPTIONS.topCars),
    carsAhead: clampCarCount(optionsInput.carsAhead ?? DEFAULT_STANDINGS_OPTIONS.carsAhead),
    carsBehind: clampCarCount(optionsInput.carsBehind ?? DEFAULT_STANDINGS_OPTIONS.carsBehind),
    showCarNumber: optionsInput.showCarNumber ?? DEFAULT_STANDINGS_OPTIONS.showCarNumber,
    showFastestLap: optionsInput.showFastestLap ?? DEFAULT_STANDINGS_OPTIONS.showFastestLap,
    showLastLap: optionsInput.showLastLap ?? DEFAULT_STANDINGS_OPTIONS.showLastLap,
    showLapProgressBar: optionsInput.showLapProgressBar ?? DEFAULT_STANDINGS_OPTIONS.showLapProgressBar,
    standingsLayout: normalizeStandingsLayout(optionsInput.standingsLayout),
  }
  const hidden = hiddenPresentation(options)
  const configuredRowCapacity = options.topCars + options.carsAhead + options.carsBehind + 1
  if (!options.standingsLayout || options.standingsLayout.rowCapacity !== configuredRowCapacity) return hidden
  const clockMs = finiteNumber(nowMs)
  if (clockMs === null) return hidden

  const snapshot = state?.status === 'available'
    && state.snapshot
    && state.snapshot.session.is_replay !== true
    ? state.snapshot
    : null
  const sharedLocal = localDriverInput?.isFresh === true && localDriverInput.isLive === true
    ? localDriverInput
    : null
  const sharedCarIndex = finiteNumber(sharedLocal?.carIndex)
  const personal = sharedLocal?.personal
  const localCarIndex = Number.isInteger(sharedCarIndex) && sharedCarIndex !== null && sharedCarIndex >= 0
    ? sharedCarIndex
    : null
  const udpLocal = localCarIndex === null
    ? null
    : snapshot?.cars.find(car => car.car_index === localCarIndex) ?? null
  const focus = snapshot?.cars.find(car => car.car_index === snapshot.session.focused_car_index)
  const localClass = udpLocal?.has_identity === true ? safeText(udpLocal.car_class, 80) : null
  const localPosition = (() => {
    const shared = finiteNumber(sharedLocal?.position)
    if (shared !== null && Number.isInteger(shared) && shared > 0) return shared
    return null
  })()
  const hasLocal = sharedLocal !== null

  let eligible: StandingsCarSnapshot[] = []
  if (snapshot && localClass && localCarIndex !== null) {
    eligible = selectFreshLocalClassCars(snapshot, clockMs, localCarIndex)
    const withoutLocal = eligible.filter(car => car.car_index !== localCarIndex)
    eligible = withoutLocal
    if (hasLocal && localPosition !== null) {
      const localCandidate: StandingsCarSnapshot = {
        ...(udpLocal ?? {}),
        car_index: localCarIndex,
        car_class: localClass,
        drivers: udpLocal?.drivers ?? [],
        position: localPosition,
        has_identity: udpLocal?.has_identity === true,
        has_realtime: true,
        realtime_updated_at_ms: clockMs,
      }
      eligible = [...withoutLocal, localCandidate]
        .sort((left, right) => Number(left.position) - Number(right.position) || left.car_index - right.car_index)
    }
  }

  const localIndex = localCarIndex === null
    ? -1
    : eligible.findIndex(car => car.car_index === localCarIndex)
  const selectedCars = localIndex >= 0 ? selectStandingsCars(eligible, localIndex, options) : []
  const classPositionByCarIndex = new Map(
    eligible.map((car, index) => [car.car_index, index + 1]),
  )

  const bestInClassMs = eligible
    .map(car => lapTime(car, 'best'))
    .filter((value): value is number => value !== null)
    .reduce<number | null>((best, value) => best === null || value < best ? value : best, null)

  const common = snapshot?.schema === 'racercore.standings'
  const commonKinds: Record<string, string> = { practice: 'Practice', qualify: 'Qualifying', qualifying: 'Qualifying', race: 'Race', time_attack: 'Time attack', hotlap: 'Hotlap', hot_stint: 'Hot stint', cruise: 'Guida libera' }
  const sessionType = personal ? commonKinds[String(personal.sessionKind)] ?? null : common ? commonKinds[String(snapshot.session.session_kind)] ?? null
    : formatStandingsSessionType(snapshot?.session.session_type)
  const showProgressData = options.showLapProgressBar

  let rows = selectedCars
    .map((car): StandingsPresentationRow => {
      const focused = car.car_index === focus?.car_index
      const isLocal = car.car_index === localCarIndex
      const bestLapMs = lapTime(car, 'best')
      const raceNumber = finiteNumber(car.race_number)
      const inPitLane = common ? ['pitlane', 'pitbox'].includes(String(car.car_location)) : finiteNumber(car.car_location) === 2
      const highlight = highlights[car.car_index]
      const progressPercent = standingsProgressPercent(car, showProgressData)
      const manufacturer = standingsManufacturerLogo(car.manufacturer_key, resolvePublicPath)
      const relativeGap = isLocal
        ? { text: '--.-', tone: 'neutral' as const }
        : formatStandingsRelativeGap(
            car.relative_gap_ms,
            car.relative_gap_kind,
            car.relative_gap_laps,
          )
      return {
        carIndex: car.car_index,
        position: classPositionByCarIndex.get(car.car_index) as number,
        positionFlash: isLocal ? null : (highlight?.positionFlash ?? null),
        carNumber: options.showCarNumber && raceNumber !== null && Number.isInteger(raceNumber) && raceNumber >= 0
          ? String(Math.round(raceNumber)) : null,
        carNumberVariant: common ? 'neutral' : standingsNumberPlateVariant(car.cup_category),
        manufacturerLogoSrc: manufacturer.src,
        manufacturerName: manufacturer.name,
        driverName: isLocal ? formatLocalDriverName(sharedLocal) : formatStandingsDriverName(car),
        inPitLane,
        relativeGap: relativeGap.text,
        relativeGapTone: relativeGap.tone,
        lastLap: options.showLastLap ? formatStandingsLapTime(lapTime(car, 'last')) : null,
        bestLap: options.showFastestLap ? formatStandingsLapTime(bestLapMs) : null,
        fastestInClass: options.showFastestLap && bestLapMs !== null && bestLapMs === bestInClassMs,
        lastLapPersonalBest: highlight?.lastLapPersonalBest ?? null,
        progressPercent,
        hasProgress: progressPercent !== null && progressPercent > 0,
        local: isLocal,
        focused,
      }
    })

  if (hasLocal && rows.every(row => row.local !== true)) {
    const localName = formatLocalDriverName(sharedLocal)
    const raceNumber = finiteNumber(udpLocal?.race_number)
    const localInPitLane = personal ? personal.inPitLane : common ? ['pitlane', 'pitbox'].includes(String(udpLocal?.car_location)) : finiteNumber(udpLocal?.car_location) === 2
    const localProgressPercent = personal
      ? showProgressData && personal.progress !== null && personal.progress >= 0 && personal.progress <= 1 ? Math.round(personal.progress * 1000) / 10 : null
      : standingsProgressPercent(udpLocal ?? null, showProgressData)
    const manufacturer = standingsManufacturerLogo(personal ? standingsManufacturerFromModel(personal.carModel) : udpLocal?.manufacturer_key, resolvePublicPath)
    rows = [{
      carIndex: localCarIndex,
      position: localPosition,
      positionFlash: null,
      carNumber: options.showCarNumber && raceNumber !== null && Number.isInteger(raceNumber) && raceNumber >= 0
        ? String(Math.round(raceNumber)) : null,
      carNumberVariant: common ? 'neutral' : standingsNumberPlateVariant(udpLocal?.cup_category),
      manufacturerLogoSrc: manufacturer.src,
      manufacturerName: manufacturer.name,
      driverName: localName,
      carModel: personal?.carModel,
      inPitLane: localInPitLane,
      relativeGap: '--.-',
      relativeGapTone: 'neutral',
      lastLap: options.showLastLap ? formatStandingsLapTime(personal ? personal.lastLapMs : udpLocal ? lapTime(udpLocal, 'last') : null) : null,
      bestLap: options.showFastestLap ? formatStandingsLapTime(personal ? personal.bestLapMs : udpLocal ? lapTime(udpLocal, 'best') : null) : null,
      fastestInClass: false,
      lastLapPersonalBest: null,
      progressPercent: localProgressPercent,
      hasProgress: localProgressPercent !== null && localProgressPercent > 0,
      local: true,
      focused: localCarIndex !== null && localCarIndex === focus?.car_index,
    }]
  }

  const rosterComplete = snapshot?.roster?.complete === true
    || (snapshot?.cars.length ? snapshot.cars.every(car => car.has_identity === true) : false)
  const realtimeComplete = snapshot?.cars.length
    ? snapshot.cars.every(car => car.has_realtime === true && isFreshCar(car, clockMs, snapshot.freshness.ttl_ms))
    : false
  const message = personal ? 'Solo dati personali · Classifica avversari non disponibile' : !snapshot || !hasLocal || !localClass || !rosterComplete || !realtimeComplete
    ? 'Classifica in aggiornamento…'
    : null
  if (message && rows.length >= options.standingsLayout.rowCapacity) {
    const removable = [...rows].reverse().find(row => row.local !== true)
    if (removable) rows = rows.filter(row => row !== removable)
  }

  return {
    visible: true,
    message,
    header: {
      sessionType,
      timeLeft: personal ? formatStandingsRemainingTime(0, personal.timeLeftMs) : common ? formatStandingsRemainingTime(0, snapshot.session.remaining_time_ms) : formatStandingsRemainingTime(
        snapshot?.session.session_time_ms,
        snapshot?.session.session_end_time_ms,
      ),
      temperatures: formatStandingsTemperatures(personal ? { ambient_temp: personal.airTemp, track_temp: personal.roadTemp } : snapshot?.session.weather),
    },
    rows,
    columns: {
      carNumber: options.showCarNumber,
      lastLap: options.showLastLap,
      bestLap: options.showFastestLap,
      progress: options.showLapProgressBar,
    },
    layout: options.standingsLayout,
  }
}

function formatLocalDriverName(
  local: StandingsLocalDriverSnapshot | null,
): string {
  const firstName = safeText(local?.firstName, 60)
  const lastName = safeText(local?.lastName, 60)
  if (lastName) return `${firstName?.charAt(0).toUpperCase() ?? ''}. ${lastName}`
  if (firstName) return firstName
  return 'Pilota locale'
}
