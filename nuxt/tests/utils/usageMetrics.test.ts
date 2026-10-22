import { describe, expect, it } from 'vitest'
import { aggregateUsage, automationResult, filterUsage, usageCalendarDays, usageDaily, type UsageItem, type UsageFilter } from '../../app/utils/usageMetrics'
const context = { game: 'acc', track: 'monza', car: 'ferrari', mode: 'singleplayer', sessionType: 'practice', version: 'old', channel: 'dev' }
const item = (key: string, uid = 'pilot', day = '2026-10-19'): UsageItem => ({ key, uid, summary: { schemaVersion: 1, source: 'desktop', producer: 'producer-1', day, context, firstAt: 1, lastAt: 2, drivingMs: 60000, sessions: ['same-session'], features: ['overlay.tyres'], partial: false, outcomes: { started: 3, verified: 1, failed: 1, unknown: 1 } } })
const filter: UsageFilter = { query: '', game: '', mode: '', sessionType: '', version: '', channel: '', includeTests: false }
describe('usage totals', () => {
  it('sums contexts but deduplicates sessions across days', () => {
    const users = aggregateUsage([item('a'), item('b', 'pilot', '2026-10-18')])
    expect(users[0]?.drivingMs).toBe(120000); expect(users[0]?.sessions.size).toBe(1)
  })
  it('does not invent sessions for an engineer and flags missing data', () => {
    const a = item('a'); a.summary!.sessions = []; a.summary!.drivingMs = 0; a.summary!.source = 'browser'
    const users = aggregateUsage([a, { key: 'missing', uid: 'pilot', summary: null }])
    expect(users[0]?.sessions.size).toBe(0); expect(users[0]?.partial).toBe(true)
  })
  it('keeps unknown, ongoing and rejected outside success percentage', () => {
    expect(automationResult({ started: 10, verified: 2, failed: 2, unknown: 1, rejected: 2 })).toEqual({ verified: 2, finished: 4, percent: 50, unknown: 1, rejected: 2, ongoing: 3 })
    expect(automationResult({}).percent).toBe(null)
  })
  it('includes all versions and filters tests explicitly', () => {
    const items = [item('a'), item('b', 'test')]
    expect(filterUsage(items, filter, {}, ['test'])).toHaveLength(1)
    expect(filterUsage(items, { ...filter, includeTests: true }, {}, ['test'])).toHaveLength(2)
    expect(filterUsage(items, { ...filter, query: 'Enrico' }, { pilot: 'Enrico' }, [])).toHaveLength(1)
    expect(filterUsage(items, { ...filter, mode: 'multiplayer' }, {}, [])).toHaveLength(0)
  })
  it('uses Rome calendar days across DST rather than rolling hours', () => {
    const days = usageCalendarDays(7, new Date('2026-10-25T23:30:00Z'))
    expect(days).toHaveLength(7); expect(days[0]).toBe('2026-10-20'); expect(days[6]).toBe('2026-10-26')
    const quarter = usageCalendarDays(90, new Date('2026-10-19T12:00:00Z'))
    expect(quarter).toHaveLength(90); expect(quarter[0]).toBe('2026-07-22'); expect(quarter[89]).toBe('2026-10-19')
    expect(usageDaily([item('a')], ['2026-10-19', '2026-10-20']).map(x => x.drivingMs)).toEqual([60000, 0])
  })
})
