import { describe, expect, it } from 'vitest'
import {
  LAP_TRACE_SCHEMA,
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
