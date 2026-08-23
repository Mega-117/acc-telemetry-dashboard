import type { LapData, StintData } from '~/types/telemetry'

export const MIN_CLEAN_LAPS_FOR_AVG = 5

export function isCleanSessionLap(lap: LapData): boolean {
  return Number(lap.lap_time_ms) > 0
    && lap.is_valid
    && !lap.has_pit_stop
    && !lap.pit_out_lap
}

export function buildRawStintMetrics(stint: StintData): {
  cleanLaps: LapData[]
  cleanLapsCount: number
  bestMs: number | null
  avgMs: number | null
  avgWarning: boolean
} {
  const cleanLaps = stint.laps.filter(isCleanSessionLap)
  const cleanLapsCount = cleanLaps.length
  const bestMs = cleanLapsCount > 0
    ? Math.min(...cleanLaps.map((lap) => lap.lap_time_ms))
    : null
  const avgMs = cleanLapsCount >= MIN_CLEAN_LAPS_FOR_AVG && Number(stint.avg_clean_lap) > 0
    ? stint.avg_clean_lap
    : null

  return {
    cleanLaps,
    cleanLapsCount,
    bestMs,
    avgMs,
    avgWarning: cleanLapsCount > 0 && cleanLapsCount < MIN_CLEAN_LAPS_FOR_AVG
  }
}
