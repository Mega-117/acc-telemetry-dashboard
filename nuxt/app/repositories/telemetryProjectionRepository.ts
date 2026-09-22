import { collection, doc, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedGetDocs } from '~/composables/useFirebaseTracker'
import { normalizeTrackId } from '~/services/projections/trackMetadata'
import {
  TRACK_DETAIL_PROJECTION_SCHEMA_VERSION,
  type TrackDetailProjectionDocument
} from '~/types/trackProjections'
import { isSupportedTrackBestProjection } from '~/services/projections/trackBestProjectionGuard'
import { checkFirebaseCacheFreshness, recordFirebaseJournalEvent } from '~/services/monitoring/firebaseOpsJournal'
import { ownerDataCacheTtlFor } from '~/services/cache/cachePolicy'
import { notifyOwnerCacheChanged } from '~/services/cache/ownerCacheSignals'
import { loadOwnerDocument } from '~/repositories/ownerDocumentRepository'
import { buildTrackBestsIndexDocument, expandTrackBestsIndexEntry, isTrackBestsIndexUsable, trackBestsIndexPath } from '~/services/sync/trackBestsIndexProjectionService'
// PIP-444: lettura a doppia forma, prima il documento unito per pista poi i vecchi documenti.
import {
  TRACK_PROJECTIONS_COLLECTION,
  isTrackProjectionDocument,
  splitTrackProjectionDocument,
  trackProjectionPath
} from '~/services/sync/trackProjectionDocument'

let cacheGeneration = 0

const CALLER = 'TelemetryProjectionRepository'

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

/** Indice piste in cache: il documento originale (per il salvataggio su disco) e la mappa espansa. */
type TrackBestsIndexEntry = { document: unknown; map: TrackBestDocumentMap }

const trackBestCache = new Map<string, CacheEntry<TrackBestDocument | null>>()
const trackBestsMapCache = new Map<string, CacheEntry<TrackBestDocumentMap>>()
// PIP-441: indice piste (`trackBestsIndex/v1`) gia' letto; `null` = indice assente o non
// usabile, ricordato per non rileggerlo ad ogni pista entro l'avvio.
const trackBestsIndexCache = new Map<string, CacheEntry<TrackBestsIndexEntry | null>>()
const trackBestsIndexInFlight = new Map<string, Promise<TrackBestDocumentMap | null>>()
const trackBestInFlight = new Map<string, Promise<TrackBestDocument | null>>()
const trackDetailProjectionCache = new Map<string, CacheEntry<TrackDetailProjectionDocument | null>>()

// PIP-442: l'owner corrente non scade a tempo (controllo di revisione); i dati di un altro
// pilota visti dal coach conservano il TTL di 15 minuti.
function isFresh<T>(entry: CacheEntry<T> | undefined, cacheName: string, uid: string): entry is CacheEntry<T> {
  return checkFirebaseCacheFreshness(`projection.${cacheName}`, entry?.cachedAt, ownerDataCacheTtlFor(uid))
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, generation: number): T {
  if (generation === cacheGeneration) cache.set(key, { cachedAt: Date.now(), value })
  return value
}

export function clearTelemetryProjectionRepositoryCache(uid?: string) {
  cacheGeneration += 1
  trackBestsIndexInFlight.clear()
  trackBestInFlight.clear()
  if (!uid) {
    trackBestCache.clear()
    trackBestsMapCache.clear()
    trackBestsIndexCache.clear()
    trackDetailProjectionCache.clear()
    return
  }

  trackBestsMapCache.delete(uid)
  trackBestsIndexCache.delete(uid)
  for (const key of Array.from(trackBestCache.keys())) {
    if (key.startsWith(`${uid}:`)) trackBestCache.delete(key)
  }
  for (const key of Array.from(trackDetailProjectionCache.keys())) {
    if (key.startsWith(`${uid}:`)) trackDetailProjectionCache.delete(key)
  }
}

// PIP-442: `users/{uid}` arriva dal documento owner condiviso (una lettura per avvio).
export async function loadUserProjection(uid: string): Promise<UserProjectionDocument | null> {
  const snapshot = await loadOwnerDocument(uid, { caller: CALLER })
  if (!snapshot.exists) return null
  const data = snapshot.data || {}
  return {
    stats: data.stats || null,
    sessionIndex: data.sessionIndex || null
  }
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

/** Mette in cache un documento indice (da Firebase o dal disco); `null` se non usabile. */
function rememberTrackBestsIndex(uid: string, indexDoc: unknown, generation: number): TrackBestDocumentMap | null {
  if (!isTrackBestsIndexUsable(indexDoc)) {
    setCache(trackBestsIndexCache, uid, null, generation)
    return null
  }
  // Le voci sono compatte: riespanse alla forma del documento per pista.
  const entries = Object.entries(indexDoc.tracks).map(([id, data]) => ({ id, data: expandTrackBestsIndexEntry(data) }))
  const map = collectSupportedTrackBests(entries, uid, generation)
  setCache(trackBestsIndexCache, uid, { document: indexDoc, map }, generation)
  return map
}

/**
 * PIP-442: idrata l'indice piste dal file locale (stessa revisione del documento owner):
 * le prossime letture di /piste, Panoramica e useTrackBests costano 0. Ritorna `false`
 * se il documento non e' usabile (si torna alla lettura normale).
 */
export function hydrateTrackBestsIndexCache(uid: string, indexDoc: unknown): boolean {
  const map = rememberTrackBestsIndex(uid, indexDoc, cacheGeneration)
  if (!map) {
    trackBestsIndexCache.delete(uid)
    return false
  }
  recordFirebaseJournalEvent({ kind: 'cache', cache: 'projection.trackBestsIndex', reason: 'disk' })
  return true
}

/** Documento indice attualmente in cache, da salvare su disco; `null` se assente o non usabile. */
export function exportTrackBestsIndexDocument(uid: string): unknown | null {
  return trackBestsIndexCache.get(uid)?.value?.document ?? null
}

/**
 * Una sola lettura per tutte le piste. Ritorna `null` se l'indice manca o ha una
 * versione vecchia: in quel caso il chiamante decide il fallback (collection per la
 * mappa completa, documento singolo per una pista) e la manutenzione lo ricostruisce.
 */
async function loadTrackBestsIndex(uid: string): Promise<TrackBestDocumentMap | null> {
  const cached = trackBestsIndexCache.get(uid)
  if (isFresh(cached, 'trackBestsIndex', uid)) return cached.value?.map ?? null

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
    const map = rememberTrackBestsIndex(uid, indexDoc, generation)
    // PIP-442: l'indice appena letto da Firebase merita il salvataggio su disco.
    if (map && generation === cacheGeneration) notifyOwnerCacheChanged(uid)
    return map
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
  if (isFresh(cached, 'trackBest', uid)) return cached.value

  const pending = trackBestInFlight.get(cacheKey)
  if (pending) return pending
  const request = readTrackBest(uid, normalizedTrackId, cacheKey)
  trackBestInFlight.set(cacheKey, request)
  try { return await request } finally {
    if (trackBestInFlight.get(cacheKey) === request) trackBestInFlight.delete(cacheKey)
  }
}

async function readTrackBest(uid: string, normalizedTrackId: string, cacheKey: string): Promise<TrackBestDocument | null> {

  // PIP-441: l'indice serve tutte le piste con una lettura condivisa (0 letture se gia' in cache).
  // La generazione va presa prima dell'await: un'invalidazione arrivata nel frattempo
  // non deve essere ripopolata con dati letti prima.
  const generation = cacheGeneration
  const indexed = await loadTrackBestsIndex(uid)
  if (indexed) return setCache(trackBestCache, cacheKey, indexed[normalizedTrackId] ?? null, generation)

  // PIP-444: documento unito per pista; il vecchio `trackBests/{trackId}` solo se manca.
  const merged = await loadMergedTrackProjection(uid, normalizedTrackId, generation)
  if (merged) return setCache(trackBestCache, cacheKey, isSupportedTrackBestProjection(merged.bests) ? merged.bests : null, generation)

  const snap = await trackedGetDoc(doc(db, `users/${uid}/trackBests/${normalizedTrackId}`), CALLER)
  if (!snap.exists()) return setCache(trackBestCache, cacheKey, null, generation)
  const data = snap.data() || null
  return setCache(trackBestCache, cacheKey, isSupportedTrackBestProjection(data) ? data : null, generation)
}

export async function loadTrackBestsMap(uid: string): Promise<TrackBestDocumentMap> {
  const cached = trackBestsMapCache.get(uid)
  if (isFresh(cached, 'trackBestsMap', uid)) return cached.value

  const generation = cacheGeneration
  const indexed = await loadTrackBestsIndex(uid)
  if (indexed) return setCache(trackBestsMapCache, uid, indexed, generation)

  // La migrazione e' per pista: una collection unita non vuota non implica che
  // tutte le piste siano migrate. Unire i due formati, preferendo quello nuovo.
  const mergedSnap = await trackedGetDocs(query(collection(db, `users/${uid}/${TRACK_PROJECTIONS_COLLECTION}`)), CALLER)
  const mergedEntries = (mergedSnap.docs || [])
    .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }))
    .filter((entry) => isTrackProjectionDocument(entry.data) && !!splitTrackProjectionDocument(entry.data).bests)
    .map((entry) => ({ id: entry.id, data: splitTrackProjectionDocument(entry.data).bests }))
  const snap = await trackedGetDocs(query(collection(db, `users/${uid}/trackBests`)), CALLER)
  const entries = (snap.docs || []).map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }))
  const map = collectSupportedTrackBests([...entries, ...mergedEntries], uid, generation)
  if (generation === cacheGeneration) {
    // La query completa e' gia' stata pagata: riusarla anche dopo il riavvio,
    // mentre la manutenzione prepara l'indice cloud. Nessuna scrittura remota.
    rememberTrackBestsIndex(uid, buildTrackBestsIndexDocument(map), generation)
    notifyOwnerCacheChanged(uid)
  }
  return setCache(trackBestsMapCache, uid, map, generation)
}

/**
 * PIP-444: una lettura del documento unito serve sia il dettaglio pista sia i best (messi
 * in cache insieme). `null` = documento assente o non unito: il chiamante usa la forma vecchia.
 */
async function loadMergedTrackProjection(
  uid: string,
  normalizedTrackId: string,
  generation: number
): Promise<{ bests: TrackBestDocument | null; detail: TrackDetailProjectionDocument | null } | null> {
  const snap = await trackedGetDoc(doc(db, trackProjectionPath(uid, normalizedTrackId)), CALLER)
  const data = snap.exists() ? snap.data() : null
  if (!isTrackProjectionDocument(data)) return null
  const sections = splitTrackProjectionDocument(data)
  const detail = sections.detail && Number(sections.detail.schemaVersion || 0) === TRACK_DETAIL_PROJECTION_SCHEMA_VERSION
    ? sections.detail as TrackDetailProjectionDocument
    : null
  if (sections.bests && isSupportedTrackBestProjection(sections.bests)) {
    setCache(trackBestCache, `${uid}:${normalizedTrackId}`, sections.bests, generation)
  }
  setCache(trackDetailProjectionCache, `${uid}:${normalizedTrackId}`, detail, generation)
  return { bests: sections.bests, detail }
}

export async function loadTrackDetailProjectionDoc(
  uid: string,
  trackId: string
): Promise<TrackDetailProjectionDocument | null> {
  const normalizedTrackId = normalizeTrackId(trackId)
  if (!normalizedTrackId) return null
  const cacheKey = `${uid}:${normalizedTrackId}`
  const cached = trackDetailProjectionCache.get(cacheKey)
  if (isFresh(cached, 'trackDetail', uid)) return cached.value

  const generation = cacheGeneration
  // PIP-444: documento unito per pista; il vecchio `trackDetailProjections/{trackId}` solo se manca.
  const merged = await loadMergedTrackProjection(uid, normalizedTrackId, generation)
  if (merged) return merged.detail

  const snap = await trackedGetDoc(doc(db, `users/${uid}/trackDetailProjections/${normalizedTrackId}`), CALLER)
  if (!snap.exists()) return setCache(trackDetailProjectionCache, cacheKey, null, generation)
  const data = snap.data() || {}
  if (Number(data.schemaVersion || 0) !== TRACK_DETAIL_PROJECTION_SCHEMA_VERSION) {
    return setCache(trackDetailProjectionCache, cacheKey, null, generation)
  }
  return setCache(trackDetailProjectionCache, cacheKey, data as TrackDetailProjectionDocument, generation)
}
