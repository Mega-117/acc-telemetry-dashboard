import { describe, expect, it } from 'vitest'
import { recordingGame, sessionGame, gameScopedKey, canUseAccRules } from '../../app/services/telemetry/gameIdentity'
import { extractMetadata, generateSessionId } from '../../app/utils/sessionParser'

const legacy = {
  session_info: { track: 'Spa', car: 'Mercedes', date_start: '2026-10-02', session_type: 0, laps_total: 1 },
  static_data: { sectorCount: 3 }, stints: []
}

describe('game identity', () => {
  it('recognizes only the known ACC legacy format', () => {
    expect(recordingGame(legacy)).toBe('acc')
    expect(recordingGame({ session_info: { track: 'Spa' }, stints: [] })).toBeNull()
    expect(recordingGame({ ...legacy, game_id: 'evo' })).toBeNull()
    expect(recordingGame({ ...legacy, schema: 'unknown' })).toBeNull()
  })
  it('accepts a versioned new-game contract without borrowing ACC rules', () => {
    const raw = { ...legacy, schema: 'racercore.session', version: 1, game_id: 'synthetic', capabilities: { acc_best_rules: true } }
    expect(recordingGame(raw)).toBe('synthetic')
    expect(canUseAccRules(raw)).toBe(false)
    expect(recordingGame({ ...raw, version: 2 })).toBeNull()
    expect(recordingGame({ ...raw, game_id: '../acc' })).toBeNull()
  })
  it('preserves ACC IDs and separates homonymous game data', () => {
    expect(generateSessionId('2026-10-02', 'Spa', 'acc')).toBe(generateSessionId('2026-10-02', 'Spa'))
    expect(generateSessionId('2026-10-02', 'Spa', 'synthetic')).not.toBe(generateSessionId('2026-10-02', 'Spa', 'acc'))
    expect(gameScopedKey('acc', 'a|b', 'c')).not.toBe(gameScopedKey('acc', 'a', 'b|c'))
    expect(gameScopedKey('acc', 'Spa')).not.toBe(gameScopedKey('evo', 'Spa'))
  })
  it('keeps source IDs, variants, vehicles and subsecond starts distinct without lossy encoding', () => {
    const make = (sourceSessionId: string, trackVariant = 'short', car = 'QA', date = '2026-10-02T12:00:00.001Z') =>
      generateSessionId(date, 'Spa', 'evo', { sourceSessionId, trackVariant, car })
    const ids = [make('a/b'), make('a_b'), make('a/b', 'full'), make('a/b', 'short', 'Other'), make('a/b', 'short', 'QA', '2026-10-02T12:00:00.002Z')]
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every(id => !id.includes('/'))).toBe(true)
    expect(() => make('x'.repeat(2000))).toThrow('session-identity-too-long')
  })
  it('reads known projected metadata but does not default unknown objects to ACC', () => {
    expect(sessionGame({ meta: legacy.session_info })).toBe('acc')
    expect(sessionGame({ meta: { track: 'Spa' } })).toBeNull()
    expect(sessionGame({ meta: { ...legacy.session_info, gameId: 'unknown' } })).toBeNull()
  })
  it('presents common timing summaries without ACC fuel or grip classification', () => {
    const parsed = extractMetadata({ ...legacy, schema: 'racercore.session', version: 1, game_id: 'synthetic',
      summary: { schema: 'racercore.timing-summary', version: 1, laps: 2, lapsValid: 0, bestLap: null, totalTime: 124000 }
    }, { allowLegacyFallback: true })
    expect(parsed.meta.gameId).toBe('synthetic')
    expect(parsed.summarySource).toBe('canonical')
    expect(parsed.summary.laps).toBe(2)
    expect(parsed.summary.bestLap).toBeNull()
    expect(parsed.summary.best_race_ms).toBeUndefined()
    expect(parsed.summary.best_rules_version).toBeUndefined()
  })
})
