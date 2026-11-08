import { computed, type Ref } from 'vue'
import { sectorBounds } from '~/services/telemetry/lapAnalysis'
import { measureSectorTimes } from '~/services/telemetry/idealLap'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

type SectorTimes = (number | null)[] | null

/** One sector box: your time, the reference's and the gap (ms). PIP-751: the box says whose time it shows. */
export interface SectorGap {
  /** Your sector time (official when the lap is of this session, else measured on your trace). */
  mine: number | null
  /** The reference's sector time (official or measured on its trace), null when it cannot be compared. */
  ref: number | null
  /** mine - ref; null when there is nothing like for like to compare. */
  gap: number | null
}

/**
 * Garage 61 sectors in the Telemetria. Official sector times exist only for laps of the shown
 * session; PIP-646: any other reference (a lap by link, another session, the ideal lap) is timed
 * at the same points of the lap on its own trace, so the Settori column is never empty for it.
 * PIP-751: `reference` is the reference only when both traces cover their laps (the page passes null
 * otherwise): times measured on a short trace are never shown; official times always are.
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
  const sectorGaps = computed<SectorGap[]>(() => {
    const ref = official(o.refTimes.value), mine = official(o.lapTimes.value)
    // ACC's own numbers on both sides: the gap holds whatever the traces are.
    if (ref && mine && ref.length === mine.length) return ref.map((t, i) => ({ mine: mine[i]!, ref: t, gap: mine[i]! - t }))
    // Measured on both traces at the same points: the gap stays like for like.
    const a = bounds.value && o.lap.value && o.reference.value ? measureSectorTimes(o.lap.value, bounds.value) : null
    const b = a && o.reference.value ? measureSectorTimes(o.reference.value, bounds.value!) : null
    // Your time stays ACC's when it exists (Codex 08/11): only the reference's and the like-for-like gap are measured.
    if (a && b) return b.map((t, i) => ({ mine: mine?.[i] ?? a[i]! * 1000, ref: t * 1000, gap: (a[i]! - t) * 1000 }))
    // PIP-751: no comparable reference, your official times still say where your lap went.
    return mine ? mine.map(t => ({ mine: t, ref: null, gap: null })) : []
  })
  return { sectorList, sectorGaps }
}
