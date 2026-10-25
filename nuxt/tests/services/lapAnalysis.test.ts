import { describe, expect, it } from 'vitest'
import { channelAt, compareCorners, cornerAdvice, deltaTrend, detectCorners, formatDelta, fractions, lapDelta, mapPoints } from '~/services/telemetry/lapAnalysis'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

const STEP = 2
/** A lap on the 2 m grid: time from the speed, a brake zone before each slow point. */
function lap(speedAt: (m: number) => number, brakeFrom: number[] = [], brakeLen = 60, length = 3000, coords = true): LapTraceView {
  const n = length / STEP + 1
  const speed = Array.from({ length: n }, (_, i) => speedAt(i * STEP))
  const time = [0]
  for (let i = 1; i < n; i++) time.push(time[i - 1]! + STEP / (((speed[i]! + speed[i - 1]!) / 2) / 3.6))
  const brake = speed.map((_, i) => brakeFrom.some(b => i * STEP >= b && i * STEP < b + brakeLen) ? 80 : 0)
  const channels: Record<string, number[]> = { time_s: time, speed_kmh: speed, brake_pct: brake, throttle_pct: speed.map(() => 100) }
  if (coords) {
    channels.pos_x = speed.map((_, i) => Math.cos((i / (n - 1)) * 2 * Math.PI) * 400)
    channels.pos_z = speed.map((_, i) => Math.sin((i / (n - 1)) * 2 * Math.PI) * 200)
  }
  return { gameId: 'acc', variant: null, sessionId: 's', track: 't', car: 'c', lapTimeS: time.at(-1)!, source: 'logger', complete: true, valid: true, fuelL: null, gridStepM: STEP, lengthM: length, channels }
}
// Two corners: slow points at 1000 m (90 km/h) and 2200 m (70 km/h), 250 km/h elsewhere.
const dip = (m: number, at: number, min: number) => Math.min(1, Math.abs(m - at) / 300) * (250 - min) + min
const profile = (c2min = 70) => (m: number) => Math.min(dip(m, 1000, 90), dip(m, 2200, c2min))

describe('lap analysis (our Track Titan)', () => {
  it('interpolates a channel on the lap fraction', () => {
    const t = lap(() => 180)
    expect(channelAt(t, 'speed_kmh', 0.5)).toBe(180)
    expect(channelAt(t, 'missing', 0.5)).toBeNull()
    expect(fractions(3)).toEqual([0, 0.5, 1])
  })

  it('finds one corner per slowdown on the reference', () => {
    const corners = detectCorners(lap(profile()))
    expect(corners).toHaveLength(2)
    expect(corners[0]!.minSpeedKmh).toBe(90)
    expect(corners[1]!.minSpeedKmh).toBe(70)
    expect(corners[0]!.apex).toBeCloseTo(1000 / 3000, 2)
    expect(corners[0]!.start).toBeLessThan(corners[0]!.apex)
    expect(corners[0]!.end).toBeLessThanOrEqual(corners[1]!.start + 1e-9)
  })

  it('a flat lap has no corners', () => {
    expect(detectCorners(lap(() => 200))).toEqual([])
  })

  it('delta is positive where the lap is slower, and the time lost sits in the slower corner', () => {
    const reference = lap(profile(), [800, 2000])
    const slower = lap(profile(55), [800, 1960]) // corner 2: 15 km/h slower, brakes 40 m earlier
    const delta = lapDelta(slower, reference, fractions(301))
    expect(delta[0]).toBe(0)
    expect(delta.at(-1)!).toBeGreaterThan(0.1)
    const [c1, c2] = compareCorners(slower, reference, detectCorners(reference))
    expect(Math.abs(c1!.timeLostS)).toBeLessThan(0.01)
    expect(c2!.timeLostS).toBeGreaterThan(0.1)
    expect(c2!.lapMinKmh).toBe(55)
    expect(c2!.brakeDeltaM).toBeCloseTo(-40, 6)
  })

  it('advice follows exit, entry, middle, and stays quiet without loss', () => {
    const base = { corner: { number: 1, start: 0, apex: 0.5, end: 1, minSpeedKmh: 80 }, lapMinKmh: 80, refMinKmh: 80, brakeDeltaM: 0, exitDeltaKmh: 0 }
    expect(cornerAdvice({ ...base, timeLostS: 0 })).toBe('Come il riferimento')
    expect(cornerAdvice({ ...base, timeLostS: -0.1 })).toBe('Qui sei più veloce del riferimento')
    expect(cornerAdvice({ ...base, timeLostS: 0.2, exitDeltaKmh: -6, brakeDeltaM: -30 })).toBe('Esci più forte: in uscita sei 6 km/h più lento')
    expect(cornerAdvice({ ...base, timeLostS: 0.2, brakeDeltaM: -30 })).toBe('Frena più tardi: freni 30 m prima')
    expect(cornerAdvice({ ...base, timeLostS: 0.2, brakeDeltaM: 25 })).toBe('Frena prima: freni 25 m dopo e arrivi lungo')
    expect(cornerAdvice({ ...base, timeLostS: 0.2, lapMinKmh: 72 })).toBe('Porta più velocità in centro curva: 8 km/h in meno')
  })

  it('map keeps the aspect ratio inside the box, null without coordinates', () => {
    const points = mapPoints(lap(() => 200), fractions(101), 300, 300, 10)!
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    expect(Math.min(...xs)).toBeCloseTo(10, 0)
    expect(Math.max(...xs)).toBeCloseTo(290, 0)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(140, 0) // 400 x 200 m track: half as tall
    expect(mapPoints(lap(() => 200, [], 60, 3000, false), fractions(11), 300, 300)).toBeNull()
  })

  it('trend and delta format', () => {
    expect(deltaTrend([0, 0.1, 0.05])).toEqual([0.1, -0.05].map(v => expect.closeTo(v, 9)))
    expect(formatDelta(0.25)).toBe('+0.250')
    expect(formatDelta(-0.1)).toBe('−0.100')
  })
})
