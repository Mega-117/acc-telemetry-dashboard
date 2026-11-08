// PIP-751: the Telemetria header (ACC's lap times) and the delta / sectors / segments (the traces' own clock)
// must never say the opposite of each other. Real laps of this PC: NitroX G2 at Silverstone (06/11, 1:58.887,
// sectors 35.200 / 49.930 / 33.757) whose trace was saved 1.67 s short, and a good Hungaroring pair.
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import real from '../fixtures/pip751_real_lap_times.json'
import { completeUnderPolicy, lapPairCheck, SHORT_TRACE_POLICY, TRACE_COVERAGE_TOLERANCE_S, traceCoversLap } from '~/services/telemetry/traceCoverage'
import { channelAt } from '~/services/telemetry/lapAnalysis'
import { normalizeLapTrace, type LapTraceView } from '~/services/telemetry/lapTraceChart'
import { useSectorCompare } from '~/composables/useSectorCompare'

type RealLap = { lapTimeS: number, gridStepM: number, sectorTimesMs: number[], time_s: number[], track: string, car: string }
function view(lap: RealLap): LapTraceView {
  return { gameId: 'acc', variant: null, sessionId: null, track: lap.track, car: lap.car, lapTimeS: lap.lapTimeS, source: 'logger', complete: true, valid: true,
    fuelL: null, conditions: null, gridStepM: lap.gridStepM, lengthM: (lap.time_s.length - 1) * lap.gridStepM, channels: { time_s: lap.time_s } }
}
function timed(lapTimeS: number, spanS: number): LapTraceView {
  const n = 500
  return { ...view({ lapTimeS, gridStepM: 2, sectorTimesMs: [], time_s: [], track: 't', car: 'c' }), lengthM: (n - 1) * 2,
    channels: { time_s: Array.from({ length: n }, (_, i) => i / (n - 1) * spanS) } }
}
const nitrox = view(real.nitrox_g2 as RealLap)
const hunFast = view(real.hun_l6 as RealLap), hunSlow = view(real.hun_l4 as RealLap)
const deltaEnd = (a: LapTraceView, b: LapTraceView) => (channelAt(a, 'time_s', 1)! - channelAt(a, 'time_s', 0)!) - (channelAt(b, 'time_s', 1)! - channelAt(b, 'time_s', 0)!)

describe('traceCoversLap (PIP-751)', () => {
  it('the real NitroX G2 trace does not cover its 1:58.887: 1.67 s short, never comparable', () => {
    expect(real.nitrox_g2.sectorTimesMs).toEqual([35200, 49930, 33757])            // ACC, the arbiter
    const c = traceCoversLap(nitrox)
    expect(c.covers).toBe(false)
    expect(c.spanGapMs).toBeLessThanOrEqual(-1650)
    expect(c.spanGapMs).toBeGreaterThanOrEqual(-1700)
    const pair = lapPairCheck(nitrox, hunFast)
    expect(pair.comparable).toBe(false)
    expect(pair.spanGapMs).toBeGreaterThanOrEqual(1650)
  })

  it('a good real pair: header, end of the delta and sum of the sectors agree within 0.05 s', () => {
    const pair = lapPairCheck(hunFast, hunSlow)
    expect(pair.comparable).toBe(true)
    const header = hunFast.lapTimeS - hunSlow.lapTimeS                               // -0.163, ACC's times
    expect(Math.abs(deltaEnd(hunFast, hunSlow) - header)).toBeLessThan(0.05)
    expect(pair.mismatchMs!).toBeLessThan(50)
    // Official sector times on both sides (laps of the shown session).
    const official = useSectorCompare({ lap: ref(hunFast), reference: ref(hunSlow), lapTimes: ref(real.hun_l6.sectorTimesMs), refTimes: ref(real.hun_l4.sectorTimesMs) })
    expect(Math.abs(official.sectorGaps.value.reduce((s, g) => s + g.gap!, 0) / 1000 - header)).toBeLessThan(0.05)
    expect(official.sectorGaps.value.map(g => g.mine)).toEqual(real.hun_l6.sectorTimesMs)   // the box shows YOUR time
    // A reference without official times: measured on both traces at the same points.
    const measured = useSectorCompare({ lap: ref(hunFast), reference: ref(hunSlow), lapTimes: ref(real.hun_l6.sectorTimesMs), refTimes: ref(null) })
    expect(measured.sectorGaps.value).toHaveLength(3)
    expect(Math.abs(measured.sectorGaps.value.reduce((s, g) => s + g.gap!, 0) / 1000 - header)).toBeLessThan(0.05)
  })

  it('a quarter second is the rule, both ways; never stretched', () => {
    expect(traceCoversLap(timed(100, 100 - TRACE_COVERAGE_TOLERANCE_S)).covers).toBe(true)
    expect(traceCoversLap(timed(100, 100 + TRACE_COVERAGE_TOLERANCE_S)).covers).toBe(true)
    expect(traceCoversLap(timed(100, 99.74)).covers).toBe(false)
    expect(traceCoversLap(timed(100, 100.26)).covers).toBe(false)
    const short = timed(100, 98.33)
    traceCoversLap(short)
    expect(short.channels.time_s!.at(-1)).toBeCloseTo(98.33, 6)                       // the trace is never touched
  })

  it('Codex 08/11: two traces each inside the quarter second but in opposite directions are not a pair', () => {
    // Header +0.100, the delta would end at -0.380: the winner reversed.
    const pair = lapPairCheck(timed(100.1, 99.86), timed(100.0, 100.24))
    expect(pair.you.covers && pair.ref.covers).toBe(true)
    expect(pair.mismatchMs).toBe(480)
    expect(pair.comparable).toBe(false)
  })

  it('a clock going back, a missing clock or a missing lap time never covers', () => {
    const back = timed(100, 100); back.channels.time_s![10] = back.channels.time_s![9]! - 1
    expect(traceCoversLap(back)).toEqual({ covers: false, spanGapMs: null })
    expect(traceCoversLap({ lapTimeS: 100, channels: {} }).covers).toBe(false)
    expect(traceCoversLap({ lapTimeS: 0, channels: { time_s: [0, 1] } }).covers).toBe(false)
    expect(lapPairCheck(timed(100, 100), { lapTimeS: 100, channels: {} })).toMatchObject({ comparable: false, spanGapMs: null, mismatchMs: null })
  })

  it('the policy for laps saved short lives in one place: warn keeps them, exclude makes them incomplete', () => {
    expect(SHORT_TRACE_POLICY).toBe('warn')                                           // user decision pending (PIP-751)
    expect(completeUnderPolicy(true, nitrox, 'warn')).toBe(true)
    expect(completeUnderPolicy(true, nitrox, 'exclude')).toBe(false)
    expect(completeUnderPolicy(true, hunFast, 'exclude')).toBe(true)
    expect(completeUnderPolicy(false, hunFast, 'warn')).toBe(false)
    // normalizeLapTrace applies it: under the default the short lap stays readable and complete.
    const raw = { schema: 'acc.laptrace.v1', grid_step_m: 2, meta: { track: 'silverstone', car: 'ferrari_296_gt3', source: 'logger', lap_time_s: 118.887, complete: true, valid: true },
      channels: Object.fromEntries(['time_s', 'speed_kmh', 'brake_pct', 'throttle_pct', 'steer_deg', 'gear'].map(k => [k, k === 'time_s' ? real.nitrox_g2.time_s : real.nitrox_g2.time_s.map(() => 1)])) }
    expect(normalizeLapTrace(raw)?.complete).toBe(true)
  })
})
