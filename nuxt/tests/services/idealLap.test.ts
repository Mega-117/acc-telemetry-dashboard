import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { measureSectorTimes, stitchIdealLap } from '~/services/telemetry/idealLap'
import { useSectorCompare } from '~/composables/useSectorCompare'
import { useReferenceLibrary, CAR_MISMATCH_NOTE, type Entry } from '~/composables/useReferenceLibrary'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

// A lap is the seconds it spends in each third of the track (constant speed inside each third).
function lap([a, b, c]: [number, number, number], car = 'bmw'): LapTraceView {
  const n = 301
  const time = Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1)
    return f <= 1 / 3 ? a * f * 3 : f <= 2 / 3 ? a + b * (f - 1 / 3) * 3 : a + b + c * (f - 2 / 3) * 3
  })
  return { gameId: 'acc', variant: null, sessionId: 's', track: 'spa', car, lapTimeS: a + b + c, source: 'logger', complete: true, valid: true,
    fuelL: null, conditions: null, gridStepM: 2, lengthM: 600, channels: { time_s: time, speed_kmh: time.map(() => 150), brake_pct: time.map(() => 0), throttle_pct: time.map(() => 100) } }
}
const bounds = [0, 1 / 3, 2 / 3, 1]

describe('idealLap (PIP-646)', () => {
  it('times any trace at the sector points', () => {
    const t = measureSectorTimes(lap([30, 20, 25]), bounds)!
    expect(t[0]).toBeCloseTo(30, 6); expect(t[1]).toBeCloseTo(20, 6); expect(t[2]).toBeCloseTo(25, 6)
    expect(measureSectorTimes(lap([30, 20, 25]), [0])).toBeNull()
    const noTime = { ...lap([30, 20, 25]), channels: { speed_kmh: [1, 2] } }
    expect(measureSectorTimes(noTime, bounds)).toBeNull()
  })
  it('stitches the best sector of each lap, with time running on', () => {
    const ideal = stitchIdealLap([lap([30, 20.5, 25]), lap([30.4, 20, 25.3]), lap([30.2, 20.2, 24.8])], bounds)!
    expect(ideal.sources).toEqual([0, 1, 2])
    expect(ideal.trace.lapTimeS).toBeCloseTo(74.8, 6)
    expect(ideal.trace.channels.time_s!.at(-1)).toBeCloseTo(74.8, 3)
    expect(ideal.trace.channels.time_s![100]).toBeCloseTo(30, 3)
    expect(ideal.trace.source).toBe('ideal')
    expect(ideal.trace.channels.speed_kmh).toHaveLength(301)
    expect(stitchIdealLap([], bounds)).toBeNull()
  })
})

describe('useSectorCompare (PIP-646)', () => {
  it('official times for session laps, measured times for any other reference', () => {
    const mine = ref<LapTraceView | null>(lap([30, 20, 25])), reference = ref<LapTraceView | null>(lap([29.5, 20.4, 25]))
    const lapTimes = ref<(number | null)[] | null>([30000, 20000, 25000]), refTimes = ref<(number | null)[] | null>([29400, 20400, 25000])
    const s = useSectorCompare({ lap: mine, reference, lapTimes, refTimes })
    expect(s.sectorGaps.value.map(g => g.gap)).toEqual([600, -400, 0])
    // A pasted link has no official times: measured at the same points of the lap, the column is not empty.
    refTimes.value = null
    const gaps = s.sectorGaps.value
    expect(gaps).toHaveLength(3)
    expect(gaps[0]!.gap).toBeCloseTo(500, 0)
    expect(s.sectorList.value).toHaveLength(3)
    lapTimes.value = null
    expect(s.sectorGaps.value).toEqual([])
    expect(computed(() => s.sectorList.value.length).value).toBe(0)
  })
})

describe('useReferenceLibrary (PIP-646)', () => {
  const files: Record<string, LapTraceView> = {
    'spa__bmw/lap_20261001_200000_L004_75000ms.json.gz': lap([29.8, 20.2, 25], 'bmw'),
    'spa__ferrari/lap_20261002_200000_L002_74000ms.json.gz': lap([29.5, 19.5, 25], 'ferrari'),
  }
  const toRaw = (t: LapTraceView) => ({ schema: 'acc.laptrace.v1', meta: { track: t.track, car: t.car, lap_time_s: t.lapTimeS, complete: true, valid: true, game_id: 'acc' }, grid_step_m: 2, length_m: 600, channels: t.channels })
  const bridge = {
    // As the program: this car's folder, or every other car's (exceptCar).
    listLapTraces: async (f?: { car?: string, exceptCar?: string }) => Object.keys(files)
      .filter(id => f?.car ? id.startsWith(`spa__${f.car}/`) : !f?.exceptCar || !id.startsWith(`spa__${f.exceptCar}/`)).map(id => ({ id })),
    readLapTrace: async (id: string) => toRaw(files[id]!),
  }
  it('adds your best laps from other sessions, another car with a note, and the Giro ideale', async () => {
    const session: Entry[] = [
      { id: 'a', lapNumber: 1, lapTimeMs: 75500, valid: true, complete: true, origin: 'local', sessionToken: '20261027_100000' },
      { id: 'b', lapNumber: 2, lapTimeMs: 75300, valid: true, complete: true, origin: 'local', sessionToken: '20261027_100000' },
    ]
    const entries = ref<Entry[]>(session), traces = ref<Record<string, LapTraceView>>({ a: lap([30, 20.5, 25]), b: lap([30.3, 20, 25]) })
    const sectors: Record<string, number[]> = { a: [30000, 20500, 25000], b: [30300, 20000, 25000] }
    const library = useReferenceLibrary({ entries, traces, sessionToken: () => '20261027_100000', sectorTimesOf: e => sectors[e.id] })
    await library.loadBestLaps(() => true, bridge, 'spa', 'bmw')
    const best = entries.value.filter(e => e.origin === 'best')
    expect(best.map(e => e.label)).toEqual(['Giro 4 del 01/10 · 1:15.000', 'ferrari · 02/10 · 1:14.000'])
    expect(best[1]!.note).toBe(CAR_MISMATCH_NOTE)
    const ideal = entries.value.find(e => e.origin === 'ideal')!
    // 29.8 (other session) + 20.0 (lap b) + 25.0: the other car never feeds the ideal lap.
    expect(ideal.lapTimeMs).toBe(74800)
    expect(ideal.label).toBe('Giro ideale · 1:14.800 · −0,2 s sul tuo migliore')
    expect(traces.value.ideal?.lapTimeS).toBeCloseTo(74.8, 3)
  })
  it('review: a selected ideal lap that no longer beats your best goes away, the reference falls back on the best lap', () => {
    const entries = ref<Entry[]>([
      { id: 'a', lapNumber: 1, lapTimeMs: 75500, valid: true, complete: true, origin: 'local', sessionToken: 't' },
      { id: 'b', lapNumber: 2, lapTimeMs: 75300, valid: true, complete: true, origin: 'local', sessionToken: 't' }])
    const traces = ref<Record<string, LapTraceView>>({ a: lap([30, 20.5, 25]), b: lap([30.3, 20, 25]) })
    const refId = ref('')
    const sectors: Record<string, number[]> = { a: [30000, 20500, 25000], b: [30300, 20000, 25000] }
    const library = useReferenceLibrary({ entries, traces, refId, sessionToken: () => 't', sectorTimesOf: e => sectors[e.id] })
    library.refreshIdeal()
    expect(entries.value.some(e => e.id === 'ideal')).toBe(true)
    refId.value = 'ideal'
    // Lap a becomes as quick as the ideal one in every sector: nothing left to gain.
    traces.value = { ...traces.value, a: lap([30, 20, 25]) }
    library.refreshIdeal()
    expect(entries.value.some(e => e.id === 'ideal')).toBe(false)
    expect(traces.value.ideal).toBeUndefined()
    expect(refId.value).toBe('b')
  })
  it('a trace ending before the line never invents potential', () => {
    const entries = ref<Entry[]>([{ id: 'a', lapNumber: 1, lapTimeMs: 75100, valid: true, complete: true, origin: 'local', sessionToken: 't' }])
    const library = useReferenceLibrary({ entries, traces: ref({ a: lap([30, 20, 25]) }), sessionToken: () => 't', sectorTimesOf: () => [30000, 20000, 25100] })
    library.refreshIdeal()
    expect(entries.value.some(e => e.id === 'ideal')).toBe(false)
  })
  it('no ideal lap without sector times, and a stale load adds nothing', async () => {
    const entries = ref<Entry[]>([{ id: 'a', lapNumber: 1, lapTimeMs: 75500, valid: true, complete: true, origin: 'local', sessionToken: 't' }])
    const library = useReferenceLibrary({ entries, traces: ref({ a: lap([30, 20.5, 25]) }), sessionToken: () => 't', sectorTimesOf: () => null })
    library.refreshIdeal()
    expect(entries.value.some(e => e.origin === 'ideal')).toBe(false)
    await library.loadBestLaps(() => false, bridge, 'spa', 'bmw')
    expect(entries.value).toHaveLength(1)
  })
})
