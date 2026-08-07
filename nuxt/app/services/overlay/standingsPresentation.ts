export interface StandingsDriverSnapshot {
  first_name?: unknown
  last_name?: unknown
}

export interface StandingsLapSnapshot {
  time_ms?: unknown
  is_invalid?: unknown
  is_valid_for_best?: unknown
  lap_type?: unknown
}

export interface StandingsCarSnapshot {
  car_index: number
  car_class: string | null
  race_number?: unknown
  current_driver_index?: unknown
  drivers: StandingsDriverSnapshot[]
  cup_position?: unknown
  laps?: unknown
  spline_position?: unknown
  best_lap_ms?: unknown
  last_lap_ms?: unknown
  best_lap?: StandingsLapSnapshot | null
  last_lap?: StandingsLapSnapshot | null
  car_location?: unknown
  realtime_updated_at_ms?: unknown
  has_identity: boolean
  has_realtime: boolean
}

export interface StandingsSessionSnapshot {
  event_index?: unknown
  session_index?: unknown
  focused_car_index: number
  is_replay: boolean
  session_type?: unknown
  phase?: unknown
  session_time_ms?: unknown
  session_end_time_ms?: unknown
  weather?: {
    ambient_temp?: unknown
    track_temp?: unknown
  }
}

export interface StandingsSnapshot {
  freshness: { generated_at_ms: number, ttl_ms: number }
  session: StandingsSessionSnapshot
  cars: StandingsCarSnapshot[]
}

export interface StandingsStateEnvelope {
  status: 'available' | 'unavailable'
  reason: string | null
  snapshot: StandingsSnapshot | null
}

export interface StandingsPresentationOptions {
  topCars: number
  carsAhead: number
  carsBehind: number
  showCarNumber: boolean
  showFastestLap: boolean
  showLastLap: boolean
  showLapProgressBar: boolean
}

export type StandingsPositionFlash = 'improved' | 'worsened'
export type StandingsPersonalBestFlash = 'focused' | 'other'

export interface StandingsRowHighlight {
  positionFlash: StandingsPositionFlash | null
  lastLapPersonalBest: StandingsPersonalBestFlash | null
}

export type StandingsHighlightMap = Readonly<Record<number, StandingsRowHighlight>>

export interface StandingsCarNumberColors {
  background: string
  color: string
}

export interface StandingsPresentationRow {
  carIndex: number
  position: number
  positionFlash: StandingsPositionFlash | null
  carNumber: string | null
  carNumberColors: StandingsCarNumberColors
  driverName: string
  inPitLane: boolean
  lastLap: string | null
  bestLap: string | null
  fastestInClass: boolean
  lastLapPersonalBest: StandingsPersonalBestFlash | null
  progressPercent: number | null
  hasProgress: boolean
  focused: boolean
}

export interface StandingsPresentation {
  visible: boolean
  header: {
    sessionType: string | null
    timeLeft: string | null
    temperatures: string | null
    carClass: string | null
  }
  rows: StandingsPresentationRow[]
  columns: {
    carNumber: boolean
    lastLap: boolean
    bestLap: boolean
    progress: boolean
  }
}

export const DEFAULT_STANDINGS_OPTIONS: Readonly<StandingsPresentationOptions> = Object.freeze({
  topCars: 3,
  carsAhead: 3,
  carsBehind: 3,
  showCarNumber: true,
  showFastestLap: true,
  showLastLap: true,
  showLapProgressBar: true,
})

const FUTURE_TOLERANCE_MS = 1000

function hiddenPresentation(options: StandingsPresentationOptions): StandingsPresentation {
  return {
    visible: false,
    header: {
      sessionType: null,
      timeLeft: null,
      temperatures: null,
      carClass: null,
    },
    rows: [],
    columns: {
      carNumber: options.showCarNumber,
      lastLap: options.showLastLap,
      bestLap: options.showFastestLap,
      progress: options.showLapProgressBar,
    },
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
  0: 'Practice',
  1: 'Qualifying',
  2: 'Race',
  3: 'Hotlap',
  4: 'TimeAttack',
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
  const totalSeconds = Math.floor(Math.max(0, sessionEndTime - sessionTime) / 1000)
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

export function standingsCarNumberColors(carClass: unknown): StandingsCarNumberColors {
  const normalized = safeText(carClass, 80)?.toUpperCase() ?? ''
  const backgrounds: Readonly<Record<string, string>> = {
    GT4: 'rgb(38, 38, 69)',
    ST: 'rgb(204, 168, 0)',
    CUP: 'rgb(69, 124, 69)',
    CHL: 'red',
    TCX: 'rgb(0, 124, 167)',
    GT2: 'darkred',
  }
  return {
    background: backgrounds[normalized] ?? 'transparent',
    color: 'white',
  }
}

export function selectStandingsCars(
  eligible: StandingsCarSnapshot[],
  focusedIndex: number,
  options: Pick<StandingsPresentationOptions, 'topCars' | 'carsAhead' | 'carsBehind'>,
): StandingsCarSnapshot[] {
  if (focusedIndex < 0 || focusedIndex >= eligible.length) return []

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
    Math.max(0, focusedIndex - options.carsAhead),
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

/** Build only the V2 cells backed by authoritative ACC Suite providers. */
export function buildStandingsPresentation(
  state: StandingsStateEnvelope | null | undefined,
  optionsInput: Partial<StandingsPresentationOptions> = {},
  nowMs = Date.now(),
  highlights: StandingsHighlightMap = {},
): StandingsPresentation {
  const options: StandingsPresentationOptions = {
    topCars: clampCarCount(optionsInput.topCars ?? DEFAULT_STANDINGS_OPTIONS.topCars),
    carsAhead: clampCarCount(optionsInput.carsAhead ?? DEFAULT_STANDINGS_OPTIONS.carsAhead),
    carsBehind: clampCarCount(optionsInput.carsBehind ?? DEFAULT_STANDINGS_OPTIONS.carsBehind),
    showCarNumber: optionsInput.showCarNumber ?? DEFAULT_STANDINGS_OPTIONS.showCarNumber,
    showFastestLap: optionsInput.showFastestLap ?? DEFAULT_STANDINGS_OPTIONS.showFastestLap,
    showLastLap: optionsInput.showLastLap ?? DEFAULT_STANDINGS_OPTIONS.showLastLap,
    showLapProgressBar: optionsInput.showLapProgressBar ?? DEFAULT_STANDINGS_OPTIONS.showLapProgressBar,
  }
  const hidden = hiddenPresentation(options)
  if (state?.status !== 'available' || !state.snapshot || state.snapshot.session.is_replay === true) {
    return hidden
  }

  const snapshot = state.snapshot
  const focus = snapshot.cars.find(car => car.car_index === snapshot.session.focused_car_index)
  const focusedClass = safeText(focus?.car_class, 80)
  const ttlMs = finiteNumber(snapshot.freshness?.ttl_ms)
  const clockMs = finiteNumber(nowMs)
  if (!focus || !focusedClass || ttlMs === null || ttlMs <= 0 || clockMs === null) return hidden

  const eligible = snapshot.cars
    .filter(car => (
      car.has_identity === true
      && car.has_realtime === true
      && safeText(car.car_class, 80) === focusedClass
      && Number.isInteger(Number(car.cup_position))
      && Number(car.cup_position) > 0
      && isFreshCar(car, clockMs, ttlMs)
    ))
    .sort((left, right) => Number(left.cup_position) - Number(right.cup_position) || left.car_index - right.car_index)

  const focusedIndex = eligible.findIndex(car => car.car_index === focus.car_index)
  if (focusedIndex < 0) return hidden

  const selectedCars = selectStandingsCars(eligible, focusedIndex, options)

  const bestInClassMs = eligible
    .map(car => lapTime(car, 'best'))
    .filter((value): value is number => value !== null)
    .reduce<number | null>((best, value) => best === null || value < best ? value : best, null)

  const sessionType = formatStandingsSessionType(snapshot.session.session_type)
  const sessionTypeCode = finiteNumber(snapshot.session.session_type)
  const showProgress = options.showLapProgressBar && sessionType !== null && sessionTypeCode !== 2

  const rows = selectedCars
    .map((car): StandingsPresentationRow => {
      const focused = car.car_index === focus.car_index
      const bestLapMs = lapTime(car, 'best')
      const raceNumber = finiteNumber(car.race_number)
      const spline = finiteNumber(car.spline_position)
      const inPitLane = finiteNumber(car.car_location) === 2
      const highlight = highlights[car.car_index]
      const progressPercent = showProgress && inPitLane
        ? 0
        : showProgress && spline !== null
          ? Math.round(Math.min(Math.max(spline, 0), 1) * 1000) / 10
          : null
      return {
        carIndex: car.car_index,
        position: Number(car.cup_position),
        positionFlash: highlight?.positionFlash ?? null,
        carNumber: options.showCarNumber && raceNumber !== null && Number.isInteger(raceNumber) && raceNumber >= 0
          ? String(Math.round(raceNumber)) : null,
        carNumberColors: standingsCarNumberColors(car.car_class),
        driverName: formatStandingsDriverName(car),
        inPitLane,
        lastLap: options.showLastLap ? formatStandingsLapTime(lapTime(car, 'last')) : null,
        bestLap: options.showFastestLap ? formatStandingsLapTime(bestLapMs) : null,
        fastestInClass: options.showFastestLap && bestLapMs !== null && bestLapMs === bestInClassMs,
        lastLapPersonalBest: highlight?.lastLapPersonalBest ?? null,
        progressPercent,
        hasProgress: progressPercent !== null && progressPercent > 0,
        focused,
      }
    })

  return {
    visible: rows.length > 0,
    header: {
      sessionType,
      timeLeft: formatStandingsRemainingTime(
        snapshot.session.session_time_ms,
        snapshot.session.session_end_time_ms,
      ),
      temperatures: formatStandingsTemperatures(snapshot.session.weather),
      carClass: focusedClass,
    },
    rows,
    columns: {
      carNumber: options.showCarNumber,
      lastLap: options.showLastLap,
      bestLap: options.showFastestLap,
      progress: showProgress,
    },
  }
}
