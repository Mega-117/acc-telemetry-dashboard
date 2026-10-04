import type { SessionDocument } from '~/types/telemetry'
import type { TrackOverviewProjectionItem } from '~/types/trackProjections'
import { sessionGame } from '~/services/telemetry/gameIdentity'
import { TRACK_METADATA, normalizeTrackId } from './trackMetadata'
import { buildCommonOverviewProjection } from './buildCommonOverviewProjection'
import { getTelemetryActivityDateKey } from '../telemetry/activityProjectionService'

/** Common cards describe recorded tracks, without importing ACC's best eligibility. */
export function buildCommonTrackOverview(input: SessionDocument[], gameId: string): TrackOverviewProjectionItem[] {
  const tracks = new Map<string, TrackOverviewProjectionItem>()
  for (const session of new Map(input.filter(s => sessionGame(s) === gameId).map(s => [s.sessionId, s])).values()) {
    const id = session.meta.track
    const artwork = TRACK_METADATA[normalizeTrackId(id)]?.image
    const track = tracks.get(id) ?? { id, name: id, country: '', length: '', image: artwork, sessions: 0 }
    track.sessions++
    const date = session.meta.date_start
    if (Number.isFinite(Date.parse(date)) && (!track.lastSessionFull || Date.parse(date) > Date.parse(track.lastSessionFull))) {
      track.lastSessionFull = date
      track.lastSession = getTelemetryActivityDateKey(date) ?? undefined
    }
    // Different variants/cars must not become one comparable historical best.
    tracks.set(id, track)
  }
  for (const track of tracks.values()) {
    const projection = buildCommonOverviewProjection(input.filter(s => s.meta.track === track.id), gameId)
    track.bestLap = projection.performanceColumns?.[0]?.best
    track.referenceLabel = projection.lastTrack ? `${projection.lastTrack.name} · ${projection.lastCar.displayName}` : undefined
  }
  return [...tracks.values()].sort((a, b) => (b.lastSession ?? '').localeCompare(a.lastSession ?? '') || a.name.localeCompare(b.name))
}
