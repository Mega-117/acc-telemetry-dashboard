import { describe, expect, it } from 'vitest'
import { analysisSessionToken, bodySlipDeg, channelAt, compareCorners, cornerAt, focusAdvice, focusInStretch, glideFrame, stepCorner, stretchDelta, timeSyncedFraction, cornerAdvice, deltaTrend, detectCorners, formatDelta, fractions, lapDelta } from '~/services/telemetry/lapAnalysis'
import { finishLine, mapPoints, worldToMap } from '~/services/telemetry/mapProjection'
import { hasMapPositions } from '~/services/telemetry/mapPositions'
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
  it('interpolates a channel on the lap fraction; levels take the previous sample', () => {
    const t = lap(() => 180)
    t.channels.speed_kmh = [100, 200, 300]
    t.channels.gear = [2, 4, 4]
    expect(channelAt(t, 'speed_kmh', 0.25)).toBe(150)
    expect(channelAt(t, 'speed_kmh', 0.75)).toBe(250)
    expect(channelAt(t, 'gear', 0.25)).toBe(2) // never a third gear that was not recorded
    expect(channelAt(t, 'missing', 0.5)).toBeNull()
    expect(fractions(3)).toEqual([0, 0.5, 1])
  })

  it('a slowdown that never climbs back before the line is not a corner', () => {
    const corners = detectCorners(lap(m => m < 2700 ? 250 : 250 - (m - 2700) / 3))
    expect(corners).toEqual([])
  })

  it('braking earlier than the reference is measured in full, even before the corner start', () => {
    const reference = lap(profile(), [800, 2000])
    const early = lap(profile(), [640, 2000], 220) // corner 1: from 640 m instead of 800 m, still braking at 800
    const [c1] = compareCorners(early, reference, detectCorners(reference))
    expect(c1!.brakeDeltaM).toBeCloseTo(-160, 6)
  })

  it('a light real braking (35%) is still the braking, never the corner before it (Codex 01/11)', () => {
    const reference = lap(profile(), [800, 2000])
    const light = lap(profile(), [800, 2000])
    light.channels.brake_pct = light.channels.brake_pct!.map(v => (v > 0 ? 35 : 0))
    const [c1] = compareCorners(light, reference, detectCorners(reference))
    expect(c1!.brakeDeltaM).toBeCloseTo(0, 6)
  })
  // 01/11 (Hungaroring T1): a light touch of brake near the apex is not where the braking starts.
  it('a light touch near the apex is not the braking; a short release does not split one braking', () => {
    const reference = lap(profile(), [800, 2000])
    const touch = lap(profile(), [800, 2000])
    touch.channels.brake_pct = touch.channels.brake_pct!.map((v, i) => (i * 2 >= 900 && i * 2 < 914 ? 11 : v))
    const [c1] = compareCorners(touch, reference, detectCorners(reference))
    expect(c1!.brakeDeltaM).toBeCloseTo(0, 6)
    const released = lap(profile(), [790, 2000], 70)
    released.channels.brake_pct = released.channels.brake_pct!.map((v, i) => (i * 2 >= 800 && i * 2 < 808 ? 0 : v))
    const [r1] = compareCorners(released, reference, detectCorners(reference))
    expect(r1!.brakeDeltaM).toBeCloseTo(-10, 6)
  })
  it('the parts of a corner count the gap you keep: a bump given back is no entry loss', () => {
    const reference = lap(profile())
    const corner = detectCorners(reference)[0]!
    const bump = lap(profile())
    const t = reference.channels.time_s!, n = t.length
    const at = (f: number) => (f * 3000)
    const [entryEnd] = [corner.apex - (corner.apex - corner.start) * 0.25]
    bump.channels.time_s = t.map((v, i) => {
      const m = (i / (n - 1)) * 3000
      const peak = at(entryEnd)
      const b = m < peak - 60 || m > peak + 60 ? 0 : 0.1 * (1 - Math.abs(m - peak) / 60)
      const exit = m > at(corner.apex) ? Math.min(0.1, (m - at(corner.apex)) / (at(corner.end) - at(corner.apex)) * 0.1) : 0
      return v + b + exit
    })
    bump.lapTimeS = bump.channels.time_s.at(-1)!
    const [c] = compareCorners(bump, reference, [corner])
    expect(c!.phaseLossS.entry).toBeLessThan(0.01)
    expect(c!.phaseLossS.exit).toBeGreaterThan(0.05)
  })

  it('finds the logger session id for the lap files, also on older sessions', () => {
    expect(analysisSessionToken('20261025_175240', 'x', null)).toBe('20261025_175240')
    expect(analysisSessionToken(undefined, '2026_08_17T20_00_00_spa', '2026-08-17T20:00:00.123')).toBe('20260817_200000')
    expect(analysisSessionToken(undefined, 'cloud-id', undefined)).toBeNull()
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
    // The three parts add up to the corner's loss.
    const parts = c2!.phaseLossS
    expect(parts.entry + parts.mid + parts.exit).toBeCloseTo(c2!.timeLostS, 9)
  })

  it('advice starts from the part of the corner where the time goes, and stays quiet without loss', () => {
    const base = { corner: { number: 1, start: 0, apex: 0.5, end: 1, minSpeedKmh: 80 }, lapMinKmh: 80, refMinKmh: 80, brakeDeltaM: 0, exitDeltaKmh: 0, phaseLossS: { entry: 0, mid: 0, exit: 0 } }
    const lost = (entry: number, mid: number, exit: number) => ({ timeLostS: entry + mid + exit, phaseLossS: { entry, mid, exit } })
    expect(cornerAdvice({ ...base, timeLostS: 0 })).toBe('Come il riferimento')
    expect(cornerAdvice({ ...base, timeLostS: -0.1 })).toBe('Qui sei più veloce del riferimento')
    // Slow apex and slow exit: the time goes in the middle, so the advice is the middle.
    expect(cornerAdvice({ ...base, ...lost(0.01, 0.15, 0.04), lapMinKmh: 72, exitDeltaKmh: -6 })).toBe('A centro curva vai 8 km/h più piano del riferimento: porta più velocità')
    expect(cornerAdvice({ ...base, ...lost(0.15, 0.02, 0.03), brakeDeltaM: -30 })).toBe('Freni 30 m prima del riferimento: prova a frenare più tardi')
    expect(cornerAdvice({ ...base, ...lost(0.15, 0.02, 0.03), brakeDeltaM: 25 })).toBe("Freni 25 m dopo il riferimento e arrivi lungo: frena un po' prima")
    expect(cornerAdvice({ ...base, ...lost(0.15, 0.02, 0.03) })).toBe('In frenata perdi 0.15 s: confronta quanto forte freni e quanta velocità porti dentro')
    expect(cornerAdvice({ ...base, ...lost(0.02, 0.03, 0.15), exitDeltaKmh: -6 })).toBe("In uscita vai 6 km/h più piano del riferimento: cerca un'uscita più veloce")
    expect(cornerAdvice({ ...base, ...lost(0.02, 0.03, 0.15) })).toBe('In uscita perdi 0.15 s: confronta quando riapri il gas')
    expect(cornerAdvice({ ...base, ...lost(0.02, 0.15, 0.03) })).toBe('A centro curva perdi 0.15 s: confronta le due traiettorie sulla mappa')
    // Loss spread evenly, no part above 40%: everywhere.
    expect(cornerAdvice({ ...base, ...lost(0.035, 0.035, 0.03) })).toBe("Perdi un po' in tutta la curva: confronta le due traiettorie sulla mappa")
  })

  it('map keeps the aspect ratio inside the box, null without coordinates', () => {
    const points = mapPoints(lap(() => 200), fractions(101), 300, 300, 10, undefined, 0)!
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    expect(Math.min(...xs)).toBeCloseTo(10, 0)
    expect(Math.max(...xs)).toBeCloseTo(290, 0)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(140, 0) // 400 x 200 m track: half as tall
    expect(mapPoints(lap(() => 200, [], 60, 3000, false), fractions(11), 300, 300)).toBeNull()
  })

  it('a frame whose coordinates stay in one place draws nothing (06/11: map squeezed into its centre)', () => {
    const flat = lap(() => 200)
    flat.channels.pos_x = flat.channels.pos_x!.map(() => 0)
    flat.channels.pos_z = flat.channels.pos_z!.map(() => 0)
    expect(hasMapPositions(flat)).toBe(false)
    expect(hasMapPositions(lap(() => 200))).toBe(true)
    // Your lap framed by such a reference: null, so the map falls back to your lap alone.
    expect(mapPoints(lap(() => 200), fractions(11), 300, 300, 10, flat)).toBeNull()
    expect(worldToMap(flat, fractions(11), 300, 300)).toBeNull()
    const empty = lap(() => 200)
    empty.channels.pos_x = empty.channels.pos_x!.map(() => Number.NaN)
    expect(hasMapPositions(empty)).toBe(false)
  })

  it('ACC orientation as the minimap: world Z down, then 270° clockwise (world +X up)', () => {
    // The fixture starts at world x = +400, z = 0: the easternmost point goes to the top.
    const points = mapPoints(lap(() => 200), fractions(101), 300, 300, 10)!
    const ys = points.map(p => p.y)
    expect(points[0]!.y).toBeCloseTo(Math.min(...ys), 0)
    // A 400 x 200 m track turned by 270°: now twice as tall as wide.
    const xs = points.map(p => p.x)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(280, 0)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(140, 0)
    // World +Z (a quarter lap in, z = +200) goes to the right: a mirrored map would put it left.
    expect(points[25]!.x).toBeCloseTo(Math.max(...xs), 0)
  })

  it('finish line crosses the track at the start', () => {
    const line = finishLine([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5)!
    expect(line).toEqual({ x1: 0, y1: -5, x2: 0, y2: 5 })
    expect(finishLine([{ x: 0, y: 0 }])).toBeNull()
  })

  it('time-sync finds where the reference was at the same time', () => {
    const reference = lap(() => 200)
    const slower = lap(() => 100) // half the speed: at the end of its first half the reference had finished
    expect(timeSyncedFraction(slower, reference, 0.25)).toBeCloseTo(0.5, 3)
    expect(timeSyncedFraction(slower, reference, 0.6)).toBe(1)
    expect(timeSyncedFraction(reference, slower, 1)).toBeCloseTo(0.5, 3)
  })

  it('time-sync follows a real speed profile, not the ratio of lap times', () => {
    const reference = lap(profile(), [800, 2000]) // slow in the corners, fast on the straights
    const steady = lap(() => 150)
    for (const f of [0.1, 0.3, 0.45, 0.7]) {
      const at = timeSyncedFraction(steady, reference, f)
      expect(channelAt(reference, 'time_s', at)!).toBeCloseTo(channelAt(steady, 'time_s', f)!, 2)
      expect(Math.abs(at - f * steady.lapTimeS / reference.lapTimeS)).toBeGreaterThan(0.001)
    }
  })

  it('a time axis that goes back falls back to the same point; two samples give no body angle', () => {
    const broken = lap(() => 200)
    broken.channels.time_s = broken.channels.time_s!.map((v, i, all) => i === all.length - 1 ? 0 : v)
    expect(timeSyncedFraction(lap(() => 100), broken, 0.3)).toBe(0.3)
    const tiny = lap(() => 200, [], 60, 2)
    tiny.channels.heading_rad = [0, 0]
    expect(bodySlipDeg(tiny, 0.5)).toBeNull()
  })

  it('body slip: zero when the car points where it goes, the angle when it does not', () => {
    const t = lap(() => 200, [], 60, 400)
    const n = t.channels.time_s!.length
    t.channels.pos_x = Array.from({ length: n }, (_, i) => i * 2) // driving along world +X
    t.channels.pos_z = Array.from({ length: n }, () => 0)
    t.channels.heading_rad = Array.from({ length: n }, () => -Math.PI / 2) // ACC heading for +X travel
    expect(bodySlipDeg(t, 0.5)).toBeCloseTo(0, 6)
    t.channels.heading_rad = Array.from({ length: n }, () => -Math.PI / 2 + 0.1)
    expect(bodySlipDeg(t, 0.5)).toBeCloseTo(5.73, 1)
    delete t.channels.heading_rad
    expect(bodySlipDeg(t, 0.5)).toBeNull()
  })

  it('trend and delta format', () => {
    expect(deltaTrend([0, 0.1, 0.05])).toEqual([0.1, -0.05].map(v => expect.closeTo(v, 9)))
    expect(formatDelta(0.25)).toBe('+0.250')
    expect(formatDelta(-0.1)).toBe('−0.100')
  })
})

describe('Garage 61 sectors', () => {
  it('places the official sector times on the trace', async () => {
    const { sectorBounds, fractionAtTime } = await import('~/services/telemetry/lapAnalysis')
    const steady = { gameId: 'acc', variant: null, sessionId: 's', track: 't', car: 'c', lapTimeS: 100, source: 'logger', complete: true, valid: true, fuelL: null, gridStepM: 2, lengthM: 200,
      channels: { time_s: Array.from({ length: 101 }, (_, i) => i), speed_kmh: Array.from({ length: 101 }, () => 7.2) } }
    expect(fractionAtTime(steady, 25)).toBeCloseTo(0.25, 6)
    expect(sectorBounds(steady, [30000, 30000, 40000])).toEqual([0, expect.closeTo(0.3, 6), expect.closeTo(0.6, 6), 1])
    expect(sectorBounds(steady, [30000, null, 40000])).toBeNull()
    expect(sectorBounds(steady, undefined)).toBeNull()
  })
})

describe('corner navigation (PIP-635)', () => {
  const corners = [{ number: 1, start: 0.1, apex: 0.15, end: 0.2, minSpeedKmh: 90 }, { number: 2, start: 0.4, apex: 0.45, end: 0.5, minSpeedKmh: 120 }, { number: 3, start: 0.7, apex: 0.75, end: 0.8, minSpeedKmh: 80 }]
  it('steps to the next and previous corner, round the lap', () => {
    expect(stepCorner(1, 3, 1)).toBe(2)
    expect(stepCorner(3, 3, 1)).toBe(1)
    expect(stepCorner(1, 3, -1)).toBe(3)
    expect(stepCorner(2, 3, -1)).toBe(1)
    expect(stepCorner(1, 0, 1)).toBeNull()
  })
  it('finds the corner under the cursor, none on the straights', () => {
    expect(cornerAt(corners, 0.45)?.number).toBe(2)
    expect(cornerAt(corners, 0.1)?.number).toBe(1)
    expect(cornerAt(corners, 0.3)).toBeNull()
    expect(cornerAt(corners, null)).toBeNull()
  })
})

describe('map follows the cursor (PIP-635)', () => {
  const frame = { cx: 100, cy: 100, span: 100 }
  it('glides a share of the way to the dot, keeping the zoom', () => {
    expect(glideFrame(frame, { x: 140, y: 60 })).toEqual({ frame: { cx: 110, cy: 90, span: 100 }, done: false })
  })
  it('settles on the dot once it is close enough', () => {
    expect(glideFrame(frame, { x: 100.5, y: 100 })).toEqual({ frame: { cx: 100.5, cy: 100, span: 100 }, done: true })
    let f = frame, steps = 0
    for (let r = glideFrame(f, { x: 180, y: 40 }); !r.done && steps < 100; r = glideFrame(f, { x: 180, y: 40 })) { f = r.frame; steps++ }
    expect(steps).toBeLessThan(30)
  })
})

describe('focus zone: the loss you keep (01/11, research)', () => {
  const fast = lap(() => 180)
  // A lap whose gap to `fast` follows the given points (metres, seconds), linear in between: speed from the slope.
  function gapLap(points: [number, number][]) {
    const t = fast.channels.time_s!, n = t.length, gapAt = (m: number) => {
      for (let k = 1; k < points.length; k++) {
        const [m0, g0] = points[k - 1]!, [m1, g1] = points[k]!
        if (m <= m1) return g0 + (g1 - g0) * Math.max(0, (m - m0) / (m1 - m0))
      }
      return points.at(-1)![1]
    }
    const out = lap(() => 180)
    out.channels.time_s = t.map((v, i) => v + gapAt((i / (n - 1)) * 3000))
    out.lapTimeS = out.channels.time_s.at(-1)!
    return out
  }
  it('corner 1 (01/11): the bump given back is no zone; the zone is where the sustained loss starts', () => {
    const c1 = gapLap([[0, 0], [550, 0], [600, 0.10], [650, 0.03], [1000, 0.134], [3000, 0.134]])
    const f = focusInStretch(c1, fast, [400 / 3000, 1000 / 3000])!
    expect(f.zone[0] * 3000).toBeGreaterThanOrEqual(645)
    expect(f.zone[0] * 3000).toBeLessThan(700)
    expect(f.lossS).toBeCloseTo(0.104, 2)
  })
  it('the zone moves back to where the pedals differ just before the loss (T1: brake released early)', () => {
    const c1 = gapLap([[0, 0], [550, 0], [600, 0.10], [650, 0.03], [1000, 0.134], [3000, 0.134]])
    const ref = lap(() => 180)
    // Both brake from 480 m; you release at 590 m, the reference holds the brake to 630 m.
    c1.channels.brake_pct = c1.channels.brake_pct!.map((_, i) => (i * 2 >= 480 && i * 2 < 590 ? 100 : 0))
    ref.channels.brake_pct = ref.channels.brake_pct!.map((_, i) => (i * 2 >= 480 && i * 2 < 630 ? 100 : 0))
    const f = focusInStretch(c1, ref, [400 / 3000, 1000 / 3000])!
    expect(f.zone[0] * 3000).toBeGreaterThan(585); expect(f.zone[0] * 3000).toBeLessThan(595)
    expect(f.zone[1] * 3000).toBeGreaterThanOrEqual(645); expect(f.zone[1] * 3000).toBeLessThan(700)
    // A throttle blip of 4 m never makes the zone.
    const blip = gapLap([[0, 0], [550, 0], [600, 0.10], [650, 0.03], [1000, 0.134], [3000, 0.134]])
    blip.channels.throttle_pct = blip.channels.throttle_pct!.map((v, i) => (i * 2 >= 600 && i * 2 < 604 ? 0 : v))
    expect(focusInStretch(blip, fast, [400 / 3000, 1000 / 3000])!.zone[0] * 3000).toBeGreaterThanOrEqual(645)
  })
  it('the advice of a pedal zone says the pedal (T1: you hold the brake less)', () => {
    const c1 = gapLap([[0, 0], [550, 0], [600, 0.10], [650, 0.03], [1000, 0.134], [3000, 0.134]])
    const ref = lap(() => 180)
    c1.channels.brake_pct = c1.channels.brake_pct!.map((_, i) => (i * 2 >= 480 && i * 2 < 590 ? 100 : 0))
    ref.channels.brake_pct = ref.channels.brake_pct!.map((_, i) => (i * 2 >= 480 && i * 2 < 630 ? 100 : 0))
    const f = focusInStretch(c1, ref, [400 / 3000, 1000 / 3000])!
    expect(f.cause).toMatchObject({ pedal: 'brake', lapMore: false, timing: true })
    expect(focusAdvice(f)).toContain('molli il freno mentre il riferimento frena ancora')
  })
  it('a pedal difference after the loss never moves the zone; every band is 30-150 m (Codex 01/11)', () => {
    const late = gapLap([[0, 0], [600, 0], [620, 0.05], [3000, 0.05]])
    late.channels.throttle_pct = late.channels.throttle_pct!.map((v, i) => (i * 2 >= 660 && i * 2 < 720 ? 0 : v))
    const f = focusInStretch(late, fast, [400 / 3000, 1000 / 3000])!
    expect(f.zone[0] * 3000).toBeGreaterThanOrEqual(598)
    expect(f.zone[1] * 3000).toBeLessThan(640)
    expect(f.cause).toBeNull()
    expect((f.zone[1] - f.zone[0]) * 3000).toBeGreaterThanOrEqual(29.9)
    const long = gapLap([[0, 0], [100, 0], [2100, 1.0], [3000, 1.0]])
    const g = focusInStretch(long, fast, [0, 1])!
    expect((g.zone[1] - g.zone[0]) * 3000).toBeLessThanOrEqual(150.1)
  })
  it('pressure is not timing; a change of pedal starts a new piece; 30 m even at the end (Codex 01/11)', () => {
    const c1 = gapLap([[0, 0], [550, 0], [600, 0.10], [650, 0.03], [1000, 0.134], [3000, 0.134]])
    const ref = lap(() => 180)
    // Same braking points, half the pressure: "lighter", never "hold it longer".
    c1.channels.brake_pct = c1.channels.brake_pct!.map((_, i) => (i * 2 >= 560 && i * 2 < 640 ? 50 : 0))
    ref.channels.brake_pct = ref.channels.brake_pct!.map((_, i) => (i * 2 >= 560 && i * 2 < 640 ? 100 : 0))
    const f = focusInStretch(c1, ref, [400 / 3000, 1000 / 3000])!
    expect(f.cause).toMatchObject({ pedal: 'brake', lapMore: false, timing: false })
    expect(focusAdvice(f)).toContain('più piano')
    // 20 m more brake then 20 m more throttle: two pieces, the claim covers one of them only.
    const mixed = gapLap([[0, 0], [550, 0], [600, 0.10], [650, 0.03], [1000, 0.134], [3000, 0.134]])
    const ref2 = lap(() => 180)
    mixed.channels.brake_pct = mixed.channels.brake_pct!.map((_, i) => (i * 2 >= 600 && i * 2 < 620 ? 80 : 0))
    mixed.channels.throttle_pct = mixed.channels.throttle_pct!.map((v, i) => (i * 2 >= 600 && i * 2 < 620 ? 0 : v))
    ref2.channels.throttle_pct = ref2.channels.throttle_pct!.map((v, i) => (i * 2 >= 620 && i * 2 < 640 ? 0 : v))
    const g = focusInStretch(mixed, ref2, [400 / 3000, 1000 / 3000])!
    expect(g.cause!.metres).toBeLessThanOrEqual(22)
    // A loss in the last 10 m of the stretch still gives a 30 m band.
    const tail = gapLap([[0, 0], [990, 0], [1000, 0.05], [3000, 0.05]])
    const h = focusInStretch(tail, fast, [400 / 3000, 1000 / 3000])!
    expect((h.zone[1] - h.zone[0]) * 3000).toBeGreaterThanOrEqual(29.9)
  })
  it('a uniform loss over a long corner still gives a zone (opening the corner keeps its band)', () => {
    const even = gapLap([[0, 0], [400, 0], [1000, 0.134], [3000, 0.134]])
    const f = focusInStretch(even, fast, [400 / 3000, 1000 / 3000])!
    expect(f.zone[0] * 3000).toBeLessThan(420)
    expect(f.zone[1] * 3000).toBeLessThan(500)
  })
  it('two separate losses are never joined: the bigger one, its own run only', () => {
    const two = gapLap([[0, 0], [450, 0], [480, 0.10], [800, 0.10], [830, 0.16], [3000, 0.16]])
    const f = focusInStretch(two, fast, [400 / 3000, 1000 / 3000])!
    expect(f.zone[0] * 3000).toBeGreaterThan(440)
    expect(f.zone[1] * 3000).toBeLessThan(500)
  })
  it('wiggles of a few thousandths on 2 m data never break a sustained loss (Codex 01/11)', () => {
    const t = fast.channels.time_s!, n = t.length
    const noisy = lap(() => 180)
    noisy.channels.time_s = t.map((v, i) => {
      const m = (i / (n - 1)) * 3000
      const sustained = m <= 400 ? 0 : Math.min(0.134, ((m - 400) / 600) * 0.134)
      return v + sustained + 0.002 * Math.sin((m / 30) * 2 * Math.PI)
    })
    const f = focusInStretch(noisy, fast, [400 / 3000, 1000 / 3000])!
    expect(f).not.toBeNull()
    expect(f.lossS).toBeGreaterThan(0.1)
  })
  it('a pause of 40 m without growth splits two losses; a shorter one does not', () => {
    const near = gapLap([[0, 0], [500, 0], [520, 0.035], [550, 0.035], [570, 0.07], [3000, 0.07]])
    expect(focusInStretch(near, fast, [400 / 3000, 1000 / 3000])!.lossS).toBeCloseTo(0.07, 2)
    const far = gapLap([[0, 0], [500, 0], [520, 0.035], [620, 0.035], [640, 0.07], [3000, 0.07]])
    expect(focusInStretch(far, fast, [400 / 3000, 1000 / 3000])!.lossS).toBeCloseTo(0.035, 2)
  })
  it('a concentrated loss: zone on it', () => {
    const slow = lap(m => (m >= 1500 && m < 1600 ? 120 : 180))
    const f = focusInStretch(slow, fast, [0.4, 0.6])!
    expect(f.zone[0]).toBeLessThan(1600 / 3000); expect(f.zone[1]).toBeGreaterThan(1500 / 3000)
    expect(f.lossS).toBeGreaterThan(0.5)
  })
  it('nothing when level, faster, under the threshold, with no stretch or with a time reset', () => {
    const slow = lap(m => (m >= 1500 && m < 1600 ? 120 : 180))
    expect(focusInStretch(fast, fast, [0.4, 0.6])).toBeNull()
    expect(focusInStretch(fast, slow, [0.4, 0.6])).toBeNull()
    expect(focusInStretch(slow, fast, [0.4, 0.6], { min: 60 })).toBeNull()
    expect(focusInStretch(slow, fast, [0.6, 0.4])).toBeNull()
    const reset = lap(() => 180)
    reset.channels.time_s = reset.channels.time_s!.map((v, i) => (i === 750 ? 0 : v))
    expect(focusInStretch(reset, fast, [0.4, 0.6])).toBeNull()
  })
})

describe('time lost over a stretch (PIP-635)', () => {
  it('is the lap time over the stretch minus the reference time over it', () => {
    const fast = lap(() => 180), slow = lap(m => (m >= 1000 && m < 2000 ? 120 : 180))
    // Only the middle third is slower: all the loss is there, none outside.
    const middle = stretchDelta(slow, fast, [1 / 3, 2 / 3])!
    expect(middle).toBeGreaterThan(9)
    expect(stretchDelta(slow, fast, [0, 0.3])).toBeCloseTo(0, 2)
    expect(stretchDelta(slow, fast, [0, 1])).toBeCloseTo(middle, 1)
    expect(stretchDelta(fast, slow, [1 / 3, 2 / 3])).toBeCloseTo(-middle, 6)
  })
})

describe('map glide inside the track bounds (PIP-635)', () => {
  it('settles on the reachable point when the dot is outside the bounds the centre can take', () => {
    const bounds = { x0: 0, x1: 100, y0: 0, y1: 100 }
    let f = { cx: 90, cy: 50, span: 8 }, steps = 0
    for (let r = glideFrame(f, { x: 102, y: 50 }, 0.25, bounds); !r.done && steps < 200; r = glideFrame(f, { x: 102, y: 50 }, 0.25, bounds)) { f = r.frame; steps++ }
    expect(steps).toBeLessThan(40)
    expect(glideFrame(f, { x: 102, y: 50 }, 0.25, bounds).frame.cx).toBe(100)
  })
})
