/**
 * Shared telemetry domain contracts.
 *
 * This module is deliberately dependency-free: repositories, services,
 * composables and UI consumers can all depend on it without crossing layer
 * boundaries or loading runtime code.
 */

export interface SessionMeta {
  track: string
  car: string
  date_start: string
  date_end: string | null
  session_type: number
  driver: string | null
}

export interface SessionSummary {
  laps: number
  lapsValid: number
  bestLap: number | null
  avgCleanLap: number | null
  totalTime: number
  stintCount: number
  best_qualy_ms?: number | null
  best_session_race_ms?: number | null
  best_race_ms?: number | null
  best_avg_race_ms?: number | null
  best_qualy_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
  best_session_race_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
  best_race_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
  best_avg_race_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
  best_rules_version?: number
  best_race_sprint_ms?: number | null
  best_race_sprint_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
  best_race_endurance_ms?: number | null
  best_race_endurance_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
  best_avg_sprint_ms?: number | null
  best_avg_sprint_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
  best_avg_endurance_ms?: number | null
  best_avg_endurance_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
  // Legacy summaries contain several versioned grip payload shapes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- compatibility boundary for persisted telemetry
  best_by_grip?: Record<string, any>
}

export interface SessionDocument {
  sessionId: string
  fileHash: string
  fileName: string
  // Firestore Timestamp, ISO string, epoch number and null all exist in legacy data.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- compatibility boundary for persisted telemetry
  uploadedAt: any
  meta: SessionMeta
  summary: SessionSummary
  rawChunkCount: number
  rawSizeBytes: number
  source?: 'cloud' | 'local'
  summarySource?: 'canonical' | 'legacy_fallback' | 'missing_canonical'
  syncState?: 'synced' | 'pending_sync' | 'local_only' | 'sync_failed'
}

export interface LapData {
  lap_number: number
  lap_time_ms: number
  elapsed_time_ms: number
  fuel_start: number
  fuel_remaining: number
  air_temp: number
  road_temp: number
  rain_intensity: string
  track_grip_status: string
  is_valid: boolean
  is_first_stint_lap: boolean
  has_pit_stop: boolean
  pit_out_lap: boolean
  sectors_reliable: boolean
  sector_times_ms: number[]
}

export interface StintData {
  stint_number: number
  type: string
  fuel_start: number
  avg_clean_lap: number
  stint_drive_time_ms: number
  laps: LapData[]
}

export interface FullSession {
  session_info: {
    track: string
    car: string
    driver: string
    session_type: number
    date_start: string
    date_end: string
    start_air_temp: number
    start_road_temp: number
    start_track_grip: string
    start_weather: string
    session_best_lap: number
    avg_clean_lap: number
    total_drive_time_ms: number
    laps_total: number
    laps_valid: number
    laps_invalid: number
  }
  stints: StintData[]
  ownerId: string
  ownerEmail: string
}

export type LoadSessionsSourceMode = 'auto' | 'cloud_fresh' | 'index_cache' | 'local_first'

export interface LoadSessionsOptions {
  sourceMode?: LoadSessionsSourceMode
  context?: string
}
