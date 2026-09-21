import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyTrackBestsProjectionDeltas: vi.fn(async () => undefined),
  applyUserProjectionDeltas: vi.fn(async () => ({
    wrote: true, totalSessions: 1, sessionsLast7Days: 1,
    previousContributions: new Map([['session-new', { laps: 3, lapsValid: 2, totalTime: 300_000 }]])
  })),
  applyTrackDetailProjectionDeltas: vi.fn(),
  rebuildTrackBestsProjection: vi.fn(async () => undefined),
  writeUserProjectionDocuments: vi.fn(async () => undefined)
}))

vi.mock('~/services/sync/trackBestsProjectionService', () => ({
  applyTrackBestsProjectionDeltas: mocks.applyTrackBestsProjectionDeltas
}))
vi.mock('~/services/sync/syncUserProjectionDeltaService', () => ({
  applyUserProjectionDeltas: mocks.applyUserProjectionDeltas
}))
vi.mock('~/services/sync/trackDetailProjectionService', () => ({
  applyTrackDetailProjectionDeltas: mocks.applyTrackDetailProjectionDeltas
}))
vi.mock('~/services/sync/projectionRebuildService', () => ({
  rebuildTrackBestsProjection: mocks.rebuildTrackBestsProjection,
  writeUserProjectionDocuments: mocks.writeUserProjectionDocuments
}))

import { refreshSyncProjections } from '~/services/sync/syncProjectionRefreshService'

const delta = {
  status: 'created' as const,
  trackId: 'nurburgring', sessionId: 'session-new', dateStart: '2026-08-21T21:33:13Z',
  sessionType: 2, car: 'ferrari_296_gt3', summary: { laps: 12 }
}

function params(loadFullHistory = vi.fn(async (_uid: string) => [] as any[])) {
  return {
    db: {}, uid: 'owner-1', changedCount: 1, loadFullHistory,
    clearTrackDerivedCaches: vi.fn(), resetAllTrackBests: vi.fn(async () => 0),
    getDocFn: vi.fn(), setDocFn: vi.fn(), bestRulesVersion: 5,
    reason: 'test', userProjectionDeltas: [delta], trackBestDeltas: [delta]
  }
}

describe('refreshSyncProjections', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refreshes track detail incrementally before taking the delta fast path', async () => {
    mocks.applyTrackDetailProjectionDeltas.mockResolvedValue({ wrote: true, requiresFullRebuild: false })
    const input = params()

    const result = await refreshSyncProjections(input)

    expect(mocks.applyUserProjectionDeltas).toHaveBeenCalledOnce()
    expect(mocks.applyTrackDetailProjectionDeltas).toHaveBeenCalledOnce()
    expect(input.loadFullHistory).not.toHaveBeenCalled()
    expect(mocks.writeUserProjectionDocuments).not.toHaveBeenCalled()
    expect(result.projectionsWritten).toBe(true)
  })

  it('PIP-436: passes the already-counted contribution of updated sessions to track projections', async () => {
    mocks.applyTrackDetailProjectionDeltas.mockResolvedValue({ wrote: true, requiresFullRebuild: false })
    await refreshSyncProjections(params())

    const userOrder = mocks.applyUserProjectionDeltas.mock.invocationCallOrder[0]!
    expect(mocks.applyTrackBestsProjectionDeltas.mock.invocationCallOrder[0]).toBeGreaterThan(userOrder)
    const previous = (mocks.applyTrackDetailProjectionDeltas.mock.calls[0] as any)[0].previousContributions
    expect(previous.get('session-new')).toEqual({ laps: 3, lapsValid: 2, totalTime: 300_000 })
    expect((mocks.applyTrackBestsProjectionDeltas.mock.calls[0] as any)[0].previousContributions).toBe(previous)
  })

  it('PIP-436: rebuilds from the full owner history, never from the capped UI loader', async () => {
    mocks.applyTrackDetailProjectionDeltas.mockResolvedValue({ wrote: false, requiresFullRebuild: true })
    const freshSessions = [{ sessionId: 'session-new' }]
    const loadFullHistory = vi.fn(async () => freshSessions as any)
    const input = params(loadFullHistory)

    const result = await refreshSyncProjections(input)

    expect(loadFullHistory).toHaveBeenCalledWith('owner-1')
    expect(mocks.writeUserProjectionDocuments).toHaveBeenCalledWith(expect.objectContaining({
      sessions: freshSessions
    }))
    expect(result.sessions).toBe(freshSessions)
  })
})
