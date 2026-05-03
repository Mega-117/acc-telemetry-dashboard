import { doc } from 'firebase/firestore'
import { buildSessionIndexProjection } from './sessionIndexProjectionService'
import { buildUserStatsProjection } from './userStatsProjectionService'
import { applyTrackBestsProjectionDeltas, type TrackBestProjectionDelta } from './trackBestsProjectionService'
import { writeTrackDetailProjectionDocuments } from './trackDetailProjectionService'
import type { SessionDocument } from '~/composables/useTelemetryData'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'
import { updatePilotDirectoryActivity } from '~/services/pilotDirectoryProjectionService'

export async function rebuildTrackBestsProjection(params: {
  db: any
  uid: string
  sessions: SessionDocument[]
  resetAllTrackBests: (uid: string) => Promise<number>
  getDocFn: (ref: any) => Promise<any>
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  bestRulesVersion: number
}): Promise<void> {
  const { db, uid, sessions, resetAllTrackBests, getDocFn, setDocFn, bestRulesVersion } = params
  await resetAllTrackBests(uid)
  const deltas: TrackBestProjectionDelta[] = sessions
    .filter((session) => !!session?.meta?.track && !!session?.sessionId)
    .map((session) => ({
      trackId: session.meta.track,
      sessionId: session.sessionId,
      dateStart: session.meta.date_start,
      summary: session.summary,
      car: session.meta.car
    }))

  await applyTrackBestsProjectionDeltas({
    db,
    uid,
    deltas,
    getDocFn,
    setDocFn,
    bestRulesVersion
  })
}

export async function writeUserProjectionDocuments(params: {
  db: any
  uid: string
  sessions: SessionDocument[]
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
}): Promise<void> {
  const { db, uid, sessions, setDocFn } = params
  const userRef = doc(db, `users/${uid}`)
  const stats = buildUserStatsProjection(sessions)
  const sessionIndex = buildSessionIndexProjection(sessions)

  await setDocFn(userRef, sanitizeForFirestore({
    stats,
    sessionIndex
  }), { merge: true })
  await updatePilotDirectoryActivity({
    db,
    uid,
    fields: {
      sessionsLast7Days: stats.sessionsLast7Days,
      lastSessionDate: stats.lastSessionDate || null
    },
    setDocFn
  })
  await writeTrackDetailProjectionDocuments({
    db,
    uid,
    sessions,
    setDocFn
  })
}
