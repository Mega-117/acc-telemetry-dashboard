<script setup lang="ts">
// PIP-618: stacked channel charts on the lap distance, one shared cursor (MoTeC,
// Garage 61, Track Titan). You: blue line and filled dot. Reference: amber line
// and hollow dot. The delta row is red where you lose and green where you gain.
import { computed, ref, useId } from 'vue'
import { channelAt, formatDelta, type Corner } from '~/services/telemetry/lapAnalysis'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

export interface ChartChannel { name: string, color?: string, label?: string, scale?: number }
export interface ChartRow {
  key: string
  title: string
  unit?: string
  /** One channel per line; several lines (gas and brake, two tyres) can share a row. */
  channels: ChartChannel[]
  delta?: boolean
  height?: number
  digits?: number
  min?: number
  max?: number
}

const props = withDefaults(defineProps<{
  lap: LapTraceView
  reference: LapTraceView | null
  rows: ChartRow[]
  range?: [number, number]
  cursor: number | null
  /** Reference dot position: the same point, or where it was at the same time. */
  refCursor?: number | null
  /** Corner bands with their number along the lap (Tracce). */
  corners?: Corner[]
  /** Same height for every row (Tracce). */
  rowHeight?: number | null
  /** Garage 61 zoom: drag to zoom a stretch, wheel in and out, double click for the lap. */
  zoomable?: boolean
}>(), { range: () => [0, 1], refCursor: null, corners: () => [], rowHeight: null, zoomable: false })
const emit = defineEmits<{ hover: [fraction: number | null], select: [corner: number], zoom: [range: [number, number] | null] }>()

const uid = useId()
const WIDTH = 1000
const SAMPLES = 500
// One colour per lap: you sky blue, the reference amber. Blue/orange stays readable on
// dark and for colour-blind drivers, and never clashes with green/red gain and loss.
const LAP = '#38bdf8'
const REF = '#fbbf24'
const at = computed(() => {
  const [start, end] = props.range
  return Array.from({ length: SAMPLES }, (_, i) => start + (end - start) * i / (SAMPLES - 1))
})
const xOf = (fraction: number) => ((fraction - props.range[0]) / Math.max(props.range[1] - props.range[0], 1e-9)) * WIDTH
const inRange = (fraction: number | null): fraction is number => fraction !== null && fraction >= props.range[0] && fraction <= props.range[1]
const valueAt = (trace: LapTraceView, channel: ChartChannel, fraction: number) => {
  const v = channelAt(trace, channel.name, fraction)
  return v === null ? null : v * (channel.scale ?? 1)
}
/** Round axis steps: 1, 2 or 5 × 10^n, about `count` of them across the range. */
function niceStep(min: number, max: number, count: number) {
  const raw = Math.max(max - min, 1e-9) / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power
}
function niceTicks(min: number, max: number, count: number) {
  const step = niceStep(min, max, count)
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-6 ? 0 : v)
  return out
}
function stepDigits(min: number, max: number, count: number, fallback: number) {
  const step = niceStep(min, max, count)
  return step >= 1 ? 0 : Math.max(fallback, Math.ceil(-Math.log10(step)))
}
const deltaAt = (fraction: number) => props.reference ? (channelAt(props.lap, 'time_s', fraction) ?? 0) - (channelAt(props.reference, 'time_s', fraction) ?? 0) : 0

const charts = computed(() => props.rows.map(row => {
  const height = props.rowHeight ?? row.height ?? 90
  // Delta relative to the start of the range: a zoomed corner shows its own loss.
  const origin = row.delta ? deltaAt(props.range[0]) : 0
  const lapSeries = row.channels.map(c => at.value.map(f => valueAt(props.lap, c, f)))
  const refSeries = props.reference ? row.channels.map(c => at.value.map(f => valueAt(props.reference!, c, f))) : []
  const delta = row.delta ? at.value.map(f => deltaAt(f) - origin) : []
  const values = (row.delta ? delta : [...lapSeries.flat(), ...refSeries.flat()]).filter((v): v is number => v !== null)
  let min = row.min ?? Math.min(...values), max = row.max ?? Math.max(...values)
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1 }
  if (row.delta) { const m = Math.max(Math.abs(min), Math.abs(max), 0.05); min = -m; max = m }
  const pad = (max - min) * 0.08 || 1
  const y = (v: number) => height - 4 - ((v - (min - pad)) / (max - min + 2 * pad)) * (height - 8)
  const line = (list: (number | null)[]) => list.map((v, i) => v === null ? '' : `${(i / (SAMPLES - 1) * WIDTH).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(' ')
  // One colour per lap in every chart.
  const lines = row.delta
    ? [{ points: line(delta), color: '#e6e6ea', ref: false }]
    : row.channels.flatMap((_, i) => [
      ...(props.reference ? [{ points: line(refSeries[i]!), color: REF, ref: true }] : []),
      { points: line(lapSeries[i]!), color: LAP, ref: false },
    ])
  const area = row.delta ? `0,${y(0)} ${delta.map((v, i) => `${(i / (SAMPLES - 1) * WIDTH).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} ${WIDTH},${y(0)}` : ''
  // Graduated axis as Garage 61: round steps (0-20-40…100 for pedals) with a guide line each.
  const digits = row.delta ? 2 : (row.digits ?? 0)
  const ticks = niceTicks(min, max, height >= 120 ? 5 : 3).map(value => ({
    y: y(value),
    label: `${row.delta && value > 0 ? '+' : ''}${value.toFixed(row.delta ? 2 : stepDigits(min, max, height >= 120 ? 5 : 3, digits))}`,
  }))
  return { row, height, lines, area, zero: row.delta ? y(0) : null, origin, y, ticks }
}))

// Dots at the cursor, apart from the lines: moving the mouse never resamples the traces.
// Yours on your line, the reference's on its line at its own position.
const dots = computed(() => charts.value.map(chart => {
  const list: { x: number, y: number, color: string, ref: boolean }[] = []
  if (!chart.row.delta) {
    chart.row.channels.forEach(c => {
      if (inRange(props.cursor)) { const v = valueAt(props.lap, c, props.cursor); if (v !== null) list.push({ x: xOf(props.cursor), y: chart.y(v), color: LAP, ref: false }) }
      const refAt = props.refCursor ?? props.cursor
      if (props.reference && inRange(refAt)) { const v = valueAt(props.reference, c, refAt); if (v !== null) list.push({ x: xOf(refAt), y: chart.y(v), color: REF, ref: true }) }
    })
  } else if (inRange(props.cursor)) {
    list.push({ x: xOf(props.cursor), y: chart.y(deltaAt(props.cursor) - chart.origin), color: '#e6e6ea', ref: false })
  }
  return list
}))

const bands = computed(() => props.corners
  .filter(c => c.end >= props.range[0] && c.start <= props.range[1])
  .map(c => ({ number: c.number, x: xOf(Math.max(c.start, props.range[0])), width: xOf(Math.min(c.end, props.range[1])) - xOf(Math.max(c.start, props.range[0])), apex: xOf(c.apex) })))

// Track Titan header per chart: the values at the cursor, you and the reference, and the difference.
const headerValues = computed(() => charts.value.map(chart => {
  const f = props.cursor
  if (!inRange(f)) return null
  if (chart.row.delta) return props.reference ? { lap: `${formatDelta(deltaAt(f) - chart.origin)} s`, ref: null, diff: null } : null
  const c = chart.row.channels[0]
  if (!c) return null
  const digits = chart.row.digits ?? 0
  const unit = chart.row.unit ? ` ${chart.row.unit}` : ''
  const lap = valueAt(props.lap, c, f)
  const ref = props.reference ? valueAt(props.reference, c, props.refCursor ?? f) : null
  const diff = lap !== null && ref !== null ? lap - ref : null
  return {
    lap: `${lap === null ? '--' : lap.toFixed(digits)}${unit}`,
    ref: props.reference ? `${ref === null ? '--' : ref.toFixed(digits)}${unit}` : null,
    diff: diff === null ? null : `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.abs(diff).toFixed(digits)}`,
  }
}))
const km = (fraction: number) => {
  const metres = fraction * props.lap.lengthM
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`
}
// Distance axis: round steps in metres along the shown range, with a faint vertical line each.
const xTicks = computed(() => {
  const [r0, r1] = props.range
  const length = Math.max(props.lap.lengthM, 1)
  const from = r0 * length, to = r1 * length
  const step = niceStep(from, to, 6)
  const ticks: { x: number, label: string }[] = []
  for (let m = Math.ceil(from / step) * step; m <= to + 1e-6; m += step) ticks.push({ x: xOf(m / length), label: km(m / length) })
  return ticks
})


function fractionOf(event: PointerEvent | WheelEvent | MouseEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
  return props.range[0] + (props.range[1] - props.range[0]) * ratio
}
// Garage 61 zoom: drag across a stretch to zoom it, Ctrl + wheel to zoom around the
// pointer, double click for the whole lap. 20 m is the smallest stretch.
const dragFrom = ref<number | null>(null)
const dragTo = ref<number | null>(null)
const brush = computed(() => dragFrom.value === null || dragTo.value === null ? null
  : { x: xOf(Math.min(dragFrom.value, dragTo.value)), width: Math.abs(xOf(dragTo.value) - xOf(dragFrom.value)) })
const minSpan = computed(() => 20 / Math.max(props.lap.lengthM, 1))
function zoomTo(start: number, end: number) {
  const span = Math.max(end - start, minSpan.value)
  const s = Math.min(Math.max(start, 0), 1 - span)
  emit('zoom', s <= 0 && span >= 1 ? null : [Math.max(s, 0), Math.min(s + span, 1)])
}
function onMove(event: PointerEvent) {
  const f = fractionOf(event)
  if (dragFrom.value !== null) dragTo.value = f
  emit('hover', f)
}
function onDown(event: PointerEvent) {
  if (!props.zoomable || event.button !== 0) return
  dragFrom.value = dragTo.value = fractionOf(event)
  ;(event.currentTarget as SVGElement).setPointerCapture?.(event.pointerId)
}
function onUp() {
  if (dragFrom.value !== null && dragTo.value !== null && Math.abs(dragTo.value - dragFrom.value) > minSpan.value / 2) {
    zoomTo(Math.min(dragFrom.value, dragTo.value), Math.max(dragFrom.value, dragTo.value))
  }
  dragFrom.value = dragTo.value = null
}
function onWheel(event: WheelEvent) {
  // Plain wheel scrolls the page; Ctrl + wheel zooms (as Google Maps), never both.
  if (!props.zoomable || !event.ctrlKey) return
  event.preventDefault()
  const f = fractionOf(event)
  const [start, end] = props.range
  const factor = event.deltaY > 0 ? 1.25 : 0.8
  const span = Math.min((end - start) * factor, 1)
  // Keep the point under the pointer where it is.
  const ratio = (f - start) / Math.max(end - start, 1e-9)
  zoomTo(f - span * ratio, f - span * ratio + span)
}
function onDouble() {
  if (props.zoomable) emit('zoom', null)
}
</script>

<template>
  <div class="charts">
    <svg v-if="bands.length" class="bands" :viewBox="`0 0 ${WIDTH} 18`" preserveAspectRatio="none">
      <g v-for="b in bands" :key="b.number" class="band" @click="emit('select', b.number)">
        <rect :x="b.x" y="0" :width="Math.max(b.width, 1)" height="18" />
        <text :x="b.apex" y="13">{{ b.number }}</text>
      </g>
    </svg>
    <!-- Garage 61 layout per chart: graduated Y axis on the left, distance below,
         channel name bottom right, value box at the cursor. -->
    <div v-for="(chart, index) in charts" :key="chart.row.key" class="chart">
      <!-- Track Titan header: the channel name, readable, and the values at the cursor. -->
      <div class="chart-head">
        <span class="chart-title">{{ chart.row.title }}</span>
        <span v-if="headerValues[index]" class="chart-values">
          <span class="v v--lap">Tu <b>{{ headerValues[index]!.lap }}</b></span>
          <span v-if="headerValues[index]!.ref" class="v v--ref">Rif. <b>{{ headerValues[index]!.ref }}</b></span>
          <span v-if="headerValues[index]!.diff" class="v v--diff">Δ <b>{{ headerValues[index]!.diff }}</b></span>
        </span>
      </div>
      <div class="chart-yaxis" :style="{ height: `${chart.height}px` }">
        <span v-for="(t, i) in chart.ticks" :key="i" :style="{ top: `${t.y}px` }">{{ t.label }}</span>
      </div>
      <div class="chart-plot" :style="{ height: `${chart.height}px` }">
        <svg :viewBox="`0 0 ${WIDTH} ${chart.height}`" preserveAspectRatio="none" :style="{ height: `${chart.height}px` }" @pointermove="onMove" @pointerleave="emit('hover', null)" @pointerdown="onDown" @pointerup="onUp" @pointercancel="onUp" @wheel="onWheel" @dblclick="onDouble">
          <rect v-for="b in bands" :key="b.number" :x="b.x" y="0" :width="Math.max(b.width, 1)" :height="chart.height" class="chart-band" />
          <line v-for="(t, i) in chart.ticks" :key="`g${i}`" x1="0" :x2="WIDTH" :y1="t.y" :y2="t.y" class="chart-grid" />
          <line v-for="(t, i) in xTicks" :key="`x${i}`" :x1="t.x" :x2="t.x" y1="0" :y2="chart.height" class="chart-grid chart-grid--x" />
          <defs v-if="chart.row.delta">
            <clipPath :id="`above-${uid}-${chart.row.key}`"><rect x="0" y="0" :width="WIDTH" :height="chart.zero!" /></clipPath>
            <clipPath :id="`below-${uid}-${chart.row.key}`"><rect x="0" :y="chart.zero!" :width="WIDTH" :height="chart.height" /></clipPath>
          </defs>
          <template v-if="chart.row.delta">
            <!-- Above zero you are behind (red), below you are ahead (green). -->
            <polygon :points="chart.area" fill="#ff5a6e40" :clip-path="`url(#above-${uid}-${chart.row.key})`" />
            <polygon :points="chart.area" fill="#3ddc5a40" :clip-path="`url(#below-${uid}-${chart.row.key})`" />
            <line x1="0" :x2="WIDTH" :y1="chart.zero!" :y2="chart.zero!" class="chart-zero" />
          </template>
          <polyline v-for="(line, i) in chart.lines" :key="i" :points="line.points" :stroke="line.color" :class="['chart-line', { 'chart-line--ref': line.ref }]" />
          <line v-if="inRange(cursor)" :x1="xOf(cursor!)" :x2="xOf(cursor!)" y1="0" :y2="chart.height" class="chart-cursor" />
          <rect v-if="brush" :x="brush.x" y="0" :width="brush.width" :height="chart.height" class="chart-brush" />
        </svg>
        <!-- Dots in an overlay without aspect distortion: round whatever the chart width. -->
        <i v-for="(d, i) in dots[index]" :key="i" class="chart-dot" :class="{ ref: d.ref }" :style="{ left: `${d.x / WIDTH * 100}%`, top: `${d.y}px`, '--c': d.color }" />
      </div>
      <div class="chart-xaxis">
        <span v-for="(t, i) in xTicks" :key="i" class="chart-xtick" :style="{ left: `${t.x / WIDTH * 100}%`, '--p': `${t.x / WIDTH * 100}%` }">{{ t.label }}</span>
        <span v-if="inRange(cursor)" class="chart-xcursor" :style="{ left: `${xOf(cursor!) / WIDTH * 100}%`, '--p': `${xOf(cursor!) / WIDTH * 100}%` }">{{ km(cursor!) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.charts { display: grid; gap: 6px; min-width: 0; }
.bands { display: block; width: calc(100% - 51px); margin-left: 43px; height: 18px;
  .band { cursor: pointer; rect { fill: #ffffff0d; stroke: #ffffff1f; stroke-width: 1; vector-effect: non-scaling-stroke; } text { fill: #b3b3b8; font: 700 11px 'Inter', sans-serif; text-anchor: middle; } &:hover rect { fill: #ff002426; } } }
.chart { display: grid; grid-template-columns: 42px minmax(0, 1fr); grid-template-rows: auto auto 16px; border: 1px solid #ffffff1f; background: #ffffff06; padding: 6px 8px 2px 0; }
.chart-yaxis { position: relative;
  span { position: absolute; right: 6px; transform: translateY(-50%); color: #8a8a90; font: 600 10px 'Inter', sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; } }
.chart-plot { position: relative; min-width: 0; }
svg { display: block; width: 100%; touch-action: none; cursor: crosshair; }
.chart-band { fill: #ffffff06; }
.chart-line { fill: none; stroke-width: 1.8; vector-effect: non-scaling-stroke; stroke-linejoin: round; &--ref { stroke-width: 1.5; } }
.chart-brush { fill: #ffffff1f; stroke: #ffffff59; stroke-width: 1; vector-effect: non-scaling-stroke; }
.chart-zero { stroke: #ffffff40; stroke-width: 1; vector-effect: non-scaling-stroke; }
.chart-cursor { stroke: #fff; stroke-width: 1; vector-effect: non-scaling-stroke; opacity: .55; }
.chart-grid { stroke: #ffffff14; stroke-width: 1; stroke-dasharray: 3 4; vector-effect: non-scaling-stroke; }
.chart-dot { position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--c); border: 1.5px solid #fff; pointer-events: none;
  &.ref { background: #0a0a0f; border: 2px solid var(--c); } }
// Track Titan header: name on the left in white, live values on the right in the lap colours.
.chart-head { grid-column: 1 / -1; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 0 0 4px 12px; }
.chart-title { color: #fff; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: .03em;
  small { color: #8a8a90; font: 500 11px 'Inter', sans-serif; text-transform: none; } }
.chart-values { display: flex; gap: 12px; font: 600 11px 'Inter', sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap;
  // Fixed width per value, right-aligned: changing digits never shifts the others.
  .v { color: #8a8a90; b { display: inline-block; min-width: 9ch; text-align: right; font-weight: 700; font-size: 12px; } }
  .v--diff b { min-width: 6ch; }
  .v--lap b { color: #38bdf8; } .v--ref b { color: #fbbf24; } .v--diff b { color: #e6e6ea; } }
.chart-grid--x { stroke-dasharray: none; stroke: #ffffff0d; }
.chart-xaxis { grid-column: 2; position: relative; overflow: hidden; height: 16px; color: #8a8a90; font: 600 10px 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
// Labels slide from left-aligned at the start to right-aligned at the end (--p), so the
// one at the cursor never sticks out of the chart: no scrollbar flashing on the far right.
.chart-xtick { position: absolute; top: 2px; transform: translateX(calc(-1 * var(--p, 50%))); white-space: nowrap; }
.chart-xcursor { position: absolute; top: 1px; transform: translateX(calc(-1 * var(--p, 50%))); padding: 0 4px; background: #e6e6ea; color: #0b0b10; font-weight: 700; white-space: nowrap; }
</style>
