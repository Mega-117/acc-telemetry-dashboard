import { describe, expect, it } from 'vitest'
import { buildTrackTimesChart } from '../../app/utils/trackTimesChart'
import type { TrackHistoricalPointProjection as Point } from '../../app/types/trackProjections'

const now = new Date(2026, 8, 24, 12)
const point = (value = '1:54.000', extra: Partial<Point> = {}): Point => ({
  sessionId: '2026_09_20T12_00_00_nurburgring', date: '20 set', bestRace: value, ...extra,
})
const dense = () => Array.from({ length: 20 }, (_, i) => point(`1:54.${String(i * 20).padStart(3, '0')}`, { sessionId: `2026_09_20T12_${String(i).padStart(2, '0')}_00_nurburgring` }))

describe('track chart presentation contract', () => {
  it('focuses ordinary times while keeping the slow original as a marked, broken segment', () => {
    const history = [...dense(), point('2:41.500')]
    const snapshot = JSON.stringify(history)
    const result = buildTrackTimesChart(history, '30', 'focus', now)
    expect(result.max).toBeLessThanOrEqual(116)
    expect(result.outside).toHaveLength(1)
    expect(result.outside[0]).toMatchObject({ original: 161.5, y: result.max, series: 'bestRace' })
    expect(result.series.bestRace.find(p => p.original === 161.5)).toMatchObject({ original: 161.5, y: null })
    expect(JSON.stringify(history)).toBe(snapshot)
  })
  it('restores every original value in complete scale', () => {
    const result = buildTrackTimesChart([...dense(), point('2:41.500')], 'all', 'complete', now)
    expect(result.max).toBeGreaterThan(161.5)
    expect(result.outside).toEqual([])
    expect(result.series.bestRace.find(p => p.original === 161.5)?.y).toBe(161.5)
  })
  it('never clips new fastest results', () => {
    const result = buildTrackTimesChart([...dense(), point('1:45.000')], 'all', 'focus', now)
    expect(result.min).toBeLessThan(105)
    expect(result.outside).toEqual([])
  })
  it('keeps ordinary three-second session variation while focusing the two Nürburgring extremes', () => {
    const result = buildTrackTimesChart([...dense(), point('1:57.462'), point('1:57.315'), point('2:08.090'), point('2:41.500')], '30', 'focus', now)
    expect(result.outside.map(p => p.original)).toEqual([128.09, 161.5])
    expect(result.min).toBe(113)
    expect(result.max).toBe(118)
  })
  it('uses the full scale for small samples, including an isolated slower race series', () => {
    expect(buildTrackTimesChart([point(), point('2:41.500')], 'all', 'focus', now).outside).toEqual([])
    const qualy = dense().map(p => ({ ...p, bestQualy: p.bestRace, bestRace: undefined }))
    const result = buildTrackTimesChart([...qualy, point('2:41.500')], 'all', 'focus', now)
    expect(result.max).toBeGreaterThan(161.5)
    expect(result.outside).toEqual([])
  })
  it('does not force clipping of a legitimately broad distribution', () => {
    const history = Array.from({ length: 20 }, (_, i) => point(`2:${String(i * 2).padStart(2, '0')}.000`))
    expect(buildTrackTimesChart(history, 'all', 'focus', now).outside).toEqual([])
  })
  it.each(['7', '30', '90'] as const)('uses %s inclusive calendar days, including the whole first and last days', period => {
    const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - Number(period) + 1)
    const before = new Date(start.getTime() - 1)
    const last = new Date(now); last.setHours(23, 59, 59, 999)
    const future = new Date(last.getTime() + 1)
    const history = [before, start, last, future].map((date, i) => point('1:54.000', { dateStart: date.toISOString(), sessionId: String(i) }))
    expect(buildTrackTimesChart(history, period, 'focus', now).series.bestRace.map(p => p.sessionId)).toEqual(['1', '2'])
  })
  it('orders by full date across years and falls back to legacy session IDs', () => {
    const history = [point(), point('1:55.000', { dateStart: '2025-12-31T13:00:00', sessionId: 'old' }), point('1:56.000', { dateStart: 'bad' })]
    const result = buildTrackTimesChart(history, 'all', 'complete', now)
    expect(result.series.bestRace[0]?.sessionId).toBe('old')
    expect(result.unknownDates).toBe(0)
    expect(buildTrackTimesChart(history, '7', 'focus', now).count).toBe(2)
  })
  it('does not invent dates for legacy labels and keeps unknown dates in available history', () => {
    const history = [point('1:54.000', { sessionId: 'opaque', date: '20 set' })]
    const recent = buildTrackTimesChart(history, '30', 'focus', now)
    expect(recent.count).toBe(0)
    expect(recent.unknownDates).toBe(1)
    expect(buildTrackTimesChart(history, 'all', 'focus', now).count).toBe(1)
  })
  it('ignores invalid times without turning them into zero-second laps', () => {
    const history = ['', '--:--.---', '0:00.000', '1:99.000', 'NaN', '-1:54.000', '1:54.000oops'].map(p => point(p))
    const result = buildTrackTimesChart(history, 'all', 'focus', now)
    expect(result.count).toBe(0)
    expect(Number.isFinite(result.min) && result.max > result.min).toBe(true)
  })
  it('handles empty data, flat data, missing series and fractional milliseconds', () => {
    expect(buildTrackTimesChart([], 'all', 'focus', now).count).toBe(0)
    const flat = buildTrackTimesChart(Array.from({ length: 12 }, () => point('1:54.5')), 'all', 'focus', now)
    expect(flat.series.bestRace[0]?.y).toBe(114.5)
    expect(flat.series.bestQualy).toEqual([])
    expect(flat.max - flat.min).toBeGreaterThanOrEqual(1)
  })
})
