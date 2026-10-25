<script setup lang="ts">
// PIP-618: track map of the analysis. The lap line coloured by gain (green) or loss
// (red) against the reference, the cursor shared with the charts, corners numbered.
import { computed } from 'vue'
import { deltaTrend, fractions, lapDelta, mapPoints, type Corner } from '~/services/telemetry/lapAnalysis'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

const props = withDefaults(defineProps<{
  lap: LapTraceView
  reference: LapTraceView | null
  corners: Corner[]
  cursor: number | null
  selected?: number | null
  size?: number
  showReference?: boolean
  /** Zoom on the selected corner: the racing lines become readable. */
  zoom?: boolean
}>(), { selected: null, size: 320, showReference: false, zoom: false })
const emit = defineEmits<{ hover: [fraction: number | null], select: [corner: number] }>()

const POINTS = 400
const at = fractions(POINTS)
const W = computed(() => props.size)
const H = computed(() => Math.round(props.size * 0.8))
// The reference draws the map when present: both lines share its frame.
const frame = computed(() => props.reference ?? props.lap)
const base = computed(() => mapPoints(frame.value, at, W.value, H.value, 18))
const lapPoints = computed(() => props.reference ? mapPoints(props.lap, at, W.value, H.value, 18, props.reference) : base.value)
const trend = computed(() => props.reference ? deltaTrend(lapDelta(props.lap, props.reference, at)) : null)
const segments = computed(() => {
  const points = lapPoints.value
  if (!points) return []
  return points.slice(1).map((p, i) => {
    const change = trend.value?.[i] ?? 0
    // Gaining (delta falling) green, losing red, even grey.
    const color = !trend.value ? '#ff3b4f' : change < -0.002 ? '#3ddc5a' : change > 0.002 ? '#ff5a6e' : '#8a8a90'
    const inside = props.selected === null || at[i]! >= (props.corners[props.selected - 1]?.start ?? 0) && at[i]! <= (props.corners[props.selected - 1]?.end ?? 1)
    return { x1: points[i]!.x, y1: points[i]!.y, x2: p.x, y2: p.y, color, opacity: inside ? 1 : 0.25 }
  })
})
const referencePath = computed(() => base.value?.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') ?? '')
const cursorPoint = computed(() => {
  if (props.cursor === null || !base.value) return null
  return base.value[Math.round(props.cursor * (POINTS - 1))] ?? null
})
const labels = computed(() => base.value ? props.corners.map(c => ({ number: c.number, point: base.value![Math.round(c.apex * (POINTS - 1))]! })) : [])
const startPoint = computed(() => base.value?.[0] ?? null)
const viewBox = computed(() => {
  const corner = props.selected !== null ? props.corners[props.selected - 1] : null
  if (!props.zoom || !corner || !base.value) return `0 0 ${W.value} ${H.value}`
  const inside = base.value.filter((_, i) => at[i]! >= corner.start && at[i]! <= corner.end)
  if (inside.length < 2) return `0 0 ${W.value} ${H.value}`
  const xs = inside.map(p => p.x), ys = inside.map(p => p.y)
  const span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) / 0.8, 24) + 24
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2
  return `${cx - span / 2} ${cy - span * 0.4} ${span} ${span * 0.8}`
})
const zoomScale = computed(() => Number(viewBox.value.split(' ')[2]) / W.value)

function onMove(event: PointerEvent) {
  const points = base.value
  if (!points) return
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const [vx, vy, vw, vh] = viewBox.value.split(' ').map(Number) as [number, number, number, number]
  const x = vx + (event.clientX - rect.left) * (vw / rect.width)
  const y = vy + (event.clientY - rect.top) * (vh / rect.height)
  let best = 0, bestDistance = Infinity
  points.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bestDistance) { bestDistance = d; best = i } })
  emit('hover', bestDistance < (30 * zoomScale.value) ** 2 ? at[best]! : null)
}
</script>

<template>
  <svg v-if="base" class="map" :viewBox="viewBox" :style="{ '--z': zoomScale }" role="img" aria-label="Mappa della pista con il giro colorato" @pointermove="onMove" @pointerleave="emit('hover', null)">
    <polyline :points="referencePath" class="map-track" />
    <polyline v-if="showReference && reference" :points="referencePath" class="map-ref" />
    <line v-for="(s, i) in segments" :key="i" :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2" :stroke="s.color" :stroke-opacity="s.opacity" class="map-lap" />
    <circle v-if="startPoint" :cx="startPoint.x" :cy="startPoint.y" :r="4 * zoomScale" class="map-start" />
    <g v-for="l in labels" :key="l.number" class="map-corner" :class="{ active: selected === l.number }" @click="emit('select', l.number)">
      <circle :cx="l.point.x" :cy="l.point.y" :r="8 * zoomScale" />
      <text :x="l.point.x" :y="l.point.y + 3.5 * zoomScale" :font-size="9 * zoomScale">{{ l.number }}</text>
    </g>
    <circle v-if="cursorPoint" :cx="cursorPoint.x" :cy="cursorPoint.y" :r="5 * zoomScale" class="map-cursor" />
  </svg>
  <p v-else class="map-none">Mappa non disponibile: questo giro non ha le coordinate.</p>
</template>

<style scoped lang="scss">
.map { display: block; width: 100%; height: auto; touch-action: none; }
// Strokes scale with the zoom (--z), so a zoomed corner keeps thin lines.
.map-track { fill: none; stroke: #ffffff14; stroke-width: calc(9px * var(--z, 1)); stroke-linejoin: round; stroke-linecap: round; }
.map-ref { fill: none; stroke: #ffffffa6; stroke-width: calc(1.2px * var(--z, 1)); stroke-dasharray: 3 3; }
.map-lap { stroke-width: calc(3px * var(--z, 1)); stroke-linecap: round; }
.map-start { fill: #fff; }
.map-corner { cursor: pointer;
  circle { fill: #0a0a0f; stroke: #ffffff59; stroke-width: 1; }
  text { fill: #e6e6ea; font-family: 'Inter', sans-serif; font-weight: 700; text-anchor: middle; }
  &.active circle { stroke: #ff0024; stroke-width: 2; } }
.map-cursor { fill: #fff; stroke: #ff0024; stroke-width: 2; }
.map-none { color: #8a8a90; font-size: 12px; }
</style>
