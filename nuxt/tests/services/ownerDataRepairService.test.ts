import { beforeEach, describe, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), set: vi.fn(), invalidate: vi.fn(), clear: vi.fn(), changed: vi.fn() }))
vi.mock('~/services/sync/syncMirrorService', () => ({ invalidateSyncMirror: io.invalidate }))
vi.mock('~/repositories/telemetryProjectionRepository', () => ({ clearTelemetryProjectionRepositoryCache: io.clear }))
vi.mock('~/services/cache/ownerCacheSignals', () => ({ notifyOwnerCacheChanged: io.changed }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  collection: (_db: unknown, path: string) => ({ path }),
  query: (value: unknown) => value, limit: () => 1, serverTimestamp: () => 'server-time'
}))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: io.get, trackedGetDocs: io.list, trackedSetDoc: io.set,
  trackedDeleteDoc: vi.fn(), withFirebaseScenario: (_n: string, _m: unknown, run: () => unknown) => run()
}))
import {
  isLegacyTrackBestProjectionDoc,
  runOwnerProjectionRepairWrites,
  migrateOwnerTrackProjections
} from '~/services/sync/ownerDataRepairService'
import { buildTrackBestsIndexDocument } from '~/services/sync/trackBestsIndexProjectionService'

describe('targeted track maintenance I/O', () => {
  const bests = { version: 4, bestRulesVersion: 5, activity: { sessionCount: 666 }, lastSessionDate: '2026-09-22', bests: {} }
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
    expect(isLegacyTrackBestProjectionDoc({ version: 3, bestRulesVersion: 5 })).toBe(true)
  })

  it('accetta solo trackBests con schema e regole correnti', () => {
    expect(isLegacyTrackBestProjectionDoc({ version: 4, bestRulesVersion: 5 })).toBe(false)
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
