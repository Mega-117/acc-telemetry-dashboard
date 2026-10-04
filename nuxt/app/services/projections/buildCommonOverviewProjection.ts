import type { SessionDocument } from '~/types/telemetry'
import type { OverviewProjection } from '~/types/overviewProjections'
import { normalizedSessionKind, sessionGame } from '../telemetry/gameIdentity'
import { buildActivityProjectionFromEntries, getTelemetryActivityDateKey } from '../telemetry/activityProjectionService'
import { formatLapTime, formatDate } from '~/utils/telemetryFormat'

/** Read-only presentation of recorded facts. ACC fuel/grip rules never enter here. */
export function buildCommonOverviewProjection(input: SessionDocument[], gameId: string, now = new Date()): OverviewProjection {
  const sessions = [...new Map(input.filter(s => sessionGame(s) === gameId).map(s => [s.sessionId, s])).values()]
  const last = sessions.filter(s => Number.isFinite(Date.parse(s.meta.date_start)))
    .sort((a, b) => Date.parse(b.meta.date_start) - Date.parse(a.meta.date_start))[0]
  const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
  const comparable = last ? sessions.filter(s => s.meta.track === last.meta.track
    && (s.meta.trackVariant ?? '') === (last.meta.trackVariant ?? '') && s.meta.car === last.meta.car) : []
  const valid = comparable.filter(s => positive(s.summary.lapsValid))
  const bests = valid.map(s => s.summary.bestLap).filter(positive)
  // A missing average cannot silently disappear from the historical denominator.
  const average = valid.length && valid.every(s => positive(s.summary.avgCleanLap))
    ? valid.reduce((sum, s) => sum + s.summary.avgCleanLap! * s.summary.lapsValid, 0)
      / valid.reduce((sum, s) => sum + s.summary.lapsValid, 0) : null
  const kindIds: Record<string, number> = { practice: 0, qualify: 1, race: 2 }
  const activity = buildActivityProjectionFromEntries({ now, sessionTypes: { PRACTICE: 0, QUALIFY: 1, RACE: 2 },
    entries: sessions.map(s => ({ dateStart: s.meta.date_start,
      sessionType: kindIds[normalizedSessionKind(gameId, s.meta.sessionKind, s.meta.session_type)] ?? -1,
      totalTimeMs: positive(s.summary.totalTime) ? s.summary.totalTime : 0 })) })
  const lastValid = last && positive(last.summary.lapsValid)
  const otherActivity = { minutes: 0, sessions: 0 }
  const activity7d = activity.data.map(day => ({ ...day, other: 0 }))
  for (const s of sessions) {
    if (normalizedSessionKind(gameId, s.meta.sessionKind, s.meta.session_type) in kindIds) continue
    const day = activity7d.find(d => d.date === getTelemetryActivityDateKey(s.meta.date_start))
    if (!day) continue
    const minutes = Math.round((positive(s.summary.totalTime) ? s.summary.totalTime : 0) / 60000)
    day.other += minutes
    otherActivity.minutes += minutes
    otherActivity.sessions++
  }
  return {
    lastCar: { rawName: last?.meta.car ?? null, displayName: last?.meta.car || 'Nessuna auto',
      lastUsedDate: last ? formatDate(getTelemetryActivityDateKey(last.meta.date_start)!) : 'Nessuna sessione registrata' },
    lastTrack: last ? { id: last.meta.track, name: [last.meta.track, last.meta.trackVariant].filter(Boolean).join(' · '), image: '',
      lastSession: last.meta.date_start, bestQualy: '', bestRace: '', bestAvgRace: '', bestQualyGrip: null, bestRaceGrip: null, bestAvgRaceGrip: null } : null,
    previousTrack: null,
    lastSession: last ? { id: last.sessionId, car: last.meta.car, track: last.meta.track, date: last.meta.date_start,
      bestQualy: '', bestRace: '', bestAvgRace: '' } : null,
    performanceColumns: [
      { label: 'Miglior giro', best: formatLapTime(bests.length ? Math.min(...bests) : null), session: formatLapTime(lastValid ? last.summary.bestLap : null) },
      { label: 'Media', best: formatLapTime(average), session: formatLapTime(lastValid ? last.summary.avgCleanLap : null) },
      // The lightweight summary has no certified sector minima. Do not infer them from lap time.
      { label: 'Teorico', best: formatLapTime(null), session: formatLapTime(null) },
    ],
    activity7d, activityTotals: activity.totals, otherActivity,
  }
}
