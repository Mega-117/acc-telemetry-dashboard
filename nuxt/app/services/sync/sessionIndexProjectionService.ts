import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import type { SessionDocument } from '~/composables/useTelemetryData'

export const SESSION_INDEX_SCHEMA_VERSION = 1
export const SESSION_INDEX_MAX_ITEMS = 200

export function buildSessionIndexProjection(allSessions: SessionDocument[], now: Date = new Date()) {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString()

  let practiceMinutes = 0
  let practiceCount = 0
  let qualifyMinutes = 0
  let qualifyCount = 0
  let raceMinutes = 0
  let raceCount = 0
  const activityByDay: Record<string, { P: number; Q: number; R: number }> = {}
  const tracksMap: Record<string, { track: string; sessions: number; lastPlayed: string }> = {}
  const sessionsList: Array<{
    id: string
    date: string
    track: string
    car: string
    type: number
    laps: number
    lapsValid: number
    bestLap: number | null
    totalTime: number
    stintCount: number
    bestQualyMs: number | null
    bestSessionRaceMs: number | null
    bestRaceMs: number | null
    bestRulesVersion: number
    grip?: string
    bestSessionRaceGrip?: string
  }> = []

  for (const session of allSessions) {
    const dateStart = session.meta?.date_start || ''
    const track = session.meta?.track || ''
    const trackKey = track.toLowerCase()

    if (dateStart >= sevenDaysAgoStr) {
      const totalMs = session.summary?.totalTime || 0
      const minutes = Math.round(totalMs / 60000)
      const dayKey = dateStart.substring(0, 10)

      if (!activityByDay[dayKey]) activityByDay[dayKey] = { P: 0, Q: 0, R: 0 }

      switch (session.meta?.session_type) {
        case 0: practiceMinutes += minutes; practiceCount++; activityByDay[dayKey].P++; break
        case 1: qualifyMinutes += minutes; qualifyCount++; activityByDay[dayKey].Q++; break
        case 2: raceMinutes += minutes; raceCount++; activityByDay[dayKey].R++; break
      }
    }

    if (trackKey) {
      if (!tracksMap[trackKey]) {
        tracksMap[trackKey] = { track, sessions: 0, lastPlayed: dateStart }
      }
      tracksMap[trackKey].sessions++
      if (dateStart > tracksMap[trackKey].lastPlayed) {
        tracksMap[trackKey].lastPlayed = dateStart
      }
    }

    const bestRulesVersion = Number(session.summary?.best_rules_version || 0)
    const raceRuleCompatible = bestRulesVersion >= BEST_RULES_VERSION
    sessionsList.push({
      id: session.sessionId,
      date: dateStart,
      track,
      car: session.meta?.car || '',
      type: session.meta?.session_type ?? 0,
      laps: session.summary?.laps || 0,
      lapsValid: session.summary?.lapsValid || 0,
      bestLap: session.summary?.bestLap || null,
      totalTime: session.summary?.totalTime || 0,
      stintCount: session.summary?.stintCount || 0,
      bestQualyMs: session.summary?.best_qualy_ms || null,
      bestSessionRaceMs: session.summary?.best_session_race_ms || null,
      bestRaceMs: raceRuleCompatible ? (session.summary?.best_race_ms || null) : null,
      bestRulesVersion,
      bestSessionRaceGrip: session.summary?.best_session_race_conditions?.grip || undefined,
      grip: (raceRuleCompatible ? session.summary?.best_race_conditions?.grip : null) || session.summary?.best_qualy_conditions?.grip || undefined
    })
  }

  sessionsList.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return {
    schemaVersion: SESSION_INDEX_SCHEMA_VERSION,
    sessionsList: sessionsList.slice(0, SESSION_INDEX_MAX_ITEMS),
    totalSessions: allSessions.length,
    activity7d: {
      practice: { minutes: practiceMinutes, sessions: practiceCount },
      qualify: { minutes: qualifyMinutes, sessions: qualifyCount },
      race: { minutes: raceMinutes, sessions: raceCount },
      byDay: Object.entries(activityByDay).map(([date, counts]) => ({ date, ...counts }))
    },
    tracksSummary: Object.values(tracksMap),
    updatedAt: new Date().toISOString()
  }
}
