import { describe, expect, it, beforeEach } from 'vitest'
import { useGameContext } from '~/composables/useGameContext'
import { buildGameActivity, scopeSessionIndex, buildCommonHistoryOverview } from '~/services/telemetry/gameProjection'
import type { SessionDocument } from '~/types/telemetry'
import { commonSessionPresentation } from '~/services/telemetry/commonSessionPresentation'
import { gameLabel } from '~/services/telemetry/gameCatalog'

describe('consulted game and recorded facts', () => {
  it('aggregates only matching game and comparable variants/cars with proven valid laps', () => {
    const session = (id: string, gameId: string, variant: string, car: string, valid: number, best: number | null) => ({
      sessionId: id, meta: { gameId, track: 'Spa', trackVariant: variant, car, date_start: '2026-10-02', sessionKind: 'time_attack', session_type: -1 },
      summary: { laps: 2, lapsValid: valid, bestLap: best, totalTime: 120000 },
    } as SessionDocument)
    const a = session('a', 'evo', 'short', 'Car A', 1, 60000)
    const result = buildCommonHistoryOverview([a, a, session('b', 'evo', 'full', 'Car A', 1, 120000),
      session('c', 'evo', 'short', 'Car B', 0, 45000), session('d', 'acc', 'short', 'Car A', 1, 50000)], 'evo', undefined, new Date('2026-10-02T12:00:00'))
    expect(result).toMatchObject({ sessions: 3, laps: 6, validLaps: 2, totalTimeMs: 360000 })
    expect(result.groups).toHaveLength(3)
    expect(result.groups.find(group => group.car === 'Car B')?.bestMs).toBeNull()
    expect(result.activity.time_attack).toEqual({ sessions: 3, minutes: 6 })
    expect(buildCommonHistoryOverview([a], 'synthetic').sessions).toBe(0)
    expect(buildCommonHistoryOverview([a], 'evo', 'Monza').sessions).toBe(0)
  })
  beforeEach(() => useGameContext().selectGame('acc'))
  it('accepts a deliberate game choice and rejects unknown or unauthorized dev choices', () => {
    const context = useGameContext()
    context.selectGame('evo')
    expect(context.consultedGame.value).toBe('evo')
    context.selectGame('synthetic')
    context.selectGame('arbitrary')
    expect(context.consultedGame.value).toBe('evo')
    context.selectGame('synthetic', true)
    expect(context.consultedGame.value).toBe('synthetic')
    expect(gameLabel('acc')).toBe('ACC')
    expect(gameLabel(null)).toBe('Gioco sconosciuto')
  })
  it('scopes homonymous tracks, last session and activity before presentation', () => {
    const entries = [
      { gameId: 'acc', date: '2026-10-02T12:00:00Z', type: 0, totalTime: 60000 },
      { gameId: 'synthetic', date: '2026-10-02T13:00:00Z', type: 0, totalTime: 600000 },
    ]
    const index = { sessionsList: entries, tracksSummary: [{ gameId: 'acc', track: 'Spa' }, { gameId: 'synthetic', track: 'Spa' }], activityByGame: buildGameActivity(entries, new Date('2026-10-02T14:00:00Z')) }
    const acc = scopeSessionIndex(index, 'acc')
    expect(acc.sessionsList).toEqual([entries[0]])
    expect(acc.tracksSummary).toHaveLength(1)
    expect((acc as any).activity7d.practice.minutes).toBe(1)
    expect(scopeSessionIndex(index, 'evo').sessionsList).toEqual([])
    expect(index.sessionsList).toHaveLength(2)
    expect(scopeSessionIndex({ sessionsList: [{ date: 'old' }], tracksSummary: [{ track: 'Spa' }], activity7d: { legacy: true } }, 'acc').activity7d).toEqual({ legacy: true })
  })
  it('displays variable sectors, a partial lap and unknown validity without inferred bests', () => {
    const raw = { schema: 'racercore.session', version: 1, game_id: 'synthetic', session_info: { track: 'Spa', car: 'Mercedes' }, stints: [{ laps: [
      { lap_number: 1, lap_time_ms: null, completeness: 'partial', validity: 'unknown', sector_times_ms: [null, 30000, 31000, null] },
      { lap_number: 2, lap_time_ms: 124000, completeness: 'complete', validity: 'unknown', sector_times_ms: [30000, 31000, 32000, 31000] },
    ] }] }
    const before = JSON.stringify(raw)
    const model = commonSessionPresentation(raw)!
    expect(model.laps[0]).toMatchObject({ time: '—', completeness: 'Parziale', validity: 'Sconosciuta' })
    expect(model.laps[1].sectors).toHaveLength(4)
    expect(model.laps[1].time).toContain('2:04')
    expect(JSON.stringify(raw)).toBe(before)
    expect(commonSessionPresentation({ ...raw, version: 99 })).toBeNull()
  })
})
