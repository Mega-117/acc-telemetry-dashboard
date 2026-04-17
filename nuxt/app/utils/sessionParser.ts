// ============================================
// sessionParser.ts — Shared session parsing logic
// ============================================
// Single source of truth for extractMetadata and generateSessionId.
// Used by: useElectronSync, useTelemetryData, dev-upload
//
// V2 logic:
//   - Fuel-band: qualy (≤25L) / sprint (26-80L) / endurance (>80L)
//   - normalizeGrip: 'Opt' → 'Optimum'
//   - bestByGrip includes fuel values
//   - car: car_model || car
//   - generateSessionId: microseconds stripped for stable IDs
// ============================================

import type { SessionMeta, SessionSummary } from '~/composables/useTelemetryData'

// ——————————————————————————————————————————
// GRIP NORMALIZATION
// ——————————————————————————————————————————
// Some logger versions write abbreviated grip values (e.g. 'Opt' instead of 'Optimum')
function normalizeGrip(grip: string): string {
  if (grip === 'Opt') return 'Optimum'
  return grip
}

// ——————————————————————————————————————————
// FUEL BAND CLASSIFICATION
// ——————————————————————————————————————————
// qualy  : fuel_start ≤ 25L  (low fuel, flying laps)
// sprint : 26L – 80L         (short race)
// endurance: > 80L            (long race / full tank)
type FuelBand = 'qualy' | 'sprint' | 'endurance'

function classifyFuelBand(
  fuelStart: number | null | undefined,
  isQualySession: boolean,
  stintType?: string
): FuelBand {
  if (isQualySession) return 'qualy'
  if (stintType === 'Qualify') return 'qualy'
  if (fuelStart == null || fuelStart <= 25) return 'qualy'
  if (fuelStart <= 80) return 'sprint'
  return 'endurance'
}

// ——————————————————————————————————————————
// GENERATE SESSION ID
// ——————————————————————————————————————————
// Strips microseconds for consistent IDs regardless of logger precision.
// "2026-01-04T17:11:38.128663" → "2026-01-04T17:11:38"
// Must stay in sync with useElectronSync.generateSessionId
export function generateSessionId(dateStart: string, track: string): string {
  const normalized = dateStart.split('.')[0]
  const base = `${normalized}_${track}`.replace(/[^a-zA-Z0-9]/g, '_')
  return base.substring(0, 100)
}

// ——————————————————————————————————————————
// EXTRACT METADATA — V2 Master
// ——————————————————————————————————————————
export function extractMetadata(rawObj: any): { meta: SessionMeta; summary: SessionSummary } {
  const sessionInfo = rawObj.session_info || {}
  const stints = rawObj.stints || []

  const meta: SessionMeta = {
    track: sessionInfo.track || rawObj.track || 'Unknown',
    date_start: sessionInfo.date_start || rawObj.date || new Date().toISOString(),
    date_end: sessionInfo.date_end || null,
    // Prefer car_model (logger V2 field) over car (legacy)
    car: sessionInfo.car_model || sessionInfo.car || rawObj.car || '',
    session_type: sessionInfo.session_type ?? 0,
    driver: sessionInfo.driver || null
  }

  // ——— BEST BY GRIP STRUCTURE ———
  const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']

  const bestByGrip: Record<string, any> = {}
  gripConditions.forEach(grip => {
    bestByGrip[grip] = {
      bestQualy: null, bestQualyTemp: null, bestQualyFuel: null,
      bestRaceSprint: null, bestRaceSprintTemp: null, bestRaceSprintFuel: null,
      bestRaceEndurance: null, bestRaceEnduranceTemp: null, bestRaceEnduranceFuel: null,
      bestAvgSprint: null, bestAvgSprintTemp: null, bestAvgSprintFuel: null,
      bestAvgEndurance: null, bestAvgEnduranceTemp: null, bestAvgEnduranceFuel: null
    }
  })

  // ——— OVERALL BESTS ———
  let bestQualyMs: number | null = null
  let bestQualyConditions: { airTemp: number; roadTemp: number; grip: string } | null = null
  let bestRaceSprintMs: number | null = null
  let bestRaceSprintConditions: { airTemp: number; roadTemp: number; grip: string } | null = null
  let bestRaceEnduranceMs: number | null = null
  let bestRaceEnduranceConditions: { airTemp: number; roadTemp: number; grip: string } | null = null
  let bestAvgSprintMs: number | null = null
  let bestAvgSprintConditions: { airTemp: number; roadTemp: number; grip: string } | null = null
  let bestAvgEnduranceMs: number | null = null
  let bestAvgEnduranceConditions: { airTemp: number; roadTemp: number; grip: string } | null = null

  const isQualySession = sessionInfo.session_type === 1

  stints.forEach((stint: any) => {
    const fuelBand = classifyFuelBand(stint.fuel_start, isQualySession, stint.type)
    const laps = stint.laps || []

    // ——— PER-LAP BESTS ———
    laps.forEach((lap: any) => {
      if (lap.is_valid && !lap.has_pit_stop && lap.lap_time_ms) {
        const grip = normalizeGrip(lap.track_grip_status || 'Unknown')
        const airTemp = lap.air_temp || 0
        const conditions = { airTemp, roadTemp: lap.road_temp || 0, grip }
        const fuelRemaining = lap.fuel_remaining ?? null

        // Update grip-specific bests
        if (bestByGrip[grip]) {
          if (fuelBand === 'qualy') {
            if (!bestByGrip[grip].bestQualy || lap.lap_time_ms < bestByGrip[grip].bestQualy) {
              bestByGrip[grip].bestQualy = lap.lap_time_ms
              bestByGrip[grip].bestQualyTemp = airTemp
              bestByGrip[grip].bestQualyFuel = fuelRemaining
            }
          } else if (fuelBand === 'sprint') {
            if (!bestByGrip[grip].bestRaceSprint || lap.lap_time_ms < bestByGrip[grip].bestRaceSprint) {
              bestByGrip[grip].bestRaceSprint = lap.lap_time_ms
              bestByGrip[grip].bestRaceSprintTemp = airTemp
              bestByGrip[grip].bestRaceSprintFuel = fuelRemaining
            }
          } else {
            if (!bestByGrip[grip].bestRaceEndurance || lap.lap_time_ms < bestByGrip[grip].bestRaceEndurance) {
              bestByGrip[grip].bestRaceEndurance = lap.lap_time_ms
              bestByGrip[grip].bestRaceEnduranceTemp = airTemp
              bestByGrip[grip].bestRaceEnduranceFuel = fuelRemaining
            }
          }
        }

        // Update overall bests
        if (fuelBand === 'qualy') {
          if (!bestQualyMs || lap.lap_time_ms < bestQualyMs) {
            bestQualyMs = lap.lap_time_ms
            bestQualyConditions = conditions
          }
        } else if (fuelBand === 'sprint') {
          if (!bestRaceSprintMs || lap.lap_time_ms < bestRaceSprintMs) {
            bestRaceSprintMs = lap.lap_time_ms
            bestRaceSprintConditions = conditions
          }
        } else {
          if (!bestRaceEnduranceMs || lap.lap_time_ms < bestRaceEnduranceMs) {
            bestRaceEnduranceMs = lap.lap_time_ms
            bestRaceEnduranceConditions = conditions
          }
        }
      }
    })

    // ——— PER-STINT AVG BESTS (only if ≥5 valid laps) ———
    const validStintLaps = laps.filter((l: any) => l.is_valid && !l.has_pit_stop)
    if (fuelBand !== 'qualy' && stint.avg_clean_lap && validStintLaps.length >= 5) {
      const firstValidLap = validStintLaps[0]
      const rawGrip = firstValidLap?.track_grip_status || laps[0]?.track_grip_status || 'Unknown'
      const grip = normalizeGrip(rawGrip)
      const airTemp = firstValidLap?.air_temp || 0
      const fuelRemaining = firstValidLap?.fuel_remaining ?? null

      if (bestByGrip[grip]) {
        if (fuelBand === 'sprint') {
          if (!bestByGrip[grip].bestAvgSprint || stint.avg_clean_lap < bestByGrip[grip].bestAvgSprint) {
            bestByGrip[grip].bestAvgSprint = stint.avg_clean_lap
            bestByGrip[grip].bestAvgSprintTemp = airTemp
            bestByGrip[grip].bestAvgSprintFuel = fuelRemaining
          }
        } else {
          if (!bestByGrip[grip].bestAvgEndurance || stint.avg_clean_lap < bestByGrip[grip].bestAvgEndurance) {
            bestByGrip[grip].bestAvgEndurance = stint.avg_clean_lap
            bestByGrip[grip].bestAvgEnduranceTemp = airTemp
            bestByGrip[grip].bestAvgEnduranceFuel = fuelRemaining
          }
        }
      }

      if (fuelBand === 'sprint') {
        if (!bestAvgSprintMs || stint.avg_clean_lap < bestAvgSprintMs) {
          bestAvgSprintMs = stint.avg_clean_lap
          bestAvgSprintConditions = { airTemp, roadTemp: firstValidLap?.road_temp || 0, grip }
        }
      } else {
        if (!bestAvgEnduranceMs || stint.avg_clean_lap < bestAvgEnduranceMs) {
          bestAvgEnduranceMs = stint.avg_clean_lap
          bestAvgEnduranceConditions = { airTemp, roadTemp: firstValidLap?.road_temp || 0, grip }
        }
      }
    }
  })

  const summary: SessionSummary = {
    laps: sessionInfo.laps_total || rawObj.laps?.length || 0,
    lapsValid: sessionInfo.laps_valid || 0,
    bestLap: sessionInfo.session_best_lap || rawObj.bestLap || null,
    avgCleanLap: sessionInfo.avg_clean_lap || null,
    totalTime: sessionInfo.total_drive_time_ms || 0,
    stintCount: stints.length || 0,
    // Fuel-band specific times (V2)
    best_qualy_ms: bestQualyMs,
    best_qualy_conditions: bestQualyConditions,
    best_race_sprint_ms: bestRaceSprintMs,
    best_race_sprint_conditions: bestRaceSprintConditions,
    best_race_endurance_ms: bestRaceEnduranceMs,
    best_race_endurance_conditions: bestRaceEnduranceConditions,
    best_avg_sprint_ms: bestAvgSprintMs,
    best_avg_sprint_conditions: bestAvgSprintConditions,
    best_avg_endurance_ms: bestAvgEnduranceMs,
    best_avg_endurance_conditions: bestAvgEnduranceConditions,
    // Backward compat: best_race_ms = best of sprint/endurance
    best_race_ms: bestRaceSprintMs && bestRaceEnduranceMs
      ? Math.min(bestRaceSprintMs, bestRaceEnduranceMs)
      : bestRaceSprintMs || bestRaceEnduranceMs,
    best_race_conditions: bestRaceSprintMs && bestRaceEnduranceMs
      ? (bestRaceSprintMs <= bestRaceEnduranceMs ? bestRaceSprintConditions : bestRaceEnduranceConditions)
      : bestRaceSprintConditions || bestRaceEnduranceConditions,
    best_avg_race_ms: bestAvgSprintMs && bestAvgEnduranceMs
      ? Math.min(bestAvgSprintMs, bestAvgEnduranceMs)
      : bestAvgSprintMs || bestAvgEnduranceMs,
    best_avg_race_conditions: bestAvgSprintMs && bestAvgEnduranceMs
      ? (bestAvgSprintMs <= bestAvgEnduranceMs ? bestAvgSprintConditions : bestAvgEnduranceConditions)
      : bestAvgSprintConditions || bestAvgEnduranceConditions,
    best_by_grip: bestByGrip
  }

  return { meta, summary }
}
