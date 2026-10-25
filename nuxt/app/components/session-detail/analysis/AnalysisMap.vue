<script setup lang="ts">
// PIP-618: track map of the analysis, oriented as ACC and the minimap HUD.
// Whole track: your lap coloured by gain (green) or loss (red) against the reference.
// Corner zoom: the two racing lines, yours blue and the reference amber.
// Two dots follow the cursor: you (blue, filled) and the reference (amber, hollow).
import { computed, ref, watch } from 'vue'
import { deltaTrend, finishLine, fractions, lapDelta, mapPoints, worldToMap, type Corner, type MapPoint } from '~/services/telemetry/lapAnalysis'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

const props = withDefaults(defineProps<{
  lap: LapTraceView
  reference: LapTraceView | null
  corners: Corner[]
  cursor: number | null
  /** Where the reference dot goes: same point, or where it was at the same time. */
  refCursor?: number | null
  selected?: number | null
  size?: number
  /** Zoom on the selected corner: the racing lines become readable. */
  zoom?: boolean
  /** 'delta': your line green/red by gain and loss. 'laps' (Garage 61): each lap in its own colour. */
  colorMode?: 'delta' | 'laps'
  /** Stretch to frame (a sector), when no corner is zoomed. */
  focus?: [number, number] | null
  /** Garage 61's + / − buttons. */
  zoomControls?: boolean
  /** Track edges in world coordinates (ACC Drive _L/_R): drawn as the track surface when present. */
  edges?: { left: [number, number][], right: [number, number][] } | null
}>(), { refCursor: null, selected: null, size: 320, zoom: false, colorMode: 'delta', focus: null, zoomControls: false, edges: null })
const emit = defineEmits<{ hover: [fraction: number | null], select: [corner: number] }>()

const POINTS = 600
const at = fractions(POINTS)
const W = computed(() => props.size)
const H = computed(() => Math.round(props.size * 0.8))
// The reference draws the frame when present: both lines share scale and offset.
const frame = computed(() => props.reference ?? props.lap)
const base = computed(() => mapPoints(frame.value, at, W.value, H.value, 18))
// Edges through the same transform as the laps: they line up with no adjustment of their own.
const edgePaths = computed(() => {
  if (!props.edges) return null
  const project = worldToMap(frame.value, at, W.value, H.value, 18)
  if (!project) return null
  const left = props.edges.left.map(([x, z]) => project(x, z))
  const right = props.edges.right.map(([x, z]) => project(x, z))
  return { left: path(left), right: path(right), surface: path([...left, ...[...right].reverse()]) }
})
const lapPoints = computed(() => props.reference ? mapPoints(props.lap, at, W.value, H.value, 18, props.reference) : base.value)
const zoomed = computed(() => props.zoom && props.selected !== null && !!props.corners[props.selected - 1])
const lapsMode = computed(() => props.colorMode === 'laps')
const focusRange = computed<[number, number] | null>(() => {
  const corner = props.selected !== null ? props.corners[props.selected - 1] : null
  // Corner zoom on the apex area, about 2.5x closer than the whole peak-to-peak stretch.
  if (zoomed.value && corner) return [corner.apex - (corner.apex - corner.start) * 0.4, corner.apex + (corner.end - corner.apex) * 0.4]
  return props.focus && (props.focus[0] > 0 || props.focus[1] < 1) ? props.focus : null
})
// Your own framing (wheel, drag, + / −), as Track Titan and Garage 61: it stays put while
// the cursor moves on the charts. Null follows the corner, the sector or the whole track.
const view = ref<{ cx: number, cy: number, span: number } | null>(null)
watch(focusRange, () => { view.value = null })
const trend = computed(() => props.reference ? deltaTrend(lapDelta(props.lap, props.reference, at)) : null)
const path = (points: MapPoint[] | null) => points?.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') ?? ''
const segments = computed(() => {
  const points = lapPoints.value
  if (!points || zoomed.value || lapsMode.value) return []
  const corner = props.selected !== null ? props.corners[props.selected - 1] : null
  return points.slice(1).map((p, i) => {
    const change = trend.value?.[i] ?? 0
    // Your lap against the reference: gaining green, losing red, even grey.
    const color = !trend.value ? '#38bdf8' : change < -0.002 ? '#3ddc5a' : change > 0.002 ? '#ff5a6e' : '#8a8a90'
    const inside = !corner || (at[i]! >= corner.start && at[i]! <= corner.end)
    return { x1: points[i]!.x, y1: points[i]!.y, x2: p.x, y2: p.y, color, opacity: inside ? 1 : 0.3 }
  })
})
const dot = (points: MapPoint[] | null, fraction: number | null) => fraction === null || !points ? null : points[Math.round(fraction * (POINTS - 1))] ?? null
const lapDot = computed(() => dot(lapPoints.value, props.cursor))
// Garage 61: an arrow shows which way the car goes at the cursor.
const lapArrow = computed(() => {
  const points = lapPoints.value
  if (!points || props.cursor === null) return null
  const i = Math.min(Math.round(props.cursor * (POINTS - 1)), POINTS - 2)
  const a = points[i]!, b = points[i + 1]!
  return { x: a.x, y: a.y, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
})
const refDot = computed(() => props.reference ? dot(base.value, props.refCursor ?? props.cursor) : null)
// Corner numbers beside the track on the outside of the bend, not on the apex: zoomed in,
// they no longer cover the two lines exactly where you look at them.
const labels = computed(() => {
  const points = base.value
  if (!points) return []
  const n = points.length
  return props.corners.map(c => {
    const i = Math.round(c.apex * (POINTS - 1))
    const a = points[(i - 6 + n) % n]!, p = points[i]!, b = points[(i + 6) % n]!
    const tx = b.x - a.x, ty = b.y - a.y
    const length = Math.hypot(tx, ty) || 1
    // Turn direction from the cross product; the outside is the other side.
    const turn = Math.sign(tx * (p.y - a.y) - ty * (p.x - a.x)) || 1
    const nx = (ty / length) * turn, ny = (-tx / length) * turn
    const offset = 16 * zoomScale.value
    return { number: c.number, point: { x: p.x + nx * offset, y: p.y + ny * offset } }
  })
})
const finish = computed(() => base.value ? finishLine(base.value, 10) : null)
// Selected sector on the track: a coloured band under the lines, a mark where it starts and ends.
const sector = computed(() => {
  const points = base.value, range = props.focus
  if (!points || !range || (range[0] <= 0 && range[1] >= 1)) return null
  const inside = points.filter((_, i) => at[i]! >= range[0] && at[i]! <= range[1])
  if (inside.length < 2) return null
  const mark = (fraction: number) => {
    const i = Math.min(Math.max(Math.round(fraction * (POINTS - 1)), 1), POINTS - 2)
    const a = points[i - 1]!, p = points[i]!, b = points[i + 1]!
    const tx = b.x - a.x, ty = b.y - a.y, length = Math.hypot(tx, ty) || 1
    const half = 9 * zoomScale.value
    return { x1: p.x - (ty / length) * half, y1: p.y + (tx / length) * half, x2: p.x + (ty / length) * half, y2: p.y - (tx / length) * half }
  }
  return { path: path(inside), start: mark(range[0]), end: mark(range[1]) }
})
const autoFrame = computed(() => {
  // Frame: the focused stretch (corner or sector) or the whole track.
  let cx = W.value / 2, cy = H.value / 2, span = W.value
  const range = focusRange.value
  const inside = range && base.value ? base.value.filter((_, i) => at[i]! >= range[0] && at[i]! <= range[1]) : []
  if (inside.length >= 2) {
    const xs = inside.map(p => p.x), ys = inside.map(p => p.y)
    // Generous margin: corner numbers near the edge stay inside the frame.
    span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) / 0.8, 16) * 1.6
    cx = (Math.max(...xs) + Math.min(...xs)) / 2; cy = (Math.max(...ys) + Math.min(...ys)) / 2
  }
  return { cx, cy, span }
})
const frameNow = computed(() => view.value ?? autoFrame.value)
const viewBox = computed(() => {
  const { cx, cy, span } = frameNow.value
  return `${cx - span / 2} ${cy - span * 0.4} ${span} ${span * 0.8}`
})
const zoomScale = computed(() => frameNow.value.span / W.value)
// Closest: about 20 m of track across the map; farthest: a little more than the whole track.
const minSpan = computed(() => W.value / 40)
const maxSpan = computed(() => W.value * 1.2)

/** Map coordinates under the pointer. */
function mapPoint(event: PointerEvent | WheelEvent | MouseEvent, svg: SVGSVGElement) {
  const rect = svg.getBoundingClientRect()
  const [vx, vy, vw, vh] = viewBox.value.split(' ').map(Number) as [number, number, number, number]
  return { x: vx + (event.clientX - rect.left) * (vw / rect.width), y: vy + (event.clientY - rect.top) * (vh / rect.height), perPixel: vw / rect.width }
}
/** Zoom by `factor` keeping the point (x, y) where it is on screen. */
function zoomAround(factor: number, x: number, y: number) {
  const { cx, cy, span } = frameNow.value
  const next = Math.min(Math.max(span * factor, minSpan.value), maxSpan.value)
  const k = next / span
  view.value = { cx: x + (cx - x) * k, cy: y + (cy - y) * k, span: next }
}
function zoomStep(factor: number) {
  const { cx, cy } = frameNow.value
  zoomAround(factor, cx, cy)
}
function onWheel(event: WheelEvent) {
  if (!props.zoomControls) return
  event.preventDefault()
  const p = mapPoint(event, event.currentTarget as SVGSVGElement)
  zoomAround(event.deltaY > 0 ? 1.25 : 0.8, p.x, p.y)
}
// Drag to move the map; a short press stays a click (corner numbers).
let drag: { x: number, y: number, cx: number, cy: number, moved: boolean } | null = null
const dragging = ref(false)
// Set while a drag ends, so the click that follows it does not pick a corner.
const dragged = ref(false)
function onDown(event: PointerEvent) {
  if (!props.zoomControls || event.button !== 0) return
  const { cx, cy } = frameNow.value
  drag = { x: event.clientX, y: event.clientY, cx, cy, moved: false }
  // Closed hand from the press, as in any map; no native image drag or text selection.
  dragging.value = true
  event.preventDefault()
}
function onUp(event: PointerEvent) {
  if (drag?.moved) {
    (event.currentTarget as SVGSVGElement).releasePointerCapture?.(event.pointerId)
    dragged.value = true
    setTimeout(() => { dragged.value = false }, 0)
  }
  drag = null
  dragging.value = false
}

// Leaving the map before a drag starts drops the press, so the hand does not stay closed.
function onLeave() {
  if (drag && !drag.moved) { drag = null; dragging.value = false }
  emit("hover", null)
}
function onMove(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  if (drag) {
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y
    if (!drag.moved && dx * dx + dy * dy > 16) { drag.moved = true; svg.setPointerCapture?.(event.pointerId) }
    if (drag.moved) {
      const perPixel = frameNow.value.span / svg.getBoundingClientRect().width
      view.value = { cx: drag.cx - dx * perPixel, cy: drag.cy - dy * perPixel, span: frameNow.value.span }
      return
    }
  }
  const points = base.value
  if (!points) return
  const { x, y } = mapPoint(event, svg)
  let best = 0, bestDistance = Infinity
  points.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bestDistance) { bestDistance = d; best = i } })
  emit('hover', bestDistance < (30 * zoomScale.value) ** 2 ? at[best]! : null)
}
</script>

<template>
  <div v-if="base" class="map-wrap">
  <div v-if="zoomControls" class="map-zoom">
    <button type="button" aria-label="Avvicina la mappa" title="Avvicina (anche con la rotella)" :disabled="frameNow.span <= minSpan" @click="zoomStep(1 / 1.6)">+</button>
    <button type="button" aria-label="Allontana la mappa" title="Allontana (anche con la rotella)" :disabled="frameNow.span >= maxSpan" @click="zoomStep(1.6)">−</button>
    <button v-if="view" type="button" aria-label="Rimetti la mappa com'era" title="Inquadratura iniziale (anche doppio clic)" @click="view = null">⟲</button>
  </div>
  <svg class="map" :class="{ 'map--pan': zoomControls, 'map--dragging': dragging }" :viewBox="viewBox" :style="{ '--z': zoomScale }" role="img" aria-label="Mappa della pista" @pointermove="onMove" @pointerleave="onLeave" @pointerdown="onDown" @pointerup="onUp" @pointercancel="onUp" @wheel="onWheel" @dblclick="zoomControls && (view = null)">
    <template v-if="edgePaths">
      <polygon :points="edgePaths.surface" class="map-surface" fill-rule="evenodd" />
      <polyline :points="edgePaths.left" class="map-edge" />
      <polyline :points="edgePaths.right" class="map-edge" />
    </template>
    <polyline v-else :points="path(base)" class="map-track" />
    <polyline v-if="sector" :points="sector.path" class="map-sector" />
    <template v-if="zoomed || lapsMode">
      <polyline v-if="reference" :points="path(base)" class="map-ref" />
      <polyline :points="path(lapPoints)" class="map-lap-line" />
    </template>
    <line v-for="(s, i) in segments" :key="i" :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2" :stroke="s.color" :stroke-opacity="s.opacity" class="map-lap" />
    <!-- Finish line: white and black, across the track -->
    <g v-if="finish" class="map-finish">
      <line :x1="finish.x1" :y1="finish.y1" :x2="finish.x2" :y2="finish.y2" class="map-finish-white" />
      <line :x1="finish.x1" :y1="finish.y1" :x2="finish.x2" :y2="finish.y2" class="map-finish-black" />
    </g>
    <template v-if="sector">
      <line v-bind="sector.start" class="map-sector-mark" />
      <line v-bind="sector.end" class="map-sector-mark" />
    </template>
    <g v-for="l in labels" :key="l.number" class="map-corner" :class="{ active: selected === l.number }" @click="!dragged && emit('select', l.number)">
      <circle :cx="l.point.x" :cy="l.point.y" :r="8 * zoomScale" />
      <text :x="l.point.x" :y="l.point.y + 3.5 * zoomScale" :font-size="9 * zoomScale">{{ l.number }}</text>
    </g>
    <circle v-if="refDot" :cx="refDot.x" :cy="refDot.y" :r="5 * zoomScale" class="map-dot-ref" />
    <path v-if="lapArrow" :transform="`translate(${lapArrow.x} ${lapArrow.y}) rotate(${lapArrow.angle}) scale(${zoomScale})`" d="M8 0 L-6 -6 L-3 0 L-6 6 Z" class="map-arrow" />
  </svg>
  </div>
  <p v-else class="map-none">Mappa non disponibile: questo giro non ha le coordinate.</p>
</template>

<style scoped lang="scss">
.map-wrap { position: relative; }
.map-zoom { position: absolute; top: 4px; left: 4px; display: grid; gap: 3px; z-index: 1;
  button { width: 24px; height: 24px; border: 1px solid #ffffff2e; background: #0d0d12e6; color: #e6e6ea; font: 700 14px/1 "Inter", sans-serif; cursor: pointer; &:disabled { opacity: .35; cursor: default; } } }
.map { display: block; width: 100%; height: auto; touch-action: none; user-select: none;
  &--pan { cursor: grab; } &--dragging { cursor: grabbing; } }
// Strokes scale with the zoom (--z), so a zoomed corner keeps thin lines.
.map-surface { fill: #ffffff0d; stroke: none; }
.map-edge { fill: none; stroke: #ffffff59; stroke-width: calc(1px * var(--z, 1)); stroke-linejoin: round; }
.map-track { fill: none; stroke: #ffffff14; stroke-width: calc(9px * var(--z, 1)); stroke-linejoin: round; stroke-linecap: round; }
.map-sector { fill: none; stroke: #ff002459; stroke-width: calc(10px * var(--z, 1)); stroke-linejoin: round; stroke-linecap: butt; }
.map-sector-mark { stroke: #ff0024; stroke-width: calc(2.5px * var(--z, 1)); stroke-linecap: round; }
.map-ref { fill: none; stroke: #fbbf24; stroke-width: calc(1.8px * var(--z, 1)); }
.map-lap-line { fill: none; stroke: #38bdf8; stroke-width: calc(2px * var(--z, 1)); stroke-linejoin: round; }
.map-lap { stroke-width: calc(3px * var(--z, 1)); stroke-linecap: round; }
.map-finish-white { stroke: #fff; stroke-width: calc(4px * var(--z, 1)); }
.map-finish-black { stroke: #000; stroke-width: calc(4px * var(--z, 1)); stroke-dasharray: calc(2px * var(--z, 1)) calc(2px * var(--z, 1)); }
.map-corner { cursor: pointer;
  circle { fill: #0a0a0f; stroke: #ffffff59; stroke-width: calc(1px * var(--z, 1)); }
  text { fill: #e6e6ea; font-family: 'Inter', sans-serif; font-weight: 700; text-anchor: middle; }
  &.active circle { stroke: #ff0024; stroke-width: calc(2px * var(--z, 1)); } }
.map-arrow { fill: #38bdf8; stroke: #fff; stroke-width: 1.2px; vector-effect: non-scaling-stroke; }
.map-dot-lap { fill: #38bdf8; stroke: #fff; stroke-width: calc(1.5px * var(--z, 1)); }
.map-dot-ref { fill: #0a0a0f; stroke: #fbbf24; stroke-width: calc(2px * var(--z, 1)); }
.map-none { color: #8a8a90; font-size: 12px; }
</style>
