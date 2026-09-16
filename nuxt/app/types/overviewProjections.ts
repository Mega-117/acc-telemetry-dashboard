export interface OverviewTrackProjection {
  id: string
  name: string
  image: string
  lastSession: string | null
  bestQualy: string
  bestQualyGrip: string | null
  bestRace: string
  bestRaceGrip: string | null
  bestAvgRace: string
  bestAvgRaceGrip: string | null
}

export interface OverviewCarProjection {
  rawName: string | null
  displayName: string
  lastUsedDate: string
}

export interface OverviewActivityDataPoint {
  date?: string
  dateLabel?: string
  day: string
  practice: number
  qualify: number
  race: number
}

import type { OverviewSessionPerformance } from '~/services/projections/overviewLastSession'

export interface OverviewProjection {
  lastSession?: OverviewSessionPerformance | null
  lastCar: OverviewCarProjection
  lastTrack: OverviewTrackProjection | null
  previousTrack: OverviewTrackProjection | null
  activity7d: OverviewActivityDataPoint[]
  activityTotals: {
    practice: { minutes: number; sessions: number }
    qualify: { minutes: number; sessions: number }
    race: { minutes: number; sessions: number }
  }
}
