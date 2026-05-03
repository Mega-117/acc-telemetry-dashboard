import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { buildActivityProjectionFromEntries } from '~/services/telemetry/activityProjectionService'
import type { SessionDocument } from '~/composables/useTelemetryData'

export const SESSION_INDEX_SCHEMA_VERSION = 2
export const SESSION_INDEX_MAX_ITEMS = 200
const ACTIVITY_SESSION_TYPES = { PRACTICE: 0, QUALIFY: 1, RACE: 2 }

export function buildSessionIndexProjection(allSessions: SessionDocument[], now: Date = new Date()) {
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
    grip: string | null
    bestSessionRaceGrip: string | null
  }> = []

  for (const session of allSessions) {
    const dateStart = session.meta?.date_start || ''
    const track = session.meta?.track || ''
    const trackKey = track.toLowerCase()

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
      bestSessionRaceGrip: session.summary?.best_session_race_conditions?.grip || null,
      grip: (raceRuleCompatible ? session.summary?.best_race_conditions?.grip : null) || session.summary?.best_qualy_conditions?.grip || null
    })
  }

  sessionsList.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const activityProjection = buildActivityProjectionFromEntries({
    entries: allSessions.map((session) => ({
      dateStart: session.meta?.date_start || '',
      sessionType: session.meta?.session_type ?? null,
      totalTimeMs: session.summary?.totalTime || 0
    })),
    now,
    sessionTypes: ACTIVITY_SESSION_TYPES
  })

  return {
    schemaVersion: SESSION_INDEX_SCHEMA_VERSION,
    sessionsList: sessionsList.slice(0, SESSION_INDEX_MAX_ITEMS),
    totalSessions: allSessions.length,
    activity7d: {
      practice: activityProjection.totals.practice,
      qualify: activityProjection.totals.qualify,
      race: activityProjection.totals.race,
      byDay: activityProjection.byDay
    },
    tracksSummary: Object.values(tracksMap),
    updatedAt: new Date().toISOString()
  }
}
