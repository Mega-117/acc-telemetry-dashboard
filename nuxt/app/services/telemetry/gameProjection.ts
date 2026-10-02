import { buildActivityProjectionFromEntries, getRecentActivityDateKeys, getTelemetryActivityDateKey } from './activityProjectionService'
import { normalizedSessionKind } from './gameIdentity'

type IndexEntry = { gameId?: string; date?: string; type?: number; sessionKind?: string; totalTime?: number }
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
export function scopeSessionIndex<T extends Record<string, unknown>>(index: T, gameId: string): T {
  const activity = index.activityByGame && typeof index.activityByGame === 'object'
    ? index.activityByGame as Record<string, unknown> : {}
  return {
    ...index,
    sessionsList: (Array.isArray(index.sessionsList) ? index.sessionsList : []).filter((row: IndexEntry) => (row.gameId ?? 'acc') === gameId),
    tracksSummary: (Array.isArray(index.tracksSummary) ? index.tracksSummary : []).filter((row: { gameId?: string }) => (row.gameId ?? 'acc') === gameId),
    activity7d: activity[gameId] ?? (gameId === 'acc' ? index.activity7d : {}),
  }
}
