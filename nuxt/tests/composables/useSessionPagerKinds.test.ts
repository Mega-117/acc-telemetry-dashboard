import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useSessionPager, clearSessionPagerCache } from '~/composables/useSessionPager'

const fake = vi.hoisted(() => ({ queries: [] as any[], rows: [] as any[] }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ profileUser: ref({ uid: 'qa' }), cloudSessionReady: ref(true) }) }))
vi.mock('~/repositories/ownerDocumentRepository', () => ({ loadOwnerDocument: async () => ({ exists: false }) }))
vi.mock('~/repositories/telemetryLocalRepository', () => ({ loadLocalTelemetrySessions: async () => [] }))
vi.mock('~/services/sync/sessionListProjectionService', () => ({
  loadSessionListProjection: async () => null, clearSessionListProjectionCache: () => {},
}))
vi.mock('~/services/monitoring/firebaseOpsJournal', () => ({ checkFirebaseCacheFreshness: () => false }))
vi.mock('firebase/firestore', async (original) => ({
  ...await original<typeof import('firebase/firestore')>(),
  collection: (_db: unknown, path: string) => path,
  query: (_ref: unknown, ...constraints: any[]) => constraints,
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: () => ({}), limit: () => ({}), startAfter: () => ({}),
}))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: vi.fn(), trackedGetCountFromServer: vi.fn(),
  trackedGetDocs: async (constraints: any[]) => {
    fake.queries.push(constraints)
    // Model the database boundary: a numeric predicate cannot return named kinds.
    const type = constraints.find(c => c.field === 'meta.session_type')
    const rows = type ? fake.rows.filter(row => row.meta.session_type === type.value) : fake.rows
    return { docs: rows.map(row => ({ id: row.id, data: () => row })) }
  },
}))

beforeEach(() => {
  clearSessionPagerCache()
  fake.queries = []
  fake.rows = [
    { id: 'evo-qualify', meta: { gameId: 'evo', sessionKind: 'qualify', session_type: -1, date_start: '2026-10-03', track: 'Spa', car: 'QA' }, summary: { laps: 1 } },
    { id: 'unknown', meta: { gameId: 'evo', sessionKind: 'unknown', session_type: 1, date_start: '2026-10-03', track: 'Spa', car: 'QA' }, summary: { laps: 1 } },
    { id: 'acc-qualify', meta: { gameId: 'acc', session_type: 1, date_start: '2026-10-02', track: 'Spa', car: 'QA' }, summary: { laps: 1 } },
  ]
})

describe('session kind filtering without projections', () => {
  it('excludes another game from ACC category filters even for an identical car name', async () => {
    const pager = useSessionPager()
    const rows = await pager.loadPage('qa', { reset: true, filters: { gameId: null, carCategory: 'GT3' } })
    expect(rows.map(row => row.sessionId)).toEqual(['acc-qualify'])
  })
  it.each(['evo', null])('keeps declared kinds in cloud fallback for %s', async (gameId) => {
    const pager = useSessionPager()
    const rows = await pager.loadPage('qa', { reset: true, filters: { gameId, sessionTypes: [1] } })
    expect(pager.error.value).toBeNull()
    expect(rows.map(row => row.sessionId)).toEqual(gameId ? ['evo-qualify'] : ['evo-qualify', 'acc-qualify'])
    expect(fake.queries.flat().some(c => c.field === 'meta.session_type')).toBe(false)
  })
  it('retains the ACC numeric query for an ACC-only filter', async () => {
    const pager = useSessionPager()
    const rows = await pager.loadPage('qa', { reset: true, filters: { gameId: 'acc', sessionTypes: [1] } })
    expect(rows.map(row => row.sessionId)).toEqual(['acc-qualify'])
    expect(fake.queries.flat()).toContainEqual({ field: 'meta.session_type', op: '==', value: 1 })
  })
})
