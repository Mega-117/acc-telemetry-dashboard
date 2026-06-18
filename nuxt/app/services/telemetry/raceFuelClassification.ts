export const STINT_RACE_FUEL_THRESHOLD_L = 20
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
  sessionType: number | null | undefined
): StintFuelClassification {
  if (sessionType === 1) return 'Qualify'
  return (parseFuel(fuelStart) ?? 0) > STINT_RACE_FUEL_THRESHOLD_L ? 'Race' : 'Qualify'
}

export function classifyHistoricalEligibility(
  fuelStart: number | null | undefined,
  sessionType: number | null | undefined,
  stintType?: string | null
): HistoricalEligibility {
  const effectiveStintType = stintType || classifyStintTypeFromFuel(fuelStart, sessionType)
  if (sessionType === 1 || effectiveStintType === 'Qualify') return 'qualy_historical'
  return isHistoricalRaceFuel(fuelStart) ? 'race_historical' : 'race_non_historical'
}
