import { describe, expect, it } from 'vitest'
import { buildSessionIndexProjection } from '~/services/sync/sessionIndexProjectionService'
import { createSessionListEntry, sessionListEntryToSessionDocument } from '~/services/sync/sessionListProjectionService'
import type { SessionDocument } from '~/types/telemetry'
import { dedupeCloudSessions, mergeLocalFirst, mergeSessionLocalPreferred } from '~/services/telemetry/telemetryMergeService'

function session(gameId: string): SessionDocument {
  return {
    sessionId: `${gameId}-same-session`,
    meta: { gameId, track: 'Spa', car: 'mercedes_amg_gt3_evo', date_start: '2026-10-02T00:00:00Z', session_type: -1 },
    summary: { laps: 2, lapsValid: 0, totalTime: 124000, bestLap: null, stintCount: 1 }
  } as SessionDocument
}

describe('multi-simulator projection identity', () => {
  it('does not deduplicate or merge homonymous sessions across games', () => {
    const acc = session('acc')
    const other = { ...session('synthetic'), sessionId: acc.sessionId }
    expect(dedupeCloudSessions([acc, other])).toHaveLength(2)
    expect(mergeLocalFirst([other], [acc])).toHaveLength(2)
    expect(() => mergeSessionLocalPreferred(other, acc)).toThrow('cross-game')
  })
  it('keeps homonymous tracks separate in the session index', () => {
    const index = buildSessionIndexProjection([session('acc'), session('synthetic')])
    expect(index.tracksSummary).toHaveLength(2)
    expect(index.tracksSummary.map(item => item.gameId)).toEqual(['acc', 'synthetic'])
    expect(index.sessionsList.map(item => item.gameId)).toEqual(['acc', 'synthetic'])
  })
  it('preserves identity through paginated list/cache projection roundtrip', () => {
    const entry = createSessionListEntry(session('synthetic'))
    expect(entry.gameId).toBe('synthetic')
    expect(entry.carCategory).toBeNull()
    expect(entry.bestRaceMs).toBeNull()
    const restored = sessionListEntryToSessionDocument(JSON.parse(JSON.stringify(entry)))
    expect(restored.meta.gameId).toBe('synthetic')
    expect(restored.summary.bestLap).toBeNull()
    const legacy = createSessionListEntry(session('acc'))
    delete legacy.gameId
    expect(sessionListEntryToSessionDocument(legacy).meta.gameId).toBe('acc')
  })
})
