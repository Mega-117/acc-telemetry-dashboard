// PIP-442: `users/{uid}` letto una sola volta per avvio e condiviso da tutti i chiamanti
// (provisioning, manutenzione, proiezioni, pager, directory). Il documento porta anche la
// revisione delle proiezioni owner, usata dalla cache persistente e dal controllo
// periodico di revisione. Nessuna scadenza a tempo: chi scrive il documento in locale
// aggiorna la copia (`rememberOwnerDocumentPatch`) o la svuota (`clearOwnerDocumentCache`).
import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc } from '~/composables/useFirebaseTracker'
import { checkFirebaseCacheFreshness, recordFirebaseCacheHit } from '~/services/monitoring/firebaseOpsJournal'
import { ownerDataCacheTtlFor } from '~/services/cache/cachePolicy'
import { extractOwnerRevision, mergeOwnerDocumentPatch, type OwnerDocumentData } from '~/services/cache/ownerRevision'

const DEFAULT_CALLER = 'OwnerDocument'
export const OWNER_DOCUMENT_CACHE_KEY = 'owner.document'

// PIP-444: la revisione vive in un modulo puro (`ownerRevision.ts`) condiviso con il piano di sync.
export { extractOwnerRevision, type OwnerDocumentData }

export interface OwnerDocumentSnapshot {
  uid: string
  exists: boolean
  data: OwnerDocumentData | null
  /** Revisione delle proiezioni owner; `null` se il documento non ne ha ancora una. */
  revision: string | null
  readAt: number
}

export interface LoadOwnerDocumentOptions {
  /** Ignora la copia in memoria (il ciclo sync e il controllo di revisione la vogliono fresca). */
  fresh?: boolean
  /** Etichetta del chiamante nel journal/tracker; di default il repository. */
  caller?: string
}

const cache = new Map<string, OwnerDocumentSnapshot>()
const inFlight = new Map<string, Promise<OwnerDocumentSnapshot>>()
let generation = 0

function toSnapshot(uid: string, exists: boolean, data: OwnerDocumentData | null): OwnerDocumentSnapshot {
  return { uid, exists, data, revision: extractOwnerRevision(data), readAt: Date.now() }
}

export async function loadOwnerDocument(uid: string, options: LoadOwnerDocumentOptions = {}): Promise<OwnerDocumentSnapshot> {
  const { fresh = false, caller = DEFAULT_CALLER } = options
  const cached = cache.get(uid)
  // L'owner corrente non scade (controllo di revisione); il documento di un altro pilota
  // visto dal coach conserva il TTL di 15 minuti. Il journal registra hit/expired.
  if (!fresh && cached && checkFirebaseCacheFreshness(OWNER_DOCUMENT_CACHE_KEY, cached.readAt, ownerDataCacheTtlFor(uid))) {
    return cached
  }

  // Una richiesta gia' in volo serve anche chi chiede `fresh`: e' comunque una lettura nuova.
  const pending = inFlight.get(uid)
  if (pending) {
    recordFirebaseCacheHit(`${OWNER_DOCUMENT_CACHE_KEY}.inFlight`)
    return pending
  }

  const startGeneration = generation
  const request = (async () => {
    const snap = await trackedGetDoc(doc(db, `users/${uid}`), caller)
    const snapshot = toSnapshot(uid, snap.exists(), snap.exists() ? (snap.data() || {}) : null)
    // Un'invalidazione arrivata durante la lettura vince: non ripopolare con dati vecchi.
    if (startGeneration === generation) cache.set(uid, snapshot)
    return snapshot
  })()

  inFlight.set(uid, request)
  try {
    return await request
  } finally {
    if (inFlight.get(uid) === request) inFlight.delete(uid)
  }
}

/** Copia in memoria senza letture; `null` se non ancora letto in questo avvio. */
export function peekOwnerDocument(uid: string): OwnerDocumentSnapshot | null {
  return cache.get(uid) || null
}

/**
 * Chi scrive `users/{uid}` in locale con `merge` aggiorna la copia con gli stessi campi
 * (heartbeat, provisioning, profilo): nessuna rilettura. Un patch su un documento non
 * ancora letto viene ignorato: la prossima lettura porta il documento intero.
 */
export function rememberOwnerDocumentPatch(uid: string, patch: OwnerDocumentData) {
  const cached = cache.get(uid)
  if (!cached || !cached.exists || !cached.data) return
  const data = { ...cached.data, ...patch }
  cache.set(uid, { ...cached, data, revision: extractOwnerRevision(data) })
}

/**
 * PIP-444: la sync ha appena scritto `users/{uid}` con `merge` a partire dalla copia
 * fresca letta nel ciclo: il documento risultante e' noto in locale e diventa la copia
 * condivisa (revisione nuova compresa), senza rileggerlo. Non usare quando nel frattempo
 * altri campi sono stati scritti senza passare da qui (manutenzione): in quel caso si svuota.
 */
export function rememberOwnerDocumentWrite(uid: string, base: OwnerDocumentData | null, patch: OwnerDocumentData) {
  const data = mergeOwnerDocumentPatch(base, patch)
  cache.set(uid, toSnapshot(uid, true, data))
}

export function clearOwnerDocumentCache(uid?: string) {
  generation += 1
  if (uid) cache.delete(uid)
  else cache.clear()
}
