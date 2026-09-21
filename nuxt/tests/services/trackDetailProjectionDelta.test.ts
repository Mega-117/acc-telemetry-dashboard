import { describe, expect, it, vi } from 'vitest'
import { applyTrackDetailProjectionDeltas } from '~/services/sync/trackDetailProjectionService'
import { TRACK_DETAIL_PROJECTION_SCHEMA_VERSION, type TrackDetailProjectionDocument } from '~/types/trackProjections'

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => path,
  serverTimestamp: () => 'server-time'
}))

function existing(schemaVersion = TRACK_DETAIL_PROJECTION_SCHEMA_VERSION): TrackDetailProjectionDocument {
  return {
    schemaVersion,
    trackId: 'nurburgring',
    lastSessionDate: '2026-08-20T10:00:00Z',
    categories: {
      GT3: {
        recentSessions: [], historicalTimes: [], sessionCount: 1,
        lastSessionDate: '2026-08-20T10:00:00Z',
        activity: { totalLaps: 10, validLaps: 8, validPercent: 80, totalTimeMs: 1_000_000, totalTimeFormatted: '16m', sessionCount: 1 }
      }
    }
  }
}

const delta = {
  status: 'created' as const,
  trackId: 'nurburgring', sessionId: 'session-new', dateStart: '2026-08-21T21:33:13Z',
  sessionType: 2, car: 'ferrari_296_gt3',
  summary: { laps: 12, lapsValid: 10, totalTime: 1_400_000, stintCount: 2, best_session_race_ms: 114_060 }
}

describe('applyTrackDetailProjectionDeltas', () => {
  it('adds a synced created session to recent sessions and activity', async () => {
    const setDocFn = vi.fn(async () => undefined)
    const result = await applyTrackDetailProjectionDeltas({
      db: {}, uid: 'owner-1', deltas: [delta],
      getDocFn: async () => ({ exists: () => true, data: () => existing() }),
      setDocFn
    })

    expect(result).toEqual({ wrote: true, requiresFullRebuild: false })
    expect(setDocFn.mock.calls[0][1]).toMatchObject({
      schemaVersion: TRACK_DETAIL_PROJECTION_SCHEMA_VERSION,
      categories: { GT3: { sessionCount: 2, activity: { totalLaps: 22, validLaps: 18 }, recentSessions: [{ id: 'session-new' }] } }
    })
  })

  it('requests the safe full rebuild for a legacy projection', async () => {
    const setDocFn = vi.fn(async () => undefined)
    const legacy = await applyTrackDetailProjectionDeltas({
      db: {}, uid: 'owner-1', deltas: [delta],
      getDocFn: async () => ({ exists: () => true, data: () => existing(1) }), setDocFn
    })

    expect(legacy.requiresFullRebuild).toBe(true)
    expect(setDocFn).not.toHaveBeenCalled()
  })

  // PIP-436: ogni giro successivo ricarica lo stesso file (stesso ID, stato updated).
  function withSession(recent: Record<string, unknown>): TrackDetailProjectionDocument {
    const doc = existing()
    const gt3 = doc.categories.GT3!
    gt3.recentSessions = [{ id: 'session-new', dateStart: delta.dateStart, date: '2026-08-21', time: '', type: 'race',
      car: 'Ferrari 296 GT3', laps: 5, stints: 1, ...recent }]
    gt3.historicalTimes = [{ date: '21 ago', dateStart: delta.dateStart, sessionId: 'session-new' }]
    gt3.sessionCount = 2
    gt3.activity = { totalLaps: 15, validLaps: 12, validPercent: 80, totalTimeMs: 1_500_000, totalTimeFormatted: '', sessionCount: 2 }
    return doc
  }

  it('replaces an updated session in place and moves activity by the difference only', async () => {
    const setDocFn = vi.fn(async () => undefined)
    const result = await applyTrackDetailProjectionDeltas({
      db: {}, uid: 'owner-1', deltas: [{ ...delta, status: 'updated' }],
      getDocFn: async () => ({ exists: () => true, data: () => withSession({}) }), setDocFn,
      previousContributions: new Map([['session-new', { laps: 5, lapsValid: 4, totalTime: 500_000 }]])
    })

    expect(result).toEqual({ wrote: true, requiresFullRebuild: false })
    const gt3 = (setDocFn.mock.calls[0] as any)[1].categories.GT3
    expect(gt3.sessionCount).toBe(2)
    expect(gt3.activity).toMatchObject({ totalLaps: 22, validLaps: 18, totalTimeMs: 2_400_000, sessionCount: 2 })
    expect(gt3.recentSessions).toHaveLength(1)
    expect(gt3.recentSessions[0]).toMatchObject({ id: 'session-new', laps: 12, lapsValid: 10, totalTimeMs: 1_400_000 })
    expect(gt3.historicalTimes).toHaveLength(1)
  })

  it('uses the contribution stored in the recent entry when the index no longer has it', async () => {
    const setDocFn = vi.fn(async () => undefined)
    await applyTrackDetailProjectionDeltas({
      db: {}, uid: 'owner-1', deltas: [{ ...delta, status: 'updated' }],
      getDocFn: async () => ({ exists: () => true, data: () => withSession({ lapsValid: 4, totalTimeMs: 500_000 }) }), setDocFn
    })
    expect((setDocFn.mock.calls[0] as any)[1].categories.GT3.activity.totalLaps).toBe(22)
  })

  it('refuses to guess when the previous contribution is unknown, and adds sessions never listed', async () => {
    const setDocFn = vi.fn(async () => undefined)
    const unknown = await applyTrackDetailProjectionDeltas({
      db: {}, uid: 'owner-1', deltas: [{ ...delta, status: 'updated' }],
      getDocFn: async () => ({ exists: () => true, data: () => withSession({}) }), setDocFn
    })
    expect(unknown.requiresFullRebuild).toBe(true)
    expect(setDocFn).not.toHaveBeenCalled()

    const firstWithLaps = await applyTrackDetailProjectionDeltas({
      db: {}, uid: 'owner-1', deltas: [{ ...delta, status: 'updated' }],
      getDocFn: async () => ({ exists: () => true, data: () => existing() }), setDocFn
    })
    expect(firstWithLaps.wrote).toBe(true)
    expect((setDocFn.mock.calls[0] as any)[1].categories.GT3.sessionCount).toBe(2)
  })

  it('writes nothing when the reloaded session did not change', async () => {
    const setDocFn = vi.fn(async () => undefined)
    const first = vi.fn(async () => undefined)
    await applyTrackDetailProjectionDeltas({
      db: {}, uid: 'owner-1', deltas: [delta],
      getDocFn: async () => ({ exists: () => true, data: () => existing() }), setDocFn: first
    })
    const { updatedAt: _ignored, ...stored } = (first.mock.calls[0] as any)[1]
    const result = await applyTrackDetailProjectionDeltas({
      db: {}, uid: 'owner-1', deltas: [{ ...delta, status: 'updated' }],
      getDocFn: async () => ({ exists: () => true, data: () => stored }), setDocFn,
      previousContributions: new Map([['session-new', { laps: 12, lapsValid: 10, totalTime: 1_400_000 }]])
    })
    expect(result.wrote).toBe(false)
    expect(setDocFn).not.toHaveBeenCalled()
  })
})
