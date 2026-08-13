import type { FullSession } from '~/types/telemetry'
import type { SessionDisplayLap, SessionDisplayStint } from '~/types/sessionDisplayModel'

export interface SessionDetailViewModel {
  sessionId: string
  userId?: string
  isShared: boolean
  isCoachAccess: boolean
  isLoading: boolean
  loadError: string | null
  currentUserNickname: string
  fullSession: FullSession | null
}

export interface SessionDetailUserIdentity {
  displayName?: string | null
}

/**
 * UI adapter for both canonical telemetry laps and the historical display
 * aliases consumed by the session-detail table and chart.
 */
export interface SessionDetailLap extends Partial<SessionDisplayLap> {
  lapNumber?: number
  lap_number?: number
  number?: number
  sessionLapNumber?: number
  _sessionLapNumber?: number
  lapTime?: string
  lapTimeMs?: number
  timeMs?: number
  is_valid?: boolean
  has_pit_stop?: boolean
  fuel_remaining?: number
  air?: number
  air_temp?: number
  temp?: number
  grip_level?: string
  track_grip_status?: string
  s1?: string
  s2?: string
  s3?: string
  _isStintStart?: boolean
  _stintIndex?: number
  _stintNumber?: number
  _globalIndex?: number
}

export interface SessionDetailStint extends Partial<SessionDisplayStint> {
  number: number
  type: string
  laps: number
  best: string
  avgCleanLap?: string
}

export interface SessionBestSectorSummary {
  s1: number | null
  s2: number | null
  s3: number | null
  lapMs: number | null
}

export interface SessionComparisonRow {
  index: number
  lapA: SessionDetailLap | null
  lapB: SessionDetailLap | null
  delta: number | null
  deltaFormatted: string
  deltaClass: 'faster' | 'close' | 'margin' | 'far' | 'neutral'
  _isStintStartA: boolean
  _isStintStartB: boolean
  _stintNumberA: number | null
  _stintNumberB: number | null
}

export type LapSeriesSource = 'a' | 'b'

export interface NormalizedLapPoint {
  raw: SessionDetailLap
  source: LapSeriesSource
  strategy: 'A' | 'B'
  stintNumber: number
  stintLapNumber: number
  sessionLapNumber: number
  displayIndex: number
  chartIndex: number
  exclusionKey: string
  time: string
  timeSeconds: number
  valid: boolean
  pit: boolean
  fuel: number | null
  air: number | null
  grip: string
  isStintStart: boolean
  stintIndex: number
}

export interface LapSeriesSummary {
  laps: number
  validLapsCount: number
  bestMs: number | null
  avgMs: number | null
  avgWarning: boolean
  durationMs: number
}
