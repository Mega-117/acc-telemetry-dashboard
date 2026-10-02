import { describe, expect, it } from 'vitest'
import { buildSessionIndexProjection } from '~/services/sync/sessionIndexProjectionService'
import { createSessionListEntry, createSessionListEntryFromDelta, sessionListEntryToSessionDocument } from '~/services/sync/sessionListProjectionService'
import { buildGameActivity } from '~/services/telemetry/gameProjection'
import { extractMetadata } from '~/utils/sessionParser'
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
  it('preserves source identity in projection deltas and prevents same-time variant merges', () => {
    const short = session('synthetic'), full = session('synthetic')
    short.meta.trackVariant = 'short'; short.meta.sourceSessionId = 'source-short'
    full.meta.trackVariant = 'full'; full.meta.sourceSessionId = 'source-full'; full.sessionId = 'separate-id'
    const entry = createSessionListEntry(short)
    expect(sessionListEntryToSessionDocument(JSON.parse(JSON.stringify(entry))).meta.sourceSessionId).toBe('source-short')
    const fromDelta = createSessionListEntryFromDelta({ gameId: 'synthetic', sourceSessionId: 'source-short',
      sessionId: short.sessionId, trackId: short.meta.track, trackVariant: 'short', car: short.meta.car, dateStart: short.meta.date_start, summary: short.summary })
    expect(fromDelta.sourceSessionId).toBe('source-short')
    expect(dedupeCloudSessions([short, full])).toHaveLength(2)
    expect(mergeLocalFirst([full], [short])).toHaveLength(2)
    expect(() => mergeSessionLocalPreferred(full, short)).toThrow('cross-context')
  })
  it('preserves named session kind and variant from recorder through upload delta and cache', () => {
    const { meta, summary } = extractMetadata({
      schema: 'racercore.session', version: 1, game_id: 'evo',
      session_info: { track: 'Spa', track_variant: 'short', car: 'car', date_start: '2026-10-02', session_kind: 'time_attack' },
      summary: { schema: 'racercore.timing-summary', version: 1, laps: 1, lapsValid: 0, totalTime: 120000 }, stints: [],
    })
    expect(meta).toMatchObject({ gameId: 'evo', trackVariant: 'short', sessionKind: 'time_attack', session_type: -1 })
    const fromRaw = createSessionListEntry({ ...session('evo'), meta, summary })
    const fromDelta = createSessionListEntryFromDelta({ gameId: meta.gameId, trackVariant: meta.trackVariant,
      sessionKind: meta.sessionKind, sessionId: 'evo-same-session', trackId: meta.track,
      car: meta.car, dateStart: meta.date_start, sessionType: meta.session_type, summary })
    expect(fromDelta).toEqual(fromRaw)
    expect(sessionListEntryToSessionDocument(JSON.parse(JSON.stringify(fromDelta))).meta)
      .toMatchObject({ gameId: 'evo', trackVariant: 'short', sessionKind: 'time_attack' })
  })
  it('keeps circuit variants separate during full rebuild', () => {
    const short = session('evo'), full = session('evo')
    short.meta.trackVariant = 'short'
    full.meta.trackVariant = 'full'
    expect(buildSessionIndexProjection([short, full]).tracksSummary.map(item => item.trackVariant)).toEqual(['short', 'full'])
  })
  it('never interprets another game numeric enum as ACC, and retains non-race activity', () => {
    const date = '2026-10-02'
    const activity = buildGameActivity([
      { gameId: 'acc', date, type: 0, totalTime: 120000 },
      { gameId: 'evo', date, type: 0, totalTime: 60000 },
      { gameId: 'evo', date, type: 1, sessionKind: 'race', totalTime: 180000 },
      { gameId: 'evo', date, sessionKind: 'time_attack', totalTime: 240000 },
      { gameId: 'evo', date: '2020-01-01', sessionKind: 'race', totalTime: 60000 },
    ], new Date(2026, 9, 2))
    expect(activity.acc?.practice).toEqual({ minutes: 2, sessions: 1 })
    expect(activity.evo?.practice.sessions).toBe(0)
    expect(activity.evo?.qualify.sessions).toBe(0)
    expect(activity.evo?.race).toEqual({ minutes: 3, sessions: 1 })
    expect(activity.evo?.byKind).toEqual({ unknown: { minutes: 1, sessions: 1 }, race: { minutes: 3, sessions: 1 }, time_attack: { minutes: 4, sessions: 1 } })
  })
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
