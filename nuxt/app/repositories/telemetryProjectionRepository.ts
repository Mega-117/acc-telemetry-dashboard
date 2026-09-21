import { collection, doc, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedGetDocs } from '~/composables/useFirebaseTracker'
import { normalizeTrackId } from '~/services/projections/trackMetadata'
import {
  TRACK_DETAIL_PROJECTION_SCHEMA_VERSION,
  type TrackDetailProjectionDocument
} from '~/types/trackProjections'
import { isSupportedTrackBestProjection } from '~/services/projections/trackBestProjectionGuard'
import { checkFirebaseCacheFreshness } from '~/services/monitoring/firebaseOpsJournal'
import { OWNER_DATA_CACHE_TTL_MS } from '~/services/cache/cachePolicy'

let cacheGeneration = 0

const CALLER = 'TelemetryProjectionRepository'
const PROJECTION_CACHE_TTL_MS = OWNER_DATA_CACHE_TTL_MS

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

function isFresh<T>(entry: CacheEntry<T> | undefined, cacheName: string): entry is CacheEntry<T> {
  return checkFirebaseCacheFreshness(`projection.${cacheName}`, entry?.cachedAt, PROJECTION_CACHE_TTL_MS)
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, generation: number): T {
  if (generation === cacheGeneration) cache.set(key, { cachedAt: Date.now(), value })
  return value
}

export function clearTelemetryProjectionRepositoryCache(uid?: string) {
  cacheGeneration += 1
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
  if (isFresh(cached, 'userProjection')) return cached.value

  const generation = cacheGeneration
  const snap = await trackedGetDoc(doc(db, `users/${uid}`), CALLER)
  if (!snap.exists()) return setCache(userProjectionCache, uid, null, generation)
  const data = snap.data() || {}
  return setCache(userProjectionCache, uid, {
    stats: data.stats || null,
    sessionIndex: data.sessionIndex || null
  }, generation)
}

export async function loadTrackBest(uid: string, trackId: string): Promise<any | null> {
  const normalizedTrackId = normalizeTrackId(trackId)
  if (!normalizedTrackId) return null
  const cacheKey = `${uid}:${normalizedTrackId}`
  const cached = trackBestCache.get(cacheKey)
  if (isFresh(cached, 'trackBest')) return cached.value

  const generation = cacheGeneration
  const snap = await trackedGetDoc(doc(db, `users/${uid}/trackBests/${normalizedTrackId}`), CALLER)
  if (!snap.exists()) return setCache(trackBestCache, cacheKey, null, generation)
  const data = snap.data() || null
  return setCache(trackBestCache, cacheKey, isSupportedTrackBestProjection(data) ? data : null, generation)
}

export async function loadTrackBestsMap(uid: string): Promise<Record<string, any>> {
  const cached = trackBestsMapCache.get(uid)
  if (isFresh(cached, 'trackBestsMap')) return cached.value

  const generation = cacheGeneration
  const snap = await trackedGetDocs(query(collection(db, `users/${uid}/trackBests`)), CALLER)
  const result: Record<string, any> = {}
  for (const docSnap of snap.docs || []) {
    const data = docSnap.data() || {}
    if (!isSupportedTrackBestProjection(data)) continue
    const normalizedTrackId = normalizeTrackId(data.trackId || docSnap.id)
    result[normalizedTrackId] = data
    setCache(trackBestCache, `${uid}:${normalizedTrackId}`, data, generation)
  }
  return setCache(trackBestsMapCache, uid, result, generation)
}

export async function loadTrackDetailProjectionDoc(
  uid: string,
  trackId: string
): Promise<TrackDetailProjectionDocument | null> {
  const normalizedTrackId = normalizeTrackId(trackId)
  if (!normalizedTrackId) return null
  const cacheKey = `${uid}:${normalizedTrackId}`
  const cached = trackDetailProjectionCache.get(cacheKey)
  if (isFresh(cached, 'trackDetail')) return cached.value

  const generation = cacheGeneration
  const snap = await trackedGetDoc(doc(db, `users/${uid}/trackDetailProjections/${normalizedTrackId}`), CALLER)
  if (!snap.exists()) return setCache(trackDetailProjectionCache, cacheKey, null, generation)
  const data = snap.data() || {}
  if (Number(data.schemaVersion || 0) !== TRACK_DETAIL_PROJECTION_SCHEMA_VERSION) {
    return setCache(trackDetailProjectionCache, cacheKey, null, generation)
  }
  return setCache(trackDetailProjectionCache, cacheKey, data as TrackDetailProjectionDocument, generation)
}
