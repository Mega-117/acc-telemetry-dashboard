import { describe, expect, it } from 'vitest'
import type { SessionDocument } from '~/types/telemetry'
import { filterHistory, historyBest, historyOptions, historyTrackId, historyTrackParts, vehicleTrackDetail } from '~/services/projections/vehicleHistory'
import { buildCommonTrackOverview } from '~/services/projections/buildCommonTrackOverview'
import { gameTrackCatalogue } from '~/services/projections/gameTrackCatalogue'
import { sessionTiming } from '~/services/telemetry/fuelHistorySummary'
import { createSessionListEntry, sessionListEntryToSessionDocument } from '~/services/sync/sessionListProjectionService'

const session = (id: string, game = 'evo', car = 'Ferrari 296 GT3', time = 100000, variant: string | null = 'GP') => ({
  sessionId: id, meta: { gameId: game, track: 'Monza', trackVariant: variant, car, date_start: '2026-10-04T12:00:00Z', session_type: 0 },
  summary: { laps: 5, lapsValid: 5, bestLap: time, totalTime: time * 5, best_qualy_ms: time, best_rules_version: 6,
    best_by_grip: { Unknown: { bestQualy: time, bestQualyFuel: 10 } } },
} as SessionDocument)

describe('vehicle and category history', () => {
  it('uses the same session Q/G through nested EVO summary, list index and track recent sessions', () => {
    const raw = session('fuel')
    raw.summary = { laps: 1, lapsValid: 1, bestLap: 100000, totalTime: 100000, stintCount: 1,
      schema: 'racercore.timing-summary', version: 1,
      fuel_history: { best_rules_version: 6, best_qualy_ms: null, best_session_race_ms: 100000, best_race_ms: null } } as any
    const indexed = sessionListEntryToSessionDocument(createSessionListEntry(raw))
    for (const value of [raw, indexed]) {
      expect(sessionTiming(value)).toEqual({ qualyMs: null, raceMs: 100000 })
      const detail = vehicleTrackDetail([value], 'evo', historyTrackId('Monza', 'GP'), {}, 'Unknown')
      expect(detail.recentSessions[0]).toMatchObject({ bestQualy: undefined, bestRace: '1:40.000' })
      expect(detail.track.bestRace).toBeNull()
    }
    delete (raw.summary as any).fuel_history
    expect(sessionTiming(raw)).toEqual({ qualyMs: null, raceMs: null })
    expect(sessionTiming(session('other', 'synthetic'))).toEqual({ qualyMs: null, raceMs: null })
  })
  it('isolates simulator, layout and exact car, including duplicate archive entries', () => {
    const a = session('a')
    expect(filterHistory([a, a, session('acc', 'acc'), session('car', 'evo', 'Ford'), session('layout', 'evo', a.meta.car, 1, 'Short')],
      'evo', { car: a.meta.car }, historyTrackId('monza', 'gp')).map(s => s.sessionId)).toEqual(['a'])
    expect(historyTrackParts('layout:not-json')).toEqual({ track: 'layout:not-json', variant: null })
    expect(historyTrackId('Monza', 'GP')).not.toBe(historyTrackId('Monza'))
  })
  it('defaults ACC to GT3 if available, then the category with data; EVO to fastest valid vehicle', () => {
    const gt4 = session('gt4', 'acc', 'Mercedes AMG GT4', 90000, null)
    expect(historyOptions([gt4, session('gt3', 'acc')], 'acc').defaultCategory).toBe('GT3')
    expect(historyOptions([gt4], 'acc').defaultCategory).toBe('GT4')
    const invalid = session('invalid', 'evo', 'Invalid', 1); invalid.summary.lapsValid = 0
    expect(historyOptions([invalid, session('slow'), session('fast', 'evo', 'Ford', 95000)], 'evo').defaultCar).toBe('Ford')
    expect(historyOptions([], 'evo').defaultCar).toBe('')
  })
  it('keeps records, chart and session list under the same car filter', () => {
    const a = session('ferrari'), b = session('ford', 'evo', 'Ford', 90000)
    const result = vehicleTrackDetail([a, b], 'evo', historyTrackId('Monza', 'GP'), { car: a.meta.car }, 'Unknown')
    expect(result.recentSessions.map(s => s.id)).toEqual(['ferrari'])
    expect(result.historicalTimes.map(s => s.sessionId)).toEqual(['ferrari'])
    expect(result.recentSessions[0]?.type).toBe('unknown')
    a.meta.sessionKind = 'qualify'
    expect(vehicleTrackDetail([a], 'evo', historyTrackId('Monza', 'GP'), {}, 'Unknown').recentSessions[0]?.type).toBe('qualify')
    expect(historyBest(filterHistory([a, b], 'evo', { car: a.meta.car })).bestQualy).toBe(100000)
    expect(historyBest([], 'Unrecognized')).toEqual({})
  })
  it('retains unvisited catalogue cards and separate layouts, naming each winning car', () => {
    const a = session('a')
    const cards = buildCommonTrackOverview([a], 'evo')
    expect(cards.find(c => c.id === historyTrackId('Monza', 'GP'))).toMatchObject({ sessions: 1, bestQualyCar: a.meta.car, bestQualy: '1:40.000' })
    expect(cards.filter(c => c.name.startsWith('Paul Ricard'))).toHaveLength(4)
    expect(cards.find(c => c.name === 'Brands Hatch · Indy')?.image).toBeUndefined()
    expect(gameTrackCatalogue('evo')).toHaveLength(36)
    expect(cards.some(c => c.sessions === 0 && !c.image)).toBe(true)
    expect(buildCommonTrackOverview([a], 'evo', { car: 'Never driven' }).every(c => c.sessions === 0)).toBe(true)
    expect(gameTrackCatalogue('acc').length).toBeGreaterThan(10)
    expect(gameTrackCatalogue('unknown')).toEqual([])
  })
})
