<script setup lang="ts">
// PIP-618: stacked channel charts on the lap distance, one shared cursor (MoTeC,
// Garage 61, Track Titan). Lap in red, reference in grey dashed; the delta row is
// green where the lap gains and red where it loses.
import { computed, useId } from 'vue'
import { channelAt, formatDelta } from '~/services/telemetry/lapAnalysis'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'

export interface ChartRow {
  key: string
  title: string
  unit?: string
  /** One channel per line; several lines (gas and brake, four tyres) share a row. */
  channels: { name: string, color?: string, label?: string, scale?: number }[]
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
}>(), { range: () => [0, 1] })
const emit = defineEmits<{ hover: [fraction: number | null] }>()

const uid = useId()
const WIDTH = 1000
const SAMPLES = 500
const LAP = '#ff3b4f'
const REF = '#c9c9cf'
const at = computed(() => {
  const [start, end] = props.range
  return Array.from({ length: SAMPLES }, (_, i) => start + (end - start) * i / (SAMPLES - 1))
})
const x = (i: number) => (i / (SAMPLES - 1)) * WIDTH

function series(trace: LapTraceView, channel: string, scale = 1) {
  return at.value.map(f => { const v = channelAt(trace, channel, f); return v === null ? null : v * scale })
}
function deltaSeries() {
  if (!props.reference) return []
  return at.value.map(f => (channelAt(props.lap, 'time_s', f) ?? 0) - (channelAt(props.reference!, 'time_s', f) ?? 0))
}

const charts = computed(() => props.rows.map(row => {
  const height = row.height ?? 90
  const lines: { points: string, color: string, dashed: boolean }[] = []
  let values: number[] = []
  if (row.delta) {
    const delta = deltaSeries()
    // Delta relative to the start of the range: the corner's own loss, not the lap's so far.
    const origin = delta[0] ?? 0
    values = delta.map(v => v - origin)
  } else {
    for (const channel of row.channels) {
      values.push(...series(props.lap, channel.name, channel.scale).filter((v): v is number => v !== null))
      if (props.reference) values.push(...series(props.reference, channel.name, channel.scale).filter((v): v is number => v !== null))
    }
  }
  let min = row.min ?? Math.min(...values, row.delta ? 0 : Infinity)
  let max = row.max ?? Math.max(...values, row.delta ? 0 : -Infinity)
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1 }
  if (row.delta) { const m = Math.max(Math.abs(min), Math.abs(max), 0.05); min = -m; max = m }
  const pad = (max - min) * 0.08 || 1
  const y = (v: number) => height - 4 - ((v - (min - pad)) / (max - min + 2 * pad)) * (height - 8)
  const path = (list: (number | null)[]) => list.map((v, i) => v === null ? '' : `${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(' ')
  let area = ''
  if (row.delta) {
    area = `0,${y(0)} ${values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} ${WIDTH},${y(0)}`
    lines.push({ points: path(values), color: '#e6e6ea', dashed: false })
  } else {
    for (const channel of row.channels) {
      if (props.reference) lines.push({ points: path(series(props.reference, channel.name, channel.scale)), color: channel.color ? `${channel.color}99` : REF, dashed: true })
      lines.push({ points: path(series(props.lap, channel.name, channel.scale)), color: channel.color ?? LAP, dashed: false })
    }
  }
  return { row, height, lines, area, zero: row.delta ? y(0) : null, deltaOrigin: row.delta ? (deltaSeries()[0] ?? 0) : 0 }
}))

const cursorX = computed(() => {
  if (props.cursor === null) return null
  const [start, end] = props.range
  if (props.cursor < start || props.cursor > end) return null
  return ((props.cursor - start) / Math.max(end - start, 1e-9)) * WIDTH
})

function readout(chart: (typeof charts.value)[number]) {
  const f = props.cursor
  if (f === null) return ''
  if (chart.row.delta) {
    if (!props.reference) return ''
    const d = (channelAt(props.lap, 'time_s', f) ?? 0) - (channelAt(props.reference, 'time_s', f) ?? 0) - chart.deltaOrigin
    return formatDelta(d)
  }
  const digits = chart.row.digits ?? 0
  return chart.row.channels.map(c => {
    const rawLap = channelAt(props.lap, c.name, f); const lap = rawLap === null ? null : rawLap * (c.scale ?? 1)
    const rawRef = props.reference ? channelAt(props.reference, c.name, f) : null; const ref = rawRef === null ? null : rawRef * (c.scale ?? 1)
    const label = c.label ? `${c.label} ` : ''
    return `${label}${lap === null ? '--' : lap.toFixed(digits)}${ref === null ? '' : ` / ${ref.toFixed(digits)}`}`
  }).join(' · ')
}

function onMove(event: PointerEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
  const [start, end] = props.range
  emit('hover', start + (end - start) * ratio)
}
</script>

<template>
  <div class="charts">
    <div v-for="chart in charts" :key="chart.row.key" class="chart">
      <div class="chart-head">
        <span class="chart-title">{{ chart.row.title }} <small v-if="chart.row.unit">{{ chart.row.unit }}</small></span>
        <span class="chart-value" :class="{ gain: chart.row.delta && readout(chart).startsWith('−'), loss: chart.row.delta && readout(chart).startsWith('+') }">{{ readout(chart) }}</span>
      </div>
      <svg :viewBox="`0 0 ${WIDTH} ${chart.height}`" preserveAspectRatio="none" :style="{ height: `${chart.height}px` }" @pointermove="onMove" @pointerleave="emit('hover', null)">
        <defs v-if="chart.row.delta">
          <clipPath :id="`above-${uid}-${chart.row.key}`"><rect x="0" y="0" :width="WIDTH" :height="chart.zero!" /></clipPath>
          <clipPath :id="`below-${uid}-${chart.row.key}`"><rect x="0" :y="chart.zero!" :width="WIDTH" :height="chart.height" /></clipPath>
        </defs>
        <template v-if="chart.row.delta">
          <!-- Above zero the lap is behind (red), below it is ahead (green). -->
          <polygon :points="chart.area" fill="#ff5a6e40" :clip-path="`url(#above-${uid}-${chart.row.key})`" />
          <polygon :points="chart.area" fill="#3ddc5a40" :clip-path="`url(#below-${uid}-${chart.row.key})`" />
          <line x1="0" :x2="WIDTH" :y1="chart.zero!" :y2="chart.zero!" class="chart-zero" />
        </template>
        <polyline v-for="(line, i) in chart.lines" :key="i" :points="line.points" :stroke="line.color" :stroke-dasharray="line.dashed ? '6 4' : undefined" class="chart-line" />
        <line v-if="cursorX !== null" :x1="cursorX" :x2="cursorX" y1="0" :y2="chart.height" class="chart-cursor" />
      </svg>
    </div>
  </div>
</template>

<style scoped lang="scss">
.charts { display: grid; gap: 6px; min-width: 0; }
.chart { border: 1px solid #ffffff1f; background: #ffffff06; padding: 4px 8px 2px; }
.chart-head { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; }
.chart-title { color: #b3b3b8; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; small { color: #77777d; font-weight: 500; text-transform: none; } }
.chart-value { color: #e6e6ea; font-variant-numeric: tabular-nums; &.gain { color: #3ddc5a; } &.loss { color: #ff5a6e; } }
svg { display: block; width: 100%; touch-action: none; cursor: crosshair; }
.chart-line { fill: none; stroke-width: 1.6; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.chart-zero { stroke: #ffffff40; stroke-width: 1; vector-effect: non-scaling-stroke; }
.chart-cursor { stroke: #fff; stroke-width: 1; vector-effect: non-scaling-stroke; opacity: .7; }
</style>
