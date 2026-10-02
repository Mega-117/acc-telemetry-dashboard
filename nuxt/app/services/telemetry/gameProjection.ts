import { buildActivityProjectionFromEntries } from './activityProjectionService'

type IndexEntry = { gameId?: string; date?: string; type?: number; totalTime?: number }

export function buildGameActivity(entries: IndexEntry[], now = new Date()) {
  return Object.fromEntries([...new Set(entries.map(entry => entry.gameId ?? 'acc'))].map(gameId => {
    const projection = buildActivityProjectionFromEntries({
      entries: entries.filter(entry => (entry.gameId ?? 'acc') === gameId).map(entry => ({
        dateStart: entry.date, sessionType: entry.type, totalTimeMs: entry.totalTime,
      })), now, sessionTypes: { PRACTICE: 0, QUALIFY: 1, RACE: 2 },
    })
    return [gameId, { ...projection.totals, byDay: projection.byDay }]
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
