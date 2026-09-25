// PIP-444 (b): un solo documento per pista.
//
// `users/{uid}/trackProjections/{trackId}` unisce le due proiezioni per pista che la
// sync riscriveva come documenti separati (`trackBests/{trackId}` = best e attivita',
// `trackDetailProjections/{trackId}` = dettaglio pagina pista): una scrittura invece di
// due per ogni ciclo. Le sezioni conservano ESATTAMENTE la forma dei vecchi documenti,
// cosi' i costruttori e i lettori esistenti non cambiano: cambia solo dove vivono.
//
// Schema additivo: i lettori accettano entrambe le forme (documento unito prima, poi i
// vecchi documenti) finche' la manutenzione 24h non ha migrato tutte le piste. Una volta
// che il documento unito esiste i vecchi non vengono piu' scritti; la loro cancellazione
// e' lasciata alla manutenzione (non in questo task). Nessun I/O qui.

export const TRACK_PROJECTION_SCHEMA_VERSION = 1
export const TRACK_PROJECTIONS_COLLECTION = 'trackProjections'
export const LEGACY_TRACK_BESTS_COLLECTION = 'trackBests'
export const LEGACY_TRACK_DETAIL_COLLECTION = 'trackDetailProjections'

export type TrackProjectionSection = 'bests' | 'detail'
export const TRACK_PROJECTION_SECTIONS: readonly TrackProjectionSection[] = ['bests', 'detail']

export interface TrackProjectionDocument {
  schemaVersion: number
  trackId: string
  /** Documento `trackBests/{trackId}` cosi' com'era (version, bests, activity, syncedSessionIds...). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forma del vecchio documento per pista
  bests?: any | null
  /** Documento `trackDetailProjections/{trackId}` cosi' com'era (schemaVersion 2, categories...). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forma del vecchio documento per pista
  detail?: any | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore Timestamp o sentinel serverTimestamp
  updatedAt?: any
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function trackProjectionPath(uid: string, trackId: string): string {
  return `users/${uid}/${TRACK_PROJECTIONS_COLLECTION}/${trackId}`
}

export function legacyTrackBestsPath(uid: string, trackId: string): string {
  return `users/${uid}/${LEGACY_TRACK_BESTS_COLLECTION}/${trackId}`
}

export function legacyTrackDetailPath(uid: string, trackId: string): string {
  return `users/${uid}/${LEGACY_TRACK_DETAIL_COLLECTION}/${trackId}`
}

/**
 * Riconosce il documento unito. I vecchi documenti hanno `version` (trackBests) o
 * `categories` (trackDetailProjections): un documento con quelle chiavi non e' mai unito,
 * anche se avesse `schemaVersion` uguale.
 */
export function isTrackProjectionDocument(value: unknown): value is TrackProjectionDocument {
  if (!isRecord(value)) return false
  if (Number(value.schemaVersion || 0) !== TRACK_PROJECTION_SCHEMA_VERSION) return false
  if ('version' in value || 'categories' in value) return false
  if (value.bests !== undefined && value.bests !== null && !isRecord(value.bests)) return false
  if (value.detail !== undefined && value.detail !== null && !isRecord(value.detail)) return false
  return true
}

/** Sezioni del documento unito; `null` per una sezione assente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forma dei vecchi documenti
export function splitTrackProjectionDocument(value: unknown): { bests: any | null; detail: any | null } {
  if (!isTrackProjectionDocument(value)) return { bests: null, detail: null }
  return {
    bests: isRecord(value.bests) ? value.bests : null,
    detail: isRecord(value.detail) ? value.detail : null
  }
}

/** Documento unito completo (rebuild, migrazione): entrambe le sezioni, anche vuote. */
export function buildTrackProjectionDocument(params: {
  trackId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forma del vecchio documento
  bests: any | null | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forma del vecchio documento
  detail: any | null | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sentinel o ISO
  updatedAt?: any
}): TrackProjectionDocument {
  const document: TrackProjectionDocument = {
    schemaVersion: TRACK_PROJECTION_SCHEMA_VERSION,
    trackId: params.trackId,
    bests: isRecord(params.bests) ? params.bests : null,
    detail: isRecord(params.detail) ? params.detail : null
  }
  if (params.updatedAt !== undefined) document.updatedAt = params.updatedAt
  return document
}

/**
 * Scrittura di una sola sezione con `mergeFields`: la sezione viene SOSTITUITA per intero
 * (nessun merge profondo che lascerebbe campi vecchi), l'altra sezione resta com'e'. Due
 * scritture sullo stesso documento nello stesso piano vengono unite dal piano della sync
 * (`combineProjectionWrites`), cosi' una pista costa un documento anche quando cambiano
 * best e dettaglio insieme.
 */
export function buildTrackProjectionSectionWrite(params: {
  trackId: string
  section: TrackProjectionSection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forma del vecchio documento
  data: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sentinel o ISO
  updatedAt?: any
}): { data: TrackProjectionDocument; options: { mergeFields: string[] } } {
  const data: TrackProjectionDocument = {
    schemaVersion: TRACK_PROJECTION_SCHEMA_VERSION,
    trackId: params.trackId,
    [params.section]: params.data
  }
  const mergeFields = ['schemaVersion', 'trackId', params.section]
  if (params.updatedAt !== undefined) {
    data.updatedAt = params.updatedAt
    mergeFields.push('updatedAt')
  }
  return { data, options: { mergeFields } }
}

export interface TrackProjectionSections {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forma del vecchio documento
  bests: any | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forma del vecchio documento
  detail: any | null
  /** `merged` = documento unito presente; `legacy` = solo vecchi documenti; `none` = nulla. */
  source: 'merged' | 'legacy' | 'none'
}

/**
 * Lettura a doppia forma: prima il documento unito, poi (solo se manca) i vecchi
 * documenti delle sezioni richieste. Un documento presente ma non unito (per esempio un
 * lettore mock che risponde con la stessa forma a ogni percorso) vale come assente.
 */
export async function loadTrackProjectionSections(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore SDK boundary
  db: any
  uid: string
  trackId: string
  sections?: readonly TrackProjectionSection[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore snapshot boundary
  getDocFn: (ref: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore reference factory
  docFn: (db: any, path: string) => any
}): Promise<TrackProjectionSections> {
  const { db, uid, trackId, getDocFn, docFn, sections = TRACK_PROJECTION_SECTIONS } = params
  const mergedSnap = await getDocFn(docFn(db, trackProjectionPath(uid, trackId)))
  const merged = mergedSnap?.exists?.() ? mergedSnap.data() : null
  if (isTrackProjectionDocument(merged)) {
    return { ...splitTrackProjectionDocument(merged), source: 'merged' }
  }

  const result: TrackProjectionSections = { bests: null, detail: null, source: 'none' }
  if (sections.includes('bests')) {
    const snap = await getDocFn(docFn(db, legacyTrackBestsPath(uid, trackId)))
    if (snap?.exists?.()) {
      result.bests = snap.data() ?? null
      result.source = 'legacy'
    }
  }
  if (sections.includes('detail')) {
    const snap = await getDocFn(docFn(db, legacyTrackDetailPath(uid, trackId)))
    if (snap?.exists?.()) {
      result.detail = snap.data() ?? null
      result.source = 'legacy'
    }
  }
  return result
}

/**
 * Unione per audit/verifica: per ogni pista la sezione del documento unito quando esiste,
 * altrimenti il vecchio documento. `unmerged` = piste con un vecchio documento ma senza
 * documento unito: la manutenzione le migra (una scrittura per pista, nessun rebuild).
 */
export function collectTrackProjectionSections(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
  merged: Array<{ id: string; data: any }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
  legacyBests: Array<{ id: string; data: any }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
  legacyDetail: Array<{ id: string; data: any }>
}): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
  bests: Map<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
  detail: Map<string, any>
  mergedTrackIds: string[]
  unmerged: string[]
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
  const bests = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti Firestore
  const detail = new Map<string, any>()
  const mergedIds = new Set<string>()
  for (const { id, data } of params.merged) {
    if (!isTrackProjectionDocument(data)) continue
    mergedIds.add(id)
    const sections = splitTrackProjectionDocument(data)
    if (sections.bests) bests.set(id, sections.bests)
    if (sections.detail) detail.set(id, sections.detail)
  }
  const unmerged = new Set<string>()
  for (const { id, data } of params.legacyBests) {
    if (mergedIds.has(id)) continue
    unmerged.add(id)
    if (!bests.has(id)) bests.set(id, data)
  }
  for (const { id, data } of params.legacyDetail) {
    if (mergedIds.has(id)) continue
    unmerged.add(id)
    if (!detail.has(id)) detail.set(id, data)
  }
  return {
    bests,
    detail,
    mergedTrackIds: Array.from(mergedIds).sort(),
    unmerged: Array.from(unmerged).sort()
  }
}
