import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn() }))
vi.mock('~/utils/devToolsAccess', () => ({ canUseDevTools: () => false }))
vi.mock('firebase/firestore', () => ({ ...fake, addDoc: vi.fn(), updateDoc: vi.fn(), getCountFromServer: vi.fn(),
  setDoc: vi.fn(), deleteDoc: vi.fn(), onSnapshot: vi.fn(), runTransaction: vi.fn(), writeBatch: vi.fn() }))
import {
  bucketRealtimePath,
  checkFirebaseCacheFreshness,
  configureFirebaseOpsJournal,
  flushFirebaseOpsJournal,
  isFirebaseOpsJournalEnabled,
  recordFirebaseJournalEvent,
  routePatternForJournal,
  setFirebaseJournalRoute,
} from '~/services/monitoring/firebaseOpsJournal'
import { trackedGetDoc, resetFirebaseTracker } from '~/composables/useFirebaseTracker'
import { createPitwallIoMetrics } from '~/services/pitwall/pitwallIoMetrics'
// @ts-expect-error -- script Node .mjs senza dichiarazioni
import { findForbiddenImports } from '../../scripts/check_firebase_tracking.mjs'

let sent: Array<Array<Record<string, unknown>>>
beforeEach(() => {
  vi.useFakeTimers()
  sent = []
  configureFirebaseOpsJournal({ enabled: true, send: batch => { sent.push(batch) } })
  resetFirebaseTracker()
})
afterEach(() => {
  configureFirebaseOpsJournal(null)
  vi.useRealTimers()
})
const events = () => sent.flat()

describe('journal dev delle operazioni Firebase (PIP-435)', () => {
  it('non accoda nulla quando e fuori dallo sviluppo o senza bridge Electron', () => {
    configureFirebaseOpsJournal({ enabled: false, send: batch => { sent.push(batch) } })
    recordFirebaseJournalEvent({ kind: 'nav' })
    flushFirebaseOpsJournal()
    expect(sent).toEqual([])
    configureFirebaseOpsJournal(null)
    // In vitest non esiste window.electronAPI: la risoluzione automatica resta spenta.
    expect(isFirebaseOpsJournalEnabled()).toBe(false)
  })

  it('impacchetta per tempo e per dimensione e timbra la pagina corrente', () => {
    setFirebaseJournalRoute('/piste')
    recordFirebaseJournalEvent({ kind: 'nav', from: '/panoramica' })
    expect(sent).toHaveLength(0)
    vi.advanceTimersByTime(2_000)
    expect(sent).toHaveLength(1)
    expect(sent[0]![0]).toMatchObject({ kind: 'nav', route: '/piste', from: '/panoramica' })
    for (let i = 0; i < 100; i++) recordFirebaseJournalEvent({ kind: 'cache', cache: 'x' })
    expect(sent).toHaveLength(2)
    expect(sent[1]).toHaveLength(100)
  })

  it('registra hit e scadenza delle cache a TTL', () => {
    const now = Date.now()
    expect(checkFirebaseCacheFreshness('c', undefined, 1000)).toBe(false)
    expect(checkFirebaseCacheFreshness('c', now - 500, 1000)).toBe(true)
    expect(checkFirebaseCacheFreshness('c', now - 5000, 1000)).toBe(false)
    flushFirebaseOpsJournal()
    expect(events()).toMatchObject([{ kind: 'cache', cache: 'c', reason: 'hit', ageMs: 500 },
      { kind: 'cache', cache: 'c', reason: 'expired', ageMs: 5000 }])
  })

  it('ogni operazione del tracker Firestore arriva nel journal con percorso generico', async () => {
    fake.getDoc.mockResolvedValueOnce({ metadata: { fromCache: false } }).mockResolvedValueOnce({ metadata: { fromCache: true } })
    await trackedGetDoc({ path: 'users/uid123/trackBests/monza' } as never, 'TrackBests')
    await trackedGetDoc({ path: 'users/uid123' } as never, 'TrackBests')
    flushFirebaseOpsJournal()
    expect(events()).toMatchObject([
      { kind: 'op', db: 'firestore', type: 'READ', caller: 'TrackBests', path: 'users/*/trackBests/*', reads: 1 },
      { kind: 'op', db: 'firestore', type: 'READ', reads: 0, fromCache: true },
    ])
    expect(JSON.stringify(events())).not.toContain('uid123')
  })

  it('il meter RTDB Pitwall inoltra letture, scritture, cache e connessioni senza identificativi', () => {
    const metrics = createPitwallIoMetrics('pitwallV3')
    const base = { path: 'rooms/9f2c1a7e4b/members/Xy7Qp2LmN8vB3kR1tZ0a', bytes: 10, success: true }
    metrics.record({ ...base, operation: 'receive' })
    metrics.record({ ...base, operation: 'write' })
    metrics.record({ ...base, operation: 'transaction', attempts: 2, committed: true, responseBytes: 5 })
    metrics.record({ ...base, operation: 'cache', bytes: 0 })
    metrics.record({ ...base, operation: 'connection', connected: true })
    metrics.record({ ...base, operation: 'delete', success: false })
    flushFirebaseOpsJournal()
    expect(events()).toMatchObject([
      { kind: 'op', db: 'rtdb', type: 'receive', transport: 'pitwallV3', path: 'rooms/*/members/*', reads: 1, bytes: 10 },
      { kind: 'op', type: 'write', writes: 1 },
      { kind: 'op', type: 'transaction', writes: 1, attempts: 2, bytes: 15 },
      { kind: 'cache', cache: 'rtdb.cache' },
      { kind: 'op', type: 'connection', reason: 'connected' },
      { kind: 'op', type: 'delete', error: 'failed' },
    ])
    expect(events().at(-1)?.deletes).toBeUndefined()
  })

  it('percorsi e pagine senza identificativi', () => {
    expect(bucketRealtimePath('pitwallV3/rooms/-Nq8abc/orders/123')).toBe('pitwallV3/rooms/*/orders/*')
    expect(bucketRealtimePath('.info/connected')).toBe('.info/connected')
    expect(bucketRealtimePath('')).toBe('root')
    expect(routePatternForJournal({ path: '/piloti/abc123', matched: [{ path: '/piloti/:id' }] })).toBe('/piloti/:id')
    expect(routePatternForJournal({ path: '/piste' })).toBe('/piste')
  })

  it('il guard blocca letture/scritture Firebase dirette fuori dai punti osservati', () => {
    expect(findForbiddenImports('pages/x.vue', "import { onValue, ref } from 'firebase/database'")).toEqual(['firebase/database:onValue'])
    expect(findForbiddenImports('pages/x.vue', "import { getDocsFromServer, doc } from 'firebase/firestore'")).toEqual(['firebase/firestore:getDocsFromServer'])
    expect(findForbiddenImports('pages/x.vue', "import * as rtdb from 'firebase/database'")).toEqual(['firebase/database:*'])
    expect(findForbiddenImports('pages/x.vue', "import type { Query } from 'firebase/firestore'")).toEqual([])
    expect(findForbiddenImports('services/pitwall/pitwallRealtimeTransport.ts', "import { get } from 'firebase/database'")).toEqual([])
    expect(findForbiddenImports('config/pitwallRealtime.ts', "import { getDatabase } from 'firebase/database'")).toEqual([])
  })
})
