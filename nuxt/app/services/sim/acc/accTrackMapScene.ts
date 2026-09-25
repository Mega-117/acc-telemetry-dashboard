// Assetto Corsa Competizione -> simulator-neutral track map scene.
//
// The ONLY place that knows ACC's dialect for the map: broadcasting location
// codes, the race session type, the freshness of the UDP roster, and that the
// local car is better taken from shared memory (20 Hz) than from UDP (4 Hz).

import type { TrackMapCar, TrackMapScene } from '~/services/sim/trackMapScene'

// ACC Broadcasting SDK, CarLocationEnum.
const ACC_CAR_LOCATION_PIT_LANE = 2
const ACC_CAR_LOCATION_PIT_ENTRY = 3
// ACC shared memory / broadcasting, RaceSessionType.
const ACC_SESSION_TYPE_RACE = 10
const FUTURE_TOLERANCE_MS = 1000

export interface AccStandingsCar {
  car_index?: number | null
  race_number?: number | null
  car_class?: string | null
  position?: number | null
  cup_position?: number | null
  spline_position?: number | null
  kmh?: number | null
  car_location?: number | null
  has_realtime?: boolean
  realtime_updated_at_ms?: number | null
  current_lap?: { is_invalid?: boolean } | null
}

export interface AccTrackMapInput {
  cars: ReadonlyArray<AccStandingsCar> | null | undefined
  focusedCarIndex?: number | null
  /** Shared memory: authoritative for the local car. */
  localCarIndex: number | null | undefined
  localLapPosition?: number | null
  sessionType?: number | null
  // Same rule as Standings: a driver who left the server stays in the UDP
  // entry list and only stops updating; older than the snapshot TTL = gone.
  nowMs?: number | null
  ttlMs?: number | null
}

function finite (value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function lapPosition (value: unknown): number | null {
  const parsed = finite(value)
  if (parsed === null || parsed < 0 || parsed > 2) return null
  return parsed > 1 ? parsed - 1 : parsed
}

function isStale (car: AccStandingsCar, nowMs: number | null, ttlMs: number | null): boolean {
  if (nowMs === null || ttlMs === null || !(ttlMs > 0)) return false
  const updatedAt = finite(car.realtime_updated_at_ms)
  if (updatedAt === null) return true
  const age = nowMs - updatedAt
  return age < -FUTURE_TOLERANCE_MS || age > ttlMs
}

export function buildAccTrackMapScene (input: AccTrackMapInput): TrackMapScene {
  const localIndex = finite(input.localCarIndex)
  const localPosition = lapPosition(input.localLapPosition)
  const nowMs = finite(input.nowMs)
  const ttlMs = finite(input.ttlMs)
  // Without a focus from the feed the pilot is looking at his own car.
  const focusedIndex = finite(input.focusedCarIndex) ?? localIndex
  const cars: TrackMapCar[] = []
  let localSeen = false

  for (const row of input.cars ?? []) {
    const id = finite(row?.car_index)
    if (id === null || row.has_realtime === false || isStale(row, nowMs, ttlMs)) continue
    const isLocal = localIndex !== null && id === localIndex
    const position = isLocal && localPosition !== null ? localPosition : lapPosition(row.spline_position)
    if (position === null) continue
    localSeen ||= isLocal
    cars.push({
      id,
      lapPosition: position,
      raceNumber: finite(row.race_number),
      overallPosition: finite(row.position),
      classPosition: finite(row.cup_position),
      classKey: typeof row.car_class === 'string' && row.car_class.trim() ? row.car_class.trim().toLowerCase() : null,
      speedKmh: finite(row.kmh),
      inPit: row.car_location === ACC_CAR_LOCATION_PIT_LANE || row.car_location === ACC_CAR_LOCATION_PIT_ENTRY,
      lapInvalid: row.current_lap?.is_invalid === true,
      isLocal,
      isFocused: id === focusedIndex
    })
  }
  // No usable UDP row for the local car: shared memory still knows where it is.
  if (!localSeen && localIndex !== null && localPosition !== null) {
    cars.push({
      id: localIndex, lapPosition: localPosition, raceNumber: null, overallPosition: null, classPosition: null,
      classKey: null, speedKmh: null, inPit: false, lapInvalid: false, isLocal: true, isFocused: localIndex === focusedIndex
    })
  }
  return {
    cars,
    isRace: input.sessionType === ACC_SESSION_TYPE_RACE,
    localInFocus: localIndex === null || focusedIndex === localIndex
  }
}
