// PIP-633: tendenze, calendario, record e progressi dalla lista sessioni.
import { describe, expect, it } from 'vitest'
import {
  calendarWeeks, drivingHabits, localDay, periodTotals, personalRecords, previousPeriodSessions, progressDelta, progressSeries, shortDate, trend,
} from '~/utils/statsJourney'
import type { SessionDocument } from '~/types/telemetry'

const NOW = new Date(2026, 9, 26, 18, 0).getTime() // lunedi' 26/10/2026, 18:00 locali
const at = (y: number, m: number, d: number, h = 20) => new Date(y, m - 1, d, h).toISOString()
const s = (date: string, extra: Partial<SessionDocument['summary']> = {}, meta: Partial<SessionDocument['meta']> = {}): SessionDocument => ({
  meta: { date_start: date, track: 'monza', car: 'ferrari_296_gt3', session_type: 0, gameId: 'acc', ...meta },
  summary: { totalTime: 3_600_000, laps: 20, lapsValid: 15, bestLap: 100_000, ...extra },
} as unknown as SessionDocument)

describe('statsJourney', () => {
  it('compares the period with the one before, same filters', () => {
    const list = [s(at(2026, 10, 20)), s(at(2026, 10, 10)), s(at(2026, 10, 5)), s(at(2026, 10, 3), {}, { track: 'spa' })]
    const filter = { periodDays: 14, trackKey: 'monza', carKey: null, sessionType: null }
    const prev = previousPeriodSessions(list, filter, NOW)!
    expect(prev.map(x => x.meta.date_start)).toEqual([at(2026, 10, 10), at(2026, 10, 5)])
    expect(previousPeriodSessions(list, { ...filter, periodDays: null }, NOW)).toBeNull()
    expect(periodTotals(prev)).toEqual({ timeMs: 7_200_000, sessions: 2, laps: 40, validPct: 75 })
    expect(periodTotals([]).validPct).toBeNull()
    expect(trend(10, 7)).toEqual({ delta: 3, direction: 'up' })
    expect(trend(5, 5)?.direction).toBe('flat')
    expect(trend(5, null)).toBeNull()
  })

  it('builds the calendar on local days, Monday first, levels from your own longest day', () => {
    const weeks = calendarWeeks([s(at(2026, 10, 26, 10), { totalTime: 4_000_000 }), s(at(2026, 10, 24), { totalTime: 1_000_000 })], 2, NOW)
    expect(weeks).toHaveLength(2)
    expect(weeks[1]![0]!.date).toBe('2026-10-26')
    expect(weeks[0]![0]!.date).toBe('2026-10-19')
    expect(weeks[1]![0]!.level).toBe(4)
    expect(weeks[0]![5]!.level).toBe(1)
    expect(weeks[1]![1]!.future).toBe(true)
    expect(localDay(NOW)).toBe('2026-10-26')
  })

  it('counts driving days, streaks and the longest session', () => {
    const list = [s(at(2026, 10, 26)), s(at(2026, 10, 25)), s(at(2026, 10, 24), { totalTime: 9_000_000 }), s(at(2026, 10, 20)), s(at(2026, 10, 19)), s(at(2026, 10, 19, 10))]
    expect(drivingHabits(list, NOW)).toEqual({ daysDriven: 5, longestStreak: 3, currentStreak: 3, longestSessionMs: 9_000_000 })
    // Oggi non hai ancora guidato: la serie di ieri e' ancora in corso.
    expect(drivingHabits([s(at(2026, 10, 25)), s(at(2026, 10, 24))], NOW).currentStreak).toBe(2)
    expect(drivingHabits([s(at(2026, 10, 20))], NOW).currentStreak).toBe(0)
  })

  it('keeps the best qualifying, race and race average per track and car, with their date', () => {
    const rows = personalRecords([
      s(at(2026, 9, 1), { bestLap: 101_000, best_qualy_ms: 101_500, best_race_ms: 102_000, best_avg_race_ms: 103_500 }),
      s(at(2026, 10, 22), { bestLap: 100_500, best_qualy_ms: 0, best_race_ms: 102_400, best_avg_race_ms: 103_000 }),
      s(at(2026, 8, 1), {}, { track: 'spa' }),
    ], NOW)
    expect(rows.map(r => r.track)).toEqual(['monza', 'spa'])
    const monza = rows[0]!
    expect(monza.sessions).toBe(2)
    expect(monza.bestLap).toEqual({ ms: 100_500, date: at(2026, 10, 22) })
    expect(monza.qualy).toEqual({ ms: 101_500, date: at(2026, 9, 1) })
    expect(monza.race?.ms).toBe(102_000)
    expect(monza.avgRace?.ms).toBe(103_000)
    expect(monza.isNew).toBe(true)
    expect(rows[1]!.isNew).toBe(false)
  })

  it('a tied record keeps the first time you did it, whatever the list order', () => {
    const first = s(at(2026, 9, 1), { best_race_ms: 100_000 }), tie = s(at(2026, 10, 25), { best_race_ms: 100_000 })
    for (const list of [[first, tie], [tie, first]]) {
      const row = personalRecords(list, NOW)[0]!
      expect(row.race).toEqual({ ms: 100_000, date: at(2026, 9, 1) })
      expect(row.isNew).toBe(false)
    }
  })

  it('labels dates in the local calendar', () => {
    const lateNight = new Date(2026, 9, 26, 0, 30).toISOString() // 00:30 locali del 26: in UTC e' ancora il 25
    expect(shortDate(lateNight)).toBe('26/10')
    expect(shortDate(lateNight, true)).toBe('26/10/26')
    expect(shortDate('rotto')).toBe('')
  })

  it('shows progress only with at least three sessions', () => {
    const list = [at(2026, 8, 1), at(2026, 8, 20), at(2026, 9, 10), at(2026, 9, 30), at(2026, 10, 10), at(2026, 10, 24)]
      .map((d, i) => s(d, { bestLap: [102_000, 101_800, 101_500, 101_200, 100_900, 101_000][i] }))
    const points = progressSeries(list, 'monza', 'ferrari_296_gt3', 'bestLap')
    expect(points).toHaveLength(6)
    expect(progressDelta(points)).toEqual({ fromMs: 101_800, toMs: 100_900, deltaMs: -900, fromDate: at(2026, 8, 1) })
    expect(progressDelta(points.slice(0, 2))).toBeNull()
    expect(progressSeries(list, 'monza', 'ferrari_296_gt3', 'qualy')).toEqual([])
  })
})
