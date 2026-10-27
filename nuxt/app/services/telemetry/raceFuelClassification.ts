export const STINT_RACE_FUEL_THRESHOLD_L = 20
export const BEST_RULES_VERSION = 7
export const HISTORICAL_RACE_FUEL_THRESHOLD_L = 40

export const RACE_FUEL_BUCKETS = ['40-60', '60-80', '80-100', '100+'] as const

export type RaceFuelBucket = typeof RACE_FUEL_BUCKETS[number]
export type HistoricalEligibility = 'qualy_historical' | 'race_non_historical' | 'race_historical'
export type StintFuelClassification = 'Qualify' | 'Race'

function parseFuel(fuel: number | null | undefined): number | null {
  const parsed = Number(fuel)
  return Number.isFinite(parsed) ? parsed : null
}

export function getRaceFuelBucket(fuel: number | null | undefined): RaceFuelBucket | null {
  const parsed = parseFuel(fuel)
  if (parsed == null || parsed <= HISTORICAL_RACE_FUEL_THRESHOLD_L) return null
  if (parsed <= 60) return '40-60'
  if (parsed <= 80) return '60-80'
  if (parsed <= 100) return '80-100'
  return '100+'
}

export function isHistoricalRaceFuel(fuel: number | null | undefined): boolean {
  return getRaceFuelBucket(fuel) !== null
}

export function classifyStintTypeFromFuel(
  fuelStart: number | null | undefined,
  _sessionType: number | null | undefined
): StintFuelClassification {
  // ACC event type must not override the actual fuel load.
  return (parseFuel(fuelStart) ?? 0) > STINT_RACE_FUEL_THRESHOLD_L ? 'Race' : 'Qualify'
}

export function classifyHistoricalEligibility(
  fuelStart: number | null | undefined,
  sessionType: number | null | undefined,
  _stintType?: string | null
): HistoricalEligibility {
  const effectiveStintType = classifyStintTypeFromFuel(fuelStart, sessionType)
  if (effectiveStintType === 'Qualify') return 'qualy_historical'
  return isHistoricalRaceFuel(fuelStart) ? 'race_historical' : 'race_non_historical'
}

// PIP-649: a refuel in the pit box can land inside the stint's first lap (pit-exit latch missed, the
// split came from the fuel jump), so the stint kept the low fuel read before the stop. Same rule as the
// logger's stint_departure_fuel: the first lap ending 2 L above where it started means the car left
// with that fuel. Without the correction a race stint on full tanks was filed as qualifying.
export const REFUEL_JUMP_L = 2

// A missing reading is unknown, never 0 (Number(null) is 0): only real numbers count as evidence.
const reading = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null

export function stintDepartureFuel(stint: { fuel_start?: unknown, laps?: unknown } | null | undefined): number | null {
  const start = reading(stint?.fuel_start)
  const first = Array.isArray(stint?.laps) ? stint.laps[0] as { fuel_start?: unknown, fuel_remaining?: unknown } | undefined : undefined
  const remaining = reading(first?.fuel_remaining)
  const before = reading(first?.fuel_start) ?? start
  if (remaining == null || before == null || remaining <= before + REFUEL_JUMP_L) return start
  // The fuel after the refuel (never the previous stint's load), rounded as the logger saves it:
  // recalculating a saved session gives the same class.
  return Math.round(remaining * 10) / 10
}
