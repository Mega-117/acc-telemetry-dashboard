import { describe, expect, it } from 'vitest'
import { buildCommonOverviewProjection as build } from '~/services/projections/buildCommonOverviewProjection'
import { getOverviewCarImage } from '~/utils/overviewCarImage'
import type { SessionDocument } from '~/types/telemetry'

const now = new Date(2026, 9, 4, 12)
const session = (id: string, patch: Partial<SessionDocument> = {}) => ({ sessionId: id,
  meta: { gameId: 'evo', track: 'Monza', trackVariant: 'GP', car: 'Ferrari 296 GT3', date_start: '2026-10-04T10:00:00', sessionKind: 'practice', session_type: 99 },
  summary: { laps: 2, lapsValid: 2, bestLap: 114972, avgCleanLap: 115000, totalTime: 240000 }, ...patch } as SessionDocument)

describe('shared overview projection', () => {
  it('keeps identity, bests and activity in the selected game and comparable car/variant', () => {
    const a = session('latest')
    const old = session('old', { meta: { ...a.meta, date_start: '2026-09-01' }, summary: { ...a.summary, bestLap: 114000, avgCleanLap: 116000 } })
    const wrong = ['acc', 'other-car', 'other-variant'].map((kind, i) => session(kind, {
      meta: { ...a.meta, date_start: '2026-10-03', gameId: i === 0 ? 'acc' : 'evo', car: i === 1 ? 'Ford' : a.meta.car, trackVariant: i === 2 ? 'short' : 'GP' },
      summary: { ...a.summary, bestLap: 1, avgCleanLap: 1 },
    }))
    const result = build([a, a, old, ...wrong], 'evo', now)
    expect(result.lastSession?.id).toBe('latest')
    expect(result.lastTrack?.name).toBe('Monza · GP')
    expect(result.performanceColumns?.map(c => c.best)).toEqual(['1:54.000', '1:55.500', '--:--.---'])
    expect(result.performanceColumns?.[0]?.session).toBe('1:54.972')
    expect(result.activityTotals.practice).toEqual({ minutes: 12, sessions: 3 })
    expect(result.activity7d).toHaveLength(7)
  })
  it('does not infer valid averages, theoretical sectors or another game when empty', () => {
    const a = session('invalid')
    a.summary.lapsValid = 0
    const result = build([a], 'evo', now)
    expect(result.performanceColumns?.every(c => c.best === '--:--.---' && c.session === '--:--.---')).toBe(true)
    const b = session('missing-average')
    b.summary.avgCleanLap = null
    expect(build([b], 'evo', now).performanceColumns?.[1]?.best).toBe('--:--.---')
    expect(build([a], 'synthetic', now).lastTrack).toBeNull()
    expect(build([], 'evo', now).activityTotals.practice.sessions).toBe(0)
  })
  it('does not replace a road car with a same-brand GT3 image', () => {
    expect(getOverviewCarImage('Ferrari 296 GT3', 'evo')).toContain('ferrari_296_gt3')
    expect(getOverviewCarImage('BMW M4 road', 'evo')).toContain('default_gt3')
    expect(getOverviewCarImage('BMW M4', 'acc')).toContain('bmw_m4_gt3')
  })
  it('counts time attack without relabelling it as practice', () => {
    const a = session('attack')
    a.meta.sessionKind = 'time_attack'
    const result = build([a], 'evo', now)
    expect(result.activityTotals.practice.sessions).toBe(0)
    expect(result.otherActivity).toEqual({ minutes: 4, sessions: 1 })
    expect(result.activity7d.reduce((sum, day) => sum + (day.other || 0), 0)).toBe(4)
  })
})
