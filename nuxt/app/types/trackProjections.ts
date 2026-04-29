import type { CarCategory } from '~/composables/useTelemetryData'

export const TRACK_DETAIL_PROJECTION_SCHEMA_VERSION = 1

export interface TrackOverviewProjectionItem {
  id: string
  name: string
  country: string
  length: string
  image?: string
  sessions: number
  lastSession?: string
  lastSessionFull?: string
  bestQualy?: string
  bestRace?: string
}

export interface TrackHeaderProjection {
  id: string
  name: string
  fullName: string
  country: string
  countryCode: string
  length: string
  turns: number
  image: string
  sessions: number
  lastSession: string
  bestQualy: string | null
  bestRace: string | null
  bestAvgRace: string | null
  bestQualyConditions: { airTemp: number; roadTemp: number; grip: string } | null
  bestRaceConditions: { airTemp: number; roadTemp: number; grip: string } | null
  bestAvgRaceConditions: { airTemp: number; roadTemp: number; grip: string } | null
  bestQualySessionId: string | null
  bestRaceSessionId: string | null
  bestAvgRaceSessionId: string | null
  bestQualyDate: string | null
  bestRaceDate: string | null
  bestAvgRaceDate: string | null
  bestQualyFuel: number | null
  bestRaceFuel: number | null
  bestAvgRaceFuel?: number | null
  hasGripData: boolean
}

export interface TrackRecentSessionProjection {
  id: string
  date: string
  time: string
  type: 'practice' | 'qualify' | 'race'
  car: string
  laps: number
  stints: number
  bestQualy?: string
  bestRace?: string
}

export interface TrackHistoricalPointProjection {
  date: string
  sessionId: string
  bestQualy?: string
  bestRace?: string
}

export interface TrackActivityProjection {
  totalLaps: number
  validLaps: number
  validPercent: number
  totalTimeMs: number
  totalTimeFormatted: string
  sessionCount: number
}

export interface TrackDetailProjection {
  track: TrackHeaderProjection
  recentSessions: TrackRecentSessionProjection[]
  historicalTimes: TrackHistoricalPointProjection[]
  activity: TrackActivityProjection
  category: CarCategory
  grip: string
}

export interface TrackDetailProjectionCategoryDocument {
  recentSessions: TrackRecentSessionProjection[]
  historicalTimes: TrackHistoricalPointProjection[]
  activity: TrackActivityProjection
  sessionCount: number
  lastSessionDate: string | null
}

export interface TrackDetailProjectionDocument {
  schemaVersion: number
  trackId: string
  updatedAt?: any
  lastSessionDate: string | null
  categories: Partial<Record<CarCategory, TrackDetailProjectionCategoryDocument>>
}
