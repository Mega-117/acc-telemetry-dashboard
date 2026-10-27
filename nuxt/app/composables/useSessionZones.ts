import { computed, type Ref } from 'vue'
import type { Corner } from '~/services/telemetry/lapAnalysis'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'
import { sessionZones, zoneMapColors } from '~/services/telemetry/sessionZones'

/**
 * PIP-645: Semplice reads every complete lap of the shown session (no reference needed). With fewer
 * than four valid laps there is no typical lap: `active` stays false and the reference comparison stays.
 */
export function useSessionZones(entries: Ref<{ id: string, valid: boolean, complete: boolean }[]>, traces: Ref<Record<string, LapTraceView>>, corners: Ref<Corner[]>) {
  const insight = computed(() => {
    const own = entries.value.filter(e => e.complete && traces.value[e.id])
    const pick = (valid: boolean) => own.filter(e => e.valid === valid).map(e => traces.value[e.id] as LapTraceView)
    return sessionZones(pick(true), corners.value, pick(false))
  })
  const active = computed(() => insight.value.zones.length > 0)
  const colors = computed(() => active.value ? zoneMapColors(insight.value) : null)
  const totalLaps = computed(() => entries.value.filter(e => e.complete).length)
  /** The corner to open first: where laps get spoiled, else the least consistent, else the most potential. */
  const firstCorner = computed(() => (insight.value.mostMistakes ?? insight.value.leastConsistent ?? insight.value.mostPotential)?.corner.number ?? null)
  return { insight, active, colors, totalLaps, firstCorner }
}
