import type { OverviewProjection, OverviewTrackProjection } from '~/types/overviewProjections'
import { resolveTrackMetadata } from '~/services/projections/trackMetadata'

type TrackBestTimes = {
  bestQualy: number | null
  bestRace: number | null
  bestAvgRace: number | null
}

type TrackStat = {
  track: string
  lastSession?: string | null
}

function buildTrackCard(
  trackStat: TrackStat | null,
  bestsByTrack: Record<string, TrackBestTimes>,
  normalizeTrackId: (track: string | null | undefined) => string,
  formatLapTime: (ms: number | null | undefined) => string,
  formatTrackName: (track: string) => string
): OverviewTrackProjection | null {
  if (!trackStat?.track) return null
  const trackId = normalizeTrackId(trackStat.track)
  const metadata = resolveTrackMetadata(trackId)
  const bests = bestsByTrack[trackId] || { bestQualy: null, bestRace: null, bestAvgRace: null }

  return {
    id: trackId,
    name: metadata.name || formatTrackName(trackStat.track).toUpperCase(),
    image: metadata.image,
    lastSession: trackStat.lastSession || null,
    bestQualy: formatLapTime(bests.bestQualy),
    bestRace: formatLapTime(bests.bestRace),
    bestAvgRace: formatLapTime(bests.bestAvgRace)
  }
}

export function buildOverviewProjection(params: {
  lastUsedCar: string | null
  lastSessionDate: string | null
  trackStats: TrackStat[]
  bestsByTrack: Record<string, TrackBestTimes>
  activity7d: OverviewProjection['activity7d']
  activityTotals: OverviewProjection['activityTotals']
  normalizeTrackId: (track: string | null | undefined) => string
  formatLapTime: (ms: number | null | undefined) => string
  formatCarName: (car: string) => string
  formatTrackName: (track: string) => string
  formatDate: (date: string) => string
}): OverviewProjection {
  const {
    lastUsedCar,
    lastSessionDate,
    trackStats,
    bestsByTrack,
    activity7d,
    activityTotals,
    normalizeTrackId,
    formatLapTime,
    formatCarName,
    formatTrackName,
    formatDate
  } = params

  const sortedTrackStats = [...trackStats].sort((a, b) => (b.lastSession || '').localeCompare(a.lastSession || ''))
  const lastTrack = buildTrackCard(sortedTrackStats[0] || null, bestsByTrack, normalizeTrackId, formatLapTime, formatTrackName)
  const previousTrack = buildTrackCard(sortedTrackStats[1] || null, bestsByTrack, normalizeTrackId, formatLapTime, formatTrackName)

  return {
    lastCar: {
      rawName: lastUsedCar,
      displayName: lastUsedCar ? formatCarName(lastUsedCar).toUpperCase() : 'NESSUNA AUTO',
      lastUsedDate: lastSessionDate ? formatDate(lastSessionDate) : '-'
    },
    lastTrack,
    previousTrack,
    activity7d,
    activityTotals
  }
}
