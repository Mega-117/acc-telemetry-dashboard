// dev.10 (user 05/11): the theoretical lap by corner segments, joined where the speeds match.
import { describe, expect, it } from 'vitest'
import { segmentBounds, stitchIdealLap } from '~/services/telemetry/idealLap'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

// A lap of 1000 points with three corners (speed valleys); `slow` adds time inside one segment.
function lap(o: { slowFrom?: number, slowTo?: number, extraS?: number, entryBoost?: { at: number, kmh: number } } = {}): LapTraceView {
  const n = 1000
  const speed: number[] = [], time: number[] = []
  let t = 0
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1)
    let v = 220 - [0.2, 0.5, 0.8].reduce((sum, c) => sum + 140 * Math.exp(-(((f - c) / 0.03) ** 2)), 0)
    if (o.entryBoost && Math.abs(f - o.entryBoost.at) < 0.03) v += o.entryBoost.kmh
    speed.push(v)
    if (i) t += 4 / (v / 3.6) * (o.slowFrom !== undefined && f >= o.slowFrom && f <= o.slowTo! ? 1 + (o.extraS ?? 0) : 1)
    time.push(t)
  }
  return { gameId: 'acc', variant: null, sessionId: null, track: 'monza', car: 'ferrari_296_gt3', lapTimeS: t, source: 'logger', complete: true, valid: true, fuelL: 30,
    conditions: null, gridStepM: 4, lengthM: 4 * (n - 1), channels: { time_s: time, speed_kmh: speed, throttle_pct: speed.map(() => 100), brake_pct: speed.map(() => 0) } }
}

describe('theoretical lap by corner segments (dev.10)', () => {
  it('one segment per corner, joined at the speed peaks, the sector lines kept, the whole lap covered once', () => {
    const bounds = segmentBounds(lap(), [0, 0.33, 0.66, 1])!
    expect(bounds[0]).toBe(0)
    expect(bounds[bounds.length - 1]).toBe(1)
    expect(bounds.length).toBeGreaterThan(4)
    expect(bounds).toEqual([...bounds].sort((a, b) => a - b))
    expect(bounds.some(b => Math.abs(b - 0.33) < 1e-9)).toBe(true)
    bounds.slice(1).forEach((b, i) => expect(b - bounds[i]!).toBeGreaterThanOrEqual(0.02))
  })
  it('no corner and no sectors: no segments; sectors only: the sectors', () => {
    const flat = { ...lap(), channels: { ...lap().channels, speed_kmh: lap().channels.speed_kmh!.map(() => 200) } }
    expect(segmentBounds(flat, null)).toBeNull()
    expect(segmentBounds(flat, [0, 0.4, 1])).toEqual([0, 0.4, 1])
  })
  it('takes each corner from the lap quickest there', () => {
    const a = lap({ slowFrom: 0.4, slowTo: 0.6, extraS: 0.05 })   // slow in the middle corner
    const b = lap({ slowFrom: 0.7, slowTo: 0.9, extraS: 0.05 })   // slow in the last one
    const bounds = segmentBounds(a, null)!
    const ideal = stitchIdealLap([a, b], bounds, 12)!
    expect(ideal.trace.lapTimeS).toBeLessThan(Math.min(a.lapTimeS, b.lapTimeS))
    expect(ideal.joinsSkipped).toBe(0)
  })
  it('Codex 05/11: a quickest segment entered 60 km/h faster than the lap before it ends is not stitched', () => {
    const a = lap()
    const bounds = segmentBounds(a, null)!
    // b is quicker in the segment that starts at bounds[2], but arrives there much faster.
    const b = lap({ slowFrom: 0, slowTo: bounds[2]! - 0.01, extraS: 0.2, entryBoost: { at: bounds[2]!, kmh: 60 } })
    const strict = stitchIdealLap([a, b], bounds, 12)!
    const loose = stitchIdealLap([a, b], bounds)!
    expect(strict.joinsSkipped).toBeGreaterThan(0)
    expect(loose.joinsSkipped).toBe(0)
  })
})
