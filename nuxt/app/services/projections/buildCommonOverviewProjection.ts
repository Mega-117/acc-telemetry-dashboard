import type { SessionDocument } from '~/types/telemetry'
import type { OverviewProjection } from '~/types/overviewProjections'
import { normalizedSessionKind, sessionGame } from '../telemetry/gameIdentity'
import { buildActivityProjectionFromEntries, getTelemetryActivityDateKey } from '../telemetry/activityProjectionService'
import { historyBest, historyTrackId } from './vehicleHistory'
import { formatLapTime, formatDate } from '~/utils/telemetryFormat'

/** Shared presentation; historical values come from the canonical fuel summary. */
export function buildCommonOverviewProjection(input: SessionDocument[], gameId: string, now = new Date()): OverviewProjection {
  const sessions = [...new Map(input.filter(s => sessionGame(s) === gameId).map(s => [s.sessionId, s])).values()]
  const last = sessions.filter(s => Number.isFinite(Date.parse(s.meta.date_start)))
    .sort((a, b) => Date.parse(b.meta.date_start) - Date.parse(a.meta.date_start))[0]
  const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
  const comparable = last ? sessions.filter(s => s.meta.track === last.meta.track
    && (s.meta.trackVariant ?? '') === (last.meta.trackVariant ?? '') && s.meta.car === last.meta.car) : []
  const kindIds: Record<string, number> = { practice: 0, qualify: 1, race: 2 }
  const activity = buildActivityProjectionFromEntries({ now, sessionTypes: { PRACTICE: 0, QUALIFY: 1, RACE: 2 },
    entries: sessions.map(s => ({ dateStart: s.meta.date_start,
      sessionType: kindIds[normalizedSessionKind(gameId, s.meta.sessionKind, s.meta.session_type)] ?? -1,
      totalTimeMs: positive(s.summary.totalTime) ? s.summary.totalTime : 0 })) })
  const historical = historyBest(comparable)
  const latest = last ? historyBest([last]) : {}
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
    lastTrack: last ? { id: historyTrackId(last.meta.track, last.meta.trackVariant), name: [last.meta.track, last.meta.trackVariant].filter(Boolean).join(' · '), image: '',
      lastSession: last.meta.date_start, bestQualy: '', bestRace: '', bestAvgRace: '', bestQualyGrip: null, bestRaceGrip: null, bestAvgRaceGrip: null } : null,
    previousTrack: null,
    lastSession: last ? { id: last.sessionId, car: last.meta.car, track: last.meta.track, date: last.meta.date_start,
      bestQualy: '', bestRace: '', bestAvgRace: '' } : null,
    performanceColumns: [
      { label: 'Qualifica', best: formatLapTime(historical.bestQualy), session: formatLapTime(latest.bestQualy) },
      { label: 'Gara', best: formatLapTime(historical.bestRace), session: formatLapTime(latest.bestRace) },
      { label: 'Media gara', best: formatLapTime(historical.bestAvgRace), session: formatLapTime(latest.bestAvgRace) },
    ],
    activity7d, activityTotals: activity.totals, otherActivity,
  }
}
