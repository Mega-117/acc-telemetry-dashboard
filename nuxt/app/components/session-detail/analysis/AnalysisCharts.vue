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

// Garage 61's value box at the cursor: one line per lap, with its colour square.
const tooltip = computed(() => {
  const f = props.cursor
  if (!inRange(f)) return null
  const refAt = props.refCursor ?? f
  const left = xOf(f) / WIDTH * 100
  return {
    left: left > 70 ? null : `calc(${left}% + 12px)`,
    right: left > 70 ? `calc(${100 - left}% + 12px)` : null,
    rows: charts.value.map(chart => {
      const unit = chart.row.unit ? ` ${chart.row.unit}` : ''
      if (chart.row.delta) return props.reference ? [{ color: LAP, text: `${formatDelta(deltaAt(f) - chart.origin)} s` }] : []
      const digits = chart.row.digits ?? 0
      return chart.row.channels.flatMap(c => {
        const lap = valueAt(props.lap, c, f)
        const ref = props.reference ? valueAt(props.reference, c, refAt) : null
        return [
          { color: LAP, text: `${lap === null ? '--' : lap.toFixed(digits)}${unit}` },
          ...(props.reference ? [{ color: REF, text: `${ref === null ? '--' : ref.toFixed(digits)}${unit}` }] : []),
        ]
      })
    }),
  }
})
const km = (fraction: number) => {
  const metres = fraction * props.lap.lengthM
  return metres >= 1000 ? `${(metres / 1000).toFixed(metres % 1000 === 0 ? 0 : 1)} km` : `${Math.round(metres)} m`
}


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
      <div class="chart-yaxis" :style="{ height: `${chart.height}px` }">
        <span v-for="(t, i) in chart.ticks" :key="i" :style="{ top: `${t.y}px` }">{{ t.label }}</span>
      </div>
      <div class="chart-plot" :style="{ height: `${chart.height}px` }">
        <svg :viewBox="`0 0 ${WIDTH} ${chart.height}`" preserveAspectRatio="none" :style="{ height: `${chart.height}px` }" @pointermove="onMove" @pointerleave="emit('hover', null)" @pointerdown="onDown" @pointerup="onUp" @pointercancel="onUp" @wheel="onWheel" @dblclick="onDouble">
          <rect v-for="b in bands" :key="b.number" :x="b.x" y="0" :width="Math.max(b.width, 1)" :height="chart.height" class="chart-band" />
          <line v-for="(t, i) in chart.ticks" :key="`g${i}`" x1="0" :x2="WIDTH" :y1="t.y" :y2="t.y" class="chart-grid" />
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
        <div v-if="tooltip && tooltip.rows[index]?.length" class="chart-tip" :style="{ left: tooltip.left ?? undefined, right: tooltip.right ?? undefined }">
          <span v-for="(r, i) in tooltip.rows[index]" :key="i"><b :style="{ background: r.color }" />{{ r.text }}</span>
        </div>
        <span class="chart-name">{{ chart.row.title }}</span>
      </div>
      <div class="chart-xaxis">
        <span>{{ km(range[0]) }}</span>
        <span v-if="inRange(cursor)" class="chart-xcursor" :style="{ left: `${xOf(cursor!) / WIDTH * 100}%` }">{{ km(cursor!) }}</span>
        <span>{{ km(range[1]) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.charts { display: grid; gap: 6px; min-width: 0; }
.bands { display: block; width: calc(100% - 51px); margin-left: 43px; height: 18px;
  .band { cursor: pointer; rect { fill: #ffffff0d; stroke: #ffffff1f; stroke-width: 1; vector-effect: non-scaling-stroke; } text { fill: #b3b3b8; font: 700 11px 'Inter', sans-serif; text-anchor: middle; } &:hover rect { fill: #ff002426; } } }
.chart { display: grid; grid-template-columns: 42px minmax(0, 1fr); grid-template-rows: auto 14px; border: 1px solid #ffffff1f; background: #ffffff06; padding: 6px 8px 2px 0; }
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
.chart-tip { position: absolute; top: 6px; display: grid; gap: 1px; padding: 4px 7px; border: 1px solid #ffffff2e; background: #0d0d12ee; pointer-events: none;
  span { display: flex; align-items: center; gap: 6px; color: #e6e6ea; font: 600 11px 'Inter', sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
  b { width: 9px; height: 9px; } }
.chart-name { position: absolute; right: 4px; bottom: 2px; color: #b3b3b8; font: 700 11px 'Inter', sans-serif; letter-spacing: .03em; pointer-events: none; }
.chart-xaxis { grid-column: 2; position: relative; display: flex; justify-content: space-between; color: #77777d; font: 600 10px 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
.chart-xcursor { position: absolute; transform: translateX(-50%); color: #e6e6ea; }
</style>
