import { describe, expect, it, beforeEach } from 'vitest'
import { useGameContext } from '~/composables/useGameContext'
import { buildGameActivity, scopeSessionIndex, buildCommonHistoryOverview } from '~/services/telemetry/gameProjection'
import type { SessionDocument } from '~/types/telemetry'
import { commonSessionPresentation } from '~/services/telemetry/commonSessionPresentation'
import { gameLabel } from '~/services/telemetry/gameCatalog'
import { setLocale } from '~/i18n'

// Italian assertions (jsdom defaults to English).
setLocale('it')

describe('consulted game and recorded facts', () => {
  it('includes a session added by a legacy writer despite a stale per-game aggregate', () => {
    const now = new Date(2026, 9, 3, 22)
    const prior = [{ date: '2026-10-03', type: 1, totalTime: 115970 },
      { date: '2026-10-03', type: 1, totalTime: 355954 }]
    const entries = [...prior, { date: '2026-10-03', type: 0, totalTime: 3300652 }]
    const index = { totalSessions: 3, sessionsList: entries,
      activity7d: buildGameActivity(entries, now).acc, activityByGame: buildGameActivity(prior, now) }
    const before = JSON.stringify(index)
    const actual = scopeSessionIndex(index, 'acc', now)
    expect(actual.activity7d).toMatchObject({ practice: { minutes: 55, sessions: 1 }, qualify: { minutes: 8, sessions: 2 },
      byDay: [{ date: '2026-10-03', P: 55, Q: 8, R: 0 }] })
    expect(actual.activityRequiresFallback).toBe(false)
    expect(JSON.stringify(index)).toBe(before)
  })
  it('recalculates only the selected game and rolls the calendar window forward', () => {
    const entries = [{ gameId: 'acc', date: '2026-10-03', type: 0, totalTime: 60000 },
      { gameId: 'synthetic', date: '2026-10-03', sessionKind: 'practice', totalTime: 600000 }]
    const index = { totalSessions: 2, sessionsList: entries }
    expect(scopeSessionIndex(index, 'acc', new Date(2026, 9, 3)).activity7d).toMatchObject({ practice: { minutes: 1 } })
    expect(scopeSessionIndex(index, 'synthetic', new Date(2026, 9, 3)).activity7d).toMatchObject({ practice: { minutes: 10 } })
    expect(scopeSessionIndex(index, 'evo', new Date(2026, 9, 3)).activity7d).toMatchObject({ practice: { minutes: 0 } })
    expect(scopeSessionIndex(index, 'acc', new Date(2026, 9, 10)).activity7d).toMatchObject({ practice: { minutes: 0 } })
  })
  it('requires fallback for a truncated recent window but not when the sorted index reaches before it', () => {
    const now = new Date(2026, 9, 3)
    const recent = { date: '2026-09-27', type: 0, totalTime: 60000 }
    const index = { totalSessions: 201, sessionsList: [recent], activityByGame: buildGameActivity([recent], now) }
    expect(scopeSessionIndex(index, 'acc', now).activityRequiresFallback).toBe(true)
    expect(scopeSessionIndex({ ...index, sessionsList: [recent, { ...recent, date: '2026-09-26' }] }, 'acc', now)
      .activityRequiresFallback).toBe(false)
    expect(scopeSessionIndex({ ...index, sessionsList: [{ ...recent, date: 'invalid' }] }, 'acc', now)
      .activityRequiresFallback).toBe(true)
    expect(scopeSessionIndex({ totalSessions: 0, sessionsList: [] }, 'acc', now).activityRequiresFallback).toBe(false)
  })
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
    const acc = scopeSessionIndex(index, 'acc', new Date('2026-10-02T14:00:00Z'))
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
