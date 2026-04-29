import { collection, doc, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedGetDocs } from '~/composables/useFirebaseTracker'
import { normalizeTrackId } from '~/services/projections/trackMetadata'
import {
  TRACK_DETAIL_PROJECTION_SCHEMA_VERSION,
  type TrackDetailProjectionDocument
} from '~/types/trackProjections'

const CALLER = 'TelemetryProjectionRepository'

export type UserProjectionDocument = {
  stats?: any
  sessionIndex?: any
}

export async function loadUserProjection(uid: string): Promise<UserProjectionDocument | null> {
  const snap = await trackedGetDoc(doc(db, `users/${uid}`), CALLER)
  if (!snap.exists()) return null
  const data = snap.data() || {}
  return {
    stats: data.stats || null,
    sessionIndex: data.sessionIndex || null
  }
}

export async function loadTrackBest(uid: string, trackId: string): Promise<any | null> {
  const normalizedTrackId = normalizeTrackId(trackId)
  if (!normalizedTrackId) return null
  const snap = await trackedGetDoc(doc(db, `users/${uid}/trackBests/${normalizedTrackId}`), CALLER)
  return snap.exists() ? (snap.data() || null) : null
}

export async function loadTrackBestsMap(uid: string): Promise<Record<string, any>> {
  const snap = await trackedGetDocs(query(collection(db, `users/${uid}/trackBests`)), CALLER)
  const result: Record<string, any> = {}
  for (const docSnap of snap.docs || []) {
    const data = docSnap.data() || {}
    result[normalizeTrackId(data.trackId || docSnap.id)] = data
  }
  return result
}

export async function loadTrackDetailProjectionDoc(
  uid: string,
  trackId: string
): Promise<TrackDetailProjectionDocument | null> {
  const normalizedTrackId = normalizeTrackId(trackId)
  if (!normalizedTrackId) return null
  const snap = await trackedGetDoc(doc(db, `users/${uid}/trackDetailProjections/${normalizedTrackId}`), CALLER)
  if (!snap.exists()) return null
  const data = snap.data() || {}
  if (Number(data.schemaVersion || 0) !== TRACK_DETAIL_PROJECTION_SCHEMA_VERSION) return null
  return data as TrackDetailProjectionDocument
}
