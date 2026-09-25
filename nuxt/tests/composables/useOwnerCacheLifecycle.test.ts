// PIP-442: la shell idrata le cache prima della dashboard e chiude tutto a logout/cambio account.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

const fake = vi.hoisted(() => ({ getDoc: vi.fn() }))
const mocks = vi.hoisted(() => ({
  hydrate: vi.fn(),
  clearDisk: vi.fn(),
  invalidate: vi.fn(),
  saver: { schedule: vi.fn(), flush: vi.fn(), dispose: vi.fn() },
  watcher: { check: vi.fn(), setRevision: vi.fn(), stop: vi.fn() },
  startWatch: vi.fn()
}))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, path: string) => path }))
vi.mock('~/composables/useFirebaseTracker', () => ({ trackedGetDoc: fake.getDoc }))
vi.mock('~/services/cache/telemetryCacheInvalidationService', () => ({ invalidateTelemetryCaches: mocks.invalidate }))
vi.mock('~/services/cache/persistentOwnerCache', () => ({
  hydrateOwnerCachesFromDisk: mocks.hydrate,
  clearPersistentOwnerCache: mocks.clearDisk,
  createOwnerCacheSaver: () => mocks.saver,
  resolveOwnerCacheBridge: () => null
}))
vi.mock('~/services/cache/ownerRevisionWatcher', () => ({
  startOwnerRevisionWatch: (options: any) => { mocks.startWatch(options); return mocks.watcher }
}))

import { clearOwnerDocumentCache, loadOwnerDocument, peekOwnerDocument } from '~/repositories/ownerDocumentRepository'
import { getCacheOwnerUid } from '~/services/cache/cachePolicy'
import { notifyOwnerCacheChanged, resetOwnerCacheSignals } from '~/services/cache/ownerCacheSignals'
import { useOwnerCacheLifecycle } from '~/composables/useOwnerCacheLifecycle'

const bridge = { ownerCacheGet: vi.fn(), ownerCacheSet: vi.fn(), ownerCacheClear: vi.fn() }

function setup() {
  const currentUser = ref<{ uid: string } | null>({ uid: 'a' })
  const canEnterApp = ref(true)
  const scope = effectScope()
  const lifecycle = scope.run(() => useOwnerCacheLifecycle({ currentUser, canEnterApp, bridge }))!
  return { currentUser, canEnterApp, scope, lifecycle }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetOwnerCacheSignals()
  clearOwnerDocumentCache()
  mocks.hydrate.mockResolvedValue('hydrated')
  mocks.clearDisk.mockResolvedValue(true)
  fake.getDoc.mockImplementation(async (path: string) => ({
    exists: () => true,
    data: () => ({ sessionIndex: { updatedAt: `rev-${path.split('/').pop()}` } })
  }))
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('useOwnerCacheLifecycle', () => {
  it('prepare: legge users/{uid} una volta, idrata con la revisione e avvia salvataggio e controllo', async () => {
    const { lifecycle, scope } = setup()
    expect(await lifecycle.prepare('a')).toBe('hydrated')
    expect(getCacheOwnerUid()).toBe('a')
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    expect(mocks.hydrate).toHaveBeenCalledWith('a', 'rev-a', bridge)
    expect(mocks.startWatch).toHaveBeenCalledWith(expect.objectContaining({ uid: 'a', revision: 'rev-a' }))
    // Idempotente: la seconda chiamata non rilegge e non riavvia nulla.
    expect(await lifecycle.prepare('a')).toBe('skipped')
    expect(mocks.hydrate).toHaveBeenCalledTimes(1)
    // Una lettura Firebase andata a buon fine programma il salvataggio; altri uid no.
    notifyOwnerCacheChanged('a')
    notifyOwnerCacheChanged('b')
    expect(mocks.saver.schedule).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('riusa il documento owner gia\' letto dal provisioning (0 letture aggiuntive)', async () => {
    await loadOwnerDocument('a', { caller: 'AuthProvisioning' })
    const { lifecycle, scope } = setup()
    await lifecycle.prepare('a')
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('logout: ferma controllo e salvataggio, svuota memoria e file dell\'uid', async () => {
    const { lifecycle, scope, currentUser } = setup()
    await lifecycle.prepare('a')
    currentUser.value = null
    await nextTick()
    await Promise.resolve()
    expect(mocks.watcher.stop).toHaveBeenCalled()
    expect(mocks.saver.dispose).toHaveBeenCalled()
    expect(mocks.invalidate).toHaveBeenCalledWith({ uid: 'a', scope: 'all', dispatchEvent: false })
    expect(peekOwnerDocument('a')).toBeNull()
    expect(getCacheOwnerUid()).toBeNull()
    expect(mocks.clearDisk).toHaveBeenCalledWith('a', bridge)
    // Dopo il logout un segnale tardivo non salva nulla.
    notifyOwnerCacheChanged('a')
    expect(mocks.saver.schedule).not.toHaveBeenCalled()
    scope.stop()
  })

  it('cambio account: chiude la sessione di A prima che B possa idratare', async () => {
    const { lifecycle, scope, currentUser } = setup()
    await lifecycle.prepare('a')
    currentUser.value = { uid: 'b' }
    await nextTick()
    await Promise.resolve()
    expect(mocks.clearDisk).toHaveBeenCalledWith('a', bridge)
    expect(await lifecycle.prepare('b')).toBe('hydrated')
    expect(mocks.hydrate).toHaveBeenLastCalledWith('b', 'rev-b', bridge)
    expect(mocks.hydrate).not.toHaveBeenCalledWith('b', 'rev-a', bridge)
    scope.stop()
  })

  it('non prepara senza permesso di entrare o per un uid diverso dall\'utente corrente', async () => {
    const { lifecycle, scope, canEnterApp } = setup()
    expect(await lifecycle.prepare('b')).toBe('skipped')
    canEnterApp.value = false
    expect(await lifecycle.prepare('a')).toBe('skipped')
    expect(mocks.hydrate).not.toHaveBeenCalled()
    scope.stop()
  })

  it('revisione cambiata da un altro PC: invalida le cache owner (scope sync)', async () => {
    const { lifecycle, scope } = setup()
    await lifecycle.prepare('a')
    const options = mocks.startWatch.mock.calls[0][0]
    options.onChanged('rev-new', 'rev-a')
    expect(mocks.invalidate).toHaveBeenCalledWith({ uid: 'a', scope: 'sync' })
    scope.stop()
  })

  it('un errore del disco non blocca l\'ingresso in dashboard', async () => {
    mocks.hydrate.mockRejectedValueOnce(new Error('ipc down'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { lifecycle, scope } = setup()
    expect(await lifecycle.prepare('a')).toBe('unavailable')
    scope.stop()
  })
})
