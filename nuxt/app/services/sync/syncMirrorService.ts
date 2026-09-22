// PIP-444 (a): mirror locale dei riepiloghi owner che il piano di sync legge prima del batch.
//
// Il client e' quasi sempre l'unico scrittore dei propri riepiloghi: rileggerli dal cloud
// a ogni ciclo (meta e pagina della lista sessioni, documento per pista) costava 5-7
// letture per confermare cio' che questo stesso client aveva scritto. Il mirror conserva
// quei documenti cosi' come sono stati scritti, con la revisione owner
// (`users/{uid}.sessionIndex.updatedAt`, la stessa di PIP-442) a cui corrispondono.
//
// Ciclo: si legge `users/{uid}` fresco (l'unica lettura); se la revisione coincide con
// quella del mirror i documenti presenti vengono serviti da qui; quelli mancanti si
// leggono dal cloud (fallback per documento, mai tutto-o-niente). Dopo il commit il
// mirror viene ricostruito dai documenti scritti (il piano ha il contenuto completo).
// Un commit fallito lo invalida. Nessun I/O qui: il chiamante decide cosa leggere,
// cosa salvare su disco (payload PIP-442) e cosa registrare nel journal.

export const SYNC_MIRROR_SCHEMA_VERSION = 1
/** Piste conservate (le piu' recenti): un pilota gira su poche piste per volta. */
export const SYNC_MIRROR_MAX_TRACKS = 6
/** Limite del mirror serializzato: il file owner-cache lo contiene insieme alle altre voci. */
export const SYNC_MIRROR_MAX_BYTES = 1_572_864
export const SYNC_MIRROR_CACHE_KEY = 'sync.mirror'

/** Collection mirrorate, per percorso relativo a `users/{uid}/`. Non `users/{uid}` (letto fresco). */
const MIRRORED_COLLECTIONS = new Set([
  'sessionListMeta',
  'sessionListPages',
  'trackProjections',
  'trackBests',
  'trackDetailProjections'
])
const TRACK_COLLECTIONS = new Set(['trackProjections', 'trackBests', 'trackDetailProjections'])

export type SyncMirrorDocument = Record<string, unknown>

export interface SyncMirrorEntry {
  schemaVersion: typeof SYNC_MIRROR_SCHEMA_VERSION
  /** Revisione owner a cui i documenti corrispondono. */
  revision: string
  /** Percorso relativo (`sessionListMeta/v1`, `trackProjections/monza`) -> documento; `null` = assente nel cloud. */
  docs: Record<string, SyncMirrorDocument | null>
  /** Piste dalla piu' recente alla meno recente (bound `SYNC_MIRROR_MAX_TRACKS`). */
  trackOrder: string[]
  updatedAt: string
}

export interface SyncMirrorWrite {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- riferimento Firestore o percorso
  ref: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documento del piano
  data: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opzioni Firestore
  options?: any
}

export interface SyncMirrorPath {
  relative: string
  collection: string
  trackId: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function refPath(ref: unknown): string {
  if (typeof ref === 'string') return ref
  const path = (ref as { path?: unknown } | null)?.path
  return typeof path === 'string' ? path : String(ref)
}

/** Percorso mirrorabile di questo owner, oppure `null` (documento fuori dal mirror). */
export function classifySyncMirrorPath(uid: string, path: string): SyncMirrorPath | null {
  const prefix = `users/${uid}/`
  if (!path.startsWith(prefix)) return null
  const relative = path.slice(prefix.length)
  const [collection, docId, ...rest] = relative.split('/')
  if (!collection || !docId || rest.length > 0 || !MIRRORED_COLLECTIONS.has(collection)) return null
  return { relative, collection, trackId: TRACK_COLLECTIONS.has(collection) ? docId : null }
}

/**
 * Copia serializzabile di un documento: i sentinel Firestore (`serverTimestamp()`) e le
 * istanze non semplici (Timestamp) vengono tolti, non indovinati. I costruttori del piano
 * non dipendono da quei campi (`updatedAt`, `lastUpdated`): li riscrivono a ogni ciclo.
 */
export function stripFirestoreSentinels<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((item) => stripFirestoreSentinels(item) ?? null) as T
  if (value instanceof Date) return value.toISOString() as T
  if (typeof value !== 'object') return value
  if (!isPlainObject(value)) return undefined as T
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    const stripped = stripFirestoreSentinels(item)
    if (stripped !== undefined) output[key] = stripped
  }
  return output as T
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const current = output[key]
    output[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value
  }
  return output
}

function setFieldPath(target: Record<string, unknown>, source: Record<string, unknown>, fieldPath: string) {
  const keys = fieldPath.split('.')
  let from: unknown = source
  let into = target
  for (const key of keys.slice(0, -1)) {
    from = isRecord(from) ? from[key] : undefined
    const next = into[key]
    into[key] = isPlainObject(next) ? { ...next } : {}
    into = into[key] as Record<string, unknown>
  }
  const last = keys[keys.length - 1]!
  const value = isRecord(from) ? from[last] : undefined
  if (value === undefined) delete into[last]
  else into[last] = value
}

/**
 * Documento risultante da una scrittura del piano, con la semantica di Firestore:
 * set = sostituzione; `mergeFields` = solo quei campi sostituiti; `merge: true` = merge
 * profondo delle mappe. Con merge su un documento di cui non si conosce lo stato
 * (`existing === undefined`) il risultato non e' conoscibile: `undefined`, e il mirror
 * non lo conserva. `complete` dichiara che la scrittura porta il documento intero
 * (rebuild da storico): allora anche un merge vale come sostituzione.
 */
export function applySyncMirrorWrite(
  existing: SyncMirrorDocument | null | undefined,
  write: Pick<SyncMirrorWrite, 'data' | 'options'>,
  complete = false
): SyncMirrorDocument | undefined {
  const data = stripFirestoreSentinels(write.data)
  if (!isRecord(data)) return undefined
  const mergeFields: unknown = write.options?.mergeFields
  const merge = write.options?.merge === true
  if (!Array.isArray(mergeFields) && !merge) return data
  if (complete) return data
  if (existing === undefined) return undefined
  const base = existing ?? {}
  if (Array.isArray(mergeFields)) {
    const output: Record<string, unknown> = { ...base }
    for (const fieldPath of mergeFields) {
      if (typeof fieldPath === 'string') setFieldPath(output, data, fieldPath)
    }
    return output
  }
  return deepMerge(base, data)
}

export function measureSyncMirrorBytes(entry: SyncMirrorEntry): number {
  const json = JSON.stringify(entry)
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(json).length : json.length
}

function dropTrack(docs: Record<string, SyncMirrorDocument | null>, trackId: string) {
  for (const collection of TRACK_COLLECTIONS) delete docs[`${collection}/${trackId}`]
}

/**
 * Mirror per il ciclo successivo, dai documenti letti (`cycleDocs`, `null` = assente) e
 * scritti in questo ciclo. Parte dal mirror precedente solo se era alla stessa revisione
 * letta dal cloud. Piste oltre il limite o byte oltre il tetto: si scartano le piste piu'
 * vecchie; se non basta, nessun mirror (`null`): il ciclo dopo rilegge, mai un mirror parziale
 * spacciato per completo.
 */
export function buildNextSyncMirror(params: {
  uid: string
  previous: SyncMirrorEntry | null
  /** Revisione letta da `users/{uid}` all'inizio del ciclo. */
  readRevision: string | null
  /** Revisione del documento owner scritto nel piano; assente se il piano non lo ha toccato. */
  writtenRevision: string | null
  cycleDocs: Map<string, SyncMirrorDocument | null>
  writes: SyncMirrorWrite[]
  /** Il piano riscrive i documenti interi (rebuild da storico). */
  complete?: boolean
  now?: Date
  maxTracks?: number
  maxBytes?: number
}): SyncMirrorEntry | null {
  const {
    uid, previous, readRevision, writtenRevision, cycleDocs, writes,
    complete = false, now = new Date(), maxTracks = SYNC_MIRROR_MAX_TRACKS, maxBytes = SYNC_MIRROR_MAX_BYTES
  } = params
  const revision = writtenRevision || readRevision
  if (!revision) return null

  const reusable = !!previous && !!readRevision && previous.revision === readRevision
  const docs: Record<string, SyncMirrorDocument | null> = reusable ? { ...previous!.docs } : {}
  const touched: string[] = []
  const touch = (trackId: string | null) => { if (trackId && !touched.includes(trackId)) touched.push(trackId) }

  for (const [relative, data] of cycleDocs) {
    const classified = classifySyncMirrorPath(uid, `users/${uid}/${relative}`)
    if (!classified) continue
    docs[relative] = data === null ? null : stripFirestoreSentinels(data)
    touch(classified.trackId)
  }
  for (const write of writes) {
    const classified = classifySyncMirrorPath(uid, refPath(write.ref))
    if (!classified) continue
    const next = applySyncMirrorWrite(docs[classified.relative], write, complete)
    if (next === undefined) delete docs[classified.relative]
    else docs[classified.relative] = next
    touch(classified.trackId)
  }

  const previousOrder = reusable ? previous!.trackOrder : []
  const trackOrder = [...touched, ...previousOrder.filter((trackId) => !touched.includes(trackId))]
  // Piste presenti nei documenti ma non nell'ordine (mirror idratato da un file vecchio): in coda.
  for (const relative of Object.keys(docs)) {
    const trackId = classifySyncMirrorPath(uid, `users/${uid}/${relative}`)?.trackId
    if (trackId && !trackOrder.includes(trackId)) trackOrder.push(trackId)
  }
  while (trackOrder.length > maxTracks) dropTrack(docs, trackOrder.pop()!)

  const entry: SyncMirrorEntry = {
    schemaVersion: SYNC_MIRROR_SCHEMA_VERSION,
    revision,
    docs,
    trackOrder,
    updatedAt: now.toISOString()
  }
  while (measureSyncMirrorBytes(entry) > maxBytes) {
    if (trackOrder.length === 0) return null
    dropTrack(docs, trackOrder.pop()!)
  }
  return entry
}

/** Validazione fail-closed di una voce letta dal disco. */
export function parseSyncMirrorEntry(raw: unknown): SyncMirrorEntry | null {
  if (!isRecord(raw)) return null
  if (raw.schemaVersion !== SYNC_MIRROR_SCHEMA_VERSION) return null
  if (typeof raw.revision !== 'string' || !raw.revision) return null
  if (typeof raw.updatedAt !== 'string') return null
  if (!isRecord(raw.docs)) return null
  if (!Array.isArray(raw.trackOrder) || !raw.trackOrder.every((item) => typeof item === 'string')) return null
  const docs: Record<string, SyncMirrorDocument | null> = {}
  for (const [relative, value] of Object.entries(raw.docs)) {
    if (!classifySyncMirrorPath('x', `users/x/${relative}`)) return null
    if (value !== null && !isRecord(value)) return null
    docs[relative] = value as SyncMirrorDocument | null
  }
  return {
    schemaVersion: SYNC_MIRROR_SCHEMA_VERSION,
    revision: raw.revision,
    docs,
    trackOrder: raw.trackOrder as string[],
    updatedAt: raw.updatedAt
  }
}

// ---------------------------------------------------------------------------
// Copia in memoria per uid (nessun I/O): la sync la pubblica dopo il commit, la cache
// persistente la salva/idrata, chi riscrive i riepiloghi fuori dalla sync la invalida.
// ---------------------------------------------------------------------------

const mirrors = new Map<string, SyncMirrorEntry>()

export function getSyncMirror(uid: string): SyncMirrorEntry | null {
  return mirrors.get(uid) || null
}

export function setSyncMirror(uid: string, entry: SyncMirrorEntry | null) {
  if (entry) mirrors.set(uid, entry)
  else mirrors.delete(uid)
}

/** Riepiloghi riscritti fuori dal piano di sync (manutenzione, rebuild, refresh manuale, logout). */
export function invalidateSyncMirror(uid?: string) {
  if (uid) mirrors.delete(uid)
  else mirrors.clear()
}

/** Voce da salvare nel file owner-cache; `null` se non c'e' un mirror per questo uid. */
export function exportSyncMirror(uid: string): SyncMirrorEntry | null {
  return mirrors.get(uid) || null
}

/** Idratazione dal file (PIP-442). `false` se la voce non e' valida. */
export function hydrateSyncMirror(uid: string, raw: unknown): boolean {
  const entry = parseSyncMirrorEntry(raw)
  if (!entry) return false
  mirrors.set(uid, entry)
  return true
}

// ---------------------------------------------------------------------------
// Lettore di ciclo: serve `users/{uid}` dalla lettura fresca, i riepiloghi dal mirror
// (stessa revisione) e ricorda ogni documento letto per la ricostruzione finale.
// ---------------------------------------------------------------------------

export interface SyncMirrorCycleStats {
  /** Documenti serviti dal mirror. */
  mirrorHits: number
  /** Documenti richiesti mentre il mirror era usabile ma non li aveva. */
  mirrorMisses: number
  /** Letture Firestore eseguite. */
  freshReads: number
  /** Letture di `users/{uid}` servite dalla copia fresca del ciclo. */
  ownerDocumentHits: number
}

export interface SyncMirrorCycle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore snapshot boundary
  getDocFn: (ref: any) => Promise<any>
  cycleDocs: Map<string, SyncMirrorDocument | null>
  stats: SyncMirrorCycleStats
  /** `hit` = mirror alla stessa revisione; `stale` = revisione diversa; `cold` = nessun mirror. */
  state: 'hit' | 'stale' | 'cold'
}

function snapshot(data: SyncMirrorDocument | null) {
  return { exists: () => data !== null, data: () => data }
}

function cloneDocument(data: SyncMirrorDocument | null): SyncMirrorDocument | null {
  return data === null ? null : JSON.parse(JSON.stringify(data))
}

export function createSyncMirrorCycle(params: {
  uid: string
  mirror: SyncMirrorEntry | null
  ownerDocument: { exists: boolean; data: Record<string, unknown> | null; revision: string | null } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore snapshot boundary
  getDocFn: (ref: any) => Promise<any>
}): SyncMirrorCycle {
  const { uid, mirror, ownerDocument, getDocFn } = params
  const cycleDocs = new Map<string, SyncMirrorDocument | null>()
  const stats: SyncMirrorCycleStats = { mirrorHits: 0, mirrorMisses: 0, freshReads: 0, ownerDocumentHits: 0 }
  const usable = !!mirror && !!ownerDocument?.revision && mirror.revision === ownerDocument.revision
  const state: SyncMirrorCycle['state'] = usable ? 'hit' : (mirror ? 'stale' : 'cold')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore snapshot boundary
  async function read(ref: any): Promise<any> {
    const path = refPath(ref)
    if (ownerDocument && path === `users/${uid}`) {
      stats.ownerDocumentHits += 1
      return snapshot(ownerDocument.exists ? cloneDocument(ownerDocument.data || {}) : null)
    }
    const classified = classifySyncMirrorPath(uid, path)
    if (classified) {
      if (cycleDocs.has(classified.relative)) {
        return snapshot(cloneDocument(cycleDocs.get(classified.relative)!))
      }
      if (usable) {
        const mirrored = mirror!.docs[classified.relative]
        if (mirrored !== undefined) {
          stats.mirrorHits += 1
          const data = cloneDocument(mirrored)
          cycleDocs.set(classified.relative, data)
          return snapshot(cloneDocument(data))
        }
        stats.mirrorMisses += 1
      }
    }
    stats.freshReads += 1
    const snap = await getDocFn(ref)
    if (classified) {
      cycleDocs.set(classified.relative, snap?.exists?.() ? stripFirestoreSentinels(snap.data() ?? {}) : null)
    }
    return snap
  }

  return { getDocFn: read, cycleDocs, stats, state }
}
