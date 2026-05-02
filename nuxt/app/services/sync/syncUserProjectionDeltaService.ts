import { doc } from 'firebase/firestore'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'
import { PILOT_DIRECTORY_SCHEMA_VERSION } from '~/utils/pilotDirectoryFields'
import { SESSION_INDEX_MAX_ITEMS, SESSION_INDEX_SCHEMA_VERSION } from './sessionIndexProjectionService'
import { USER_STATS_SCHEMA_VERSION } from './userStatsProjectionService'
import type { TrackBestProjectionDelta } from './trackBestsProjectionService'

export interface UserProjectionDelta extends TrackBestProjectionDelta {
  status: 'created' | 'updated'
}

type SessionIndexEntry = {
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
}

function toSessionIndexEntry(delta: UserProjectionDelta): SessionIndexEntry {
  const summary = delta.summary || {}
  const bestRulesVersion = Number(summary.best_rules_version || BEST_RULES_VERSION)
  const raceRuleCompatible = bestRulesVersion >= BEST_RULES_VERSION

  return {
    id: delta.sessionId,
    date: delta.dateStart || '',
    track: delta.trackId || '',
    car: delta.car || '',
    type: Number(delta.sessionType ?? summary.sessionType ?? summary.session_type ?? 0),
    laps: Number(summary.laps || 0),
    lapsValid: Number(summary.lapsValid || 0),
    bestLap: summary.bestLap || null,
    totalTime: Number(summary.totalTime || 0),
    stintCount: Number(summary.stintCount || 0),
    bestQualyMs: summary.best_qualy_ms || null,
    bestSessionRaceMs: summary.best_session_race_ms || null,
    bestRaceMs: raceRuleCompatible ? (summary.best_race_ms || null) : null,
    bestRulesVersion,
    bestSessionRaceGrip: summary.best_session_race_conditions?.grip || null,
    grip: (raceRuleCompatible ? summary.best_race_conditions?.grip : null) || summary.best_qualy_conditions?.grip || null
  }
}

function buildActivity7d(entries: SessionIndexEntry[], now = new Date()) {
  const sevenDaysAgoStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const activityByDay: Record<string, { P: number; Q: number; R: number }> = {}
  let practiceMinutes = 0
  let practiceCount = 0
  let qualifyMinutes = 0
  let qualifyCount = 0
  let raceMinutes = 0
  let raceCount = 0

  for (const entry of entries) {
    if (!entry.date || entry.date < sevenDaysAgoStr) continue
    const minutes = Math.round(Number(entry.totalTime || 0) / 60000)
    const dayKey = entry.date.substring(0, 10)
    if (!activityByDay[dayKey]) activityByDay[dayKey] = { P: 0, Q: 0, R: 0 }

    switch (entry.type) {
      case 0: practiceMinutes += minutes; practiceCount++; activityByDay[dayKey].P += minutes; break
      case 1: qualifyMinutes += minutes; qualifyCount++; activityByDay[dayKey].Q += minutes; break
      case 2: raceMinutes += minutes; raceCount++; activityByDay[dayKey].R += minutes; break
    }
  }

  return {
    practice: { minutes: practiceMinutes, sessions: practiceCount },
    qualify: { minutes: qualifyMinutes, sessions: qualifyCount },
    race: { minutes: raceMinutes, sessions: raceCount },
    byDay: Object.entries(activityByDay).map(([date, counts]) => ({ date, ...counts }))
  }
}

function mergeTracksSummary(existing: any[], deltas: UserProjectionDelta[]) {
  const tracks = new Map<string, { track: string; sessions: number; lastPlayed: string }>()
  for (const item of Array.isArray(existing) ? existing : []) {
    const track = String(item?.track || '')
    if (!track) continue
    tracks.set(track.toLowerCase(), {
      track,
      sessions: Number(item?.sessions || 0),
      lastPlayed: item?.lastPlayed || ''
    })
  }

  for (const delta of deltas) {
    if (delta.status !== 'created') continue
    const track = String(delta.trackId || '')
    if (!track) continue
    const key = track.toLowerCase()
    const current = tracks.get(key) || { track, sessions: 0, lastPlayed: '' }
    current.sessions += 1
    if (delta.dateStart && delta.dateStart > current.lastPlayed) {
      current.lastPlayed = delta.dateStart
    }
    tracks.set(key, current)
  }

  return Array.from(tracks.values())
}

export async function applyUserProjectionDeltas(params: {
  db: any
  uid: string
  deltas: UserProjectionDelta[]
  getDocFn: (ref: any) => Promise<any>
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  docFn?: (db: any, path: string) => any
}): Promise<{ wrote: boolean; totalSessions: number; sessionsLast7Days: number }> {
  const { db, uid, deltas, getDocFn, setDocFn, docFn = doc } = params
  if (deltas.length === 0) {
    return { wrote: false, totalSessions: 0, sessionsLast7Days: 0 }
  }

  const userRef = docFn(db, `users/${uid}`)
  const directoryRef = docFn(db, `pilotDirectory/${uid}`)
  const userSnap = await getDocFn(userRef)
  const userData = userSnap.exists() ? userSnap.data() : {}
  const existingIndex = userData?.sessionIndex || {}
  const existingStats = userData?.stats || {}
  const existingList = Array.isArray(existingIndex.sessionsList) ? existingIndex.sessionsList : []
  const byId = new Map<string, SessionIndexEntry>()

  for (const item of existingList) {
    if (item?.id) byId.set(item.id, item)
  }
  for (const delta of deltas) {
    byId.set(delta.sessionId, toSessionIndexEntry(delta))
  }

  const sessionsList = Array.from(byId.values())
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, SESSION_INDEX_MAX_ITEMS)

  const createdIds = new Set(deltas.filter((delta) => delta.status === 'created').map((delta) => delta.sessionId))
  let createdNotPreviouslyIndexed = 0
  for (const id of createdIds) {
    if (!existingList.some((item: any) => item?.id === id)) createdNotPreviouslyIndexed++
  }

  const totalSessions = Math.max(
    Number(existingIndex.totalSessions || 0),
    Number(existingStats.totalSessions || 0),
    existingList.length
  ) + createdNotPreviouslyIndexed
  const activity7d = buildActivity7d(sessionsList)
  const tracksSummary = mergeTracksSummary(existingIndex.tracksSummary || [], deltas)
  const lastSessionDate = sessionsList[0]?.date || existingStats.lastSessionDate || null
  const sessionsLast7Days = activity7d.practice.sessions + activity7d.qualify.sessions + activity7d.race.sessions
  const now = new Date().toISOString()

  await setDocFn(userRef, sanitizeForFirestore({
    stats: {
      schemaVersion: USER_STATS_SCHEMA_VERSION,
      totalSessions,
      sessionsLast7Days,
      lastSessionDate,
      tracksCount: tracksSummary.length,
      updatedAt: now
    },
    sessionIndex: {
      schemaVersion: SESSION_INDEX_SCHEMA_VERSION,
      sessionsList,
      totalSessions,
      activity7d,
      tracksSummary,
      updatedAt: now
    }
  }), { merge: true })

  await setDocFn(directoryRef, sanitizeForFirestore({
    schemaVersion: PILOT_DIRECTORY_SCHEMA_VERSION,
    uid,
    sessionsLast7Days,
    lastSessionDate
  }), { merge: true })

  return { wrote: true, totalSessions, sessionsLast7Days }
}
