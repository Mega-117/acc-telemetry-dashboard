// 01/11 (the focus zone of Track Titan; research docs/wiki/research/2026-11-01-telemetria-focus-zone-metodo-fonti.md).
// On the whole lap the corner where you lose most, in a sector the worst corner of that sector: named in the bar
// (a click opens it). Inside that corner, or the one opened, the band marks where the loss you keep starts
// (focusInStretch). No clear piece: no band.
// Nothing when you gain or are level, or on a free zoom.
import { computed, type Ref } from 'vue'
import { focusInStretch, type CornerComparison } from '~/services/telemetry/lapAnalysis'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

export function useFocusZone(o: {
  lap: Ref<LapTraceView | null>
  reference: Ref<LapTraceView | null>
  comparison: Ref<CornerComparison[]>
  worst: Ref<CornerComparison[]>
  range: Ref<[number, number]>
  wholeView: Ref<boolean>
  selectedSector: Ref<number | null>
  selectedCorner: Ref<number | null>
  zoomRange: Ref<[number, number] | null>
}) {
  const focusCorner = computed(() => {
    if (o.wholeView.value) return o.worst.value[0] ?? null
    if (o.selectedSector.value === null || o.zoomRange.value) return null
    const [from, to] = o.range.value
    // A corner belongs to the sector its apex is in: corners run peak to peak and can cross a sector line.
    return [...o.comparison.value].filter(c => c.corner.apex >= from && c.corner.apex < to && c.timeLostS >= 0.03).sort((a, b) => b.timeLostS - a.timeLostS)[0] ?? null
  })
  const stretch = computed<[number, number] | null>(() => focusCorner.value ? [focusCorner.value.corner.start, focusCorner.value.corner.end]
    : o.selectedCorner.value !== null && !o.zoomRange.value ? o.range.value : null)
  const focus = computed(() => {
    const s = stretch.value
    if (!s || !o.lap.value || !o.reference.value) return null
    // No clear piece (or a time reset): no band. The worst corner is still named in the bar (Codex 01/11: a
    // whole-corner band of 600 m pointed at nothing).
    return focusInStretch(o.lap.value, o.reference.value, s)
  })
  return { focusCorner, focus, focusZone: computed(() => focus.value?.zone ?? null) }
}
