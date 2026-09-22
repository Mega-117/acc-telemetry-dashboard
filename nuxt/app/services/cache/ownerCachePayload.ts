// PIP-442: forma del file locale con le proiezioni owner (logica pura, senza I/O).
// Solo voci in whitelist, mai segreti: indice piste, sommario calendario e lista sessioni,
// cioe' cio' che l'app rilegge a ogni avvio. Il documento `users/{uid}` non viene salvato:
// si legge comunque una volta per avvio ed e' la fonte della revisione.
import type { RaceCalendarIndexDocument } from '~/services/projections/raceCalendarIndexProjectionService'
import type { SessionListProjectionEntry } from '~/services/sync/sessionListProjectionService'
import { parseSyncMirrorEntry, type SyncMirrorEntry } from '~/services/sync/syncMirrorService'

export const OWNER_CACHE_SCHEMA_VERSION = 1
// PIP-444: da 2 a 4 MB. Il file ospita anche il mirror della sync (fino a 1,5 MB: meta
// e pagine toccate della lista sessioni, documento unito delle ultime 6 piste) accanto
// all'indice piste (fino a 900 KB), al sommario calendario e alle voci della lista.
// Lo stesso limite vive in `desktop-app/runtime/ownerCacheStore.js`.
export const OWNER_CACHE_MAX_BYTES = 4 * 1024 * 1024

export interface OwnerCacheEntries {
  /** Documento `trackBestsIndex/v1` cosi' come letto da Firestore. */
  trackBestsIndex?: { document: unknown }
  /** Sommario `raceCalendarIndex/v1` con l'istante di lettura: conserva il TTL del calendario. */
  raceCalendarIndex?: { summary: RaceCalendarIndexDocument; cachedAt: number }
  /** Voci della lista sessioni (`sessionListPages/*`) gia' ordinate. */
  sessionList?: { entries: SessionListProjectionEntry[] }
  /** PIP-444: mirror dei riepiloghi scritti dalla sync, con la propria revisione. */
  syncMirror?: SyncMirrorEntry
}

export interface OwnerCachePayload {
  schemaVersion: typeof OWNER_CACHE_SCHEMA_VERSION
  uid: string
  revision: string
  savedAt: string
  entries: OwnerCacheEntries
}

const ENTRY_KEYS = new Set<keyof OwnerCacheEntries>(['trackBestsIndex', 'raceCalendarIndex', 'sessionList', 'syncMirror'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function buildOwnerCachePayload(input: {
  uid: string
  revision: string
  entries: OwnerCacheEntries
  now?: Date
}): OwnerCachePayload {
  const entries: OwnerCacheEntries = {}
  if (input.entries.trackBestsIndex && isRecord(input.entries.trackBestsIndex.document)) {
    entries.trackBestsIndex = { document: input.entries.trackBestsIndex.document }
  }
  if (input.entries.raceCalendarIndex && isRecord(input.entries.raceCalendarIndex.summary)) {
    entries.raceCalendarIndex = {
      summary: input.entries.raceCalendarIndex.summary,
      cachedAt: Number(input.entries.raceCalendarIndex.cachedAt) || 0
    }
  }
  if (input.entries.sessionList && Array.isArray(input.entries.sessionList.entries)) {
    entries.sessionList = { entries: input.entries.sessionList.entries }
  }
  const syncMirror = input.entries.syncMirror ? parseSyncMirrorEntry(input.entries.syncMirror) : null
  if (syncMirror) entries.syncMirror = syncMirror
  return {
    schemaVersion: OWNER_CACHE_SCHEMA_VERSION,
    uid: input.uid,
    revision: input.revision,
    savedAt: (input.now || new Date()).toISOString(),
    entries
  }
}

export function hasOwnerCacheEntries(payload: Pick<OwnerCachePayload, 'entries'>): boolean {
  return Object.keys(payload.entries).length > 0
}

export function measureOwnerCacheBytes(payload: OwnerCachePayload): number {
  const json = JSON.stringify(payload)
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(json).length : json.length
}

/** `null` se il payload supera il limite: non si salva un file che poi verrebbe scartato. */
export function serializeOwnerCachePayload(payload: OwnerCachePayload, maxBytes = OWNER_CACHE_MAX_BYTES): string | null {
  const json = JSON.stringify(payload)
  const bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(json).length : json.length
  return bytes <= maxBytes ? json : null
}

/**
 * Valida un payload letto dal disco (oggetto o stringa JSON). Fail-closed: schema diverso,
 * uid diverso, revisione assente, voci sconosciute o fuori forma -> `null`.
 */
export function parseOwnerCachePayload(raw: unknown, expectedUid: string, maxBytes = OWNER_CACHE_MAX_BYTES): OwnerCachePayload | null {
  let candidate: unknown = raw
  if (typeof raw === 'string') {
    if (raw.length > maxBytes) return null
    try { candidate = JSON.parse(raw) } catch { return null }
  }
  if (!isRecord(candidate)) return null
  if (candidate.schemaVersion !== OWNER_CACHE_SCHEMA_VERSION) return null
  if (typeof candidate.uid !== 'string' || !candidate.uid || candidate.uid !== expectedUid) return null
  if (typeof candidate.revision !== 'string' || !candidate.revision) return null
  if (typeof candidate.savedAt !== 'string') return null
  if (!isRecord(candidate.entries)) return null

  const entries: OwnerCacheEntries = {}
  for (const [key, value] of Object.entries(candidate.entries)) {
    if (!ENTRY_KEYS.has(key as keyof OwnerCacheEntries)) return null
    if (!isRecord(value)) return null
    if (key === 'trackBestsIndex') {
      if (!isRecord(value.document)) return null
      entries.trackBestsIndex = { document: value.document }
    } else if (key === 'raceCalendarIndex') {
      if (!isRecord(value.summary) || !Number.isFinite(Number(value.cachedAt))) return null
      entries.raceCalendarIndex = { summary: value.summary as unknown as RaceCalendarIndexDocument, cachedAt: Number(value.cachedAt) }
    } else if (key === 'sessionList') {
      if (!Array.isArray(value.entries) || !value.entries.every(isRecord)) return null
      entries.sessionList = { entries: value.entries as unknown as SessionListProjectionEntry[] }
    } else if (key === 'syncMirror') {
      const mirror = parseSyncMirrorEntry(value)
      if (!mirror) return null
      entries.syncMirror = mirror
    }
  }

  return {
    schemaVersion: OWNER_CACHE_SCHEMA_VERSION,
    uid: candidate.uid,
    revision: candidate.revision,
    savedAt: candidate.savedAt,
    entries
  }
}

/** Si idrata solo con la stessa revisione: una revisione nuova o assente rende il file inutile. */
export function shouldHydrateOwnerCache(payload: OwnerCachePayload | null, currentRevision: string | null): payload is OwnerCachePayload {
  return !!payload && !!currentRevision && payload.revision === currentRevision
}
