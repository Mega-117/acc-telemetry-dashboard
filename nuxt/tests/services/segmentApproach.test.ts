// 06/11 (user): a segment starts before its braking, with room (Barcelona: laps braking 8-28 m before the old start).
// Cases from Codex's "how would you break it": shared boundary, chicane, start line, totals, numbering, no speed channel.
import { describe, expect, it } from 'vitest'
import { channelAt, compareCorners, detectCorners } from '~/services/telemetry/lapAnalysis'
import { segmentsCheck, withApproach } from '~/services/telemetry/segmentApproach'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

const STEP = 2
function lap(speedAt: (m: number) => number, brakeFrom: number[] = [], length = 3000): LapTraceView {
  const n = length / STEP + 1
  const speed = Array.from({ length: n }, (_, i) => speedAt(i * STEP))
  const time = [0]
  for (let i = 1; i < n; i++) time.push(time[i - 1]! + STEP / (((speed[i]! + speed[i - 1]!) / 2) / 3.6))
  const brake = speed.map((_, i) => brakeFrom.some(b => i * STEP >= b && i * STEP < b + 80) ? 80 : 0)
  return { gameId: 'acc', variant: null, sessionId: 's', track: 't', car: 'c', lapTimeS: time.at(-1)!, source: 'logger', complete: true, valid: true, fuelL: null,
    gridStepM: STEP, lengthM: length, channels: { time_s: time, speed_kmh: speed, brake_pct: brake, throttle_pct: speed.map(() => 100) } }
}
// Speed keeps rising on the straights (as on track): the peak is where the braking starts.
const dip = (m: number, at: number, min: number, half = 300) => {
  const base = 180 + m / 30
  return Math.abs(m - at) >= half ? base : min + (base - min) * Math.abs(m - at) / half
}
const twoCorners = (m: number) => Math.min(dip(m, 1000, 90), dip(m, 2200, 70))
const metres = (f: number, t: LapTraceView) => f * t.lengthM

describe('withApproach (segments start before the braking)', () => {
  it('moves each start back about one second of travel (40-100 m), keeps numbers and apexes', () => {
    const t = lap(twoCorners)
    const before = detectCorners(t)
    const after = withApproach(before, t)
    expect(after.map(c => [c.number, c.apex])).toEqual(before.map(c => [c.number, c.apex]))
    after.forEach((c, i) => {
      const moved = metres(before[i]!.start - c.start, t)
      const kmh = channelAt(t, 'speed_kmh', before[i]!.start)!
      expect(moved).toBeCloseTo(Math.min(100, Math.max(40, kmh / 3.6)), 0)
    })
    expect(before[0]!.start).toBeGreaterThan(0) // the input is not changed
    expect(detectCorners(t)).toEqual(before)
  })

  it('one shared boundary: the previous segment ends where the next starts; ordered, no gaps or overlaps', () => {
    const t = lap(twoCorners)
    const [a, b] = withApproach(detectCorners(t), t)
    expect(a!.end).toBe(b!.start)
    for (const c of [a!, b!]) expect(c.start < c.apex && c.apex < c.end).toBe(true)
  })

  it('a lap braking 30 m earlier than the best now brakes inside the segment', () => {
    const best = lap(twoCorners)
    const corners = detectCorners(best)
    const earlyBrake = metres(corners[1]!.start, best) - 30
    expect(earlyBrake).toBeLessThan(metres(corners[1]!.start, best)) // outside the old segment
    expect(earlyBrake).toBeGreaterThan(metres(withApproach(corners, best)[1]!.start, best)) // inside the new one
  })

  it('a chicane keeps the exit of its first corner: the boundary stops halfway from the previous apex', () => {
    const t = lap(m => Math.min(dip(m, 1000, 90, 120), dip(m, 1260, 100, 120)))
    const before = detectCorners(t)
    expect(before).toHaveLength(2)
    const after = withApproach(before, t)
    const floor = before[0]!.apex + (before[1]!.start - before[0]!.apex) / 2
    expect(after[1]!.start).toBeGreaterThanOrEqual(floor - 1e-12)
    expect(after[0]!.end).toBe(after[1]!.start)
    expect(after[0]!.end).toBeGreaterThan(after[0]!.apex)
  })

  it('never before the start line', () => {
    const t = lap(m => dip(m, 200, 90, 180))
    const after = withApproach(detectCorners(t), t)
    expect(after[0]!.start).toBeGreaterThanOrEqual(0)
  })

  it('the segment losses still add up to the delta over the covered stretch', () => {
    const best = lap(twoCorners)
    const mine = lap(m => twoCorners(m) - (m > 1500 && m < 2300 ? 6 : 0))
    const corners = withApproach(detectCorners(best), best)
    const rows = compareCorners(mine, best, corners)
    const delta = (f: number) => channelAt(mine, 'time_s', f)! - channelAt(best, 'time_s', f)!
    const sum = rows.reduce((s, r) => s + r.timeLostS, 0)
    expect(sum).toBeCloseTo(delta(corners.at(-1)!.end) - delta(corners[0]!.start), 9)
  })

  it('without a speed channel the margin is the 40 m minimum; no corners, nothing to do', () => {
    const t = lap(twoCorners)
    const corners = detectCorners(t)
    const bare = { ...t, channels: { ...t.channels, speed_kmh: [] } }
    expect(metres(corners[1]!.start - withApproach(corners, bare)[1]!.start, t)).toBeCloseTo(40, 6)
    expect(withApproach([], t)).toEqual([])
  })

  it('PIP-737 spy: clean moved segments say 0; a gap, an overlap, a moved apex or a lost segment each count', () => {
    const t = lap(twoCorners)
    const detected = detectCorners(t)
    const timed = withApproach(detected, t)
    expect(segmentsCheck(detected, timed)).toEqual({ segments: 2, badBounds: 0 })
    const gap = timed.map(c => ({ ...c })); gap[0]!.end = gap[1]!.start - 0.01
    expect(segmentsCheck(detected, gap).badBounds).toBe(1)
    const apex = timed.map(c => ({ ...c })); apex[1]!.apex += 0.001
    expect(segmentsCheck(detected, apex).badBounds).toBeGreaterThan(0)
    const inverted = timed.map(c => ({ ...c })); inverted[0]!.start = inverted[0]!.apex
    expect(segmentsCheck(detected, inverted).badBounds).toBe(1)
    expect(segmentsCheck(detected, timed.slice(1)).badBounds).toBeGreaterThan(0)
  })
})
