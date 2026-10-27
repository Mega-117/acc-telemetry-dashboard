import { computed, type Ref } from 'vue'
import { sectorBounds } from '~/services/telemetry/lapAnalysis'
import { measureSectorTimes } from '~/services/telemetry/idealLap'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

type SectorTimes = (number | null)[] | null

/**
 * Garage 61 sectors in the Telemetria. Official sector times exist only for laps of the shown
 * session; PIP-646: any other reference (a lap by link, another session, the ideal lap) is timed
 * at the same points of the lap on its own trace, so the Settori column is never empty for it.
 */
export function useSectorCompare(o: {
  lap: Ref<LapTraceView | null>
  reference: Ref<LapTraceView | null>
  /** Official sector times (ms) of "Tu" and of the reference, when they are laps of this session. */
  lapTimes: Ref<SectorTimes>
  refTimes: Ref<SectorTimes>
}) {
  const official = (times: SectorTimes) => times?.length && times.every(t => typeof t === 'number' && t > 0) ? times as number[] : null
  const bounds = computed(() => {
    const ref = official(o.refTimes.value), mine = official(o.lapTimes.value)
    if (ref && (o.reference.value ?? o.lap.value)) return sectorBounds((o.reference.value ?? o.lap.value)!, ref)
    return mine && o.lap.value ? sectorBounds(o.lap.value, mine) : null
  })
  const sectorList = computed(() => bounds.value
    ? bounds.value.slice(0, -1).map((start, index) => ({ index, start, end: bounds.value![index + 1]! })) : [])
  const sectorGaps = computed(() => {
    const ref = official(o.refTimes.value), mine = official(o.lapTimes.value)
    if (ref && mine && ref.length === mine.length) return ref.map((t, i) => ({ ref: t, gap: mine[i]! - t }))
    // Measured on both traces at the same points: the gap stays like for like.
    if (!bounds.value || !o.lap.value || !o.reference.value) return []
    const a = measureSectorTimes(o.lap.value, bounds.value), b = measureSectorTimes(o.reference.value, bounds.value)
    return a && b ? b.map((t, i) => ({ ref: t * 1000, gap: (a[i]! - t) * 1000 })) : []
  })
  return { sectorList, sectorGaps }
}
