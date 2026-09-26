import type { TrackOverviewProjectionItem } from '~/types/trackProjections'
import { resolveTrackFallbackBest } from '~/services/telemetry/trackProjectionService'

export function buildTrackOverviewProjection(params: {
  trackMetadata: Record<string, { name: string; country: string; length: string; image: string }>
  trackStats: Array<{
    track: string
    sessions: number
    lastSession?: string | null
    bestQualy?: number | null
    bestRace?: number | null
    bestByGrip?: Record<string, { bestQualy?: number | null; bestRace?: number | null }>
  }>
  trackBestsMap: Record<string, { bestQualy: number | null; bestRace: number | null }>
  normalizeTrackId: (track: string | null | undefined) => string
  formatLapTime: (ms: number | null | undefined) => string
}) {
  const { trackMetadata, trackStats, trackBestsMap, normalizeTrackId, formatLapTime } = params

  const result: TrackOverviewProjectionItem[] = Object.entries(trackMetadata).map(([id, meta]) => ({
    id,
    name: meta.name,
    country: meta.country,
    length: meta.length,
    image: meta.image,
    sessions: 0,
    lastSession: undefined,
    lastSessionFull: undefined,
    bestQualy: undefined,
    bestRace: undefined
  }))

  for (const stat of trackStats) {
    const trackId = normalizeTrackId(stat.track)
    const existing = result.find((track) => track.id === trackId || track.name.toLowerCase() === stat.track.toLowerCase())
    const fallback = resolveTrackFallbackBest(stat)
    const cached = trackBestsMap[trackId]
    const bestQualyValue = cached?.bestQualy ?? fallback.bestQualy ?? null
    const bestRaceValue = cached?.bestRace ?? fallback.bestRace ?? null

    if (existing) {
      existing.sessions = stat.sessions
      existing.lastSession = stat.lastSession?.split('T')[0]
      existing.lastSessionFull = stat.lastSession || undefined
      existing.bestQualy = bestQualyValue ? formatLapTime(bestQualyValue) : undefined
      existing.bestRace = bestRaceValue ? formatLapTime(bestRaceValue) : undefined
      continue
    }

    result.push({
      id: trackId,
      name: stat.track,
      country: '??',
      length: '?.??? km',
      sessions: stat.sessions,
      lastSession: stat.lastSession?.split('T')[0],
      lastSessionFull: stat.lastSession || undefined,
      bestQualy: bestQualyValue ? formatLapTime(bestQualyValue) : undefined,
      bestRace: bestRaceValue ? formatLapTime(bestRaceValue) : undefined
    })
  }

  // Metadata includes legacy names (Spa/Donington). Do not display a second
  // empty placeholder for the same circuit. Preserve every populated route:
  // merging historical IDs here would make the detail page lose its sessions.
  const visible = result.filter((track, index) => track.sessions > 0 || !result.some((other, otherIndex) =>
    otherIndex !== index && other.name === track.name && other.image === track.image
    && other.country === track.country && other.length === track.length
    && (other.sessions > 0 || otherIndex < index),
  ))
  return visible.sort((a, b) => {
    if (a.sessions > 0 && b.sessions > 0) {
      return (b.lastSessionFull || '').localeCompare(a.lastSessionFull || '')
    }
    if (a.sessions > 0 && b.sessions === 0) return -1
    if (a.sessions === 0 && b.sessions > 0) return 1
    return a.name.localeCompare(b.name)
  })
}
