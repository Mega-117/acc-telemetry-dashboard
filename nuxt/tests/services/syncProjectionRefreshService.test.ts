import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applyTrackBestsProjectionDeltas: vi.fn(async () => undefined),
  applyUserProjectionDeltas: vi.fn(async () => ({ wrote: true, totalSessions: 1, sessionsLast7Days: 1 })),
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

function params(loadSessions = vi.fn(async () => [])) {
  return {
    db: {}, uid: 'owner-1', changedCount: 1, loadSessions,
    clearTrackDerivedCaches: vi.fn(), resetAllTrackBests: vi.fn(async () => 0),
    getDocFn: vi.fn(), setDocFn: vi.fn(), bestRulesVersion: 5,
    reason: 'test', userProjectionDeltas: [delta]
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
    expect(input.loadSessions).not.toHaveBeenCalled()
    expect(result.projectionsWritten).toBe(true)
  })

  it('uses the existing full rebuild when incremental track detail is unsafe', async () => {
    mocks.applyTrackDetailProjectionDeltas.mockResolvedValue({ wrote: false, requiresFullRebuild: true })
    const freshSessions = [{ sessionId: 'session-new' }]
    const loadSessions = vi.fn(async () => freshSessions as any)
    const input = params(loadSessions)

    const result = await refreshSyncProjections(input)

    expect(loadSessions).toHaveBeenCalledWith(undefined, true, {
      sourceMode: 'cloud_fresh', context: 'test'
    })
    expect(mocks.writeUserProjectionDocuments).toHaveBeenCalledWith(expect.objectContaining({
      sessions: freshSessions
    }))
    expect(result.sessions).toBe(freshSessions)
  })
})
