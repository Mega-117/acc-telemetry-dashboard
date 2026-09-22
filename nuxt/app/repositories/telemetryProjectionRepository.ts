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
import { expandTrackBestsIndexEntry, isTrackBestsIndexUsable, trackBestsIndexPath } from '~/services/sync/trackBestsIndexProjectionService'

let cacheGeneration = 0

const CALLER = 'TelemetryProjectionRepository'
const PROJECTION_CACHE_TTL_MS = OWNER_DATA_CACHE_TTL_MS

type CacheEntry<T> = {
  cachedAt: number
  value: T
}

export type UserProjectionDocument = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  stats?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  sessionIndex?: any
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documento `trackBests/{trackId}` letto da Firestore
type TrackBestDocument = any
type TrackBestDocumentMap = Record<string, TrackBestDocument>

const userProjectionCache = new Map<string, CacheEntry<UserProjectionDocument | null>>()
const trackBestCache = new Map<string, CacheEntry<TrackBestDocument | null>>()
const trackBestsMapCache = new Map<string, CacheEntry<TrackBestDocumentMap>>()
// PIP-441: indice piste (`trackBestsIndex/v1`) gia' letto; `null` = indice assente o non
// usabile, ricordato per non rileggerlo ad ogni pista entro il TTL.
const trackBestsIndexCache = new Map<string, CacheEntry<TrackBestDocumentMap | null>>()
const trackBestsIndexInFlight = new Map<string, Promise<TrackBestDocumentMap | null>>()
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
    trackBestsIndexCache.clear()
    trackDetailProjectionCache.clear()
    return
  }

  userProjectionCache.delete(uid)
  trackBestsMapCache.delete(uid)
  trackBestsIndexCache.delete(uid)
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

/** Voci per pista (solo schema supportato) da un indice o da una lista di documenti. */
function collectSupportedTrackBests(
  entries: Array<{ id: string; data: TrackBestDocument }>,
  uid: string,
  generation: number
): TrackBestDocumentMap {
  const result: TrackBestDocumentMap = {}
  for (const { id, data } of entries) {
    if (!isSupportedTrackBestProjection(data)) continue
    const normalizedTrackId = normalizeTrackId(data?.trackId || id)
    if (!normalizedTrackId) continue
    result[normalizedTrackId] = data
    setCache(trackBestCache, `${uid}:${normalizedTrackId}`, data, generation)
  }
  return result
}

/**
 * Una sola lettura per tutte le piste. Ritorna `null` se l'indice manca o ha una
 * versione vecchia: in quel caso il chiamante decide il fallback (collection per la
 * mappa completa, documento singolo per una pista) e la manutenzione lo ricostruisce.
 */
async function loadTrackBestsIndex(uid: string): Promise<TrackBestDocumentMap | null> {
  const cached = trackBestsIndexCache.get(uid)
  if (isFresh(cached, 'trackBestsIndex')) return cached.value

  const inFlight = trackBestsIndexInFlight.get(uid)
  if (inFlight) return inFlight

  const generation = cacheGeneration
  const request = (async () => {
    let indexDoc: unknown = null
    try {
      const snap = await trackedGetDoc(doc(db, trackBestsIndexPath(uid)), CALLER)
      indexDoc = snap.exists() ? snap.data() : null
    } catch (error) {
      // Degradazione: rules non ancora pubblicate o rete assente -> collection come prima di PIP-441.
      console.warn('[PROJECTION] trackBestsIndex unavailable, falling back to trackBests collection:', error)
    }
    if (!isTrackBestsIndexUsable(indexDoc)) return setCache(trackBestsIndexCache, uid, null, generation)
    // Le voci sono compatte: riespanse alla forma del documento per pista.
    const entries = Object.entries(indexDoc.tracks).map(([id, data]) => ({ id, data: expandTrackBestsIndexEntry(data) }))
    return setCache(trackBestsIndexCache, uid, collectSupportedTrackBests(entries, uid, generation), generation)
  })()

  trackBestsIndexInFlight.set(uid, request)
  try {
    return await request
  } finally {
    if (trackBestsIndexInFlight.get(uid) === request) trackBestsIndexInFlight.delete(uid)
  }
}

export async function loadTrackBest(uid: string, trackId: string): Promise<TrackBestDocument | null> {
  const normalizedTrackId = normalizeTrackId(trackId)
  if (!normalizedTrackId) return null
  const cacheKey = `${uid}:${normalizedTrackId}`
  const cached = trackBestCache.get(cacheKey)
  if (isFresh(cached, 'trackBest')) return cached.value

  // PIP-441: l'indice serve tutte le piste con una lettura condivisa (0 letture se gia' in cache).
  // La generazione va presa prima dell'await: un'invalidazione arrivata nel frattempo
  // non deve essere ripopolata con dati letti prima.
  const generation = cacheGeneration
  const indexed = await loadTrackBestsIndex(uid)
  if (indexed) return setCache(trackBestCache, cacheKey, indexed[normalizedTrackId] ?? null, generation)

  const snap = await trackedGetDoc(doc(db, `users/${uid}/trackBests/${normalizedTrackId}`), CALLER)
  if (!snap.exists()) return setCache(trackBestCache, cacheKey, null, generation)
  const data = snap.data() || null
  return setCache(trackBestCache, cacheKey, isSupportedTrackBestProjection(data) ? data : null, generation)
}

export async function loadTrackBestsMap(uid: string): Promise<TrackBestDocumentMap> {
  const cached = trackBestsMapCache.get(uid)
  if (isFresh(cached, 'trackBestsMap')) return cached.value

  const generation = cacheGeneration
  const indexed = await loadTrackBestsIndex(uid)
  if (indexed) return setCache(trackBestsMapCache, uid, indexed, generation)

  // Fallback (indice assente/vecchio): la collection come prima di PIP-441.
  const snap = await trackedGetDocs(query(collection(db, `users/${uid}/trackBests`)), CALLER)
  const entries = (snap.docs || []).map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }))
  return setCache(trackBestsMapCache, uid, collectSupportedTrackBests(entries, uid, generation), generation)
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
