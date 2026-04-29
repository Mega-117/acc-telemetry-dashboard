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
  day: string
  practice: number
  qualify: number
  race: number
}

export interface OverviewProjection {
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
