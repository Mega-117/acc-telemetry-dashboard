import type { SessionDocument } from '~/composables/useTelemetryData'
import { normalizeTrackKey } from './telemetryMergeService'

export function selectTrackSessions(sessions: SessionDocument[], trackId: string): SessionDocument[] {
  const normalizedTrackId = normalizeTrackKey(trackId)
  return sessions.filter((session) => {
    const sessionTrackId = normalizeTrackKey(session.meta.track || '')
    return sessionTrackId.includes(normalizedTrackId) || normalizedTrackId.includes(sessionTrackId)
  })
}

export function selectTrackStat<T extends { track: string }>(stats: T[], trackId: string): T | null {
  const normalizedTrackId = normalizeTrackKey(trackId)
  return stats.find((stat) => {
    const statTrackId = normalizeTrackKey(stat.track || '')
    return statTrackId.includes(normalizedTrackId) || normalizedTrackId.includes(statTrackId)
  }) || null
}
