import type { SessionDocument } from '~/types/telemetry'
import type { TrackOverviewProjectionItem } from '~/types/trackProjections'
import { TRACK_METADATA, normalizeTrackId } from './trackMetadata'
import { filterHistory, historyTrackId, type HistoryFilter } from './vehicleHistory'
import { gameTrackCatalogue } from './gameTrackCatalogue'
import { formatLapTime } from '~/utils/telemetryFormat'

/** One catalogue card per layout; filters select data, never remove unvisited tracks. */
export function buildCommonTrackOverview(input: SessionDocument[], gameId: string, filter: HistoryFilter = {}): TrackOverviewProjectionItem[] {
  const tracks = new Map(gameTrackCatalogue(gameId).map(t => [t.id, t]))
  const sessions = filterHistory(input, gameId, filter)
  for (const session of sessions) {
    const id = historyTrackId(session.meta.track, session.meta.trackVariant)
    const track = tracks.get(id) ?? { id, name: [session.meta.track, session.meta.trackVariant].filter(Boolean).join(' · '),
      country: '', length: '', image: TRACK_METADATA[normalizeTrackId(session.meta.track)]?.image, sessions: 0 }
    track.sessions++
    if (!track.lastSessionFull || session.meta.date_start > track.lastSessionFull) {
      track.lastSessionFull = session.meta.date_start
      track.lastSession = session.meta.date_start.split('T')[0]
    }
    tracks.set(id, track)
  }
  for (const track of tracks.values()) {
    const matching = sessions.filter(s => historyTrackId(s.meta.track, s.meta.trackVariant) === track.id)
    for (const [field, value, carField] of [
      ['bestQualy', 'best_qualy_ms', 'bestQualyCar'], ['bestRace', 'best_race_ms', 'bestRaceCar'],
    ] as const) {
      const winner = matching.filter(s => Number.isFinite(s.summary[value]) && s.summary[value]! > 0)
        .sort((a, b) => a.summary[value]! - b.summary[value]!)[0]
      if (winner) { track[field] = formatLapTime(winner.summary[value]); track[carField] = winner.meta.car }
    }
    const best = matching.filter(s => s.summary.lapsValid > 0 && Number.isFinite(s.summary.bestLap) && s.summary.bestLap! > 0)
      .sort((a, b) => a.summary.bestLap! - b.summary.bestLap!)[0]
    if (best) { track.bestLap = formatLapTime(best.summary.bestLap); track.referenceLabel = best.meta.car }
  }
  return [...tracks.values()].sort((a, b) => (b.lastSession ?? '').localeCompare(a.lastSession ?? '') || a.name.localeCompare(b.name))
}
