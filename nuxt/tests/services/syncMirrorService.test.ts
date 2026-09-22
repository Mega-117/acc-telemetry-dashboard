// PIP-444: mirror locale dei riepiloghi owner (logica pura) e lettore di ciclo.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SYNC_MIRROR_MAX_TRACKS,
  applySyncMirrorWrite,
  buildNextSyncMirror,
  classifySyncMirrorPath,
  createSyncMirrorCycle,
  exportSyncMirror,
  getSyncMirror,
  hydrateSyncMirror,
  invalidateSyncMirror,
  measureSyncMirrorBytes,
  parseSyncMirrorEntry,
  setSyncMirror,
  stripFirestoreSentinels,
  type SyncMirrorEntry
} from '~/services/sync/syncMirrorService'

class FakeSentinel { readonly kind = 'serverTimestamp' }

function entry(overrides: Partial<SyncMirrorEntry> = {}): SyncMirrorEntry {
  return {
    schemaVersion: 1,
    revision: 'r1',
    docs: {
      'sessionListMeta/v1': { schemaVersion: 1, pageKeys: ['p0000'], totalSessions: 1 },
      'sessionListPages/p0000': { schemaVersion: 1, items: [{ id: 's1' }] },
      'trackProjections/monza': { schemaVersion: 1, trackId: 'monza', bests: { version: 4 }, detail: { schemaVersion: 2 } }
    },
    trackOrder: ['monza'],
    updatedAt: '2026-09-22T10:00:00.000Z',
    ...overrides
  }
}

beforeEach(() => invalidateSyncMirror())

describe('classifySyncMirrorPath', () => {
  it('riconosce solo i riepiloghi dell\'owner, mai users/{uid}, indici o altri utenti', () => {
    expect(classifySyncMirrorPath('u', 'users/u/sessionListMeta/v1')).toEqual({ relative: 'sessionListMeta/v1', collection: 'sessionListMeta', trackId: null })
    expect(classifySyncMirrorPath('u', 'users/u/trackProjections/monza')).toMatchObject({ trackId: 'monza' })
    expect(classifySyncMirrorPath('u', 'users/u/trackBests/spa')).toMatchObject({ trackId: 'spa' })
    expect(classifySyncMirrorPath('u', 'users/u/trackDetailProjections/spa')).toMatchObject({ trackId: 'spa' })
    expect(classifySyncMirrorPath('u', 'users/u')).toBeNull()
    expect(classifySyncMirrorPath('u', 'users/u/trackBestsIndex/v1')).toBeNull()
    expect(classifySyncMirrorPath('u', 'users/other/trackProjections/monza')).toBeNull()
    expect(classifySyncMirrorPath('u', 'users/u/sessions/s1/rawChunks/0')).toBeNull()
    expect(classifySyncMirrorPath('u', 'pilotDirectory/u')).toBeNull()
  })
})

describe('stripFirestoreSentinels', () => {
  it('toglie i sentinel e le istanze non semplici, converte le date, conserva il resto', () => {
    const stripped = stripFirestoreSentinels({
      a: 1, b: 'x', c: null, d: [1, new FakeSentinel(), { e: new FakeSentinel(), f: 2 }],
      lastUpdated: new FakeSentinel(), when: new Date('2026-09-22T10:00:00Z'), nested: { keep: true }
    })
    expect(stripped).toEqual({ a: 1, b: 'x', c: null, d: [1, null, { f: 2 }], when: '2026-09-22T10:00:00.000Z', nested: { keep: true } })
  })
})

describe('applySyncMirrorWrite', () => {
  it('set pieno sostituisce; mergeFields sostituisce solo i campi indicati; merge fonde le mappe', () => {
    const existing = { schemaVersion: 1, trackId: 'monza', bests: { version: 3, activity: { totalLaps: 1 } }, detail: { schemaVersion: 2 } }
    expect(applySyncMirrorWrite(existing, { data: { fresh: true } })).toEqual({ fresh: true })
    expect(applySyncMirrorWrite(existing, {
      data: { schemaVersion: 1, trackId: 'monza', bests: { version: 4 }, updatedAt: new FakeSentinel() },
      options: { mergeFields: ['schemaVersion', 'trackId', 'bests', 'updatedAt'] }
    })).toEqual({ schemaVersion: 1, trackId: 'monza', bests: { version: 4 }, detail: { schemaVersion: 2 } })
    expect(applySyncMirrorWrite(existing, { data: { bests: { activity: { totalLaps: 9 } } }, options: { merge: true } }))
      .toEqual({ schemaVersion: 1, trackId: 'monza', bests: { version: 3, activity: { totalLaps: 9 } }, detail: { schemaVersion: 2 } })
  })

  it('merge su documento sconosciuto non e\' conoscibile; su documento assente crea; complete vale come set', () => {
    expect(applySyncMirrorWrite(undefined, { data: { a: 1 }, options: { merge: true } })).toBeUndefined()
    expect(applySyncMirrorWrite(undefined, { data: { a: 1 }, options: { mergeFields: ['a'] } })).toBeUndefined()
    expect(applySyncMirrorWrite(null, { data: { a: 1, b: 2 }, options: { mergeFields: ['a'] } })).toEqual({ a: 1 })
    expect(applySyncMirrorWrite(null, { data: { a: 1 }, options: { merge: true } })).toEqual({ a: 1 })
    expect(applySyncMirrorWrite(undefined, { data: { a: 1 }, options: { merge: true } }, true)).toEqual({ a: 1 })
  })
})

describe('buildNextSyncMirror', () => {
  const uid = 'u'
  const write = (relative: string, data: Record<string, unknown>, options?: Record<string, unknown>) => ({ ref: `users/${uid}/${relative}`, data, options })

  it('parte dal mirror precedente solo alla stessa revisione e applica letture e scritture del ciclo', () => {
    const previous = entry()
    const next = buildNextSyncMirror({
      uid, previous, readRevision: 'r1', writtenRevision: 'r2',
      cycleDocs: new Map([['trackProjections/spa', null]]),
      writes: [
        write('sessionListPages/p0000', { schemaVersion: 1, items: [{ id: 's1', laps: 9 }] }, { merge: true }),
        write('trackProjections/spa', { schemaVersion: 1, trackId: 'spa', bests: { version: 4 } }, { mergeFields: ['schemaVersion', 'trackId', 'bests'] }),
        write('trackBestsIndex/v1', { version: 1 }, { mergeFields: ['version'] }),
        { ref: `users/${uid}`, data: { sessionIndex: { updatedAt: 'r2' } }, options: { merge: true } }
      ]
    })!
    expect(next.revision).toBe('r2')
    expect(next.docs['sessionListPages/p0000']).toEqual({ schemaVersion: 1, items: [{ id: 's1', laps: 9 }] })
    expect(next.docs['trackProjections/spa']).toEqual({ schemaVersion: 1, trackId: 'spa', bests: { version: 4 } })
    expect(next.docs['trackProjections/monza']).toEqual(previous.docs['trackProjections/monza'])
    expect(next.docs['sessionListMeta/v1']).toEqual(previous.docs['sessionListMeta/v1'])
    expect(Object.keys(next.docs)).not.toContain('trackBestsIndex/v1')
    expect(next.trackOrder).toEqual(['spa', 'monza'])
  })

  it('revisione letta diversa (altro PC): il mirror precedente viene scartato, restano solo i documenti del ciclo', () => {
    const next = buildNextSyncMirror({
      uid, previous: entry(), readRevision: 'r9', writtenRevision: null,
      cycleDocs: new Map([['sessionListMeta/v1', { schemaVersion: 1, pageKeys: [] }]]),
      writes: [write('sessionListPages/p0000', { items: [] }, { merge: true })]
    })!
    expect(next.revision).toBe('r9')
    expect(Object.keys(next.docs)).toEqual(['sessionListMeta/v1'])
    expect(next.trackOrder).toEqual([])
  })

  it('senza revisione non esiste mirror; le scritture merge su documenti mai letti non entrano', () => {
    expect(buildNextSyncMirror({ uid, previous: null, readRevision: null, writtenRevision: null, cycleDocs: new Map(), writes: [] })).toBeNull()
    const next = buildNextSyncMirror({
      uid, previous: null, readRevision: 'r1', writtenRevision: null, cycleDocs: new Map(),
      writes: [write('sessionListMeta/v1', { a: 1 }, { merge: true }), write('trackProjections/monza', { schemaVersion: 1, trackId: 'monza', bests: {} })]
    })!
    expect(Object.keys(next.docs)).toEqual(['trackProjections/monza'])
  })

  it('rebuild (complete): ogni scrittura vale come documento intero', () => {
    const next = buildNextSyncMirror({
      uid, previous: null, readRevision: 'r1', writtenRevision: 'r2', cycleDocs: new Map(), complete: true,
      writes: [write('sessionListMeta/v1', { pageKeys: ['p0000'] }, { merge: true })]
    })!
    expect(next.docs['sessionListMeta/v1']).toEqual({ pageKeys: ['p0000'] })
  })

  it('conserva al massimo le ultime piste toccate e scarta quelle piu\' vecchie', () => {
    const previous = entry({ docs: {}, trackOrder: [] })
    for (let index = 0; index < SYNC_MIRROR_MAX_TRACKS; index++) {
      previous.docs[`trackProjections/t${index}`] = { schemaVersion: 1, trackId: `t${index}` }
      previous.trackOrder.push(`t${index}`)
    }
    const next = buildNextSyncMirror({
      uid, previous, readRevision: 'r1', writtenRevision: null, cycleDocs: new Map(),
      writes: [write('trackProjections/new', { schemaVersion: 1, trackId: 'new' })]
    })!
    expect(next.trackOrder).toHaveLength(SYNC_MIRROR_MAX_TRACKS)
    expect(next.trackOrder[0]).toBe('new')
    expect(next.docs[`trackProjections/t${SYNC_MIRROR_MAX_TRACKS - 1}`]).toBeUndefined()
    expect(next.docs['trackProjections/t0']).toBeDefined()
  })

  it('oltre il tetto di byte scarta piste dalla piu\' vecchia; se non basta nessun mirror', () => {
    const big = { schemaVersion: 1, trackId: 'a', detail: { blob: 'x'.repeat(600) } }
    const next = buildNextSyncMirror({
      uid, previous: null, readRevision: 'r1', writtenRevision: null, cycleDocs: new Map(), maxBytes: 1_000,
      writes: [write('trackProjections/a', big), write('trackProjections/b', { ...big, trackId: 'b' })]
    })!
    expect(next.trackOrder).toEqual(['a'])
    expect(measureSyncMirrorBytes(next)).toBeLessThanOrEqual(1_000)
    expect(buildNextSyncMirror({
      uid, previous: null, readRevision: 'r1', writtenRevision: null, cycleDocs: new Map(), maxBytes: 100,
      writes: [write('sessionListMeta/v1', { blob: 'x'.repeat(200) })]
    })).toBeNull()
  })
})

describe('parseSyncMirrorEntry e store', () => {
  it('fail-closed su schema, revisione, docs e percorsi non mirrorabili', () => {
    const valid = entry()
    expect(parseSyncMirrorEntry(JSON.parse(JSON.stringify(valid)))).toEqual(valid)
    expect(parseSyncMirrorEntry({ ...valid, schemaVersion: 2 })).toBeNull()
    expect(parseSyncMirrorEntry({ ...valid, revision: '' })).toBeNull()
    expect(parseSyncMirrorEntry({ ...valid, docs: { 'users/x': {} } })).toBeNull()
    expect(parseSyncMirrorEntry({ ...valid, docs: { 'trackProjections/monza': 'x' } })).toBeNull()
    expect(parseSyncMirrorEntry({ ...valid, trackOrder: [1] })).toBeNull()
    expect(parseSyncMirrorEntry(null)).toBeNull()
  })

  it('set/get/export/hydrate/invalidate per uid', () => {
    expect(getSyncMirror('u')).toBeNull()
    setSyncMirror('u', entry())
    expect(getSyncMirror('u')?.revision).toBe('r1')
    expect(exportSyncMirror('u')).toEqual(entry())
    invalidateSyncMirror('u')
    expect(getSyncMirror('u')).toBeNull()
    expect(hydrateSyncMirror('u', entry({ revision: 'r5' }))).toBe(true)
    expect(getSyncMirror('u')?.revision).toBe('r5')
    expect(hydrateSyncMirror('u', { corrupt: true })).toBe(false)
    expect(getSyncMirror('u')?.revision).toBe('r5')
    setSyncMirror('u', null)
    expect(getSyncMirror('u')).toBeNull()
  })
})

describe('createSyncMirrorCycle', () => {
  const uid = 'u'
  const cloud = new Map<string, Record<string, unknown> | null>([
    ['users/u/sessionListMeta/v1', { schemaVersion: 1, pageKeys: ['p0000'], totalSessions: 2 }],
    ['users/u/trackProjections/spa', { schemaVersion: 1, trackId: 'spa', bests: null, detail: null }]
  ])
  const reads: string[] = []
  const getDocFn = async (ref: string) => {
    reads.push(ref)
    const data = cloud.get(ref) ?? null
    return { exists: () => data !== null, data: () => data }
  }
  const ownerDocument = { exists: true, data: { sessionIndex: { updatedAt: 'r1', sessionsList: [] } }, revision: 'r1' }
  beforeEach(() => { reads.length = 0 })

  it('hit: serve users/{uid} dalla copia fresca e i riepiloghi dal mirror; i mancanti dal cloud una sola volta', async () => {
    const cycle = createSyncMirrorCycle({ uid, mirror: entry(), ownerDocument, getDocFn })
    expect(cycle.state).toBe('hit')
    const user = await cycle.getDocFn('users/u')
    expect(user.exists()).toBe(true)
    expect(user.data().sessionIndex.updatedAt).toBe('r1')
    const meta = await cycle.getDocFn('users/u/sessionListMeta/v1')
    expect(meta.data()).toEqual({ schemaVersion: 1, pageKeys: ['p0000'], totalSessions: 1 })
    const spa = await cycle.getDocFn('users/u/trackProjections/spa')
    expect(spa.data()).toMatchObject({ trackId: 'spa' })
    await cycle.getDocFn('users/u/trackProjections/spa')
    const missing = await cycle.getDocFn('users/u/trackBests/spa')
    expect(missing.exists()).toBe(false)
    expect(reads).toEqual(['users/u/trackProjections/spa', 'users/u/trackBests/spa'])
    expect(cycle.stats).toEqual({ mirrorHits: 1, mirrorMisses: 2, freshReads: 2, ownerDocumentHits: 1 })
    expect(cycle.cycleDocs.get('trackBests/spa')).toBeNull()
    expect(cycle.cycleDocs.get('trackProjections/spa')).toMatchObject({ trackId: 'spa' })
    // Il chiamante non puo' mutare il mirror attraverso lo snapshot.
    meta.data().pageKeys.push('p0001')
    expect((await cycle.getDocFn('users/u/sessionListMeta/v1')).data().pageKeys).toEqual(['p0000'])
  })

  it('stale/cold: revisione diversa o mirror assente -> tutte le letture dal cloud, users ancora dalla copia', async () => {
    const stale = createSyncMirrorCycle({ uid, mirror: entry({ revision: 'r0' }), ownerDocument, getDocFn })
    expect(stale.state).toBe('stale')
    await stale.getDocFn('users/u/sessionListMeta/v1')
    await stale.getDocFn('users/u')
    expect(reads).toEqual(['users/u/sessionListMeta/v1'])
    expect(stale.stats).toMatchObject({ mirrorHits: 0, mirrorMisses: 0, freshReads: 1, ownerDocumentHits: 1 })

    reads.length = 0
    const cold = createSyncMirrorCycle({ uid, mirror: null, ownerDocument: null, getDocFn })
    expect(cold.state).toBe('cold')
    await cold.getDocFn('users/u')
    expect(reads).toEqual(['users/u'])
  })
})
