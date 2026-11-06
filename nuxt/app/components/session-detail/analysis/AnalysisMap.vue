<script setup lang="ts">
// PIP-618: track map of the analysis, oriented as ACC and the minimap HUD.
// Whole track: your lap coloured by gain (green) or loss (red) against the reference.
// Corner zoom: the two racing lines, yours blue and the reference amber.
// Two dots follow the cursor: you (blue, filled) and the reference (amber, hollow).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { deltaTrend, finishLine, glideFrame, fractions, lapDelta, mapPoints, worldToMap, type Corner, type MapPoint } from '~/services/telemetry/lapAnalysis'
import { hasMapPositions } from '~/services/telemetry/mapPositions'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'
import { placeMapLabels } from '~/services/telemetry/mapLabelPlacement'
import { useI18n } from '~/i18n'
const { t } = useI18n()

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
  /** PIP-645: Semplice on the whole session: each stretch in its own colour (no reference needed), the rest grey. */
  zoneColors?: { start: number, end: number, color: string }[] | null
  /** 01/11 (Track Titan): seconds lost (+) or gained (−) in each corner, written beside its number. */
  cornerDeltas?: Record<number, number> | null
}>(), { refCursor: null, selected: null, size: 320, zoom: false, colorMode: 'delta', focus: null, zoomControls: false, edges: null, zoneColors: null, cornerDeltas: null })
const emit = defineEmits<{ hover: [fraction: number | null], select: [corner: number] }>()

const POINTS = 600
const at = fractions(POINTS)
const W = computed(() => props.size)
const H = computed(() => Math.round(props.size * 0.8))
// The reference draws the frame when present: both lines share scale and offset.
// dev.11 (05/11): a reference without coordinates (laps saved before late October) used to hide the
// whole map, with a message blaming your lap. It now gives way: the map follows your lap alone.
// 06/11: also a reference whose coordinates do not draw a track (all equal) gives way.
const mapRef = computed(() => hasMapPositions(props.reference) ? props.reference! : null)
const frame = computed(() => mapRef.value ?? props.lap)
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
const lapPoints = computed(() => mapRef.value ? mapPoints(props.lap, at, W.value, H.value, 18, mapRef.value) : base.value)
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
// PIP-635: zoomed in, the map follows the cursor dot moved on the charts; dragging the map by hand stops
// it until the double click (or a new corner / sector) gives the framing back.
const follow = ref(true)
const onMap = ref(false)
function resetView() { view.value = null; follow.value = true }
watch(focusRange, resetView)
const trend = computed(() => props.reference ? deltaTrend(lapDelta(props.lap, props.reference, at)) : null)
const path = (points: MapPoint[] | null) => points?.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') ?? ''
const segments = computed(() => {
  const points = lapPoints.value
  if (!points || zoomed.value || lapsMode.value) return []
  const corner = props.selected !== null ? props.corners[props.selected - 1] : null
  return points.slice(1).map((p, i) => {
    const change = trend.value?.[i] ?? 0
    // Your lap against the reference: gaining green, losing red, even grey.
    const zone = props.zoneColors?.find(z => at[i]! >= z.start && at[i]! < z.end)
    const color = props.zoneColors ? zone?.color ?? '#8a8a90'
      : !trend.value ? '#38bdf8' : change < -0.002 ? '#3ddc5a' : change > 0.002 ? '#ff5a6e' : '#8a8a90'
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
const refDot = computed(() => mapRef.value ? dot(base.value, props.refCursor ?? props.cursor) : null)
// Only for the cursor moved on the charts: on the map itself the pointer is already where you look.
// PIP-635: zoomed in, the dot stays centred and the map glides to it frame by frame (Track Titan).
let glide = 0
let glideTarget: MapPoint | null = null
function glideStep() {
  glide = 0
  if (!glideTarget) return
  const { frame, done } = glideFrame(frameNow.value, glideTarget, 0.25, bounds.value)
  setView(frame)
  if (!done) glide = requestAnimationFrame(glideStep)
}
watch(lapDot, (point) => {
  // 02/11 (user): the cursor moved on the charts again after the map was dragged by hand: follow and centre the
  // dot again (keeping the zoom); not zoomed in, the whole track comes back.
  if (point && !onMap.value && !follow.value) {
    follow.value = true
    if (frameNow.value.span >= W.value * 0.9) view.value = null
  }
  if (!point || !follow.value || onMap.value || frameNow.value.span >= W.value * 0.9) { glideTarget = null; return }
  glideTarget = point
  if (!glide) glide = requestAnimationFrame(glideStep)
})
onBeforeUnmount(() => { if (glide) cancelAnimationFrame(glide) })
// Corner numbers beside the track on the outside of the bend, not on the apex: zoomed in,
// they no longer cover the two lines exactly where you look at them.
const labels = computed(() => {
  const points = base.value
  if (!points) return []
  const n = points.length
  const raw = props.corners.map(c => {
    const i = Math.round(c.apex * (POINTS - 1))
    const a = points[(i - 6 + n) % n]!, p = points[i]!, b = points[(i + 6) % n]!
    const tx = b.x - a.x, ty = b.y - a.y
    const length = Math.hypot(tx, ty) || 1
    // Turn direction from the cross product; the outside is the other side.
    const turn = Math.sign(tx * (p.y - a.y) - ty * (p.x - a.x)) || 1
    const nx = (ty / length) * turn, ny = (-tx / length) * turn
    const offset = 16 * zoomScale.value
    // The time beside the number, further out on the same side: every corner, in thousandths as in the corner list (01/11).
    const d = props.cornerDeltas?.[c.number]
    const gap = typeof d === 'number' && Number.isFinite(d) ? d : null
    const far = 34 * zoomScale.value
    // Kept inside the drawing: a bend near the edge would push the time out of the map.
    const margin = 14 * zoomScale.value
    const { cx, cy, span } = frameNow.value
    const box = { x: cx - span / 2, y: cy - span * 0.4, w: span, h: span * 0.8 }
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))
    // 01/11 (Codex): the bend out of the visible frame: no time pushed onto the edge, far from its corner.
    const inView = p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h
    const keepInside = (q: { x: number, y: number }) => ({ x: clamp(q.x, box.x + margin * 1.6, box.x + box.w - margin * 1.6), y: clamp(q.y, box.y + margin, box.y + box.h - margin * 0.6) })
    return { number: c.number, apex: p, point: { x: p.x + nx * offset, y: p.y + ny * offset }, keepInside,
      preferred: { x: p.x + nx * far, y: p.y + ny * far },
      gap: gap === null || !inView ? null : { text: `${gap > 0 ? '+' : gap < 0 ? '−' : '±'}${Math.abs(gap).toFixed(3)}`, loss: gap > 0 } }
  })
  // 05/11 (user): close bends (Monza 3-4) wrote their times on top of each other: each time takes the first free
  // spot around its own corner, never over another time or a corner number.
  const withGap = raw.filter(r => r.gap)
  const z = zoomScale.value
  const spots = placeMapLabels(withGap.map(r => ({ anchor: r.apex, preferred: r.preferred, width: 44 * z, height: 13 * z })),
    raw.map(r => r.point), 11 * z, raw[0]?.keepInside)
  const at = new Map(withGap.map((r, i) => [r.number, spots[i]!]))
  return raw.map(r => ({ number: r.number, point: r.point, apex: r.apex, gap: r.gap ? { ...r.gap, ...at.get(r.number)! } : null }))
})
// 05/11 (user): the bend where you lose the most (the "Da guardare" one) pulses on its number: the problem at a glance.
const worstNumber = computed(() => {
  const deltas = props.cornerDeltas
  if (!deltas) return null
  const worst = Object.entries(deltas).filter(([, d]) => typeof d === 'number' && d >= 0.01).sort((a, b) => b[1] - a[1])[0]
  return worst ? Number(worst[0]) : null
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
// The track never leaves the map: the view centre stays inside the track's own bounds,
// however far the mouse goes while dragging.
const bounds = computed(() => {
  const points = base.value
  if (!points?.length) return { x0: 0, x1: W.value, y0: 0, y1: H.value }
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
})
function setView(next: { cx: number, cy: number, span: number }) {
  const b = bounds.value
  view.value = { cx: Math.min(Math.max(next.cx, b.x0), b.x1), cy: Math.min(Math.max(next.cy, b.y0), b.y1), span: next.span }
}
/** Zoom by `factor` keeping the point (x, y) where it is on screen. */
function zoomAround(factor: number, x: number, y: number) {
  const { cx, cy, span } = frameNow.value
  const next = Math.min(Math.max(span * factor, minSpan.value), maxSpan.value)
  const k = next / span
  setView({ cx: x + (cx - x) * k, cy: y + (cy - y) * k, span: next })
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
onBeforeUnmount(() => document.documentElement.classList.remove('map-grabbing'))
function onDown(event: PointerEvent) {
  if (!props.zoomControls || event.button !== 0) return
  const { cx, cy } = frameNow.value
  drag = { x: event.clientX, y: event.clientY, cx, cy, moved: false }
  // Closed hand from the press to the release, as in any map, set on the page so it holds
  // over every element under the pointer; no text selection meanwhile.
  dragging.value = true
  event.preventDefault()
  document.documentElement.classList.add('map-grabbing')
}
function onUp(event: PointerEvent) {
  if (drag?.moved) {
    (event.currentTarget as SVGSVGElement).releasePointerCapture?.(event.pointerId)
    dragged.value = true
    setTimeout(() => { dragged.value = false }, 0)
  }
  drag = null
  dragging.value = false
  document.documentElement.classList.remove('map-grabbing')
}

// Leaving the map before a drag starts drops the press, so the hand does not stay closed.
function onLeave() {
  if (drag && !drag.moved) { drag = null; dragging.value = false; document.documentElement.classList.remove('map-grabbing') }
  onMap.value = false
  emit("hover", null)
}
function onMove(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  if (drag) {
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y
    if (!drag.moved && dx * dx + dy * dy > 16) { drag.moved = true; svg.setPointerCapture?.(event.pointerId) }
    if (drag.moved) {
      follow.value = false; glideTarget = null
      const perPixel = frameNow.value.span / svg.getBoundingClientRect().width
      setView({ cx: drag.cx - dx * perPixel, cy: drag.cy - dy * perPixel, span: frameNow.value.span })
      return
    }
  }
  onMap.value = true
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
    <button type="button" :aria-label="t('telemetry.map.zoomInAria')" :title="t('telemetry.map.zoomInTitle')" :disabled="frameNow.span <= minSpan" @click="zoomStep(1 / 1.6)">+</button>
    <button type="button" :aria-label="t('telemetry.map.zoomOutAria')" :title="t('telemetry.map.zoomOutTitle')" :disabled="frameNow.span >= maxSpan" @click="zoomStep(1.6)">−</button>
    <!-- 06/11 (user): always in its place, off while there is nothing to reset: + and − never move. -->
    <button type="button" :aria-label="t('telemetry.map.resetAria')" :title="t('telemetry.map.resetTitle')" :disabled="!view" @click="view = null">⟲</button>
  </div>
  <svg class="map" :class="{ 'map--pan': zoomControls, 'map--dragging': dragging }" :viewBox="viewBox" :style="{ '--z': zoomScale }" role="img" :aria-label="t('telemetry.map.aria')" @pointermove="onMove" @pointerleave="onLeave" @pointerdown="onDown" @mousedown.prevent @dragstart.prevent @pointerup="onUp" @pointercancel="onUp" @wheel="onWheel" @dblclick="zoomControls && resetView()">
    <template v-if="edgePaths">
      <polygon :points="edgePaths.surface" class="map-surface" fill-rule="evenodd" />
      <polyline :points="edgePaths.left" class="map-edge" />
      <polyline :points="edgePaths.right" class="map-edge" />
    </template>
    <polyline v-else :points="path(base)" class="map-track" />
    <polyline v-if="sector" :points="sector.path" class="map-sector" />
    <template v-if="zoomed || lapsMode">
      <polyline v-if="mapRef" :points="path(base)" class="map-ref" />
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
    <!-- 01/11: on a zoomed corner no numbers and no times: those around the edge belonged to corners out of sight. -->
    <g v-for="l in zoomed ? [] : labels" :key="l.number" class="map-corner" :class="{ active: selected === l.number, 'is-worst': l.number === worstNumber }" @click="!dragged && emit('select', l.number)">
      <!-- 01/11: a click area twice the drawn circle (the numbers were hard to hit), invisible. -->
      <!-- 02/11: three times the drawn circle, invisible: the numbers are easy to hit. -->
      <circle :cx="l.point.x" :cy="l.point.y" :r="27 * zoomScale" class="map-corner__hit" />
      <!-- 05/11 (user): the number of the bend where you lose the most has a red edge and a red ring pulsing around it. -->
      <circle v-if="l.number === worstNumber" :cx="l.point.x" :cy="l.point.y" :r="16 * zoomScale" class="map-worst__pulse" data-testid="map-worst" aria-hidden="true" />
      <circle :cx="l.point.x" :cy="l.point.y" :r="9 * zoomScale" />
      <text :x="l.point.x" :y="l.point.y + 4 * zoomScale" :font-size="11 * zoomScale">{{ l.number }}</text>
      <text v-if="l.gap" :x="l.gap.x" :y="l.gap.y + 4 * zoomScale" :font-size="11 * zoomScale" class="map-corner__gap" :class="l.gap.loss ? 'loss' : 'gain'">{{ l.gap.text }}</text>
    </g>
    <circle v-if="refDot" :cx="refDot.x" :cy="refDot.y" :r="5 * zoomScale" class="map-dot-ref" />
    <path v-if="lapArrow" :transform="`translate(${lapArrow.x} ${lapArrow.y}) rotate(${lapArrow.angle}) scale(${zoomScale})`" d="M8 0 L-6 -6 L-3 0 L-6 6 Z" class="map-arrow" />
  </svg>
  </div>
  <p v-else class="map-none">{{ t('telemetry.map.none') }}</p>
</template>

<style>
/* While the map is dragged: no text selection (02/11: the normal arrow, no hand). */
html.map-grabbing, html.map-grabbing * { user-select: none !important; }
</style>

<style scoped lang="scss">
.map-wrap { position: relative; }
// 06/11 (user): bottom left of the map.
.map-zoom { position: absolute; bottom: 4px; left: 4px; display: grid; gap: 3px; z-index: 1;
  button { width: 24px; height: 24px; border: 1px solid #ffffff2e; background: #0d0d12e6; color: #e6e6ea; font: 700 14px/1 "Inter", sans-serif; cursor: pointer; &:disabled { opacity: .35; cursor: default; } } }
// 06/11 (user): + − ⟲ only while the mouse is over the map (or a button has the keyboard focus); always on touch screens.
@media (hover: hover) {
  .map-zoom { opacity: 0; pointer-events: none; transition: opacity .15s ease; }
  .map-wrap:hover .map-zoom, .map-zoom:focus-within { opacity: 1; pointer-events: auto; } }
.map { display: block; width: 100%; height: auto; touch-action: none; user-select: none;
  &--pan, &--dragging { cursor: default; } }
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
/* 05/11 (user): the bend where you lose the most pulses; still for those who asked for less motion. */
/* 05/11 (user: "it must be seen"): a strong red ring and a red glow that grows well beyond the number. */
.map-corner.is-worst circle:not(.map-corner__hit):not(.map-worst__pulse) { stroke: #ff0024; stroke-width: calc(2.5px * var(--z, 1)); fill: #3a0009; }
.map-worst__pulse { pointer-events: none; fill: rgba(255, 0, 36, 0.35); stroke: #ff0024; stroke-width: calc(3.5px * var(--z, 1)); transform-box: fill-box; transform-origin: center;
  animation: map-worst-pulse 1.3s ease-out infinite; }
@keyframes map-worst-pulse { 0% { transform: scale(.55); opacity: 1; } 60% { opacity: .85; } 100% { transform: scale(1.9); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .map-worst__pulse { animation: none; opacity: .8; } }
// 06/11 (user): the hand over a corner's click area (the map itself keeps the normal arrow, 02/11).
.map-corner { cursor: pointer;
  circle { fill: #0a0a0f; stroke: #ffffff59; stroke-width: calc(1px * var(--z, 1)); }
  .map-corner__hit { fill: transparent; stroke: none; }
  // Readable on the track and the dark background: a dark outline around the digits.
  .map-corner__gap { paint-order: stroke; stroke: #0a0a0f; stroke-width: calc(3px * var(--z, 1)); stroke-linejoin: round;
    &.loss { fill: #ff8a98; } &.gain { fill: #7ee79a; } }
  &:hover circle:not(.map-corner__hit) { stroke: #fff; }
  text { fill: #e6e6ea; font-family: 'Inter', sans-serif; font-weight: 700; text-anchor: middle; }
  &.active circle { stroke: #ff0024; stroke-width: calc(2px * var(--z, 1)); } }
.map-arrow { fill: #38bdf8; stroke: #fff; stroke-width: 1.2px; vector-effect: non-scaling-stroke; }
.map-dot-lap { fill: #38bdf8; stroke: #fff; stroke-width: calc(1.5px * var(--z, 1)); }
.map-dot-ref { fill: #0a0a0f; stroke: #fbbf24; stroke-width: calc(2px * var(--z, 1)); }
.map-none { color: #8a8a90; font-size: 12px; }
</style>
