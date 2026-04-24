// ============================================
// sessionParser.ts - Session metadata normalization
// ============================================
// Canonical business rules live in the local program (Python domain layer).
// This module consumes the canonical summary when present and only keeps a
// compatibility fallback for legacy payloads that have not been reprocessed yet.

import type { SessionMeta, SessionSummary } from '~/composables/useTelemetryData'

type BestConditions = { airTemp: number; roadTemp: number; grip: string }
type HistoricalEligibility = 'qualy_historical' | 'race_non_historical' | 'race_historical'
export type SessionSummarySource = 'canonical' | 'legacy_fallback' | 'missing_canonical'

const VALID_GRIPS = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum'] as const
const STINT_RACE_FUEL_THRESHOLD_L = 20
const HISTORICAL_RACE_FUEL_THRESHOLD_L = 40

export const BEST_RULES_VERSION = 3

function normalizeGrip(grip: string): string {
  if (grip === 'Opt') return 'Optimum'
  if (grip === 'Flooded') return 'Flood'
  return grip || 'Unknown'
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function toNonNegativeInt(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed)
}

function buildConditions(lap: any): BestConditions {
  return {
    airTemp: toNonNegativeInt(lap?.air_temp),
    roadTemp: toNonNegativeInt(lap?.road_temp),
    grip: normalizeGrip(String(lap?.track_grip_status || 'Unknown'))
  }
}

function emptyBestByGrip(): Record<string, any> {
  return Object.fromEntries(
    VALID_GRIPS.map((grip) => [
      grip,
      {
        bestQualy: null,
        bestQualyTemp: null,
        bestQualyFuel: null,
        bestRace: null,
        bestRaceTemp: null,
        bestRaceFuel: null,
        bestAvgRace: null,
        bestAvgRaceTemp: null,
        bestAvgRaceFuel: null
      }
    ])
  )
}

function normalizeBestByGrip(bestByGrip: Record<string, any> | null | undefined): Record<string, any> {
  const normalized = emptyBestByGrip()
  if (!bestByGrip || typeof bestByGrip !== 'object') return normalized

  for (const [rawGrip, values] of Object.entries(bestByGrip)) {
    const grip = normalizeGrip(rawGrip)
    if (!normalized[grip]) continue
    normalized[grip] = {
      ...normalized[grip],
      ...(values || {})
    }
  }

  return normalized
}

function updateBest<TConditions extends BestConditions | null>(
  currentValue: number | null,
  currentConditions: TConditions,
  candidateValue: number | null,
  candidateConditions: TConditions
): [number | null, TConditions] {
  if (!candidateValue) return [currentValue, currentConditions]
  if (!currentValue || candidateValue < currentValue) {
    return [candidateValue, candidateConditions]
  }
  return [currentValue, currentConditions]
}

function classifyLegacyStintType(
  fuelStart: number | null,
  sessionType: number | null | undefined,
  stintType?: string
): 'Qualify' | 'Race' {
  if (sessionType === 1) return 'Qualify'
  if (stintType === 'Qualify') return 'Qualify'
  if (stintType === 'Race') return 'Race'
  return (fuelStart ?? 0) > STINT_RACE_FUEL_THRESHOLD_L ? 'Race' : 'Qualify'
}

function classifyHistoricalEligibility(
  fuelStart: number | null,
  sessionType: number | null | undefined,
  stintType?: string
): HistoricalEligibility {
  const effectiveStintType = classifyLegacyStintType(fuelStart, sessionType, stintType)
  if (sessionType === 1 || effectiveStintType === 'Qualify') return 'qualy_historical'
  if ((fuelStart ?? 0) <= HISTORICAL_RACE_FUEL_THRESHOLD_L) return 'race_non_historical'
  return 'race_historical'
}

function normalizeCanonicalSummary(rawObj: any, sessionInfo: any, stints: any[]): SessionSummary | null {
  const existing = rawObj?.summary
  const version = Number(existing?.best_rules_version || 0)
  if (!existing || version < BEST_RULES_VERSION) {
    return null
  }

  return {
    laps: toNonNegativeInt(existing.laps ?? sessionInfo.laps_total ?? rawObj?.laps?.length),
    lapsValid: toNonNegativeInt(existing.lapsValid ?? sessionInfo.laps_valid),
    bestLap: toPositiveNumber(existing.bestLap ?? sessionInfo.session_best_lap),
    avgCleanLap: toPositiveNumber(existing.avgCleanLap ?? sessionInfo.avg_clean_lap),
    totalTime: toNonNegativeInt(existing.totalTime ?? sessionInfo.total_drive_time_ms),
    stintCount: toNonNegativeInt(existing.stintCount ?? stints.length),
    best_qualy_ms: toPositiveNumber(existing.best_qualy_ms),
    best_qualy_conditions: existing.best_qualy_conditions || null,
    best_session_race_ms: toPositiveNumber(existing.best_session_race_ms),
    best_session_race_conditions: existing.best_session_race_conditions || null,
    best_race_ms: toPositiveNumber(existing.best_race_ms),
    best_race_conditions: existing.best_race_conditions || null,
    best_avg_race_ms: toPositiveNumber(existing.best_avg_race_ms),
    best_avg_race_conditions: existing.best_avg_race_conditions || null,
    best_rules_version: BEST_RULES_VERSION,
    best_by_grip: normalizeBestByGrip(existing.best_by_grip)
  }
}

function buildMissingCanonicalSummary(rawObj: any, sessionInfo: any, stints: any[]): SessionSummary {
  return {
    laps: toNonNegativeInt(sessionInfo.laps_total ?? rawObj?.laps?.length),
    lapsValid: toNonNegativeInt(sessionInfo.laps_valid),
    bestLap: toPositiveNumber(sessionInfo.session_best_lap ?? rawObj?.bestLap),
    avgCleanLap: toPositiveNumber(sessionInfo.avg_clean_lap),
    totalTime: toNonNegativeInt(sessionInfo.total_drive_time_ms),
    stintCount: toNonNegativeInt(stints.length),
    best_qualy_ms: null,
    best_qualy_conditions: null,
    best_session_race_ms: null,
    best_session_race_conditions: null,
    best_race_ms: null,
    best_race_conditions: null,
    best_avg_race_ms: null,
    best_avg_race_conditions: null,
    best_rules_version: 0,
    best_by_grip: emptyBestByGrip()
  }
}

function buildLegacyCompatibilitySummary(rawObj: any, sessionInfo: any, stints: any[]): SessionSummary {
  const bestByGrip = emptyBestByGrip()
  let bestQualyMs: number | null = null
  let bestQualyConditions: BestConditions | null = null
  let bestSessionRaceMs: number | null = null
  let bestSessionRaceConditions: BestConditions | null = null
  let bestRaceMs: number | null = null
  let bestRaceConditions: BestConditions | null = null
  let bestAvgRaceMs: number | null = null
  let bestAvgRaceConditions: BestConditions | null = null

  const sessionType = sessionInfo.session_type ?? 0

  stints.forEach((stint: any) => {
    const laps = Array.isArray(stint?.laps) ? stint.laps : []
    const stintFuelStart = toPositiveNumber(stint?.fuel_start)
    const stintType = classifyLegacyStintType(stintFuelStart, sessionType, stint?.type)

    laps.forEach((lap: any) => {
      const lapTime = toPositiveNumber(lap?.lap_time_ms)
      if (!lapTime || !lap?.is_valid || lap?.has_pit_stop) return

      const lapFuelStart = toPositiveNumber(lap?.fuel_start) ?? stintFuelStart
      const historicalEligibility = classifyHistoricalEligibility(lapFuelStart, sessionType, stintType)
      const conditions = buildConditions(lap)
      const grip = conditions.grip
      const fuelRemaining = toPositiveNumber(lap?.fuel_remaining)

      if (historicalEligibility === 'qualy_historical') {
        ;[bestQualyMs, bestQualyConditions] = updateBest(
          bestQualyMs,
          bestQualyConditions,
          lapTime,
          conditions
        )
        const gripBest = bestByGrip[grip]
        if (gripBest && (!gripBest.bestQualy || lapTime < gripBest.bestQualy)) {
          gripBest.bestQualy = lapTime
          gripBest.bestQualyTemp = conditions.airTemp
          gripBest.bestQualyFuel = fuelRemaining
        }
        return
      }

      ;[bestSessionRaceMs, bestSessionRaceConditions] = updateBest(
        bestSessionRaceMs,
        bestSessionRaceConditions,
        lapTime,
        conditions
      )

      if (historicalEligibility === 'race_historical') {
        ;[bestRaceMs, bestRaceConditions] = updateBest(
          bestRaceMs,
          bestRaceConditions,
          lapTime,
          conditions
        )
        const gripBest = bestByGrip[grip]
        if (gripBest && (!gripBest.bestRace || lapTime < gripBest.bestRace)) {
          gripBest.bestRace = lapTime
          gripBest.bestRaceTemp = conditions.airTemp
          gripBest.bestRaceFuel = fuelRemaining
        }
      }
    })

    const validStintLaps = laps.filter((lap: any) => {
      return !!toPositiveNumber(lap?.lap_time_ms) && lap?.is_valid && !lap?.has_pit_stop
    })
    const avgCleanLap = toPositiveNumber(stint?.avg_clean_lap)
    const historicalEligibility = classifyHistoricalEligibility(stintFuelStart, sessionType, stintType)
    if (!avgCleanLap || validStintLaps.length < 5 || historicalEligibility !== 'race_historical') {
      return
    }

    const firstLap = validStintLaps[0]
    const conditions = buildConditions(firstLap)
    const grip = conditions.grip
    const fuelRemaining = toPositiveNumber(firstLap?.fuel_remaining)

    ;[bestAvgRaceMs, bestAvgRaceConditions] = updateBest(
      bestAvgRaceMs,
      bestAvgRaceConditions,
      avgCleanLap,
      conditions
    )

    const gripBest = bestByGrip[grip]
    if (gripBest && (!gripBest.bestAvgRace || avgCleanLap < gripBest.bestAvgRace)) {
      gripBest.bestAvgRace = avgCleanLap
      gripBest.bestAvgRaceTemp = conditions.airTemp
      gripBest.bestAvgRaceFuel = fuelRemaining
    }
  })

  return {
    laps: toNonNegativeInt(sessionInfo.laps_total ?? rawObj?.laps?.length),
    lapsValid: toNonNegativeInt(sessionInfo.laps_valid),
    bestLap: toPositiveNumber(sessionInfo.session_best_lap ?? rawObj?.bestLap),
    avgCleanLap: toPositiveNumber(sessionInfo.avg_clean_lap),
    totalTime: toNonNegativeInt(sessionInfo.total_drive_time_ms),
    stintCount: toNonNegativeInt(stints.length),
    best_qualy_ms: bestQualyMs,
    best_qualy_conditions: bestQualyConditions,
    best_session_race_ms: bestSessionRaceMs,
    best_session_race_conditions: bestSessionRaceConditions,
    best_race_ms: bestRaceMs,
    best_race_conditions: bestRaceConditions,
    best_avg_race_ms: bestAvgRaceMs,
    best_avg_race_conditions: bestAvgRaceConditions,
    best_rules_version: BEST_RULES_VERSION,
    best_by_grip: bestByGrip
  }
}

export function generateSessionId(dateStart: string, track: string): string {
  const normalized = dateStart.split('.')[0]
  const base = `${normalized}_${track}`.replace(/[^a-zA-Z0-9]/g, '_')
  return base.substring(0, 100)
}

export function extractMetadata(
  rawObj: any,
  options: { allowLegacyFallback?: boolean } = {}
): { meta: SessionMeta; summary: SessionSummary; summarySource: SessionSummarySource } {
  const sessionInfo = rawObj?.session_info || {}
  const stints = Array.isArray(rawObj?.stints) ? rawObj.stints : []

  const meta: SessionMeta = {
    track: sessionInfo.track || rawObj?.track || 'Unknown',
    date_start: sessionInfo.date_start || rawObj?.date || new Date().toISOString(),
    date_end: sessionInfo.date_end || null,
    car: sessionInfo.car_model || sessionInfo.car || rawObj?.car || '',
    session_type: sessionInfo.session_type ?? 0,
    driver: sessionInfo.driver || null
  }

  const canonicalSummary = normalizeCanonicalSummary(rawObj, sessionInfo, stints)
  if (canonicalSummary) {
    return {
      meta,
      summary: canonicalSummary,
      summarySource: 'canonical'
    }
  }

  if (options.allowLegacyFallback) {
    return {
      meta,
      summary: buildLegacyCompatibilitySummary(rawObj, sessionInfo, stints),
      summarySource: 'legacy_fallback'
    }
  }

  return {
    meta,
    summary: buildMissingCanonicalSummary(rawObj, sessionInfo, stints),
    summarySource: 'missing_canonical'
  }
}
