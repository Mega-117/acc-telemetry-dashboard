// PIP-442: ciclo di vita delle cache owner per la shell.
// - `prepare(uid)` prima di mostrare la dashboard: legge (o riusa) `users/{uid}`, idrata le
//   cache dal disco se la revisione coincide, avvia il salvataggio debounced e il controllo
//   di revisione ogni 15 minuti.
// - il watch su uid/canEnterApp chiude tutto in modo fail-closed: logout o cambio account
//   svuotano memoria e file dell'uid precedente prima che il nuovo possa leggere qualcosa.
import { onScopeDispose, watch, type Ref } from 'vue'
import { clearOwnerDocumentCache, loadOwnerDocument, peekOwnerDocument } from '~/repositories/ownerDocumentRepository'
import { onOwnerCacheChanged } from '~/services/cache/ownerCacheSignals'
import { startOwnerRevisionWatch, type OwnerRevisionWatcher } from '~/services/cache/ownerRevisionWatcher'
import {
  clearPersistentOwnerCache,
  createOwnerCacheSaver,
  hydrateOwnerCachesFromDisk,
  type OwnerCacheBridge,
  type OwnerCacheHydration,
  type OwnerCacheSaver,
  resolveOwnerCacheBridge
} from '~/services/cache/persistentOwnerCache'
import { invalidateTelemetryCaches } from '~/services/cache/telemetryCacheInvalidationService'
import { setCacheOwnerUid } from '~/services/cache/cachePolicy'

/** Il disco e' locale: oltre questo tempo si entra comunque, senza idratazione. */
export const OWNER_CACHE_PREPARE_TIMEOUT_MS = 2_000

type OwnerCacheSession = {
  uid: string
  saver: OwnerCacheSaver
  watcher: OwnerRevisionWatcher
  unsubscribe: () => void
}

export interface OwnerCacheLifecycle {
  /** Idempotente per uid: la seconda chiamata riusa la sessione gia' avviata. */
  prepare: (uid: string) => Promise<OwnerCacheHydration | 'skipped'>
  /** Chiude la sessione corrente (memoria + file dell'uid). */
  release: (reason: 'logout' | 'account-change' | 'dispose') => Promise<void>
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then((value) => { clearTimeout(timer); resolve(value) }, () => { clearTimeout(timer); resolve(fallback) })
  })
}

export function useOwnerCacheLifecycle(options: {
  currentUser: Ref<{ uid: string } | null>
  canEnterApp: Ref<boolean>
  bridge?: OwnerCacheBridge | null
}): OwnerCacheLifecycle {
  const bridge = options.bridge === undefined ? resolveOwnerCacheBridge() : options.bridge
  let session: OwnerCacheSession | null = null
  let preparing: { uid: string; promise: Promise<OwnerCacheHydration | 'skipped'> } | null = null
  let revision = 0

  function isActive(uid: string, startRevision: number) {
    return revision === startRevision && options.currentUser.value?.uid === uid && options.canEnterApp.value
  }

  async function release(reason: 'logout' | 'account-change' | 'dispose'): Promise<void> {
    revision += 1
    preparing = null
    const current = session
    session = null
    setCacheOwnerUid(null)
    if (!current) return
    current.watcher.stop()
    current.saver.dispose()
    current.unsubscribe()
    // Fail-closed: niente della sessione precedente puo' servire l'account successivo.
    invalidateTelemetryCaches({ uid: current.uid, scope: 'all', dispatchEvent: false })
    clearOwnerDocumentCache(current.uid)
    if (reason !== 'dispose') await clearPersistentOwnerCache(current.uid, bridge)
  }

  async function startSession(uid: string, startRevision: number): Promise<OwnerCacheHydration | 'skipped'> {
    // Da qui le cache di questo uid non scadono a tempo (controllo di revisione al posto del TTL).
    setCacheOwnerUid(uid)
    const snapshot = peekOwnerDocument(uid) || await loadOwnerDocument(uid)
    if (!isActive(uid, startRevision)) return 'skipped'

    const outcome = await withTimeout(
      hydrateOwnerCachesFromDisk(uid, snapshot.revision, bridge),
      OWNER_CACHE_PREPARE_TIMEOUT_MS,
      'unavailable' as OwnerCacheHydration
    )
    if (!isActive(uid, startRevision)) return 'skipped'

    const saver = createOwnerCacheSaver({ uid, bridge })
    const unsubscribe = onOwnerCacheChanged((changedUid) => {
      if (changedUid === uid) saver.schedule()
    })
    const watcher = startOwnerRevisionWatch({
      uid,
      revision: snapshot.revision,
      onChanged: (next, previous) => {
        console.info(`[OWNER_REVISION] changed ${previous || 'none'} -> ${next || 'none'}: caches invalidated`)
        invalidateTelemetryCaches({ uid, scope: 'sync' })
      }
    })
    session = { uid, saver, watcher, unsubscribe }
    console.info(`[OWNER_CACHE] prepared uid=${uid.slice(0, 6)}… disk=${outcome} revision=${snapshot.revision || 'none'}`)
    return outcome
  }

  function prepare(uid: string): Promise<OwnerCacheHydration | 'skipped'> {
    if (session?.uid === uid) return Promise.resolve('skipped')
    if (preparing?.uid === uid) return preparing.promise
    if (!options.currentUser.value || options.currentUser.value.uid !== uid || !options.canEnterApp.value) {
      return Promise.resolve('skipped')
    }
    // Una sessione di un altro uid viene chiusa prima (fail-closed), poi si parte dalla
    // revisione corrente: un logout durante la preparazione la rende obsoleta.
    const promise = (session ? release('account-change') : Promise.resolve())
      .then(() => startSession(uid, revision))
      .catch((error) => {
        console.warn('[OWNER_CACHE] prepare failed, continuing without disk cache:', error)
        return 'unavailable' as OwnerCacheHydration
      })
      .finally(() => { if (preparing?.uid === uid) preparing = null })
    preparing = { uid, promise }
    return promise
  }

  const stopWatch = watch(
    [() => options.currentUser.value?.uid || null, options.canEnterApp],
    ([uid, canEnter]) => {
      if (!session && !preparing) return
      const activeUid = session?.uid || preparing?.uid || null
      if (!uid) { void release('logout'); return }
      if (activeUid && activeUid !== uid) { void release('account-change'); return }
      if (!canEnter) void release('logout')
    },
    { flush: 'sync' }
  )

  onScopeDispose(() => {
    stopWatch()
    void release('dispose')
  })

  return { prepare, release }
}
