import { describe, expect, it } from 'vitest'
import {
  LAP_TRACE_SCHEMA,
  COMMON_LAP_TRACE_SCHEMA,
  lapTraceContextMatches,
  channelRange,
  normalizeLapTrace,
  polylinePoints,
} from '~/services/telemetry/lapTraceChart'

function makeTraceDict(overrides: Record<string, unknown> = {}) {
  const n = 11
  const ramp = Array.from({ length: n }, (_, i) => i * 10)
  return {
    schema: LAP_TRACE_SCHEMA,
    grid_step_m: 2,
    meta: {
      track: 'spa', car: 'ferrari_296_gt3', source: 'logger',
      lap_time_s: 136.5, complete: true, valid: true, fuel_l: 58.2,
    },
    channels: {
      time_s: ramp.map(v => v / 10),
      speed_kmh: ramp.map(v => 100 + v),
      brake_pct: ramp.map(() => 0),
      throttle_pct: ramp.map(() => 100),
    },
    ...overrides,
  }
}

describe('normalizeLapTrace', () => {
  it('preserves common identity, unknown validity/fuel and partial channels', () => {
    const raw = makeTraceDict()
    const view = normalizeLapTrace({ ...raw, schema: COMMON_LAP_TRACE_SCHEMA,
      meta: { ...raw.meta, game_id: 'synthetic', track_variant: 'short', valid: null, fuel_l: null },
      channels: { time_s: raw.channels.time_s, speed_kmh: raw.channels.speed_kmh } })!
    expect(view).toMatchObject({ gameId: 'synthetic', variant: 'short', valid: null, fuelL: null })
    expect(view.channels.brake_pct).toBeUndefined()
    expect(lapTraceContextMatches(view, { ...view, variant: 'full' })).toBe(false)
    expect(lapTraceContextMatches(view, { ...view, variant: null })).toBe(false)
    expect(lapTraceContextMatches(view, { ...view, gameId: 'acc' })).toBe(false)
    expect(lapTraceContextMatches(view, { ...view, car: 'other' })).toBe(false)
    expect(lapTraceContextMatches(view, { ...view, track: ' SPA ' })).toBe(true)
  })

  it('rejects conflicting or missing game identity and malformed measurements', () => {
    const raw = makeTraceDict()
    expect(normalizeLapTrace({ ...raw, meta: { ...raw.meta, game_id: 'evo' } })).toBeNull()
    expect(normalizeLapTrace({ ...raw, schema: COMMON_LAP_TRACE_SCHEMA })).toBeNull()
    expect(normalizeLapTrace({ ...raw, meta: { ...raw.meta, track_variant: 3 } })).toBeNull()
    expect(normalizeLapTrace({ ...raw, meta: { ...raw.meta, lap_time_s: null } })).toBeNull()
    expect(normalizeLapTrace({ ...raw, channels: { ...raw.channels, brake_pct: raw.channels.brake_pct.map(() => NaN) } })).toBeNull()
  })

  it('accetta lo schema v1 con canali coerenti', () => {
    const view = normalizeLapTrace(makeTraceDict())
    expect(view).not.toBeNull()
    expect(view?.track).toBe('spa')
    expect(view?.lengthM).toBe(20)
    expect(view?.fuelL).toBe(58.2)
    expect(view?.complete).toBe(true)
  })

  it('rifiuta schema sbagliato, canali mancanti o lunghezze diverse', () => {
    expect(normalizeLapTrace(null)).toBeNull()
    expect(normalizeLapTrace(makeTraceDict({ schema: 'altro' }))).toBeNull()
    const missing = makeTraceDict()
    delete (missing.channels as Record<string, unknown>).speed_kmh
    expect(normalizeLapTrace(missing)).toBeNull()
    const ragged = makeTraceDict()
    ;(ragged.channels as Record<string, number[]>).brake_pct = [1, 2, 3]
    expect(normalizeLapTrace(ragged)).toBeNull()
  })
})

describe('polylinePoints / channelRange', () => {
  const box = { width: 100, height: 50, padding: 10 }

  it.each([32, 64, 127, 128])('keeps both endpoints for %i samples at the default decimation', (count) => {
    const raw = makeTraceDict()
    const channels = Object.fromEntries(Object.keys(raw.channels).map(name =>
      [name, Array.from({ length: count }, (_, i) => i / (count - 1))]))
    const trace = normalizeLapTrace({ ...raw, grid_step_m: 1000 / (count - 1), channels })!
    const points = polylinePoints(trace, 'speed_kmh', box, 0, 1).split(' ')
    expect(points[0]).toBe('10.0,40.0')
    expect(points.at(-1)).toBe('90.0,10.0')
  })

  it('scala i punti dentro il box, partenza e traguardo sempre allineati', () => {
    const view = normalizeLapTrace(makeTraceDict())!
    const points = polylinePoints(view, 'speed_kmh', box, 100, 200, 1)
    const pairs = points.split(' ').map(p => p.split(',').map(Number))
    expect(pairs[0]).toEqual([10, 40])            // inizio: x=padding, y=min in basso
    expect(pairs[pairs.length - 1]).toEqual([90, 10]) // fine: x=width-padding, y=max in alto
    // un giro con meta' campioni (lunghezza diversa) finisce comunque al traguardo
    const shortDict = makeTraceDict()
    for (const name of Object.keys(shortDict.channels as Record<string, number[]>)) {
      (shortDict.channels as Record<string, number[]>)[name] =
        (shortDict.channels as Record<string, number[]>)[name]!.slice(0, 6)
    }
    const shortView = normalizeLapTrace(shortDict)!
    const shortLast = polylinePoints(shortView, 'speed_kmh', box, 100, 200, 1)
      .split(' ').pop()!.split(',').map(Number)
    expect(shortLast[0]).toBeCloseTo(90, 0)
  })

  it('range comune su piu\' giri con margine', () => {
    const a = normalizeLapTrace(makeTraceDict())!
    const dictB = makeTraceDict()
    ;(dictB.channels as Record<string, number[]>).speed_kmh = a.channels.speed_kmh!.map(v => v + 50)
    const b = normalizeLapTrace(dictB)!
    const { yMin, yMax } = channelRange([a, b], 'speed_kmh')
    expect(yMin).toBeLessThan(100)
    expect(yMax).toBeGreaterThan(250)
  })
})
