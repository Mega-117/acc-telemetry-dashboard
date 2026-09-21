// PIP-436: costo per ciclo di sync quando lo stesso file sessione viene ricaricato a ogni giro.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => path,
  serverTimestamp: () => 'server-time'
}))

import { applyUserProjectionDeltas } from '~/services/sync/syncUserProjectionDeltaService'
import { applySessionListProjectionDeltas } from '~/services/sync/sessionListProjectionService'
import { applyTrackBestsProjectionDeltas } from '~/services/sync/trackBestsProjectionService'

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
const setDocFn = async (path: string, data: any, options?: { merge?: boolean }) => {
  writes.push(path)
  store.set(path, options?.merge ? { ...(store.get(path) || {}), ...data } : data)
}

const NOW = new Date().toISOString()
const delta = (status: 'created' | 'updated', laps: number, extra: Record<string, unknown> = {}) => ({
  status, sessionId: 's-new', trackId: 'monza', dateStart: NOW, sessionType: 0, car: 'ferrari_296_gt3',
  summary: { laps, lapsValid: laps - 1, totalTime: laps * 100_000, stintCount: 1 }, ...extra
})

function listEntry(id: string, date: string, laps = 3) {
  return { id, date, track: 'monza', car: 'ferrari_296_gt3', type: 0, laps, lapsValid: laps - 1, totalTimeMs: laps * 100_000 }
}

beforeEach(() => {
  store = new Map()
  reads.length = 0
  writes.length = 0
})

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
    store.set('users/u/trackBests/monza', {
      version: 99, bestRulesVersion: 99, trackId: 'monza', bests: {},
      activity: { totalLaps: 15, validLaps: 12, totalTimeMs: 1_500_000, sessionCount: 2 },
      syncedSessionIds: ['s-old', 's-new']
    })
    await applyTrackBestsProjectionDeltas({
      db: {}, uid: 'u', deltas: [delta('updated', 8)], getDocFn, setDocFn, docFn, bestRulesVersion: 1,
      previousContributions: new Map([['s-new', { laps: 5, lapsValid: 4, totalTime: 500_000 }]])
    })
    expect(store.get('users/u/trackBests/monza').activity).toMatchObject({
      totalLaps: 18, validLaps: 15, totalTimeMs: 1_800_000, sessionCount: 2
    })
  })
})
