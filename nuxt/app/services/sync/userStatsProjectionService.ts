import type { SessionDocument } from '~/composables/useTelemetryData'

export const USER_STATS_SCHEMA_VERSION = 1

export function buildUserStatsProjection(allSessions: SessionDocument[], now: Date = new Date()) {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString()
  let lastSessionDate: string | null = null
  let sessionsLast7Days = 0
  const tracksMap = new Set<string>()

  for (const session of allSessions) {
    const dateStart = session.meta?.date_start || ''
    const track = session.meta?.track || ''
    if (dateStart && (!lastSessionDate || dateStart > lastSessionDate)) {
      lastSessionDate = dateStart
    }
    if (dateStart >= sevenDaysAgoStr) {
      sessionsLast7Days++
    }
    if (track) {
      tracksMap.add(track.toLowerCase())
    }
  }

  return {
    schemaVersion: USER_STATS_SCHEMA_VERSION,
    totalSessions: allSessions.length,
    sessionsLast7Days,
    lastSessionDate,
    tracksCount: tracksMap.size,
    updatedAt: new Date().toISOString()
  }
}
