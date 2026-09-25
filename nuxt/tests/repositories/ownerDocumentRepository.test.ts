// PIP-442: `users/{uid}` letto una sola volta per avvio e condiviso da tutti i chiamanti.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ getDoc: vi.fn() }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, path: string) => path }))
vi.mock('~/composables/useFirebaseTracker', () => ({ trackedGetDoc: fake.getDoc }))

import { configureFirebaseOpsJournal, flushFirebaseOpsJournal } from '~/services/monitoring/firebaseOpsJournal'
import { FOREIGN_OWNER_DATA_CACHE_TTL_MS, setCacheOwnerUid } from '~/services/cache/cachePolicy'
import {
  clearOwnerDocumentCache,
  extractOwnerRevision,
  loadOwnerDocument,
  peekOwnerDocument,
  rememberOwnerDocumentPatch,
  rememberOwnerDocumentWrite
} from '~/repositories/ownerDocumentRepository'

let sent: Array<Array<Record<string, unknown>>>
const journalEvents = () => sent.flat()

function snapshot(data: Record<string, unknown> | null) {
  return { exists: () => data !== null, data: () => data }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-22T10:00:00Z'))
  sent = []
  configureFirebaseOpsJournal({ enabled: true, send: (batch) => { sent.push(batch) } })
  fake.getDoc.mockReset().mockImplementation(async () => snapshot({ stats: { updatedAt: 'r1' }, sessionIndex: { updatedAt: 'r1', sessionsList: [] } }))
  clearOwnerDocumentCache()
  setCacheOwnerUid('u')
})
afterEach(() => {
  setCacheOwnerUid(null)
  configureFirebaseOpsJournal(null)
  vi.useRealTimers()
})

describe('ownerDocumentRepository', () => {
  it('a repeated unchanged-file scan reuses the committed owner; next write and invalidation still read fresh', async () => {
    const owner = await loadOwnerDocument('u', { fresh: true })
    rememberOwnerDocumentWrite('u', owner.data, { sessionIndex: { updatedAt: 'r2', sessionsList: [{ id: 'new-session' }] } })
    fake.getDoc.mockClear()
    const unchanged = await loadOwnerDocument('u', { fresh: false, caller: 'ElectronSync' })
    expect(unchanged.revision).toBe('r2')
    expect(unchanged.data?.sessionIndex?.sessionsList).toEqual([{ id: 'new-session' }])
    expect(fake.getDoc).not.toHaveBeenCalled()
    await loadOwnerDocument('u', { fresh: true, caller: 'ElectronSync' })
    expect(fake.getDoc).toHaveBeenCalledOnce()
    clearOwnerDocumentCache('u')
    await loadOwnerDocument('u', { fresh: false, caller: 'ElectronSync' })
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
  })
  it('sei chiamanti in parallelo e in sequenza costano una sola lettura', async () => {
    const parallel = await Promise.all([
      loadOwnerDocument('u', { caller: 'AuthProvisioning' }),
      loadOwnerDocument('u', { caller: 'OwnerDataMaintenance' }),
      loadOwnerDocument('u', { caller: 'SessionPager' })
    ])
    await loadOwnerDocument('u', { caller: 'TelemetryProjectionRepository' })
    await loadOwnerDocument('u', { caller: 'PilotDirectoryProjection' })
    await loadOwnerDocument('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    expect(fake.getDoc).toHaveBeenCalledWith('users/u', 'AuthProvisioning')
    expect(parallel.every((item) => item.revision === 'r1')).toBe(true)
    flushFirebaseOpsJournal()
    const cacheEvents = journalEvents().filter((event) => event.kind === 'cache')
    expect(cacheEvents.map((event) => event.cache)).toEqual([
      'owner.document.inFlight', 'owner.document.inFlight', 'owner.document', 'owner.document', 'owner.document'
    ])
    expect(cacheEvents.every((event) => event.reason === 'hit')).toBe(true)
  })

  it('non scade a tempo per l\'owner corrente; il documento di un altro pilota (coach) dopo 15 minuti', async () => {
    await loadOwnerDocument('u')
    await loadOwnerDocument('pilot')
    vi.advanceTimersByTime(FOREIGN_OWNER_DATA_CACHE_TTL_MS + 1)
    await loadOwnerDocument('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
    await loadOwnerDocument('pilot')
    expect(fake.getDoc).toHaveBeenCalledTimes(3)
    flushFirebaseOpsJournal()
    expect(journalEvents().some((event) => event.cache === 'owner.document' && event.reason === 'expired')).toBe(true)
    vi.advanceTimersByTime(6 * 60 * 60_000)
    await loadOwnerDocument('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(3)
  })

  it('fresh forza una lettura nuova e sostituisce la copia', async () => {
    await loadOwnerDocument('u')
    fake.getDoc.mockImplementation(async () => snapshot({ sessionIndex: { updatedAt: 'r2' } }))
    const fresh = await loadOwnerDocument('u', { fresh: true, caller: 'ElectronSync' })
    expect(fresh.revision).toBe('r2')
    expect(fake.getDoc).toHaveBeenLastCalledWith('users/u', 'ElectronSync')
    expect(peekOwnerDocument('u')?.revision).toBe('r2')
    await loadOwnerDocument('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
  })

  it('una lettura iniziata prima di un\'invalidazione non ripopola la copia', async () => {
    let resolve!: (value: unknown) => void
    fake.getDoc.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const pending = loadOwnerDocument('u')
    clearOwnerDocumentCache('u')
    resolve(snapshot({ sessionIndex: { updatedAt: 'old' } }))
    await pending
    expect(peekOwnerDocument('u')).toBeNull()
    await loadOwnerDocument('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
  })

  it('le copie sono per uid: un altro account non vede il documento del primo', async () => {
    await loadOwnerDocument('a')
    expect(peekOwnerDocument('b')).toBeNull()
    await loadOwnerDocument('b')
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
    clearOwnerDocumentCache('a')
    expect(peekOwnerDocument('a')).toBeNull()
    expect(peekOwnerDocument('b')).not.toBeNull()
  })

  it('un patch locale (heartbeat, profilo) aggiorna la copia senza cambiare la revisione', async () => {
    await loadOwnerDocument('u')
    rememberOwnerDocumentPatch('u', { clientRuntime: { channel: 'develop' }, suiteVersion: '1.2.3' })
    const current = peekOwnerDocument('u')
    expect(current?.data?.clientRuntime).toEqual({ channel: 'develop' })
    expect(current?.data?.sessionIndex?.updatedAt).toBe('r1')
    expect(current?.revision).toBe('r1')
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    // Senza copia il patch viene ignorato: la prossima lettura porta il documento intero.
    rememberOwnerDocumentPatch('missing', { nickname: 'x' })
    expect(peekOwnerDocument('missing')).toBeNull()
  })

  it('documento assente: exists=false, revisione nulla, nessuna seconda lettura', async () => {
    fake.getDoc.mockImplementation(async () => snapshot(null))
    const first = await loadOwnerDocument('new')
    expect(first.exists).toBe(false)
    expect(first.revision).toBeNull()
    await loadOwnerDocument('new')
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
  })

  it('la revisione e\' sessionIndex.updatedAt, poi stats.updatedAt, altrimenti null', () => {
    expect(extractOwnerRevision({ sessionIndex: { updatedAt: 'a' }, stats: { updatedAt: 'b' } })).toBe('a')
    expect(extractOwnerRevision({ stats: { updatedAt: 'b' } })).toBe('b')
    expect(extractOwnerRevision({ clientRuntime: { lastHeartbeatAt: 'c' } })).toBeNull()
    expect(extractOwnerRevision(null)).toBeNull()
  })
})
