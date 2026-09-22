// PIP-442: cache proiezioni owner persistente su disco (solo Electron, renderer primario).
// Il file vive nel main (`ownerCacheStore.js`, un file per uid, scrittura atomica) e qui si
// decide quando idratare (stessa revisione del documento owner) e quando salvare (debounce
// dopo ogni lettura Firebase andata a buon fine). Senza bridge (web, renderer secondari)
// tutto degrada a "non disponibile" e l'app si comporta come prima.
import {
  buildOwnerCachePayload,
  hasOwnerCacheEntries,
  measureOwnerCacheBytes,
  OWNER_CACHE_MAX_BYTES,
  parseOwnerCachePayload,
  shouldHydrateOwnerCache,
  type OwnerCacheEntries,
  type OwnerCachePayload
} from '~/services/cache/ownerCachePayload'
import { recordFirebaseJournalEvent } from '~/services/monitoring/firebaseOpsJournal'
import { peekOwnerDocument } from '~/repositories/ownerDocumentRepository'
import {
  exportTrackBestsIndexDocument,
  hydrateTrackBestsIndexCache
} from '~/repositories/telemetryProjectionRepository'
import {
  exportRaceCalendarSummary,
  hydrateRaceCalendarSummary
} from '~/repositories/raceCalendarRepository'
import {
  exportSessionListProjectionEntries,
  hydrateSessionListProjectionCache
} from '~/services/sync/sessionListProjectionService'
// PIP-444: il mirror della sync viaggia nello stesso file, con la propria revisione.
import { exportSyncMirror, hydrateSyncMirror } from '~/services/sync/syncMirrorService'

export const OWNER_DISK_CACHE_KEY = 'owner.disk'
export const OWNER_CACHE_SAVE_DEBOUNCE_MS = 1_500

export interface OwnerCacheBridge {
  ownerCacheGet: (uid: string) => Promise<unknown>
  ownerCacheSet: (uid: string, payload: OwnerCachePayload) => Promise<boolean>
  ownerCacheClear: (uid?: string) => Promise<boolean>
}

export type OwnerCacheHydration = 'hydrated' | 'stale' | 'missing' | 'unavailable'

/** Il bridge esiste solo nel renderer primario Electron (preload `primaryCloudOwnerApi`). */
export function resolveOwnerCacheBridge(): OwnerCacheBridge | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridge Electron opzionale
  const api = (window as any).electronAPI
  if (!api || typeof api.ownerCacheGet !== 'function' || typeof api.ownerCacheSet !== 'function' || typeof api.ownerCacheClear !== 'function') {
    return null
  }
  return {
    ownerCacheGet: (uid) => api.ownerCacheGet(uid),
    ownerCacheSet: (uid, payload) => api.ownerCacheSet(uid, payload),
    ownerCacheClear: (uid) => api.ownerCacheClear(uid)
  }
}

function journal(reason: string, extra: { bytes?: number } = {}) {
  recordFirebaseJournalEvent({ kind: 'cache', cache: OWNER_DISK_CACHE_KEY, reason, ...extra })
}

/**
 * Idrata le cache in memoria dal file locale se la revisione coincide con quella del
 * documento owner appena letto. Un file di un altro uid, corrotto o con revisione diversa
 * non viene mai usato; quello con revisione diversa viene anche cancellato.
 */
export async function hydrateOwnerCachesFromDisk(
  uid: string,
  revision: string | null,
  bridge: OwnerCacheBridge | null = resolveOwnerCacheBridge()
): Promise<OwnerCacheHydration> {
  if (!bridge) return 'unavailable'
  let raw: unknown = null
  try {
    raw = await bridge.ownerCacheGet(uid)
  } catch (error) {
    console.warn('[OWNER_CACHE] read failed:', error)
    journal('read-failed')
    return 'missing'
  }
  const payload = parseOwnerCachePayload(raw, uid)
  if (!payload) {
    journal('missing')
    return 'missing'
  }
  if (!shouldHydrateOwnerCache(payload, revision)) {
    journal('stale')
    try { await bridge.ownerCacheClear(uid) } catch { /* il file verra' comunque sovrascritto */ }
    return 'stale'
  }

  let hydrated = 0
  if (payload.entries.trackBestsIndex && hydrateTrackBestsIndexCache(uid, payload.entries.trackBestsIndex.document)) hydrated += 1
  if (payload.entries.raceCalendarIndex && hydrateRaceCalendarSummary(uid, payload.entries.raceCalendarIndex)) hydrated += 1
  if (payload.entries.sessionList && hydrateSessionListProjectionCache(uid, payload.entries.sessionList.entries)) hydrated += 1
  // Il mirror ha la propria revisione: il ciclo di sync la confronta con la lettura fresca.
  if (payload.entries.syncMirror && hydrateSyncMirror(uid, payload.entries.syncMirror)) hydrated += 1
  journal('hydrated', { bytes: hydrated })
  return 'hydrated'
}

/** Raccoglie dalle cache in memoria solo cio' che e' presente ora. */
export function collectOwnerCacheEntries(uid: string): OwnerCacheEntries {
  const entries: OwnerCacheEntries = {}
  const index = exportTrackBestsIndexDocument(uid)
  if (index) entries.trackBestsIndex = { document: index }
  const calendar = exportRaceCalendarSummary(uid)
  if (calendar) entries.raceCalendarIndex = calendar
  const sessionList = exportSessionListProjectionEntries(uid)
  if (sessionList) entries.sessionList = { entries: sessionList }
  const syncMirror = exportSyncMirror(uid)
  if (syncMirror) entries.syncMirror = syncMirror
  return entries
}

export type OwnerCacheSaveOutcome = 'saved' | 'skipped' | 'unavailable' | 'failed'

/**
 * Salva le cache correnti con la revisione del documento owner in memoria. Senza revisione
 * (documento non ancora letto o gia' invalidato da una sync) non si salva: il file avrebbe
 * una revisione che non si potrebbe confrontare.
 */
export async function savePersistentOwnerCache(
  uid: string,
  bridge: OwnerCacheBridge | null = resolveOwnerCacheBridge()
): Promise<OwnerCacheSaveOutcome> {
  if (!bridge) return 'unavailable'
  const revision = peekOwnerDocument(uid)?.revision ?? null
  if (!revision) return 'skipped'
  const payload = buildOwnerCachePayload({ uid, revision, entries: collectOwnerCacheEntries(uid) })
  if (!hasOwnerCacheEntries(payload)) return 'skipped'
  const bytes = measureOwnerCacheBytes(payload)
  if (bytes > OWNER_CACHE_MAX_BYTES) {
    journal('oversized', { bytes })
    return 'skipped'
  }
  try {
    const saved = await bridge.ownerCacheSet(uid, payload)
    journal(saved ? 'saved' : 'rejected', { bytes })
    return saved ? 'saved' : 'failed'
  } catch (error) {
    console.warn('[OWNER_CACHE] save failed:', error)
    journal('save-failed')
    return 'failed'
  }
}

export async function clearPersistentOwnerCache(
  uid?: string,
  bridge: OwnerCacheBridge | null = resolveOwnerCacheBridge()
): Promise<boolean> {
  if (!bridge) return false
  try {
    return await bridge.ownerCacheClear(uid) === true
  } catch (error) {
    console.warn('[OWNER_CACHE] clear failed:', error)
    return false
  }
}

export interface OwnerCacheSaver {
  schedule: () => void
  flush: () => Promise<OwnerCacheSaveOutcome>
  dispose: () => void
}

/** Salvataggio con debounce: piu' letture ravvicinate (Panoramica + Piste) = una scrittura. */
export function createOwnerCacheSaver(options: {
  uid: string
  bridge?: OwnerCacheBridge | null
  debounceMs?: number
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}): OwnerCacheSaver {
  const {
    uid,
    bridge = resolveOwnerCacheBridge(),
    debounceMs = OWNER_CACHE_SAVE_DEBOUNCE_MS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
  } = options
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  async function flush(): Promise<OwnerCacheSaveOutcome> {
    if (timer) clearTimeoutFn(timer)
    timer = null
    if (disposed || !bridge) return 'unavailable'
    return savePersistentOwnerCache(uid, bridge)
  }

  return {
    schedule: () => {
      if (disposed || !bridge) return
      if (timer) clearTimeoutFn(timer)
      timer = setTimeoutFn(() => { void flush() }, debounceMs)
    },
    flush,
    dispose: () => {
      disposed = true
      if (timer) clearTimeoutFn(timer)
      timer = null
    }
  }
}
