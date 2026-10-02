import { BEST_RULES_VERSION, extractMetadata } from '~/utils/sessionParser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), set: vi.fn(), invalidate: vi.fn(), clear: vi.fn(), changed: vi.fn() }))
vi.mock('~/services/sync/syncMirrorService', () => ({ invalidateSyncMirror: io.invalidate }))
vi.mock('~/repositories/telemetryProjectionRepository', () => ({ clearTelemetryProjectionRepositoryCache: io.clear }))
vi.mock('~/services/cache/ownerCacheSignals', () => ({ notifyOwnerCacheChanged: io.changed }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  collection: (_db: unknown, path: string) => ({ path }),
  query: (value: unknown) => value, orderBy: () => null, limit: () => 1, serverTimestamp: () => 'server-time'
}))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: io.get, trackedGetDocs: io.list, trackedSetDoc: io.set,
  trackedDeleteDoc: vi.fn(), withFirebaseScenario: (_n: string, _m: unknown, run: () => unknown) => run()
}))
import {
  isLegacyTrackBestProjectionDoc,
  auditOwnerData,
  reprocessOwnerCloudRawSummaries,
  runOwnerProjectionRepairWrites,
  migrateOwnerTrackProjections
} from '~/services/sync/ownerDataRepairService'
import { buildTrackBestsIndexDocument } from '~/services/sync/trackBestsIndexProjectionService'
import { rebuildTrackBestsProjection } from '~/services/sync/projectionRebuildService'
import { writeTrackDetailProjectionDocuments } from '~/services/sync/trackDetailProjectionService'

describe('multisim owner maintenance', () => {
  const raw = { schema: 'racercore.session', version: 1, game_id: 'evo', session_id: 'evo-test',
    session_info: { track: 'Evo-only', car: 'Car', track_variant: 'short', date_start: '2026-10-02', session_kind: 'practice' },
    stints: [], summary: { schema: 'racercore.timing-summary', version: 1, laps: 3, lapsValid: 1, bestLap: 90000, totalTime: 270000 } }
  const meta = { gameId: 'evo', track: 'Evo-only', car: 'Car', date_start: '2026-10-02', trackVariant: 'short' }
  beforeEach(() => { vi.clearAllMocks(); io.get.mockResolvedValue({ exists: () => false }); io.set.mockResolvedValue(undefined) })
  it('does not rebuild ACC best or track detail documents from a non-ACC session', async () => {
    const sessions = [{ sessionId: 'evo-test', meta, summary: { laps: 3, bestQualyMs: 90000, best_rules_version: 6 } }] as any
    await rebuildTrackBestsProjection({ db: {}, uid: 'owner', sessions, resetAllTrackBests: vi.fn(async () => 0), getDocFn: io.get, setDocFn: io.set, bestRulesVersion: BEST_RULES_VERSION })
    expect(io.set.mock.calls.every(([ref]) => !ref.path.includes('/trackProjections/'))).toBe(true)
    io.set.mockClear()
    await writeTrackDetailProjectionDocuments({ db: {}, uid: 'owner', sessions, setDocFn: io.set })
    expect(io.set).not.toHaveBeenCalled()
  })
  it('recognizes the common summary version without requiring ACC rules or ACC track projections', async () => {
    io.list.mockImplementation(async ({ path }) => ({ docs: path.endsWith('/sessions')
      ? [{ id: 'evo-test', data: () => ({ meta, summary: { laps: 3 }, summaryRulesVersion: 1, rawChunkCount: 1 }) }] : [] }))
    const report = await auditOwnerData('owner')
    expect(report.sessions.canonical).toBe(1)
    expect(report.sessions.missingCanonical).toBe(0)
    expect(report.projections.missingTrackBests).toEqual([])
    expect(io.set).not.toHaveBeenCalled()
    const reprocess = await reprocessOwnerCloudRawSummaries('owner')
    expect(reprocess.eligibleSessions).toBe(0)
  })
  it('rebuilds a common raw without adding best_rules_version or invoking the ACC domain', async () => {
    io.list.mockImplementation(async ({ path }) => ({ docs: path.endsWith('/sessions')
      ? [{ id: 'evo-test', ref: { path: 'users/owner/sessions/evo-test' }, data: () => ({ meta, summary: {}, summaryRulesVersion: 0 }) }]
      : path.endsWith('/rawChunks') ? [{ data: () => ({ idx: 0, chunk: JSON.stringify(raw) }) }] : [] }))
    const report = await reprocessOwnerCloudRawSummaries('owner', { forceAll: true })
    expect(report.failedSessions).toBe(0)
    expect(report.updatedSessions).toBe(1)
    expect(io.set.mock.calls[0]![1]).toMatchObject({ meta: { gameId: 'evo', trackVariant: 'short' }, summaryRulesVersion: 1, summary: { bestLap: 90000, lapsValid: 1 } })
    expect(io.set.mock.calls[0]![1].summary).not.toHaveProperty('best_rules_version')
  })
  it('does not relabel unknown raw schema as an ACC summary', async () => {
    io.list.mockImplementation(async ({ path }) => ({ docs: path.endsWith('/sessions')
      ? [{ id: 'unknown', ref: { path: 'users/owner/sessions/unknown' }, data: () => ({ meta, summary: {} }) }]
      : path.endsWith('/rawChunks') ? [{ data: () => ({ idx: 0, chunk: JSON.stringify({ ...raw, version: 999 }) }) }] : [] }))
    const report = await reprocessOwnerCloudRawSummaries('owner', { forceAll: true })
    expect(report.failedSessions).toBe(1)
    expect(io.set).not.toHaveBeenCalled()
  })
  it('does not rewrite unchanged summaries merely because Firestore changed key order', async () => {
    const parsed = extractMetadata(raw)
    const reordered = (value: object) => Object.fromEntries(Object.entries(value).reverse())
    io.list.mockImplementation(async ({ path }) => ({ docs: path.endsWith('/sessions')
      ? [{ id: 'evo-test', ref: { path: 'users/owner/sessions/evo-test' }, data: () => ({ meta: reordered(parsed.meta), summary: reordered(raw.summary), summaryRulesVersion: 1 }) }]
      : path.endsWith('/rawChunks') ? [{ data: () => ({ idx: 0, chunk: JSON.stringify(raw) }) }] : [] }))
    const report = await reprocessOwnerCloudRawSummaries('owner', { forceAll: true })
    expect(report.unchangedSessions).toBe(1)
    expect(io.set).not.toHaveBeenCalled()
  })
})

describe('targeted track maintenance I/O', () => {
  const bests = { version: 4, bestRulesVersion: BEST_RULES_VERSION, activity: { sessionCount: 666 }, lastSessionDate: '2026-09-22', bests: {} }
  beforeEach(() => {
    vi.clearAllMocks()
    io.list.mockImplementation(async ({ path }: { path: string }) => ({ docs:
      path.endsWith('/trackBests') ? [{ id: 'imola', data: () => bests }] :
      path.endsWith('/trackDetailProjections') ? [{ id: 'imola', data: () => ({ schemaVersion: 1 }) }] : []
    }))
    io.get.mockResolvedValue({ exists: () => false })
    io.set.mockResolvedValue(undefined)
  })
  it('merges legacy sections and repairs the index without reading any sessions', async () => {
    await migrateOwnerTrackProjections('owner', { repairIndex: true })
    expect(io.list.mock.calls.map(([ref]) => ref.path)).toEqual([
      'users/owner/trackProjections', 'users/owner/trackBests', 'users/owner/trackDetailProjections'
    ])
    expect(io.set.mock.calls.map(([ref]) => ref.path)).toEqual([
      'users/owner/trackProjections/imola', 'users/owner/trackBestsIndex/v1'
    ])
    expect(io.set.mock.calls[0]?.[1].bests).toEqual(bests)
    expect(io.set.mock.calls[1]?.[1].tracks.imola.activity.sessionCount).toBe(666)
  })
  it('does not rewrite an already coherent index or merged track', async () => {
    io.list.mockImplementation(async ({ path }: { path: string }) => ({ docs: path.endsWith('/trackProjections')
      ? [{ id: 'imola', data: () => ({ schemaVersion: 1, bests, detail: { schemaVersion: 1 } }) }] : [] }))
    io.get.mockResolvedValue({ exists: () => true, data: () => buildTrackBestsIndexDocument({ imola: bests }) })
    await migrateOwnerTrackProjections('owner', { repairIndex: true })
    expect(io.set).not.toHaveBeenCalled()
    expect(io.clear).not.toHaveBeenCalled()
    expect(io.changed).not.toHaveBeenCalled()
  })
  it('invalidates local copies when only the index needs repair', async () => {
    io.list.mockImplementation(async ({ path }: { path: string }) => ({ docs: path.endsWith('/trackProjections')
      ? [{ id: 'imola', data: () => ({ schemaVersion: 1, bests, detail: { schemaVersion: 1 } }) }] : [] }))
    await migrateOwnerTrackProjections('owner', { repairIndex: true })
    expect(io.set.mock.calls.map(([ref]) => ref.path)).toEqual(['users/owner/trackBestsIndex/v1'])
    expect(io.invalidate).toHaveBeenCalledWith('owner')
    expect(io.clear).toHaveBeenCalledWith('owner')
    expect(io.changed).toHaveBeenCalledWith('owner')
  })
  it('does not publish a partial index when a source read fails', async () => {
    io.list.mockRejectedValueOnce(new Error('permission-denied'))
    await expect(migrateOwnerTrackProjections('owner', { repairIndex: true })).rejects.toThrow('permission-denied')
    expect(io.set).not.toHaveBeenCalled()
  })
})

describe('isLegacyTrackBestProjectionDoc', () => {
  it('considera legacy un trackBests con schema corrente ma bestRulesVersion vecchia', () => {
    expect(isLegacyTrackBestProjectionDoc({ version: 4, bestRulesVersion: 3 })).toBe(true)
  })

  it('considera legacy un trackBests con schema vecchio anche se bestRulesVersion corrente', () => {
    expect(isLegacyTrackBestProjectionDoc({ version: 3, bestRulesVersion: BEST_RULES_VERSION })).toBe(true)
  })

  it('accetta solo trackBests con schema e regole correnti', () => {
    expect(isLegacyTrackBestProjectionDoc({ version: 4, bestRulesVersion: BEST_RULES_VERSION })).toBe(false)
  })
})

describe('runOwnerProjectionRepairWrites', () => {
  it('crea la directory completa prima della patch incrementale', async () => {
    const order: string[] = []
    const wrote = await runOwnerProjectionRepairWrites({
      writeFullPilotDirectory: vi.fn(async () => {
        order.push('directory')
      }),
      writeUserProjection: vi.fn(async () => {
        order.push('user-projection')
      })
    })

    expect(wrote).toBe(true)
    expect(order).toEqual(['directory', 'user-projection'])
  })

  it('mantiene riparabile la projection utente se il mirror directory fallisce', async () => {
    const writeUserProjection = vi.fn(async () => undefined)
    const wrote = await runOwnerProjectionRepairWrites({
      writeFullPilotDirectory: vi.fn(async () => {
        throw new Error('directory unavailable')
      }),
      writeUserProjection
    })

    expect(wrote).toBe(false)
    expect(writeUserProjection).toHaveBeenCalledOnce()
  })
})
