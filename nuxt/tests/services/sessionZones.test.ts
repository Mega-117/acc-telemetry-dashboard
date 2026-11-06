import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useSessionZones } from '~/composables/useSessionZones'
import { ADVICE_MIN_S, MIN_ZONE_LAPS, sessionZones, zoneMapColors, zoneSeconds, ZONE_COLORS } from '~/services/telemetry/sessionZones'
import type { Corner } from '~/services/telemetry/lapAnalysis'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

// Three stretches of a third of the lap each; a lap is the seconds it spends in each of them.
const corners: Corner[] = [0, 1, 2].map(i => ({ number: i + 1, start: i / 3, apex: (i + 0.5) / 3, end: (i + 1) / 3, minSpeedKmh: 80 }))
function lap([a, b, c]: [number, number, number], valid = true): LapTraceView {
  const n = 301
  const time = Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1)
    return f <= 1 / 3 ? a * f * 3 : f <= 2 / 3 ? a + b * (f - 1 / 3) * 3 : a + b + c * (f - 2 / 3) * 3
  })
  return { gameId: 'acc', variant: null, sessionId: 's', track: 't', car: 'c', lapTimeS: a + b + c, source: 'logger', complete: true, valid,
    fuelL: null, conditions: null, gridStepM: 2, lengthM: 600, channels: { time_s: time } }
}

describe('sessionZones (PIP-645, Semplice on the whole session)', () => {
  // Corner 1 steady; corner 2 swings ±0.3 s; corner 3 steady but one valid lap spoiled (+1.5 s) and one invalid lap off (+2 s).
  const laps = [
    lap([30, 20.0, 25]), lap([30, 20.6, 25]), lap([30.02, 20.1, 25]), lap([30, 20.5, 25]), lap([30, 20.3, 26.5]), lap([30.01, 20.0, 25.02]),
  ]
  const invalid = [lap([30, 20.2, 27], false)]
  const insight = sessionZones(laps, corners, invalid)

  it('times every corner: best, typical (median), swing and potential', () => {
    const c2 = insight.zones[1]!
    expect(c2.bestS).toBeCloseTo(20, 3)
    expect(c2.typicalS).toBeCloseTo(20.2, 3)
    expect(c2.potentialS).toBeCloseTo(0.2, 3)
    expect(c2.spreadS).toBeCloseTo(0.4, 3)
  })
  it('05/11 (user): one stretch per card - mistakes first, then potential, then swing; never the same stretch twice', () => {
    expect(insight.mostMistakes?.corner.number).toBe(3)
    expect(insight.mostMistakes?.mistakes).toBe(2)
    expect(insight.mostMistakes?.mistakeLossS).toBeCloseTo(3.5, 2)
    // Corner 2 is both the most potential and the least consistent: potential takes it, swing has nothing else worth it.
    expect(insight.mostPotential?.corner.number).toBe(2)
    expect(insight.leastConsistent).toBeNull()
  })
  it('the next card takes the worst stretch left, when it is worth at least ADVICE_MIN_S', () => {
    // Corner 1 now swings by 0.2 s: the swing card goes there instead of repeating corner 2.
    const withCorner1 = (a: number) => [20.0, 20.6, 20.1, 20.5, 20.3, 20.0].map((b, i) => lap([i % 2 ? 30 + a : 30, b, i === 4 ? 26.5 : 25]))
    const swing = sessionZones(withCorner1(0.2), corners, invalid)
    expect(swing.mostPotential?.corner.number).toBe(2)
    expect(swing.leastConsistent?.corner.number).toBe(1)
    expect(ADVICE_MIN_S).toBe(0.05)
    // Under ADVICE_MIN_S it is not worth a card.
    const tiny = sessionZones(withCorner1(0.04), corners, invalid)
    expect(tiny.leastConsistent).toBeNull()
  })
  it('does not count a usual swing as a mistake', () => {
    expect(insight.zones[1]!.mistakes).toBe(0)
  })
  it('needs four valid laps: with fewer the view keeps the reference comparison', () => {
    expect(MIN_ZONE_LAPS).toBe(4)
    expect(sessionZones(laps.slice(0, 3), corners).zones).toEqual([])
    expect(sessionZones(laps, []).zones).toEqual([])
  })
  it('a steady session has no mistakes card and no swing card', () => {
    const steady = sessionZones([1, 2, 3, 4].map(() => lap([30, 20, 25])), corners)
    expect(steady.mostMistakes).toBeNull()
    expect(steady.leastConsistent).toBeNull()
    expect(steady.mostPotential).toBeNull()
  })
  it('the composable reads complete laps of the session, valid and invalid apart, the mistakes corner is found', () => {
    const all = [...laps, ...invalid]
    const entries = ref(all.map((t, i) => ({ id: `l${i}`, valid: t.valid === true, complete: true })).concat({ id: 'partial', valid: true, complete: false }))
    const zones = useSessionZones(entries, ref(Object.fromEntries(all.map((t, i) => [`l${i}`, t]))), ref(corners))
    expect(zones.active.value).toBe(true)
    expect(zones.totalLaps.value).toBe(7)
    expect(zones.insight.value.mostMistakes?.corner.number).toBe(3)
    expect(zones.colors.value).toHaveLength(2)
    entries.value = entries.value.slice(0, 3)
    expect(zones.active.value).toBe(false)
    expect(zones.colors.value).toBeNull()
  })
  it('colours the chosen stretches on the map and writes seconds with a dot', () => {
    expect(zoneMapColors(insight)).toEqual(expect.arrayContaining([{ start: 2 / 3, end: 1, color: ZONE_COLORS.mistakes }, { start: 1 / 3, end: 2 / 3, color: ZONE_COLORS.potential }]))
    expect(zoneSeconds(0.4)).toBe('0.4')
    expect(zoneSeconds(0.06)).toBe('0.06')
  })
})
