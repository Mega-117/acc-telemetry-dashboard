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

  it('requests the safe full rebuild for a legacy projection or updated session', async () => {
    const setDocFn = vi.fn(async () => undefined)
    const legacy = await applyTrackDetailProjectionDeltas({
      db: {}, uid: 'owner-1', deltas: [delta],
      getDocFn: async () => ({ exists: () => true, data: () => existing(1) }), setDocFn
    })
    const updated = await applyTrackDetailProjectionDeltas({
      db: {}, uid: 'owner-1', deltas: [{ ...delta, status: 'updated' }],
      getDocFn: async () => ({ exists: () => true, data: () => existing() }), setDocFn
    })

    expect(legacy.requiresFullRebuild).toBe(true)
    expect(updated.requiresFullRebuild).toBe(true)
    expect(setDocFn).not.toHaveBeenCalled()
  })
})
