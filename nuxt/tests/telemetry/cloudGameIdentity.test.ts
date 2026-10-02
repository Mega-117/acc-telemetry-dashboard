import { describe, expect, it, vi } from 'vitest'
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => path,
  collection: (_db: unknown, path: string) => path,
  query: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  limit: (n: number) => n,
}))
vi.mock('~/utils/sessionParser', () => ({ BEST_RULES_VERSION: 6 }))
import { fetchCloudFullSession, loadCloudSessionIndexList, loadCloudSessionsBounded } from '~/repositories/telemetryCloudRepository'

const snapshot = (data: unknown) => ({ exists: () => true, data: () => data })
describe('persisted game identity on cloud reads', () => {
  it('preserves two homonyms and known legacy identity in the compact index', async () => {
    const base = { track: 'Spa', car: 'Mercedes', date: '2026-10-02', type: 0 }
    const result = await loadCloudSessionIndexList({ db: {}, targetUserId: 'qa', getDocFn: async () => snapshot({ sessionIndex: { sessionsList: [
      { ...base, id: 'old', bestRulesVersion: 6 },
      { ...base, id: 'new', gameId: 'synthetic', bestRulesVersion: 1 },
    ] } }) })
    expect(result.map(s => s.meta.gameId)).toEqual(['acc', 'synthetic'])
    expect(result.map(s => s.summarySource)).toEqual(['canonical', 'canonical'])
  })
  it('keeps the common summary canonical in bounded reads', async () => {
    const result = await loadCloudSessionsBounded({ db: {}, targetUserId: 'qa', maxItems: 10,
      getDocsFn: async () => ({ docs: [{ id: 's', data: () => ({ meta: { gameId: 'synthetic' }, summary: { best_rules_version: 1 } }) }] }) })
    expect(result[0].summarySource).toBe('canonical')
  })
  it('reassembles chunks and rejects mismatched game metadata', async () => {
    const payload = { schema: 'racercore.session', version: 1, game_id: 'synthetic', stints: [] }
    const text = JSON.stringify(payload)
    const getDocsFn = async () => ({ docs: [snapshot({ idx: 1, chunk: text.slice(20) }), snapshot({ idx: 0, chunk: text.slice(0, 20) })] })
    const summary = { best_rules_version: 1, bestLap: null }
    const params = { db: {}, targetUserId: 'qa', sessionId: 's', isExternalSession: false, getDocsFn,
      getDocFn: async () => snapshot({ meta: { gameId: 'synthetic' }, rawChunkCount: 2, summary }) }
    expect(await fetchCloudFullSession(params)).toEqual({ ...payload, summary })
    await expect(fetchCloudFullSession({ ...params, getDocFn: async () => snapshot({ meta: { gameId: 'acc' }, rawChunkCount: 2 }) })).rejects.toThrow('session-game-identity-mismatch')
  })
})
