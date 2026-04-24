import { doc } from 'firebase/firestore'
import { buildSessionIndexProjection } from './sessionIndexProjectionService'
import { buildUserStatsProjection } from './userStatsProjectionService'
import { updateTrackBestsProjection } from './trackBestsProjectionService'
import type { SessionDocument } from '~/composables/useTelemetryData'

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
  for (const session of sessions) {
    await updateTrackBestsProjection({
      db,
      uid,
      trackId: session.meta.track,
      sessionId: session.sessionId,
      dateStart: session.meta.date_start,
      summary: session.summary,
      car: session.meta.car,
      getDocFn,
      setDocFn,
      bestRulesVersion
    })
  }
}

export async function writeUserProjectionDocuments(params: {
  db: any
  uid: string
  sessions: SessionDocument[]
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
}): Promise<void> {
  const { db, uid, sessions, setDocFn } = params
  const userRef = doc(db, `users/${uid}`)
  await setDocFn(userRef, {
    stats: buildUserStatsProjection(sessions),
    sessionIndex: buildSessionIndexProjection(sessions)
  }, { merge: true })
}
