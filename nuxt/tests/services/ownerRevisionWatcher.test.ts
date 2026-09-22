// PIP-442: controllo di revisione ogni 15 minuti, solo a finestra visibile e online.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ getDoc: vi.fn() }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, path: string) => path }))
vi.mock('~/composables/useFirebaseTracker', () => ({ trackedGetDoc: fake.getDoc }))

import { configureFirebaseOpsJournal, flushFirebaseOpsJournal } from '~/services/monitoring/firebaseOpsJournal'
import { OWNER_REVISION_CHECK_MS } from '~/services/cache/cachePolicy'
import { clearOwnerDocumentCache, loadOwnerDocument, peekOwnerDocument } from '~/repositories/ownerDocumentRepository'
import { startOwnerRevisionWatch } from '~/services/cache/ownerRevisionWatcher'

let revision = 'r1'
let sent: Array<Array<Record<string, unknown>>>
const journalEvents = () => { flushFirebaseOpsJournal(); return sent.flat() }

beforeEach(() => {
  vi.useFakeTimers()
  revision = 'r1'
  sent = []
  configureFirebaseOpsJournal({ enabled: true, send: (batch) => { sent.push(batch) } })
  fake.getDoc.mockReset().mockImplementation(async () => ({ exists: () => true, data: () => ({ sessionIndex: { updatedAt: revision } }) }))
  clearOwnerDocumentCache()
})
afterEach(() => {
  configureFirebaseOpsJournal(null)
  vi.useRealTimers()
})

describe('ownerRevisionWatcher', () => {
  it('ogni 15 minuti legge users/{uid} una volta; revisione uguale = nessuna invalidazione', async () => {
    expect(OWNER_REVISION_CHECK_MS).toBe(15 * 60_000)
    await loadOwnerDocument('u')
    const onChanged = vi.fn()
    const watcher = startOwnerRevisionWatch({ uid: 'u', revision: 'r1', onChanged, isVisible: () => true, isOnline: () => true })
    await vi.advanceTimersByTimeAsync(OWNER_REVISION_CHECK_MS - 1)
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
    expect(fake.getDoc).toHaveBeenLastCalledWith('users/u', 'OwnerRevisionCheck')
    expect(onChanged).not.toHaveBeenCalled()
    expect(journalEvents().some((event) => event.cache === 'owner.revision' && event.reason === 'unchanged')).toBe(true)
    watcher.stop()
    await vi.advanceTimersByTimeAsync(OWNER_REVISION_CHECK_MS * 3)
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
  })

  it('revisione cambiata da un altro PC: invalida e aggiorna la copia condivisa', async () => {
    await loadOwnerDocument('u')
    const onChanged = vi.fn()
    const watcher = startOwnerRevisionWatch({ uid: 'u', revision: 'r1', onChanged, isVisible: () => true, isOnline: () => true })
    revision = 'r2'
    expect(await watcher.check()).toBe('changed')
    expect(onChanged).toHaveBeenCalledWith('r2', 'r1')
    expect(peekOwnerDocument('u')?.revision).toBe('r2')
    expect(journalEvents().some((event) => event.cache === 'owner.revision' && event.reason === 'changed')).toBe(true)
    // La nuova revisione e' ora quella nota: il giro successivo non invalida di nuovo.
    expect(await watcher.check()).toBe('unchanged')
    expect(onChanged).toHaveBeenCalledTimes(1)
    watcher.stop()
  })

  it('finestra nascosta o offline: nessuna lettura', async () => {
    let visible = false
    const watcher = startOwnerRevisionWatch({ uid: 'u', revision: 'r1', onChanged: vi.fn(), isVisible: () => visible, isOnline: () => true })
    await vi.advanceTimersByTimeAsync(OWNER_REVISION_CHECK_MS * 2)
    expect(fake.getDoc).not.toHaveBeenCalled()
    expect(await watcher.check()).toBe('skipped')
    visible = true
    const offline = startOwnerRevisionWatch({ uid: 'u', revision: 'r1', onChanged: vi.fn(), isVisible: () => true, isOnline: () => false })
    expect(await offline.check()).toBe('skipped')
    expect(await watcher.check()).toBe('unchanged')
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    watcher.stop()
    offline.stop()
  })

  it('un errore di lettura non invalida e non blocca i giri successivi', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fake.getDoc.mockRejectedValueOnce(new Error('offline'))
    const onChanged = vi.fn()
    const watcher = startOwnerRevisionWatch({ uid: 'u', revision: 'r1', onChanged, isVisible: () => true, isOnline: () => true })
    expect(await watcher.check()).toBe('skipped')
    expect(onChanged).not.toHaveBeenCalled()
    expect(await watcher.check()).toBe('unchanged')
    watcher.stop()
    warn.mockRestore()
  })

  it('setRevision allinea la revisione nota dopo una sync locale', async () => {
    const onChanged = vi.fn()
    const watcher = startOwnerRevisionWatch({ uid: 'u', revision: 'r1', onChanged, isVisible: () => true, isOnline: () => true })
    revision = 'r2'
    watcher.setRevision('r2')
    expect(await watcher.check()).toBe('unchanged')
    expect(onChanged).not.toHaveBeenCalled()
    watcher.stop()
  })
})
