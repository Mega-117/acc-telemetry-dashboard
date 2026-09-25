// PIP-441: indice delle piste in un solo documento.
//
// `users/{uid}/trackBests/{trackId}` resta la fonte di verita' per pista (la sync lo
// aggiorna per delta). Questo modulo costruisce, in modo puro, il documento
// `users/{uid}/trackBestsIndex/v1` che riassume TUTTE le piste, cosi' /piste e
// Panoramica leggono un documento invece di N. Nessun I/O qui: chi scrive decide
// come (batch della sync, rebuild, manutenzione).
import { normalizeTrackId } from '~/services/projections/trackMetadata'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'
import { compactTrackBestsMap, normalizeTrackBestsMap } from '~/services/projections/trackBestsShape'

export const TRACK_BESTS_INDEX_SCHEMA_VERSION = 1
export const TRACK_BESTS_INDEX_DOC_ID = 'v1'
// Firestore rifiuta documenti oltre 1 MiB: sotto questa soglia lasciamo margine per
// i metadati interni e per la codifica dei nomi campo.
export const TRACK_BESTS_INDEX_MAX_BYTES = 900 * 1024

export function trackBestsIndexPath(uid: string): string {
  return `users/${uid}/trackBestsIndex/${TRACK_BESTS_INDEX_DOC_ID}`
}

/**
 * Voce per pista: il documento `trackBests/{trackId}` senza il ledger `syncedSessionIds`
 * e con `bests` in forma compatta (niente null ne bucket vuoti: ~5x piu' piccolo).
 * `expandTrackBestsIndexEntry` restituisce la forma completa ai lettori.
 */
export interface TrackBestsIndexEntry {
  version: number
  bestRulesVersion: number
  trackId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forma compatta di `bests`
  bests: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stessa shape del documento per pista
  activity: any
  lastSessionDate: string | null
}

/** Forma completa (identica al documento per pista) a partire da una voce dell'indice. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- voce letta da Firestore
export function expandTrackBestsIndexEntry(entry: any): any {
  if (!entry || typeof entry !== 'object') return entry
  return { ...entry, bests: normalizeTrackBestsMap(entry.bests) }
}

export interface TrackBestsIndexDocument {
  version: number
  bestRulesVersion?: number
  updatedAt: string
  /**
   * `true`: costruito da un rebuild completo, copre tutte le piste.
   * `false`: disabilitato di proposito (indice troppo grande), i lettori usano la collection.
   * assente: creato da un merge incrementale su documento mancante, parziale: non fidarsi.
   */
  complete?: boolean
  tracks: Record<string, TrackBestsIndexEntry>
}

export type TrackBestsIndexMode = 'none' | 'incremental' | 'full'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documento Firestore
export function buildTrackBestsIndexEntry(trackId: string, trackDoc: any): TrackBestsIndexEntry | null {
  const normalizedTrackId = normalizeTrackId(trackDoc?.trackId || trackId)
  if (!normalizedTrackId || !trackDoc || typeof trackDoc !== 'object') return null
  return sanitizeForFirestore({
    version: Number(trackDoc.version || 0),
    bestRulesVersion: Number(trackDoc.bestRulesVersion || 0),
    trackId: normalizedTrackId,
    bests: trackDoc.bests ? compactTrackBestsMap(trackDoc.bests) : null,
    activity: trackDoc.activity ?? null,
    lastSessionDate: trackDoc.lastSessionDate ?? trackDoc.activity?.lastSessionDate ?? null
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
function toTrackDocRecord(trackDocs: Record<string, any> | Array<{ id: string; data: any }>): Record<string, any> {
  if (Array.isArray(trackDocs)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
    const record: Record<string, any> = {}
    for (const item of trackDocs) record[item.id] = item.data
    return record
  }
  return trackDocs || {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
function buildEntries(trackDocs: Record<string, any>): { tracks: Record<string, TrackBestsIndexEntry>; bestRulesVersion: number } {
  const tracks: Record<string, TrackBestsIndexEntry> = {}
  let bestRulesVersion = 0
  for (const [trackId, trackDoc] of Object.entries(trackDocs)) {
    const entry = buildTrackBestsIndexEntry(trackId, trackDoc)
    if (!entry) continue
    tracks[entry.trackId] = entry
    bestRulesVersion = Math.max(bestRulesVersion, entry.bestRulesVersion)
  }
  return { tracks, bestRulesVersion }
}

/** Indice completo (rebuild): copre tutte le piste passate e viene marcato `complete: true`. */
export function buildTrackBestsIndexDocument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
  trackDocs: Record<string, any> | Array<{ id: string; data: any }>,
  updatedAt: string = new Date().toISOString()
): TrackBestsIndexDocument {
  const { tracks, bestRulesVersion } = buildEntries(toTrackDocRecord(trackDocs))
  return {
    version: TRACK_BESTS_INDEX_SCHEMA_VERSION,
    bestRulesVersion,
    updatedAt,
    complete: true,
    tracks
  }
}

/** Indice disabilitato: i lettori tornano alla collection, la manutenzione non lo considera guasto. */
export function buildDisabledTrackBestsIndexDocument(updatedAt: string = new Date().toISOString()): TrackBestsIndexDocument {
  return {
    version: TRACK_BESTS_INDEX_SCHEMA_VERSION,
    updatedAt,
    complete: false,
    tracks: {}
  }
}

/** Sostituisce (o aggiunge) la voce di una pista in un indice gia' caricato, senza mutarlo. */
export function applyTrackBestsIndexEntry(
  indexDoc: TrackBestsIndexDocument,
  trackId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documento Firestore
  trackDoc: any,
  updatedAt: string = new Date().toISOString()
): TrackBestsIndexDocument {
  const entry = buildTrackBestsIndexEntry(trackId, trackDoc)
  if (!entry) return indexDoc
  return {
    ...indexDoc,
    version: TRACK_BESTS_INDEX_SCHEMA_VERSION,
    bestRulesVersion: Math.max(Number(indexDoc.bestRulesVersion || 0), entry.bestRulesVersion),
    updatedAt,
    tracks: { ...indexDoc.tracks, [entry.trackId]: entry }
  }
}

/**
 * Scrittura incrementale per la sync: solo le piste cambiate. Usa `mergeFields` con il
 * percorso `tracks.{trackId}` cosi' ogni voce viene SOSTITUITA per intero (le voci sono
 * compatte: un merge profondo lascerebbe campi vecchi accanto ai nuovi). Zero letture:
 * se l'indice esiste ed e' completo resta completo; se manca, nasce parziale senza
 * `complete` e i lettori lo ignorano finche' un rebuild non lo completa.
 */
export function buildTrackBestsIndexIncrementalWrite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
  changedTrackDocs: Record<string, any>,
  updatedAt: string = new Date().toISOString()
): { data: { version: number; updatedAt: string; tracks: Record<string, TrackBestsIndexEntry> }; options: { mergeFields: string[] } } | null {
  const { tracks } = buildEntries(changedTrackDocs)
  const trackIds = Object.keys(tracks)
  if (trackIds.length === 0) return null
  return {
    data: { version: TRACK_BESTS_INDEX_SCHEMA_VERSION, updatedAt, tracks },
    options: { mergeFields: ['version', 'updatedAt', ...trackIds.map((trackId) => `tracks.${trackId}`)] }
  }
}

/** Un lettore puo' fidarsi dell'indice solo se e' della versione corrente e completo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documento Firestore
export function isTrackBestsIndexUsable(indexDoc: any): indexDoc is TrackBestsIndexDocument {
  return !!indexDoc
    && Number(indexDoc.version || 0) === TRACK_BESTS_INDEX_SCHEMA_VERSION
    && indexDoc.complete === true
    && !!indexDoc.tracks
    && typeof indexDoc.tracks === 'object'
}

/** Indice scritto di proposito vuoto perche' oltre la soglia: non e' un guasto. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documento Firestore
export function isTrackBestsIndexDisabled(indexDoc: any): boolean {
  return !!indexDoc
    && Number(indexDoc.version || 0) === TRACK_BESTS_INDEX_SCHEMA_VERSION
    && indexDoc.complete === false
}

export function serializedTrackBestsIndexBytes(indexDoc: unknown): number {
  const serialized = JSON.stringify(indexDoc ?? null)
  // TextEncoder e' disponibile in browser e Node >= 11; misura i byte UTF-8 reali.
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(serialized).length : serialized.length
}

export function exceedsTrackBestsIndexSizeGuard(indexDoc: unknown, maxBytes: number = TRACK_BESTS_INDEX_MAX_BYTES): boolean {
  return serializedTrackBestsIndexBytes(indexDoc) > maxBytes
}

/**
 * Coerenza fra indice e collection per la manutenzione 24h: stesse piste e stessi
 * riassunti (schema, regole, sessioni contate, ultima sessione). Un indice
 * disabilitato di proposito e' coerente per definizione.
 */
export function isTrackBestsIndexConsistent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
  indexDoc: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
  trackDocs: Array<{ id: string; data: any }>
): boolean {
  if (isTrackBestsIndexDisabled(indexDoc)) return true
  if (!isTrackBestsIndexUsable(indexDoc)) return false
  const expected = buildEntries(toTrackDocRecord(trackDocs)).tracks
  const expectedIds = Object.keys(expected).sort()
  const actualIds = Object.keys(indexDoc.tracks).sort()
  if (expectedIds.length !== actualIds.length || expectedIds.some((id, index) => id !== actualIds[index])) return false
  return expectedIds.every((trackId) => {
    const entry = indexDoc.tracks[trackId]
    const doc = expected[trackId]
    if (!doc) return false
    return Number(entry?.version || 0) === doc.version
      && Number(entry?.bestRulesVersion || 0) === doc.bestRulesVersion
      && Number(entry?.activity?.sessionCount || 0) === Number(doc.activity?.sessionCount || 0)
      && (entry?.lastSessionDate ?? null) === (doc.lastSessionDate ?? null)
  })
}
