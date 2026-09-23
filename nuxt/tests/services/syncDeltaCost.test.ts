// PIP-436: costo per ciclo di sync quando lo stesso file sessione viene ricaricato a ogni giro.
// PIP-444: il piano si costruisce dal mirror locale (0 riletture con la stessa revisione) e
// deve essere identico a quello costruito rileggendo i documenti dal cloud.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => path,
  serverTimestamp: () => 'server-time'
}))

import { applyUserProjectionDeltas } from '~/services/sync/syncUserProjectionDeltaService'
import { applySessionListProjectionDeltas, buildSessionListProjection, loadSessionListProjection, clearSessionListProjectionCache } from '~/services/sync/sessionListProjectionService'
import { applyTrackBestsProjectionDeltas } from '~/services/sync/trackBestsProjectionService'
import { refreshSyncProjections, type ProjectionWrite } from '~/services/sync/syncProjectionRefreshService'
import { extractOwnerRevision } from '~/services/cache/ownerRevision'
import type { SyncMirrorEntry } from '~/services/sync/syncMirrorService'
import { buildOwnerCachePayload, serializeOwnerCachePayload, parseOwnerCachePayload } from '~/services/cache/ownerCachePayload'

type Store = Map<string, any>
let store: Store
const reads: string[] = []
const writes: string[] = []
const docFn = (_db: unknown, path: string) => path
const getDocFn = async (path: string) => {
  reads.push(path)
  const data = store.get(path)
  return { exists: () => data !== undefined, data: () => data }
}
const setDocFn = async (path: string, data: any, options?: { merge?: boolean; mergeFields?: string[] }) => {
  writes.push(path)
  if (options?.mergeFields) {
    // Come Firestore: solo i percorsi indicati vengono sostituiti, il resto del documento resta.
    const merged = structuredClone(store.get(path) || {})
    for (const fieldPath of options.mergeFields) {
      const keys = fieldPath.split('.')
      let source = data
      let target = merged
      for (const key of keys.slice(0, -1)) { source = source?.[key]; target[key] = target[key] || {}; target = target[key] }
      target[keys.at(-1)!] = source?.[keys.at(-1)!]
    }
    store.set(path, merged)
    return
  }
  store.set(path, options?.merge ? { ...(store.get(path) || {}), ...data } : data)
}

describe('PIP-446 new sessions do not shift historical pages', () => {
  function seed(count: number) {
    const sessions = Array.from({ length: count }, (_, i) => ({ sessionId: `old-${i}`,
      meta: { date_start: new Date(Date.UTC(2025, 0, 1) + i * 60000).toISOString(), track: 'monza', car: 'ferrari_296_gt3' },
      summary: { laps: 2, lapsValid: 1 } })) as any[]
    const projection = buildSessionListProjection(sessions)
    store.set('users/u/sessionListMeta/v1', projection.meta)
    for (const page of projection.pages) store.set(`users/u/sessionListPages/${page.pageKey}`, page)
    return sessions
  }
  it.each([666, 700])('adds one session to %i entries with only meta + one page written, UI stays sorted', async count => {
    seed(count)
    const before = structuredClone(store)
    await applySessionListProjectionDeltas({ db: {}, uid: 'u', deltas: [delta('created', 7)], getDocFn, setDocFn, docFn })
    expect(reads).toHaveLength(3)
    expect(writes).toHaveLength(2)
    for (const [path, value] of before) if (!writes.includes(path)) expect(store.get(path)).toEqual(value)
    clearSessionListProjectionCache()
    const loaded = await loadSessionListProjection({ db: {}, uid: 'u', getDocFn, docFn })
    expect(loaded).toHaveLength(count + 1)
    expect(new Set(loaded!.map(s => s.sessionId)).size).toBe(count + 1)
    expect(loaded![0]!.sessionId).toBe('s-new')
    expect(loaded![0]!.summary.laps).toBe(7)
    const first = JSON.stringify(loaded)
    // Before a rebuild, another stint follows the append hint straight to the
    // tail instead of walking the historical pages.
    reads.length = 0
    writes.length = 0
    await applySessionListProjectionDeltas({ db: {}, uid: 'u', deltas: [delta('updated', 9)], getDocFn, setDocFn, docFn })
    expect(reads).toHaveLength(2)
    expect(writes).toHaveLength(1)
    expect(reads[1]).toBe(`users/u/sessionListPages/${store.get('users/u/sessionListMeta/v1').lastInsertedPageKey}`)
    // A replayed creation must not add a duplicate or increment the total twice.
    await applySessionListProjectionDeltas({ db: {}, uid: 'u', deltas: [delta('created', 7)], getDocFn, setDocFn, docFn })
    clearSessionListProjectionCache()
    expect(JSON.stringify(await loadSessionListProjection({ db: {}, uid: 'u', getDocFn, docFn }))).toBe(first)
    expect(store.get('users/u/sessionListMeta/v1').totalSessions).toBe(count + 1)
    reads.length = 0
    writes.length = 0
    await applySessionListProjectionDeltas({ db: {}, uid: 'u', deltas: [delta('updated', 9)], getDocFn, setDocFn, docFn })
    expect(reads).toHaveLength(2) // meta + tail, no historical scan for another stint
    expect(writes).toHaveLength(1)
  })
  it('older imported session keeps all existing entries through reconciliation', async () => {
    seed(201)
    await applySessionListProjectionDeltas({ db: {}, uid: 'u', deltas: [delta('created', 3, { dateStart: '2020-01-01' })], getDocFn, setDocFn, docFn })
    clearSessionListProjectionCache()
    const loaded = await loadSessionListProjection({ db: {}, uid: 'u', getDocFn, docFn })
    expect(loaded).toHaveLength(202)
    expect(loaded!.at(-1)!.sessionId).toBe('s-new')
  })
})

const NOW = '2026-09-22T12:00:00.000Z'
const TRACK = 'users/u/trackProjections/monza'

describe('PIP-436 integrated projection recovery', () => {
  function session(laps: number) {
    return { sessionId: 's-new', meta: { track: 'monza', car: 'ferrari_296_gt3', date_start: NOW, session_type: 0 },
      summary: { laps, lapsValid: laps - 1, totalTime: laps * 100_000, stintCount: 1 } } as any
  }
  async function commit(plan: ProjectionWrite[]) {
    expect(new Set(plan.map(write => write.ref)).size).toBe(plan.length)
    for (const write of plan) await setDocFn(write.ref, write.data, write.options)
  }
  const input = (laps: number) => ({
    db: {}, uid: 'u', changedCount: 1, loadFullHistory: vi.fn(async () => [session(laps)]),
    clearTrackDerivedCaches: vi.fn(), resetAllTrackBests: vi.fn(async () => 0),
    getDocFn, setDocFn, commitWrites: commit, bestRulesVersion: 5, reason: 'audit-fixture'
  })

  it('publishes nothing on commit failure; retry and following lap remain exact', async () => {
    await refreshSyncProjections(input(3))
    const before = JSON.stringify([...store])
    const updated = { ...input(8), userProjectionDeltas: [delta('updated', 8)], trackBestDeltas: [delta('updated', 8)] }
    await expect(refreshSyncProjections({ ...updated, commitWrites: async () => { throw new Error('batch-offline') } })).rejects.toThrow('batch-offline')
    expect(JSON.stringify([...store])).toBe(before)
    writes.length = 0
    reads.length = 0
    await refreshSyncProjections(updated)
    expect(updated.loadFullHistory).not.toHaveBeenCalled()
    expect(new Set(writes).size).toBe(writes.length)
    // PIP-444 (b): best e dettaglio pista vivono nello stesso documento: una scrittura per pista.
    expect(writes.filter((path) => path === TRACK)).toHaveLength(1)
    expect(store.get(TRACK).bests.activity.totalLaps).toBe(8)
    expect(store.get(TRACK).detail.categories.GT3.activity.totalLaps).toBe(8)
    // PIP-441: +1 documento (indice piste, merge della sola pista cambiata) e 0 letture dell'indice.
    expect(writes.filter((path) => path === 'users/u/trackBestsIndex/v1')).toHaveLength(1)
    expect(reads).not.toContain('users/u/trackBestsIndex/v1')
    expect(store.get('users/u/trackBestsIndex/v1').tracks.monza.activity.totalLaps).toBe(8)
    expect(store.get('users/u/trackBestsIndex/v1').complete).toBe(true)
    await refreshSyncProjections({ ...input(9), userProjectionDeltas: [delta('updated', 9)], trackBestDeltas: [delta('updated', 9)] })
    expect(store.get(TRACK).bests.activity.totalLaps).toBe(9)
    expect(store.get('users/u/trackBestsIndex/v1').tracks.monza.activity.totalLaps).toBe(9)
  })

  it('il primo caricamento (rebuild da storico) scrive l\'indice piste completo nello stesso piano', async () => {
    await refreshSyncProjections(input(3))
    const index = store.get('users/u/trackBestsIndex/v1')
    expect(index).toMatchObject({ version: 1, complete: true })
    expect(Object.keys(index.tracks)).toEqual(['monza'])
    expect(index.tracks.monza).not.toHaveProperty('syncedSessionIds')
    expect(writes.filter((path) => path === 'users/u/trackBestsIndex/v1')).toHaveLength(1)
    expect(store.get(TRACK)).toMatchObject({ schemaVersion: 1, trackId: 'monza' })
    expect(store.has('users/u/trackBests/monza')).toBe(false)
    expect(store.has('users/u/trackDetailProjections/monza')).toBe(false)
  })

  it('missing prior contribution rebuilds every aggregate without publishing the unsafe delta', async () => {
    await refreshSyncProjections(input(3))
    store.get('users/u').sessionIndex.sessionsList = []
    writes.length = 0
    const updated = { ...input(8), userProjectionDeltas: [delta('updated', 8)], trackBestDeltas: [delta('updated', 8)] }
    await refreshSyncProjections(updated)
    expect(updated.loadFullHistory).toHaveBeenCalledOnce()
    expect(updated.resetAllTrackBests).not.toHaveBeenCalled()
    expect(new Set(writes).size).toBe(writes.length)
    expect(store.get(TRACK).bests.activity.totalLaps).toBe(8)
    expect(store.get(TRACK).detail.categories.GT3.activity.totalLaps).toBe(8)
  })

  it('an unavailable track read cannot publish the user index alone', async () => {
    await refreshSyncProjections(input(3))
    const before = JSON.stringify([...store])
    await expect(refreshSyncProjections({ ...input(8), userProjectionDeltas: [delta('updated', 8)], trackBestDeltas: [delta('updated', 8)],
      getDocFn: async (path: string) => { if (path.includes('/trackProjections/')) throw new Error('read-offline'); return getDocFn(path) }
    })).rejects.toThrow('read-offline')
    expect(JSON.stringify([...store])).toBe(before)
  })

  it('vecchi documenti separati (utente non migrato): la sync li legge e scrive il documento unito', async () => {
    await refreshSyncProjections(input(3))
    const legacyBests = store.get(TRACK).bests
    const legacyDetail = store.get(TRACK).detail
    store.delete(TRACK)
    store.set('users/u/trackBests/monza', legacyBests)
    store.set('users/u/trackDetailProjections/monza', legacyDetail)
    reads.length = 0
    writes.length = 0
    await refreshSyncProjections({ ...input(8), userProjectionDeltas: [delta('updated', 8)], trackBestDeltas: [delta('updated', 8)] })
    expect(reads).toContain('users/u/trackBests/monza')
    expect(reads).toContain('users/u/trackDetailProjections/monza')
    expect(writes).toContain(TRACK)
    expect(writes).not.toContain('users/u/trackBests/monza')
    expect(writes).not.toContain('users/u/trackDetailProjections/monza')
    expect(store.get(TRACK).bests.activity.totalLaps).toBe(8)
    expect(store.get(TRACK).detail.categories.GT3.activity.totalLaps).toBe(8)
  })
})

const delta = (status: 'created' | 'updated', laps: number, extra: Record<string, unknown> = {}) => ({
  status, sessionId: 's-new', trackId: 'monza', dateStart: NOW, sessionType: 0, car: 'ferrari_296_gt3',
  summary: { laps, lapsValid: laps - 1, totalTime: laps * 100_000, stintCount: 1 }, ...extra
})

function listEntry(id: string, date: string, laps = 3) {
  return { id, date, track: 'monza', car: 'ferrari_296_gt3', type: 0, laps, lapsValid: laps - 1, totalTimeMs: laps * 100_000 }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
  store = new Map()
  reads.length = 0
  writes.length = 0
})
afterEach(() => vi.useRealTimers())

describe('PIP-436 costo per giro', () => {
  it('sessionList: una sessione aggiornata legge meta + la sua pagina e scrive solo quella', async () => {
    store.set('users/u/sessionListMeta/v1', { schemaVersion: 1, pageSize: 100, totalSessions: 3, pageCount: 2, pageKeys: ['p0000', 'p0001'] })
    store.set('users/u/sessionListPages/p0000', { schemaVersion: 1, pageKey: 'p0000', pageIndex: 0, items: [listEntry('s-new', NOW), listEntry('s-2', '2026-01-02')] })
    store.set('users/u/sessionListPages/p0001', { schemaVersion: 1, pageKey: 'p0001', pageIndex: 1, items: [listEntry('s-1', '2026-01-01')] })

    await applySessionListProjectionDeltas({ db: {}, uid: 'u', deltas: [delta('updated', 7)], getDocFn, setDocFn, docFn })

    expect(reads).toEqual(['users/u/sessionListMeta/v1', 'users/u/sessionListPages/p0000'])
    expect(writes).toEqual(['users/u/sessionListPages/p0000'])
    expect(store.get('users/u/sessionListPages/p0000').items[0]).toMatchObject({ id: 's-new', laps: 7 })
    expect(store.get('users/u/sessionListMeta/v1').totalSessions).toBe(3)
  })

  it('sessionList: una sessione nuova usa ancora il percorso completo (conteggio e pagine cambiano)', async () => {
    store.set('users/u/sessionListMeta/v1', { schemaVersion: 1, pageSize: 100, totalSessions: 1, pageCount: 1, pageKeys: ['p0000'] })
    store.set('users/u/sessionListPages/p0000', { schemaVersion: 1, pageKey: 'p0000', pageIndex: 0, items: [listEntry('s-1', '2026-01-01')] })

    await applySessionListProjectionDeltas({ db: {}, uid: 'u', deltas: [delta('created', 2)], getDocFn, setDocFn, docFn })

    expect(store.get('users/u/sessionListMeta/v1').totalSessions).toBe(2)
    expect(reads.filter((path) => path.endsWith('sessionListMeta/v1'))).toHaveLength(1)
  })

  it('users: restituisce il contributo precedente e non riscrive pilotDirectory se invariato', async () => {
    store.set('users/u', {
      stats: { totalSessions: 1, sessionsLast7Days: 1, lastSessionDate: NOW },
      sessionIndex: { totalSessions: 1, sessionsList: [{ id: 's-new', date: NOW, track: 'monza', type: 0, laps: 5, lapsValid: 4, totalTime: 500_000 }], tracksSummary: [{ track: 'monza', sessions: 1, lastPlayed: NOW }] }
    })
    store.set('users/u/sessionListMeta/v1', { schemaVersion: 1, pageSize: 100, totalSessions: 1, pageCount: 1, pageKeys: ['p0000'] })
    store.set('users/u/sessionListPages/p0000', { schemaVersion: 1, pageKey: 'p0000', pageIndex: 0, items: [listEntry('s-new', NOW, 5)] })

    const result = await applyUserProjectionDeltas({ db: {}, uid: 'u', deltas: [delta('updated', 8)], getDocFn, setDocFn, docFn })

    expect(result.previousContributions.get('s-new')).toEqual({ laps: 5, lapsValid: 4, totalTime: 500_000 })
    expect(result.totalSessions).toBe(1)
    expect(writes).not.toContain('pilotDirectory/u')
    expect(writes).toEqual(['users/u', 'users/u/sessionListPages/p0000'])
  })

  it('users: pilotDirectory viene scritto quando cambiano i valori pubblici', async () => {
    store.set('users/u', { stats: { sessionsLast7Days: 0, lastSessionDate: null }, sessionIndex: { sessionsList: [] } })
    await applyUserProjectionDeltas({ db: {}, uid: 'u', deltas: [delta('created', 3)], getDocFn, setDocFn, docFn })
    expect(writes).toContain('pilotDirectory/u')
  })

  it('trackBests: una sessione gia contata e allungata aggiorna l\'attivita della sola differenza', async () => {
    store.set(TRACK, { schemaVersion: 1, trackId: 'monza', bests: {
      version: 99, bestRulesVersion: 99, trackId: 'monza', bests: {},
      activity: { totalLaps: 15, validLaps: 12, totalTimeMs: 1_500_000, sessionCount: 2 },
      syncedSessionIds: ['s-old', 's-new']
    }, detail: null })
    await applyTrackBestsProjectionDeltas({
      db: {}, uid: 'u', deltas: [delta('updated', 8)], getDocFn, setDocFn, docFn, bestRulesVersion: 1,
      previousContributions: new Map([['s-new', { laps: 5, lapsValid: 4, totalTime: 500_000 }]])
    })
    expect(reads).toEqual([TRACK])
    expect(store.get(TRACK).bests.activity).toMatchObject({
      totalLaps: 18, validLaps: 15, totalTimeMs: 1_800_000, sessionCount: 2
    })
  })
})

// ---------------------------------------------------------------------------
// PIP-444: piano dal mirror == piano da letture fresche; conteggi esatti per scenario.
// ---------------------------------------------------------------------------
describe('PIP-444 mirror locale del piano', () => {
  const uid = 'u'
  // Le sessioni reali portano sempre `best_rules_version` nel summary canonico: senza,
  // percorso incrementale e rebuild lo derivano in modo diverso (5 vs 0).
  function sessionDoc(id: string, laps: number, dateStart = NOW) {
    return { sessionId: id, meta: { track: 'monza', car: 'ferrari_296_gt3', date_start: dateStart, session_type: 0 },
      summary: { laps, lapsValid: laps - 1, totalTime: laps * 100_000, stintCount: 1, best_rules_version: 5 } } as any
  }
  const withRules = (item: any) => ({ ...item, summary: { ...item.summary, best_rules_version: 5 } })
  let history: any[]
  let plans: ProjectionWrite[][]
  async function commit(plan: ProjectionWrite[]) {
    expect(new Set(plan.map(write => write.ref)).size).toBe(plan.length)
    plans.push(plan)
    for (const write of plan) await setDocFn(write.ref, write.data, write.options)
  }
  const ownerDocument = () => {
    const data = store.get(`users/${uid}`)
    return { exists: data !== undefined, data: data ?? null, revision: extractOwnerRevision(data) }
  }
  const base = () => ({
    db: {}, uid, changedCount: 1, loadFullHistory: vi.fn(async () => history),
    clearTrackDerivedCaches: vi.fn(), resetAllTrackBests: vi.fn(async () => 0),
    getDocFn, setDocFn, commitWrites: commit, bestRulesVersion: 5, reason: 'pip444'
  })
  const cycle = (rawDeltas: any[], mirror: SyncMirrorEntry | null) => {
    const deltas = rawDeltas.map(withRules)
    return refreshSyncProjections({
      ...base(), userProjectionDeltas: deltas, trackBestDeltas: deltas, mirror: { entry: mirror, ownerDocument: ownerDocument() }
    })
  }
  /** Documento senza i campi temporali che il piano riscrive ad ogni ciclo. */
  function normalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalize)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !['updatedAt', 'lastUpdated'].includes(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, key === 'syncedSessionIds' ? [...(item as string[])].sort() : normalize(item)]))
  }
  const planDocs = (plan: ProjectionWrite[]) => Object.fromEntries(plan.map((write) => [write.ref, normalize(write.data)]))

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T12:00:00Z'))
    history = [sessionDoc('s-new', 3)]
    plans = []
  })
  afterEach(() => vi.useRealTimers())

  async function warmMirror(): Promise<SyncMirrorEntry> {
    // Primo caricamento: rebuild da storico, il mirror riparte dai documenti interi scritti.
    const first = await refreshSyncProjections({ ...base(), mirror: { entry: null, ownerDocument: ownerDocument() } })
    expect(first.mirror).not.toBeNull()
    expect(first.mirror!.revision).toBe(store.get(`users/${uid}`).sessionIndex.updatedAt)
    expect(Object.keys(first.mirror!.docs).sort()).toEqual(['sessionListMeta/v1', 'sessionListPages/p0000', TRACK.replace(`users/${uid}/`, '')])
    return first.mirror!
  }

  it('666 historical sessions: cold sync, serialized cache and next new session preserve every entry without re-reading history', async () => {
    history = Array.from({ length: 666 }, (_, i) => sessionDoc(`old-${i}`, 3,
      new Date(Date.UTC(2025, 0, 1) + i * 60000).toISOString()))
    await refreshSyncProjections({ ...base(), mirror: { entry: null, ownerDocument: ownerDocument() } })
    reads.length = 0
    plans = []
    const first = await cycle([delta('created', 7)], null)
    expect(first.mirrorCycle!.state).toBe('cold')
    expect(reads).toHaveLength(4) // meta, first/last list pages, combined track projection
    expect(plans[0]).toHaveLength(6) // upload session/raw are outside this projection plan
    const serialized = serializeOwnerCachePayload(buildOwnerCachePayload({ uid,
      revision: first.mirror!.revision, entries: { syncMirror: first.mirror! } }))
    const restored = parseOwnerCachePayload(serialized, uid)!.entries.syncMirror!
    vi.advanceTimersByTime(1000)
    reads.length = 0
    plans = []
    const second = await cycle([delta('created', 4, { sessionId: 's-next', dateStart: '2026-09-23T12:00:00Z' })], restored)
    expect(second.mirrorCycle!.state).toBe('hit')
    expect(reads).toEqual([])
    expect(plans[0]).toHaveLength(6)
    clearSessionListProjectionCache()
    const loaded = await loadSessionListProjection({ db: {}, uid, getDocFn, docFn })
    expect(loaded).toHaveLength(668)
    expect(new Set(loaded!.map(s => s.sessionId)).size).toBe(668)
    expect(loaded!.slice(0, 2).map(s => s.sessionId)).toEqual(['s-next', 's-new'])
    expect(store.get(TRACK).bests.activity.totalLaps).toBe(666 * 3 + 7 + 4)
  })

  it('mirror caldo, sessione aggiornata su una pista: 0 letture oltre users/{uid}, 4 documenti, piano identico alle letture fresche', async () => {
    const mirror = await warmMirror()
    const snapshot = structuredClone([...store])
    reads.length = 0
    plans = []
    const fromMirror = await cycle([delta('updated', 8)], mirror)
    expect(fromMirror.mirrorCycle).toMatchObject({ state: 'hit', stats: { freshReads: 0, ownerDocumentHits: 1, mirrorMisses: 0 } })
    expect(reads).toEqual([])
    expect(plans[0].map((write) => write.ref).sort()).toEqual([
      `users/${uid}`, 'users/u/sessionListPages/p0000', 'users/u/trackBestsIndex/v1', TRACK
    ])
    const mirrorPlan = planDocs(plans[0])
    const mirrorStore = structuredClone([...store])

    // Stesso stato di partenza, nessun mirror: ogni documento riletto dal cloud.
    store = new Map(structuredClone(snapshot))
    reads.length = 0
    plans = []
    await cycle([delta('updated', 8)], null)
    expect(reads.sort()).toEqual(['users/u/sessionListMeta/v1', 'users/u/sessionListPages/p0000', TRACK])
    expect(planDocs(plans[0])).toEqual(mirrorPlan)
    expect(normalize(Object.fromEntries(structuredClone([...store])))).toEqual(normalize(Object.fromEntries(mirrorStore)))

    // Il mirror ricostruito dal piano equivale ai documenti ora nel cloud.
    for (const [relative, doc] of Object.entries(fromMirror.mirror!.docs)) {
      expect(normalize(doc)).toEqual(normalize(store.get(`users/${uid}/${relative}`)))
    }
    expect(fromMirror.mirror!.revision).toBe(extractOwnerRevision(store.get(`users/${uid}`)))
  })

  it('mirror caldo, sessione nuova: meta e pagina dal mirror, +1 meta e +1 pilotDirectory, piano identico', async () => {
    const mirror = await warmMirror()
    const created = { ...delta('created', 4), sessionId: 's-2', dateStart: '2026-09-21T10:00:00.000Z' }
    history = [sessionDoc('s-new', 3), sessionDoc('s-2', 4, created.dateStart)]
    const snapshot = structuredClone([...store])
    reads.length = 0
    plans = []
    const fromMirror = await cycle([created], mirror)
    expect(fromMirror.mirrorCycle!.stats.freshReads).toBe(0)
    expect(plans[0].map((write) => write.ref).sort()).toEqual([
      'pilotDirectory/u', `users/${uid}`, 'users/u/sessionListMeta/v1', 'users/u/sessionListPages/p0000', 'users/u/trackBestsIndex/v1', TRACK
    ])
    const mirrorPlan = planDocs(plans[0])
    store = new Map(structuredClone(snapshot))
    plans = []
    await cycle([created], null)
    expect(planDocs(plans[0])).toEqual(mirrorPlan)
  })

  it('revisione diversa (altro PC ha scritto): mirror scartato, i riepiloghi si rileggono; mirror parziale: solo il mancante', async () => {
    const mirror = await warmMirror()
    const user = store.get(`users/${uid}`)
    store.set(`users/${uid}`, { ...user, sessionIndex: { ...user.sessionIndex, updatedAt: '2026-09-22T13:00:00.000Z' } })
    reads.length = 0
    const stale = await cycle([delta('updated', 8)], mirror)
    expect(stale.mirrorCycle!.state).toBe('stale')
    expect(reads.sort()).toEqual(['users/u/sessionListMeta/v1', 'users/u/sessionListPages/p0000', TRACK])
    expect(stale.mirror!.revision).toBe(store.get(`users/${uid}`).sessionIndex.updatedAt)

    const partial: SyncMirrorEntry = { ...stale.mirror!, docs: { ...stale.mirror!.docs } }
    delete partial.docs['trackProjections/monza']
    reads.length = 0
    const hit = await cycle([delta('updated', 9)], partial)
    expect(hit.mirrorCycle).toMatchObject({ state: 'hit', stats: { freshReads: 1, mirrorHits: 2, mirrorMisses: 1 } })
    expect(reads).toEqual([TRACK])
    expect(store.get(TRACK).bests.activity.totalLaps).toBe(9)
  })

  it('commit fallito: nessun mirror nuovo, lo store resta intatto e il ciclo seguente rilegge', async () => {
    const mirror = await warmMirror()
    const before = JSON.stringify([...store])
    await expect(refreshSyncProjections({
      ...base(), userProjectionDeltas: [delta('updated', 8)], trackBestDeltas: [delta('updated', 8)],
      mirror: { entry: mirror, ownerDocument: ownerDocument() }, commitWrites: async () => { throw new Error('batch-offline') }
    })).rejects.toThrow('batch-offline')
    expect(JSON.stringify([...store])).toBe(before)
    // Il chiamante invalida il mirror: senza mirror il ciclo rilegge come prima.
    reads.length = 0
    const cold = await cycle([delta('updated', 8)], null)
    expect(cold.mirrorCycle!.state).toBe('cold')
    expect(reads).toHaveLength(3)
  })

  it('un rebuild completo dopo cicli incrementali produce gli stessi documenti', async () => {
    const mirror = await warmMirror()
    const second = await cycle([delta('updated', 8)], mirror)
    const created = { ...delta('created', 4), sessionId: 's-2', dateStart: '2026-09-21T10:00:00.000Z' }
    history = [sessionDoc('s-new', 8), sessionDoc('s-2', 4, created.dateStart)]
    await cycle([created], second.mirror)
    const incremental = normalize(Object.fromEntries(structuredClone([...store])))

    store = new Map()
    await refreshSyncProjections({ ...base(), mirror: { entry: null, ownerDocument: ownerDocument() } })
    const rebuilt = normalize(Object.fromEntries(structuredClone([...store])))
    expect(rebuilt).toEqual(incremental)
  })
})
