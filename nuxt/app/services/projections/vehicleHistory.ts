import type { SessionDocument } from '~/types/telemetry'
import { sessionGame, sessionCarCategory, normalizedSessionKind } from '../telemetry/gameIdentity'
import { TRACK_METADATA, normalizeTrackId, resolveTrackMetadata } from './trackMetadata'
import { buildPendingGripBest } from '../gateway/trackDetailProjectionBuilder'
import { buildTrackDetailProjection } from './buildTrackDetailProjection'
import { formatLapTime, formatDriveTime, formatCarName, getSessionTypeLabel, type CarCategory } from '~/utils/telemetryFormat'

export interface HistoryFilter { category?: CarCategory | ''; car?: string }
export const HISTORY_GRIPS = ['Optimum', 'Fast', 'Green', 'Greasy', 'Damp', 'Wet', 'Flood', 'Unknown']

function trackKey(track: string): string {
  const aliases: Record<string, string> = { circuit_de_spa_francorchamps: 'spa', circuit_of_the_americas: 'cota',
    bathurst: 'mount_panorama', watkins_glen_international: 'watkins_glen', sebring_international_raceway: 'sebring' }
  const key = aliases[normalizeTrackId(track)] || normalizeTrackId(track)
  const metadata = TRACK_METADATA[key]
  return metadata ? Object.values(TRACK_METADATA).find(t => t.name === metadata.name)!.id : key
}

/** Layout identity is lossless; a missing variant is never guessed to be GP. */
export function historyTrackId(track: string, variant?: string | null): string {
  return variant ? `layout:${JSON.stringify([trackKey(track), variant.trim().toLowerCase()])}` : trackKey(track)
}
export function historyTrackParts(id: string): { track: string; variant: string | null } {
  if (id.startsWith('layout:')) {
    try {
      const parts: unknown = JSON.parse(id.slice(7))
      if (Array.isArray(parts) && parts.length === 2 && parts.every(p => typeof p === 'string')) {
        return { track: parts[0]!, variant: parts[1]! }
      }
    } catch { /* Treat invalid route values as unknown track IDs, not executable input. */ }
  }
  return { track: id, variant: null }
}
export function onHistoryTrack(session: SessionDocument, id: string): boolean {
  const { track, variant } = historyTrackParts(id)
  return trackKey(session.meta.track) === trackKey(track)
    && (session.meta.trackVariant?.trim().toLowerCase() || null) === variant
}
export function filterHistory(input: SessionDocument[], gameId: string, filter: HistoryFilter = {}, trackId?: string) {
  return [...new Map(input.filter(s => sessionGame(s) === gameId
    && (!trackId || onHistoryTrack(s, trackId))
    && (!filter.category || sessionCarCategory(s) === filter.category)
    && (!filter.car || s.meta.car === filter.car)).map(s => [s.sessionId, s])).values()]
    .sort((a, b) => b.meta.date_start.localeCompare(a.meta.date_start))
}
export function historyOptions(input: SessionDocument[], gameId: string, trackId?: string) {
  const sessions = filterHistory(input, gameId, {}, trackId)
  const categories = [...new Set(sessions.map(sessionCarCategory).filter((c): c is CarCategory => !!c))].sort()
  const cars = [...new Set(sessions.map(s => s.meta.car).filter(Boolean))].sort()
  const fastest = sessions.filter(s => s.summary.lapsValid > 0 && Number.isFinite(s.summary.bestLap) && s.summary.bestLap! > 0)
    .sort((a, b) => a.summary.bestLap! - b.summary.bestLap! || a.meta.car.localeCompare(b.meta.car))[0]
  return { categories, cars, defaultCategory: categories.includes('GT3') ? 'GT3' as CarCategory : categories[0],
    defaultCar: fastest?.meta.car ?? cars[0] ?? '' }
}
export function historyBest(input: SessionDocument[], grip?: string) {
  const byGrip = Object.fromEntries(HISTORY_GRIPS.map(g => [g, buildPendingGripBest(input, g)]))
  if (grip) return byGrip[grip] ?? {}
  // Each metric keeps its own winning session; Q and race can belong to different cars.
  const result: ReturnType<typeof buildPendingGripBest> = {}
  for (const prefix of ['bestQualy', 'bestRace', 'bestAvgRace'] as const) {
    const winner = Object.values(byGrip).filter(g => typeof g[prefix] === 'number' && g[prefix]! > 0)
      .sort((a, b) => a[prefix]! - b[prefix]!)[0]
    if (winner) Object.assign(result, Object.fromEntries(Object.entries(winner).filter(([key]) => key.startsWith(prefix))))
  }
  return result
}
export function vehicleTrackDetail(input: SessionDocument[], gameId: string, trackId: string, filter: HistoryFilter, grip: string) {
  const sessions = filterHistory(input, gameId, filter, trackId)
  const parts = historyTrackParts(trackId)
  const metadata = resolveTrackMetadata(parts.track)
  const displayVariant = sessions[0]?.meta.trackVariant || (parts.variant === 'gp' ? 'GP' : parts.variant)
  const best = historyBest(sessions, grip)
  const projection = buildTrackDetailProjection({ trackId,
    metadata: { ...metadata, name: [metadata.name === 'Unknown' ? parts.track : metadata.name, displayVariant].filter(Boolean).join(' · '),
      fullName: [parts.track, displayVariant].filter(Boolean).join(' · ') },
    visibleSessions: sessions, selectedGrip: grip, selectedCategory: filter.category || 'GT3',
    recalculatedBestByGrip: { [grip]: best }, bestFuelData: { qualyFuel: best.bestQualyFuel ?? null, raceFuel: best.bestRaceFuel ?? null },
    formatLapTime, formatDriveTime, formatCarName, getSessionTypeLabel })
  // Preserve full dates for chart periods rather than using display labels as identity.
  projection.historicalTimes.forEach(p => { p.dateStart = sessions.find(s => s.sessionId === p.sessionId)?.meta.date_start })
  if (gameId === 'evo') {
    // Legacy track projections use zero for missing temperatures. The EVO
    // presentation must keep an unreported value absent instead.
    for (const [condition, temperature] of [['bestQualyConditions', best.bestQualyTemp],
      ['bestRaceConditions', best.bestRaceTemp], ['bestAvgRaceConditions', best.bestAvgRaceTemp]] as const) {
      const value = projection.track[condition]
      if (value) value.airTemp = typeof temperature === 'number' && Number.isFinite(temperature) ? temperature : Number.NaN
    }
  }
  projection.recentSessions.forEach(p => {
    const source = sessions.find(s => s.sessionId === p.id)
    p.dateStart = source?.meta.date_start
    if (source && gameId !== 'acc') {
      const kind = normalizedSessionKind(gameId, source.meta.sessionKind, source.meta.session_type)
      p.type = kind === 'qualify' || kind === 'practice' || kind === 'race' ? kind : 'unknown'
    }
  })
  return projection
}
