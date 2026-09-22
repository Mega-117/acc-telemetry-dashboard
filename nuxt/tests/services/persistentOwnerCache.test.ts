// PIP-442: idratazione dal disco con revisione uguale (0 letture), fail-closed altrimenti,
// salvataggio debounced dopo le letture Firebase.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn() }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  query: (value: unknown) => value,
  orderBy: () => ({}),
  limit: () => ({})
}))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: fake.getDoc, trackedGetDocs: fake.getDocs, trackedSetDoc: vi.fn(), trackedWriteBatch: vi.fn()
}))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ currentUser: { value: null } }) }))

import { configureFirebaseOpsJournal, flushFirebaseOpsJournal } from '~/services/monitoring/firebaseOpsJournal'
import { setCacheOwnerUid } from '~/services/cache/cachePolicy'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { TRACK_BESTS_SCHEMA_VERSION } from '~/services/sync/trackBestsProjectionService'
import { buildTrackBestsIndexDocument } from '~/services/sync/trackBestsIndexProjectionService'
import { buildRaceCalendarIndexDocument } from '~/services/projections/raceCalendarIndexProjectionService'
import { clearOwnerDocumentCache, loadOwnerDocument } from '~/repositories/ownerDocumentRepository'
import { clearTelemetryProjectionRepositoryCache, loadTrackBest, loadTrackBestsMap } from '~/repositories/telemetryProjectionRepository'
import { clearRaceCalendarCache, loadRaceCalendarEvents } from '~/repositories/raceCalendarRepository'
import { clearSessionListProjectionCache, loadSessionListProjection } from '~/services/sync/sessionListProjectionService'
import { onOwnerCacheChanged, resetOwnerCacheSignals } from '~/services/cache/ownerCacheSignals'
import { buildOwnerCachePayload } from '~/services/cache/ownerCachePayload'
import {
  clearPersistentOwnerCache,
  collectOwnerCacheEntries,
  createOwnerCacheSaver,
  hydrateOwnerCachesFromDisk,
  savePersistentOwnerCache,
  type OwnerCacheBridge
} from '~/services/cache/persistentOwnerCache'

type Store = Map<string, any>
let store: Store
let disk: Map<string, any>
let sent: Array<Array<Record<string, unknown>>>
const journalEvents = () => { flushFirebaseOpsJournal(); return sent.flat() }

function trackDoc(trackId: string) {
  return {
    version: TRACK_BESTS_SCHEMA_VERSION, bestRulesVersion: BEST_RULES_VERSION, trackId,
    bests: { GT3: { Optimum: { bestQualy: 100_000 } } },
    activity: { totalLaps: 10, validLaps: 8, totalTimeMs: 1_000_000, sessionCount: 2 },
    syncedSessionIds: ['s1'], lastSessionDate: '2026-09-01T10:00:00.000Z'
  }
}

function sessionEntry(id: string) {
  return {
    id, date: `2026-09-0${id.slice(-1)}T10:00:00.000Z`, track: 'monza', trackKey: 'monza', car: 'ferrari', carKey: 'ferrari',
    carCategory: 'GT3', type: 0, laps: 3, lapsValid: 2, stintCount: 1, bestLapMs: 100_000, bestQualyMs: null,
    bestRaceMs: null, bestSessionRaceMs: null, bestRulesVersion: BEST_RULES_VERSION, hasLaps: true, totalTimeMs: 300_000
  }
}

function seedCloud(revision = 'r1') {
  store.set('users/u', { stats: { updatedAt: revision }, sessionIndex: { updatedAt: revision, sessionsList: [] } })
  store.set('users/u/trackBestsIndex/v1', buildTrackBestsIndexDocument({ monza: trackDoc('monza'), spa: trackDoc('spa') }))
  store.set('users/u/raceCalendarIndex/v1', buildRaceCalendarIndexDocument([
    { id: 'e1', title: 'Gara', startsAt: '2026-10-01T10:00:00.000Z', trackName: 'Monza' } as any
  ], { knownComplete: true }))
  store.set('users/u/sessionListMeta/v1', { schemaVersion: 1, pageSize: 100, totalSessions: 2, pageCount: 1, pageKeys: ['p0000'], updatedAt: revision })
  store.set('users/u/sessionListPages/p0000', { schemaVersion: 1, pageKey: 'p0000', pageIndex: 0, pageSize: 100, items: [sessionEntry('s2'), sessionEntry('s1')], updatedAt: revision })
}

function makeBridge(): OwnerCacheBridge & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    ownerCacheGet: async (uid) => { calls.push(`get:${uid}`); return disk.get(uid) ?? null },
    ownerCacheSet: async (uid, payload) => { calls.push(`set:${uid}`); disk.set(uid, JSON.parse(JSON.stringify(payload))); return true },
    ownerCacheClear: async (uid) => { calls.push(`clear:${uid ?? '*'}`); if (uid) disk.delete(uid); else disk.clear(); return true }
  }
}

async function readEverything() {
  await loadOwnerDocument('u')
  await loadTrackBestsMap('u')
  await loadTrackBest('u', 'monza')
  await loadRaceCalendarEvents('u', 25)
  await loadSessionListProjection({ db: {}, uid: 'u', getDocFn: (ref: string) => fake.getDoc(ref, 'SessionPager') })
}

function clearMemory() {
  clearOwnerDocumentCache()
  clearTelemetryProjectionRepositoryCache()
  clearRaceCalendarCache()
  clearSessionListProjectionCache()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-22T10:00:00Z'))
  store = new Map()
  disk = new Map()
  sent = []
  configureFirebaseOpsJournal({ enabled: true, send: (batch) => { sent.push(batch) } })
  fake.getDoc.mockReset().mockImplementation(async (path: string) => {
    const data = store.get(path)
    return { exists: () => data !== undefined, data: () => data }
  })
  fake.getDocs.mockReset().mockResolvedValue({ docs: [] })
  resetOwnerCacheSignals()
  clearMemory()
  seedCloud()
  setCacheOwnerUid('u')
})
afterEach(() => {
  setCacheOwnerUid(null)
  configureFirebaseOpsJournal(null)
  vi.useRealTimers()
})

describe('persistentOwnerCache', () => {
  it('primo avvio: legge da Firebase, poi salva su disco con la revisione del documento owner', async () => {
    const bridge = makeBridge()
    expect(await hydrateOwnerCachesFromDisk('u', 'r1', bridge)).toBe('missing')
    await readEverything()
    // users + indice piste + calendario + meta + pagina
    expect(fake.getDoc).toHaveBeenCalledTimes(5)
    const entries = collectOwnerCacheEntries('u')
    expect(Object.keys(entries).sort()).toEqual(['raceCalendarIndex', 'sessionList', 'trackBestsIndex'])
    expect(await savePersistentOwnerCache('u', bridge)).toBe('saved')
    expect(disk.get('u').revision).toBe('r1')
    expect(disk.get('u').entries.sessionList.entries.map((entry: any) => entry.id)).toEqual(['s2', 's1'])
  })

  it('secondo avvio con la stessa revisione: idrata dal disco e le pagine costano 0 letture', async () => {
    const bridge = makeBridge()
    await readEverything()
    await savePersistentOwnerCache('u', bridge)
    clearMemory()
    fake.getDoc.mockClear()
    sent = []

    await loadOwnerDocument('u')
    expect(await hydrateOwnerCachesFromDisk('u', 'r1', bridge)).toBe('hydrated')
    const map = await loadTrackBestsMap('u')
    expect(Object.keys(map).sort()).toEqual(['monza', 'spa'])
    expect((await loadTrackBest('u', 'spa')).trackId).toBe('spa')
    expect((await loadRaceCalendarEvents('u', 25)).map((event) => event.id)).toEqual(['e1'])
    const sessions = await loadSessionListProjection({ db: {}, uid: 'u', getDocFn: (ref: string) => fake.getDoc(ref, 'SessionPager') })
    expect(sessions?.map((session) => session.sessionId)).toEqual(['s2', 's1'])
    // Una sola lettura: il documento owner.
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    expect(fake.getDoc).toHaveBeenCalledWith('users/u', 'OwnerDocument')
    const diskHits = journalEvents().filter((event) => event.kind === 'cache' && event.reason === 'disk').map((event) => event.cache)
    expect(diskHits.sort()).toEqual(['projection.trackBestsIndex', 'raceCalendar.index', 'sessionListProjection'])
    expect(journalEvents().some((event) => event.cache === 'owner.disk' && event.reason === 'hydrated')).toBe(true)
  })

  it('il calendario idratato conserva il suo TTL: oltre 15 minuti dal salvataggio si rilegge', async () => {
    const bridge = makeBridge()
    await readEverything()
    await savePersistentOwnerCache('u', bridge)
    clearMemory()
    vi.advanceTimersByTime(16 * 60_000)
    fake.getDoc.mockClear()
    expect(await hydrateOwnerCachesFromDisk('u', 'r1', bridge)).toBe('hydrated')
    await loadRaceCalendarEvents('u', 25)
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    expect(fake.getDoc).toHaveBeenCalledWith('users/u/raceCalendarIndex/v1', 'RaceCalendarRepository')
    // Le piste invece non scadono.
    await loadTrackBestsMap('u')
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
  })

  it('revisione diversa (sync su un altro PC): il file viene scartato e cancellato', async () => {
    const bridge = makeBridge()
    await readEverything()
    await savePersistentOwnerCache('u', bridge)
    clearMemory()
    seedCloud('r2')
    expect(await hydrateOwnerCachesFromDisk('u', 'r2', bridge)).toBe('stale')
    expect(disk.has('u')).toBe(false)
    expect(bridge.calls).toContain('clear:u')
    expect(journalEvents().some((event) => event.cache === 'owner.disk' && event.reason === 'stale')).toBe(true)
  })

  it('fail-closed: payload di un altro uid, corrotto o senza bridge non idrata nulla', async () => {
    const bridge = makeBridge()
    disk.set('u', buildOwnerCachePayload({ uid: 'other', revision: 'r1', entries: { trackBestsIndex: { document: store.get('users/u/trackBestsIndex/v1') } } }))
    expect(await hydrateOwnerCachesFromDisk('u', 'r1', bridge)).toBe('missing')
    disk.set('u', '{corrupt')
    expect(await hydrateOwnerCachesFromDisk('u', 'r1', bridge)).toBe('missing')
    expect(await hydrateOwnerCachesFromDisk('u', 'r1', null)).toBe('unavailable')
    await loadTrackBestsMap('u')
    expect(fake.getDoc).toHaveBeenCalledWith('users/u/trackBestsIndex/v1', 'TelemetryProjectionRepository')
    const failing: OwnerCacheBridge = { ...bridge, ownerCacheGet: async () => { throw new Error('ipc down') } }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await hydrateOwnerCachesFromDisk('u', 'r1', failing)).toBe('missing')
    warn.mockRestore()
  })

  it('senza revisione nota o senza voci non si salva; oltre 2 MB si rinuncia', async () => {
    const bridge = makeBridge()
    expect(await savePersistentOwnerCache('u', bridge)).toBe('skipped')
    await loadOwnerDocument('u')
    expect(await savePersistentOwnerCache('u', bridge)).toBe('skipped')
    expect(await savePersistentOwnerCache('u', null)).toBe('unavailable')
    store.set('users/u/sessionListMeta/v1', { schemaVersion: 1, pageSize: 100, totalSessions: 12_000, pageCount: 1, pageKeys: ['p0000'], updatedAt: 'r1' })
    store.set('users/u/sessionListPages/p0000', {
      schemaVersion: 1, pageKey: 'p0000', pageIndex: 0, pageSize: 100, updatedAt: 'r1',
      items: Array.from({ length: 12_000 }, (_, i) => ({ ...sessionEntry('s1'), id: `s${i}`, track: 'x'.repeat(150) }))
    })
    await loadSessionListProjection({ db: {}, uid: 'u', getDocFn: (ref: string) => fake.getDoc(ref, 'SessionPager') })
    expect(await savePersistentOwnerCache('u', bridge)).toBe('skipped')
    expect(journalEvents().some((event) => event.cache === 'owner.disk' && event.reason === 'oversized')).toBe(true)
    expect(disk.has('u')).toBe(false)
  })

  it('il salvataggio e\' debounced: piu\' letture ravvicinate producono una sola scrittura', async () => {
    const bridge = makeBridge()
    const saver = createOwnerCacheSaver({ uid: 'u', bridge, debounceMs: 1_500 })
    const unsubscribe = onOwnerCacheChanged((uid) => { if (uid === 'u') saver.schedule() })
    await readEverything()
    expect(bridge.calls.filter((call) => call.startsWith('set:'))).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1_499)
    expect(bridge.calls.filter((call) => call.startsWith('set:'))).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(2)
    expect(bridge.calls.filter((call) => call.startsWith('set:'))).toEqual(['set:u'])
    saver.dispose()
    unsubscribe()
    saver.schedule()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(bridge.calls.filter((call) => call.startsWith('set:'))).toHaveLength(1)
  })

  it('un\'idratazione non fa scattare il salvataggio (nessuna lettura Firebase)', async () => {
    const bridge = makeBridge()
    await readEverything()
    await savePersistentOwnerCache('u', bridge)
    clearMemory()
    const scheduled: string[] = []
    const unsubscribe = onOwnerCacheChanged((uid) => scheduled.push(uid))
    await hydrateOwnerCachesFromDisk('u', 'r1', bridge)
    expect(scheduled).toEqual([])
    unsubscribe()
  })

  it('clear passa dal bridge ed e\' innocuo senza bridge', async () => {
    const bridge = makeBridge()
    disk.set('u', {})
    expect(await clearPersistentOwnerCache('u', bridge)).toBe(true)
    expect(disk.has('u')).toBe(false)
    expect(await clearPersistentOwnerCache('u', null)).toBe(false)
  })
})
