// ============================================
// sessionParser.ts - Session metadata normalization
// ============================================
// Canonical business rules live in the local program (Python domain layer).
// This module consumes the canonical summary when present and only keeps a
// compatibility fallback for legacy payloads that have not been reprocessed yet.

import type { SessionMeta, SessionSummary } from '~/composables/useTelemetryData'
import {
  RACE_FUEL_BUCKETS,
  classifyHistoricalEligibility,
  classifyStintTypeFromFuel,
  getRaceFuelBucket,
  type HistoricalEligibility
} from '~/services/telemetry/raceFuelClassification'

type BestConditions = { airTemp: number; roadTemp: number; grip: string }
type GripEntry = {
  bestQualy: number | null; bestQualyTemp: number | null; bestQualyFuel: number | null
  bestRace: number | null; bestRaceTemp: number | null; bestRaceFuel: number | null
  bestAvgRace: number | null; bestAvgRaceTemp: number | null; bestAvgRaceFuel: number | null
  raceBestByFuelBucket: Record<string, unknown>; raceAvgByFuelBucket: Record<string, unknown>
}
export type SessionSummarySource = 'canonical' | 'legacy_fallback' | 'missing_canonical'

const VALID_GRIPS = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum'] as const

export const BEST_RULES_VERSION = 5

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

function buildConditions(lap: Record<string, unknown>): BestConditions {
  return {
    airTemp: toNonNegativeInt(lap?.['air_temp']),
    roadTemp: toNonNegativeInt(lap?.['road_temp']),
    grip: normalizeGrip(String(lap?.['track_grip_status'] || 'Unknown'))
  }
}

function emptyBucketMap(): Record<string, unknown> {
  return Object.fromEntries(RACE_FUEL_BUCKETS.map((bucket) => [bucket, {}]))
}

function emptyBestByGrip(): Record<string, unknown> {
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
        bestAvgRaceFuel: null,
        raceBestByFuelBucket: emptyBucketMap(),
        raceAvgByFuelBucket: emptyBucketMap()
      }
    ])
  )
}

function normalizeBucketMap(bucketMap: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const normalized = emptyBucketMap()
  if (!bucketMap || typeof bucketMap !== 'object') return normalized
  for (const bucket of RACE_FUEL_BUCKETS) {
    normalized[bucket] = bucketMap[bucket] || {}
  }
  return normalized
}

function normalizeBestByGrip(bestByGrip: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const normalized = emptyBestByGrip()
  if (!bestByGrip || typeof bestByGrip !== 'object') return normalized

  for (const [rawGrip, values] of Object.entries(bestByGrip)) {
    const grip = normalizeGrip(rawGrip)
    if (!normalized[grip]) continue
    normalized[grip] = {
      ...normalized[grip],
      ...(values || {}),
      raceBestByFuelBucket: normalizeBucketMap((values as Record<string, unknown>)?.raceBestByFuelBucket as Record<string, unknown> | null),
      raceAvgByFuelBucket: normalizeBucketMap((values as Record<string, unknown>)?.raceAvgByFuelBucket as Record<string, unknown> | null)
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

function lapBucketFuel(lap: Record<string, unknown>): number | null {
  return toPositiveNumber(lap?.['fuel_start']) ?? toPositiveNumber(lap?.['fuel_remaining'])
}

function buildBucketRecord({
  timeMs,
  fuel,
  conditions,
  sampleLapCount,
  source
}: {
  timeMs: number
  fuel: number | null
  conditions: BestConditions
  sampleLapCount: number
  source: 'best_lap' | 'stint_avg' | 'legacy_fallback'
}): Record<string, unknown> {
  return {
    timeMs: toNonNegativeInt(timeMs),
    fuel,
    airTemp: conditions.airTemp,
    roadTemp: conditions.roadTemp,
    grip: conditions.grip,
    sessionId: null,
    date: null,
    sampleLapCount,
    confidence: 'high',
    source
  }
}

function updateBucketBest(bucketMap: Record<string, unknown>, bucket: string, record: Record<string, unknown>): void {
  const current = (bucketMap[bucket] || {}) as Record<string, unknown>
  if (!current['timeMs'] || (record['timeMs'] as number) < (current['timeMs'] as number)) {
    bucketMap[bucket] = record
  }
}

function average(values: Array<unknown>): number | null {
  const parsed = values.map(toPositiveNumber).filter((value): value is number => value !== null)
  if (!parsed.length) return null
  return Math.round(parsed.reduce((sum, value) => sum + value, 0) / parsed.length)
}

function dominantGrip(laps: Record<string, unknown>[]): string {
  const counts = new Map<string, number>()
  laps.forEach((lap) => {
    const grip = normalizeGrip(String(lap?.['track_grip_status'] || 'Unknown'))
    counts.set(grip, (counts.get(grip) || 0) + 1)
  })
  let selected = 'Unknown'
  let bestCount = -1
  counts.forEach((count, grip) => {
    if (count > bestCount) {
      selected = grip
      bestCount = count
    }
  })
  return selected
}

function buildAvgConditions(laps: Record<string, unknown>[]): BestConditions {
  return {
    airTemp: average(laps.map((lap) => lap?.['air_temp'])) ?? 0,
    roadTemp: average(laps.map((lap) => lap?.['road_temp'])) ?? 0,
    grip: dominantGrip(laps)
  }
}

function normalizeCanonicalSummary(rawObj: Record<string, unknown>, sessionInfo: Record<string, unknown>, stints: Record<string, unknown>[]): SessionSummary | null {
  const existing = rawObj?.['summary'] as Record<string, unknown> | null | undefined
  const version = Number(existing?.['best_rules_version'] || 0)
  if (!existing || version < BEST_RULES_VERSION) {
    return null
  }

  return {
    laps: toNonNegativeInt(existing['laps'] ?? sessionInfo['laps_total'] ?? (rawObj?.['laps'] as unknown[] | undefined)?.length),
    lapsValid: toNonNegativeInt(existing['lapsValid'] ?? sessionInfo['laps_valid']),
    bestLap: toPositiveNumber(existing['bestLap'] ?? sessionInfo['session_best_lap']),
    avgCleanLap: toPositiveNumber(existing['avgCleanLap'] ?? sessionInfo['avg_clean_lap']),
    totalTime: toNonNegativeInt(existing['totalTime'] ?? sessionInfo['total_drive_time_ms']),
    stintCount: toNonNegativeInt(existing['stintCount'] ?? stints.length),
    best_qualy_ms: toPositiveNumber(existing['best_qualy_ms']),
    best_qualy_conditions: (existing['best_qualy_conditions'] as BestConditions | null) || null,
    best_session_race_ms: toPositiveNumber(existing['best_session_race_ms']),
    best_session_race_conditions: (existing['best_session_race_conditions'] as BestConditions | null) || null,
    best_race_ms: toPositiveNumber(existing['best_race_ms']),
    best_race_conditions: (existing['best_race_conditions'] as BestConditions | null) || null,
    best_avg_race_ms: toPositiveNumber(existing['best_avg_race_ms']),
    best_avg_race_conditions: (existing['best_avg_race_conditions'] as BestConditions | null) || null,
    best_rules_version: BEST_RULES_VERSION,
    best_by_grip: normalizeBestByGrip(existing['best_by_grip'] as Record<string, unknown> | null)
  }
}

function buildMissingCanonicalSummary(rawObj: Record<string, unknown>, sessionInfo: Record<string, unknown>, stints: Record<string, unknown>[]): SessionSummary {
  return {
    laps: toNonNegativeInt(sessionInfo['laps_total'] ?? (rawObj?.['laps'] as unknown[] | undefined)?.length),
    lapsValid: toNonNegativeInt(sessionInfo['laps_valid']),
    bestLap: toPositiveNumber(sessionInfo['session_best_lap'] ?? rawObj?.['bestLap']),
    avgCleanLap: toPositiveNumber(sessionInfo['avg_clean_lap']),
    totalTime: toNonNegativeInt(sessionInfo['total_drive_time_ms']),
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

function buildLegacyCompatibilitySummary(rawObj: Record<string, unknown>, sessionInfo: Record<string, unknown>, stints: Record<string, unknown>[]): SessionSummary {
  const bestByGrip = emptyBestByGrip()
  let bestQualyMs: number | null = null
  let bestQualyConditions: BestConditions | null = null
  let bestSessionRaceMs: number | null = null
  let bestSessionRaceConditions: BestConditions | null = null
  let bestRaceMs: number | null = null
  let bestRaceConditions: BestConditions | null = null
  let bestAvgRaceMs: number | null = null
  let bestAvgRaceConditions: BestConditions | null = null

  const sessionType = (sessionInfo['session_type'] as number | null) ?? 0

  stints.forEach((stint) => {
    const laps: Record<string, unknown>[] = Array.isArray(stint?.['laps']) ? (stint['laps'] as Record<string, unknown>[]) : []
    const stintFuelStart = toPositiveNumber(stint?.['fuel_start'])
    const stintType = classifyStintTypeFromFuel(stintFuelStart, sessionType)

    laps.forEach((lap) => {
      const lapTime = toPositiveNumber(lap?.['lap_time_ms'])
      if (!lapTime || !lap?.['is_valid'] || lap?.['has_pit_stop'] || lap?.['pit_out_lap']) return

      const lapFuelReference = lapBucketFuel(lap)
      const historicalEligibility = classifyHistoricalEligibility(
        lapFuelReference ?? stintFuelStart,
        sessionType,
        stintType
      )
      const conditions = buildConditions(lap)
      const grip = conditions.grip

      if (historicalEligibility === 'qualy_historical') {
        ;[bestQualyMs, bestQualyConditions] = updateBest(
          bestQualyMs,
          bestQualyConditions,
          lapTime,
          conditions
        )
        const gripBest = bestByGrip[grip] as GripEntry | undefined
        if (gripBest && (!gripBest.bestQualy || lapTime < gripBest.bestQualy)) {
          gripBest.bestQualy = lapTime
          gripBest.bestQualyTemp = conditions.airTemp
          gripBest.bestQualyFuel = lapFuelReference
        }
        return
      }

      const bucket = getRaceFuelBucket(lapFuelReference)
      if (historicalEligibility !== 'race_historical' || !bucket) return

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
        const gripBest = bestByGrip[grip] as GripEntry | undefined
        if (gripBest && (!gripBest.bestRace || lapTime < gripBest.bestRace)) {
          gripBest.bestRace = lapTime
          gripBest.bestRaceTemp = conditions.airTemp
          gripBest.bestRaceFuel = lapFuelReference
        }
        if (gripBest) {
          updateBucketBest(
            gripBest.raceBestByFuelBucket,
            bucket,
            buildBucketRecord({
              timeMs: lapTime,
              fuel: lapFuelReference,
              conditions,
              sampleLapCount: 1,
              source: 'best_lap'
            })
          )
        }
      }
    })

    const validStintLaps = laps.filter((lap) => {
      return !!toPositiveNumber(lap?.['lap_time_ms']) && lap?.['is_valid'] && !lap?.['has_pit_stop'] && !lap?.['pit_out_lap']
    })
    const avgCleanLap = toPositiveNumber(stint?.['avg_clean_lap'])
    const historicalEligibility = classifyHistoricalEligibility(stintFuelStart, sessionType, stintType)
    if (!avgCleanLap || validStintLaps.length < 5 || historicalEligibility !== 'race_historical') {
      return
    }

    const conditions = buildAvgConditions(validStintLaps)
    const grip = conditions.grip

    ;[bestAvgRaceMs, bestAvgRaceConditions] = updateBest(
      bestAvgRaceMs,
      bestAvgRaceConditions,
      avgCleanLap,
      conditions
    )

    const gripBest = bestByGrip[grip] as GripEntry | undefined
    if (gripBest && (!gripBest.bestAvgRace || avgCleanLap < gripBest.bestAvgRace)) {
      gripBest.bestAvgRace = avgCleanLap
      gripBest.bestAvgRaceTemp = conditions.airTemp
      gripBest.bestAvgRaceFuel = stintFuelStart
    }

    const avgBucket = getRaceFuelBucket(stintFuelStart)
    if (gripBest && avgBucket) {
      updateBucketBest(
        gripBest.raceAvgByFuelBucket,
        avgBucket,
        buildBucketRecord({
          timeMs: avgCleanLap,
          fuel: stintFuelStart,
          conditions,
          sampleLapCount: validStintLaps.length,
          source: 'stint_avg'
        })
      )
    }
  })

  return {
    laps: toNonNegativeInt(sessionInfo['laps_total'] ?? (rawObj?.['laps'] as unknown[] | undefined)?.length),
    lapsValid: toNonNegativeInt(sessionInfo['laps_valid']),
    bestLap: toPositiveNumber(sessionInfo['session_best_lap'] ?? rawObj?.['bestLap']),
    avgCleanLap: toPositiveNumber(sessionInfo['avg_clean_lap']),
    totalTime: toNonNegativeInt(sessionInfo['total_drive_time_ms']),
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
  rawObj: Record<string, unknown>,
  options: { allowLegacyFallback?: boolean } = {}
): { meta: SessionMeta; summary: SessionSummary; summarySource: SessionSummarySource } {
  const sessionInfo = (rawObj?.['session_info'] || {}) as Record<string, unknown>
  const stints: Record<string, unknown>[] = Array.isArray(rawObj?.['stints']) ? (rawObj['stints'] as Record<string, unknown>[]) : []

  const meta: SessionMeta = {
    track: String(sessionInfo['track'] || rawObj?.['track'] || 'Unknown'),
    date_start: String(sessionInfo['date_start'] || rawObj?.['date'] || new Date().toISOString()),
    date_end: (sessionInfo['date_end'] as string | null) || null,
    car: String(sessionInfo['car_model'] || sessionInfo['car'] || rawObj?.['car'] || ''),
    session_type: (sessionInfo['session_type'] as number) ?? 0,
    driver: (sessionInfo['driver'] as string | null) || null
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
