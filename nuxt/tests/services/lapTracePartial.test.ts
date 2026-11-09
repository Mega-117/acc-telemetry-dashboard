// PIP-760: the partial channel contract on the site. A channel the program recovered from a lap's original
// trace (MoTeC repair) holds `null` where nothing was recorded. It never reaches the generic charts (they would
// draw a hole as 0): normalizeLapTrace keeps it apart, in `partialChannels`; core channels are never partial.
import { describe, expect, it } from 'vitest'
import { normalizeLapTrace } from '~/services/telemetry/lapTraceChart'
import { decodeLapChannels } from '~/services/telemetry/lapsArchiveClient'

const n = 50
const ramp = (k = 1) => Array.from({ length: n }, (_, i) => i * k)
function raw(channels: Record<string, (number | null)[]>) {
  return { schema: 'acc.laptrace.v1', grid_step_m: 2,
    meta: { track: 'silverstone', car: 'ferrari_296_gt3', source: 'logger', lap_time_s: 49, complete: true, valid: true, extra: { lap_number: 2 } },
    channels: { time_s: ramp(), speed_kmh: ramp(3), brake_pct: ramp(0), throttle_pct: ramp(0), steer_deg: ramp(0.001), gear: ramp(0).map(() => 4), ...channels } }
}
const holed = (values: number[], missing: (i: number) => boolean) => values.map((v, i) => (missing(i) ? null : v))

describe('normalizeLapTrace with partial channels (PIP-760)', () => {
  it('keeps a recovered channel apart with its nulls, out of the full channels', () => {
    const view = normalizeLapTrace(raw({ pos_x: holed(ramp(5), i => i < 6), pos_z: holed(ramp(2), i => i < 6), heading_rad: holed(ramp(0.1), i => i < 6), rpm: ramp(100) }))!
    expect(view).not.toBeNull()
    expect(view.channels.pos_x).toBeUndefined()
    expect(view.channels.rpm).toHaveLength(n)
    expect(view.partialChannels?.pos_x?.slice(0, 7)).toEqual([null, null, null, null, null, null, 30])
    expect(Object.keys(view.partialChannels ?? {}).sort()).toEqual(['heading_rad', 'pos_x', 'pos_z'])
    expect(view.lengthM).toBe((n - 1) * 2)
  })

  it.each(['time_s', 'speed_kmh', 'brake_pct', 'throttle_pct', 'steer_deg', 'gear'])('refuses a lap whose %s is partial', (name) => {
    const lap = raw({})
    ;(lap.channels as Record<string, (number | null)[]>)[name]![7] = null
    expect(normalizeLapTrace(lap)).toBeNull()
  })

  it('refuses a partial channel with no recorded sample, of another length or with a non-number', () => {
    expect(normalizeLapTrace(raw({ pos_x: ramp().map(() => null) }))).toBeNull()
    expect(normalizeLapTrace(raw({ pos_x: holed(ramp(), i => i < 3).slice(1) }))).toBeNull()
    expect(normalizeLapTrace(raw({ pos_x: [...holed(ramp(), i => i < 3).slice(0, -1), Number.NaN] }))).toBeNull()
  })

  it('a lap without nulls has no partial channels (unchanged)', () => {
    expect(normalizeLapTrace(raw({ pos_x: ramp() }))!.partialChannels).toBeUndefined()
  })
})

describe('decodeLapChannels with channels_partial_qd (PIP-760)', () => {
  it('gives the nulls back exactly; the running sum resumes from the last recorded value', () => {
    const decoded = decodeLapChannels({ schema: 'acc.laptrace.v1', encoding: 'qdelta1', channel_decimals: { time_s: 3, pos_x: 1 },
      channels_qd: { time_s: [0, 1000, 1000, 1000] }, channels_partial_qd: { pos_x: [null, 1234, null, 10] } }) as { channels: Record<string, unknown[]> }
    expect(decoded.channels.pos_x).toEqual([null, 123.4, null, 124.4])
    expect(decoded.channels.time_s).toEqual([0, 1, 2, 3])
    expect('channels_partial_qd' in decoded).toBe(false)
  })

  it('a null in a full channel, or a partial channel without decimals, is refused', () => {
    expect(() => decodeLapChannels({ encoding: 'qdelta1', channel_decimals: { time_s: 3 }, channels_qd: { time_s: [0, null] } })).toThrow()
    expect(() => decodeLapChannels({ encoding: 'qdelta1', channel_decimals: { time_s: 3 }, channels_qd: { time_s: [0, 1] }, channels_partial_qd: { pos_x: [null, 1] } })).toThrow()
  })
})

describe('lapMapLine (PIP-760)', () => {
  it('a hole of one sample between two map points still breaks the line (no chord)', async () => {
    const { lapMapLine, fractions } = await import('~/services/telemetry/lapAnalysis')
    const big = 3000
    const x = Array.from({ length: big }, (_, i) => Math.cos(i / big * 2 * Math.PI) * 300)
    const z = Array.from({ length: big }, (_, i) => Math.sin(i / big * 2 * Math.PI) * 200)
    const lap = normalizeLapTrace({ schema: 'acc.laptrace.v1', grid_step_m: 2,
      meta: { track: 's', car: 'c', source: 'logger', lap_time_s: 100, complete: true, valid: true },
      channels: { time_s: x.map((_, i) => i), speed_kmh: x.map(() => 150), brake_pct: x.map(() => 0), throttle_pct: x.map(() => 100),
        pos_x: x.map((v, i) => (i === 1501 ? null : v)), pos_z: z } })!
    const full = normalizeLapTrace({ schema: 'acc.laptrace.v1', grid_step_m: 2, meta: { track: 's', car: 'c', source: 'logger', lap_time_s: 100, complete: true, valid: true },
      channels: { time_s: x.map((_, i) => i), speed_kmh: x.map(() => 150), brake_pct: x.map(() => 0), throttle_pct: x.map(() => 100), pos_x: x, pos_z: z } })!
    const at = fractions(600)
    const line = lapMapLine(lap, at, 320, 256, 18, full)!
    expect(line.points.every(p => p !== null)).toBe(true)                 // no map point falls on the missing sample...
    expect(line.joined.filter(j => !j)).toHaveLength(1)                   // ...the stretch across it is still not joined
    expect(lapMapLine(full, at, 320, 256, 18, full)!.joined.every(Boolean)).toBe(true)
  })
})
