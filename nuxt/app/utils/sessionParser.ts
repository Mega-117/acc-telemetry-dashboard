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
// qualy  : fuel_start <= 40L or missing
// race   : fuel_start > 40L
type FuelBand = 'qualy' | 'race'
export const BEST_RACE_FUEL_THRESHOLD_L = 40
export const BEST_RULES_VERSION = 1

function classifyFuelBand(
  fuelStart: number | null | undefined,
  isQualySession: boolean,
  stintType?: string
): FuelBand {
  if (isQualySession) return 'qualy'
  if (stintType === 'Qualify') return 'qualy'
  if (fuelStart == null || fuelStart <= BEST_RACE_FUEL_THRESHOLD_L) return 'qualy'
  return 'race'
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
      bestRace: null, bestRaceTemp: null, bestRaceFuel: null,
      bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceFuel: null
    }
  })

  // ——— OVERALL BESTS ———
  let bestQualyMs: number | null = null
  let bestQualyConditions: { airTemp: number; roadTemp: number; grip: string } | null = null
  let bestRaceMs: number | null = null
  let bestRaceConditions: { airTemp: number; roadTemp: number; grip: string } | null = null
  let bestAvgRaceMs: number | null = null
  let bestAvgRaceConditions: { airTemp: number; roadTemp: number; grip: string } | null = null

  const isQualySession = sessionInfo.session_type === 1

  stints.forEach((stint: any) => {
    const laps = stint.laps || []

    // ——— PER-LAP BESTS ———
    laps.forEach((lap: any) => {
      if (lap.is_valid && !lap.has_pit_stop && lap.lap_time_ms) {
        const lapFuelBand = classifyFuelBand(lap.fuel_start, isQualySession, stint.type)
        const grip = normalizeGrip(lap.track_grip_status || 'Unknown')
        const airTemp = lap.air_temp || 0
        const conditions = { airTemp, roadTemp: lap.road_temp || 0, grip }
        const fuelRemaining = lap.fuel_remaining ?? null

        // Update grip-specific bests
        if (bestByGrip[grip]) {
          if (lapFuelBand === 'qualy') {
            if (!bestByGrip[grip].bestQualy || lap.lap_time_ms < bestByGrip[grip].bestQualy) {
              bestByGrip[grip].bestQualy = lap.lap_time_ms
              bestByGrip[grip].bestQualyTemp = airTemp
              bestByGrip[grip].bestQualyFuel = fuelRemaining
            }
          } else if (lapFuelBand === 'race') {
            if (!bestByGrip[grip].bestRace || lap.lap_time_ms < bestByGrip[grip].bestRace) {
              bestByGrip[grip].bestRace = lap.lap_time_ms
              bestByGrip[grip].bestRaceTemp = airTemp
              bestByGrip[grip].bestRaceFuel = fuelRemaining
            }
          }
        }

        // Update overall bests
        if (lapFuelBand === 'qualy') {
          if (!bestQualyMs || lap.lap_time_ms < bestQualyMs) {
            bestQualyMs = lap.lap_time_ms
            bestQualyConditions = conditions
          }
        } else if (lapFuelBand === 'race') {
          if (!bestRaceMs || lap.lap_time_ms < bestRaceMs) {
            bestRaceMs = lap.lap_time_ms
            bestRaceConditions = conditions
          }
        }
      }
    })

    // ——— PER-STINT AVG BESTS (only if ≥5 valid laps) ———
    const validStintLaps = laps.filter((l: any) => l.is_valid && !l.has_pit_stop)
    const avgFuelReference = validStintLaps[0]?.fuel_start ?? stint.fuel_start
    const avgFuelBand = classifyFuelBand(avgFuelReference, isQualySession, stint.type)
    if (avgFuelBand !== 'qualy' && stint.avg_clean_lap && validStintLaps.length >= 5) {
      const firstValidLap = validStintLaps[0]
      const rawGrip = firstValidLap?.track_grip_status || laps[0]?.track_grip_status || 'Unknown'
      const grip = normalizeGrip(rawGrip)
      const airTemp = firstValidLap?.air_temp || 0
      const fuelRemaining = firstValidLap?.fuel_remaining ?? null

      if (bestByGrip[grip]) {
        if (avgFuelBand === 'race') {
          if (!bestByGrip[grip].bestAvgRace || stint.avg_clean_lap < bestByGrip[grip].bestAvgRace) {
            bestByGrip[grip].bestAvgRace = stint.avg_clean_lap
            bestByGrip[grip].bestAvgRaceTemp = airTemp
            bestByGrip[grip].bestAvgRaceFuel = fuelRemaining
          }
        }
      }

      if (avgFuelBand === 'race') {
        if (!bestAvgRaceMs || stint.avg_clean_lap < bestAvgRaceMs) {
          bestAvgRaceMs = stint.avg_clean_lap
          bestAvgRaceConditions = { airTemp, roadTemp: firstValidLap?.road_temp || 0, grip }
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
    best_race_ms: bestRaceMs,
    best_race_conditions: bestRaceConditions,
    best_avg_race_ms: bestAvgRaceMs,
    best_avg_race_conditions: bestAvgRaceConditions,
    best_rules_version: BEST_RULES_VERSION,
    best_by_grip: bestByGrip
  }

  return { meta, summary }
}
