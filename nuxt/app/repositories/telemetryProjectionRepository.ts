import { collection, doc, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedGetDocs } from '~/composables/useFirebaseTracker'
import { normalizeTrackId } from '~/services/projections/trackMetadata'
import {
  TRACK_DETAIL_PROJECTION_SCHEMA_VERSION,
  type TrackDetailProjectionDocument
} from '~/types/trackProjections'
import { isSupportedTrackBestProjection } from '~/services/projections/trackBestProjectionGuard'

const CALLER = 'TelemetryProjectionRepository'
const PROJECTION_CACHE_TTL_MS = 60_000

type CacheEntry<T> = {
  cachedAt: number
  value: T
}

export type UserProjectionDocument = {
  stats?: any
  sessionIndex?: any
}

const userProjectionCache = new Map<string, CacheEntry<UserProjectionDocument | null>>()
const trackBestCache = new Map<string, CacheEntry<any | null>>()
const trackBestsMapCache = new Map<string, CacheEntry<Record<string, any>>>()
const trackDetailProjectionCache = new Map<string, CacheEntry<TrackDetailProjectionDocument | null>>()

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return !!entry && Date.now() - entry.cachedAt <= PROJECTION_CACHE_TTL_MS
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): T {
  cache.set(key, { cachedAt: Date.now(), value })
  return value
}

export function clearTelemetryProjectionRepositoryCache(uid?: string) {
  if (!uid) {
    userProjectionCache.clear()
    trackBestCache.clear()
    trackBestsMapCache.clear()
    trackDetailProjectionCache.clear()
    return
  }

  userProjectionCache.delete(uid)
  trackBestsMapCache.delete(uid)
  for (const key of Array.from(trackBestCache.keys())) {
    if (key.startsWith(`${uid}:`)) trackBestCache.delete(key)
  }
  for (const key of Array.from(trackDetailProjectionCache.keys())) {
    if (key.startsWith(`${uid}:`)) trackDetailProjectionCache.delete(key)
  }
}

export async function loadUserProjection(uid: string): Promise<UserProjectionDocument | null> {
  const cached = userProjectionCache.get(uid)
  if (isFresh(cached)) return cached.value

  const snap = await trackedGetDoc(doc(db, `users/${uid}`), CALLER)
  if (!snap.exists()) return setCache(userProjectionCache, uid, null)
  const data = snap.data() || {}
  return setCache(userProjectionCache, uid, {
    stats: data.stats || null,
    sessionIndex: data.sessionIndex || null
  })
}

export async function loadTrackBest(uid: string, trackId: string): Promise<any | null> {
  const normalizedTrackId = normalizeTrackId(trackId)
  if (!normalizedTrackId) return null
  const cacheKey = `${uid}:${normalizedTrackId}`
  const cached = trackBestCache.get(cacheKey)
  if (isFresh(cached)) return cached.value

  const snap = await trackedGetDoc(doc(db, `users/${uid}/trackBests/${normalizedTrackId}`), CALLER)
  if (!snap.exists()) return setCache(trackBestCache, cacheKey, null)
  const data = snap.data() || null
  return setCache(trackBestCache, cacheKey, isSupportedTrackBestProjection(data) ? data : null)
}

export async function loadTrackBestsMap(uid: string): Promise<Record<string, any>> {
  const cached = trackBestsMapCache.get(uid)
  if (isFresh(cached)) return cached.value

  const snap = await trackedGetDocs(query(collection(db, `users/${uid}/trackBests`)), CALLER)
  const result: Record<string, any> = {}
  for (const docSnap of snap.docs || []) {
    const data = docSnap.data() || {}
    if (!isSupportedTrackBestProjection(data)) continue
    const normalizedTrackId = normalizeTrackId(data.trackId || docSnap.id)
    result[normalizedTrackId] = data
    trackBestCache.set(`${uid}:${normalizedTrackId}`, { cachedAt: Date.now(), value: data })
  }
  return setCache(trackBestsMapCache, uid, result)
}

export async function loadTrackDetailProjectionDoc(
  uid: string,
  trackId: string
): Promise<TrackDetailProjectionDocument | null> {
  const normalizedTrackId = normalizeTrackId(trackId)
  if (!normalizedTrackId) return null
  const cacheKey = `${uid}:${normalizedTrackId}`
  const cached = trackDetailProjectionCache.get(cacheKey)
  if (isFresh(cached)) return cached.value

  const snap = await trackedGetDoc(doc(db, `users/${uid}/trackDetailProjections/${normalizedTrackId}`), CALLER)
  if (!snap.exists()) return setCache(trackDetailProjectionCache, cacheKey, null)
  const data = snap.data() || {}
  if (Number(data.schemaVersion || 0) !== TRACK_DETAIL_PROJECTION_SCHEMA_VERSION) {
    return setCache(trackDetailProjectionCache, cacheKey, null)
  }
  return setCache(trackDetailProjectionCache, cacheKey, data as TrackDetailProjectionDocument)
}
