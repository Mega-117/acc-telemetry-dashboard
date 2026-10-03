import { buildActivityProjectionFromEntries, getRecentActivityDateKeys, getTelemetryActivityDateKey } from './activityProjectionService'
import { normalizedSessionKind, sessionGame, gameScopedKey } from './gameIdentity'
import type { SessionDocument } from '~/types/telemetry'

type IndexEntry = { gameId?: string; date?: string; type?: number; sessionKind?: string; totalTime?: number }

/** Aggregate recorded summaries within comparable game/track/variant/car groups. */
export function buildCommonHistoryOverview(input: SessionDocument[], gameId: string, track?: string, now = new Date()) {
  const sessions = [...new Map(input.filter(session => sessionGame(session) === gameId
    && (!track || session.meta.track.toLowerCase() === track.toLowerCase()))
    .map(session => [session.sessionId, session])).values()]
  const finiteCount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
  const groups = new Map<string, { key: string; track: string; variant: string | null; car: string; sessions: number; laps: number; validLaps: number; bestMs: number | null }>()
  for (const session of sessions) {
    const { meta, summary } = session
    const key = gameScopedKey(gameId, meta.track, meta.trackVariant ?? '', meta.car)
    const group = groups.get(key) ?? { key, track: meta.track, variant: meta.trackVariant ?? null,
      car: meta.car, sessions: 0, laps: 0, validLaps: 0, bestMs: null }
    group.sessions++
    group.laps += finiteCount(summary.laps)
    group.validLaps += finiteCount(summary.lapsValid)
    const best = summary.bestLap
    if (summary.lapsValid > 0 && typeof best === 'number' && Number.isFinite(best) && best > 0) {
      group.bestMs = group.bestMs === null ? best : Math.min(group.bestMs, best)
    }
    groups.set(key, group)
  }
  return { gameId, sessions: sessions.length,
    laps: sessions.reduce((sum, session) => sum + finiteCount(session.summary.laps), 0),
    validLaps: sessions.reduce((sum, session) => sum + finiteCount(session.summary.lapsValid), 0),
    totalTimeMs: sessions.reduce((sum, session) => sum + finiteCount(session.summary.totalTime), 0),
    groups: [...groups.values()].sort((a, b) => a.track.localeCompare(b.track) || (a.variant ?? '').localeCompare(b.variant ?? '') || a.car.localeCompare(b.car)),
    activity: buildGameActivity(sessions.map(session => ({ gameId, date: session.meta.date_start,
      sessionKind: session.meta.sessionKind, type: session.meta.session_type, totalTime: session.summary.totalTime })), now)[gameId]?.byKind ?? {},
  }
}
const ACTIVITY_KINDS = new Map([['practice', 0], ['qualify', 1], ['race', 2]])

export function buildGameActivity(entries: IndexEntry[], now = new Date()) {
  return Object.fromEntries([...new Set(entries.map(entry => entry.gameId ?? 'acc'))].map(gameId => {
    const scoped = entries.filter(entry => (entry.gameId ?? 'acc') === gameId)
    const days = new Set(getRecentActivityDateKeys(7, now))
    const byKind: Record<string, { minutes: number; sessions: number }> = {}
    for (const entry of scoped) {
      if (!days.has(getTelemetryActivityDateKey(entry.date) ?? '')) continue
      const kind = normalizedSessionKind(gameId, entry.sessionKind, entry.type)
      const totals = Object.hasOwn(byKind, kind) ? byKind[kind]! : (byKind[kind] = { minutes: 0, sessions: 0 })
      totals.minutes += Math.round(Math.max(0, Number.isFinite(entry.totalTime) ? entry.totalTime! : 0) / 60000)
      totals.sessions += 1
    }
    const projection = buildActivityProjectionFromEntries({
      entries: scoped.map(entry => ({
        dateStart: entry.date,
        sessionType: ACTIVITY_KINDS.get(normalizedSessionKind(gameId, entry.sessionKind, entry.type)) ?? -1,
        totalTimeMs: entry.totalTime,
      })), now, sessionTypes: { PRACTICE: 0, QUALIFY: 1, RACE: 2 },
    })
    return [gameId, { ...projection.totals, byDay: projection.byDay, byKind }]
  }))
}

/** Legacy indexes contain ACC only; new indexes carry per-game activity. */
export function scopeSessionIndex<T extends Record<string, unknown>>(index: T, gameId: string, now = new Date()): T & { activityRequiresFallback: boolean; activity7d: unknown } {
  const activity = index.activityByGame && typeof index.activityByGame === 'object'
    ? index.activityByGame as Record<string, unknown> : {}
  const entries: IndexEntry[] = Array.isArray(index.sessionsList) ? index.sessionsList : []
  const dates = entries.map(entry => getTelemetryActivityDateKey(entry.date))
  const firstDay = getRecentActivityDateKeys(7, now)[0]!
  // Both writers maintain this newest-first index. Legacy writers do not update
  // activityByGame, so its existence cannot establish freshness (even if its
  // bars and totals agree). Reuse the index only when it covers the whole window.
  const ordered = dates.every((date, i) => date !== null && (i === 0 || date <= dates[i - 1]!))
  const complete = ordered && ((typeof index.totalSessions === 'number' && index.totalSessions === entries.length)
    || (dates.length > 0 && dates[dates.length - 1]! < firstDay))
  const recalculated = complete ? buildGameActivity(entries, now)[gameId]
    ?? buildGameActivity([{ gameId }], now)[gameId] : undefined
  return {
    ...index,
    sessionsList: entries.filter((row: IndexEntry) => (row.gameId ?? 'acc') === gameId),
    tracksSummary: (Array.isArray(index.tracksSummary) ? index.tracksSummary : []).filter((row: { gameId?: string }) => (row.gameId ?? 'acc') === gameId),
    activity7d: recalculated ?? activity[gameId] ?? (gameId === 'acc' ? index.activity7d : {}),
    activityRequiresFallback: !complete,
  }
}
