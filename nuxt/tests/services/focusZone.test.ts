// 01/11: which stretch gets the focus band, in each view (whole lap, sector, corner, free zoom).
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useFocusZone } from '~/composables/useFocusZone'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'
import type { CornerComparison } from '~/services/telemetry/lapAnalysis'

// 3000 m at 180 km/h; `slowFrom`..`slowTo` (metres) at 120 km/h (the shape of the lapAnalysis test laps).
function trace(slowFrom = -1, slowTo = -1): LapTraceView {
  const step = 2, length = 3000, n = length / step + 1
  const speed = Array.from({ length: n }, (_, i) => (i * step >= slowFrom && i * step < slowTo ? 120 : 180))
  const time = [0]
  for (let i = 1; i < n; i++) time.push(time[i - 1]! + step / (((speed[i]! + speed[i - 1]!) / 2) / 3.6))
  return { gameId: 'acc', variant: null, sessionId: 's', track: 't', car: 'c', lapTimeS: time.at(-1)!, source: 'logger', complete: true, valid: true, fuelL: null, gridStepM: step, lengthM: length,
    channels: { time_s: time, speed_kmh: speed } } as LapTraceView
}
const corner = (number: number, start: number, apex: number, end: number, timeLostS: number) =>
  ({ corner: { number, start, apex, end, minSpeedKmh: 90 }, timeLostS, lapMinKmh: null, refMinKmh: null, brakeDeltaM: null }) as unknown as CornerComparison

function setup(o: { slow?: [number, number], comparison: CornerComparison[], sector?: number | null, corner?: number | null, zoom?: [number, number] | null, range?: [number, number] }) {
  const comparison = ref(o.comparison)
  const worst = ref([...o.comparison].sort((a, b) => b.timeLostS - a.timeLostS).filter(c => c.timeLostS >= 0.03))
  const selectedSector = ref(o.sector ?? null), selectedCorner = ref(o.corner ?? null), zoomRange = ref(o.zoom ?? null)
  const wholeView = ref(!zoomRange.value && selectedSector.value === null && selectedCorner.value === null)
  return useFocusZone({ lap: ref(trace(...(o.slow ?? [-1, -1]))), reference: ref(trace()), comparison, worst, range: ref(o.range ?? [0, 1]), wholeView, selectedSector, selectedCorner, zoomRange })
}

describe('useFocusZone', () => {
  const corners = [corner(1, 0.1, 0.15, 0.2, 0.05), corner(2, 0.45, 0.5, 0.6, 0.6)]
  it('whole lap: the worst corner is named; the band is the piece inside it where the loss starts', () => {
    const f = setup({ slow: [1500, 1600], comparison: corners })
    expect(f.focusCorner.value?.corner.number).toBe(2)
    const [a, b] = f.focusZone.value!
    expect(a).toBeGreaterThanOrEqual(0.45); expect(b).toBeLessThanOrEqual(0.6)
    expect(b - a).toBeLessThan(0.15 / 2)
  })
  it('sector: the worst corner whose apex is in the sector, even if it starts in the one before', () => {
    const f = setup({ slow: [1500, 1600], comparison: [corner(1, 0.1, 0.15, 0.2, 0.05), corner(2, 0.3, 0.5, 0.6, 0.6)], sector: 1, range: [0.4, 0.8] })
    expect(f.focusCorner.value?.corner.number).toBe(2)
  })
  it('a corner opened: the band inside it, no corner named', () => {
    const f = setup({ slow: [1500, 1600], comparison: corners, corner: 2, range: [0.45, 0.6] })
    expect(f.focusCorner.value).toBeNull()
    expect(f.focusZone.value).not.toBeNull()
  })
  it('the worst corner with no clear piece inside: the whole corner', () => {
    const f = setup({ comparison: corners })
    expect(f.focusZone.value).toEqual([0.45, 0.6])
    expect(f.focusEffect.value).toBeNull()
  })
  it('a free zoom or a level corner: nothing', () => {
    expect(setup({ slow: [1500, 1600], comparison: corners, zoom: [0.4, 0.7], range: [0.4, 0.7] }).focusZone.value).toBeNull()
    expect(setup({ comparison: corners, corner: 1, range: [0.1, 0.2] }).focusZone.value).toBeNull()
  })
})
