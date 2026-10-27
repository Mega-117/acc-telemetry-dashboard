<script setup lang="ts">
// PIP-618: the car seen from above at the cursor, as GOFast does. The car always
// drives up the panel; the body turns by the angle between where it points and
// where it goes. Each tyre is coloured by how much it works (slip angle) with a
// bar for its suspension travel, the load it carries. A small G meter beside it.
// ACC gives no wheel load: slip angle and suspension travel are the closest signals.
import { computed } from 'vue'
import { bodySlipDeg, channelAt } from '~/services/telemetry/lapAnalysis'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'
import { useI18n } from '~/i18n'
// `tr`: the template already uses `t` for the tyres.
const { t: tr } = useI18n()

const props = defineProps<{
  lap: LapTraceView
  reference: LapTraceView | null
  cursor: number | null
  refCursor: number | null
}>()

const WHEELS = [
  { id: 'fl', x: 28, y: 30 }, { id: 'fr', x: 72, y: 30 },
  { id: 'rl', x: 28, y: 92 }, { id: 'rr', x: 72, y: 92 },
] as const
const SUSPENSION_MAX_MM = 80
const G_MAX = 3

const available = computed(() => !!props.lap.channels.slip_angle_fl || !!props.lap.channels.acc_lat_g || !!props.lap.channels.heading_rad)
const at = computed(() => props.cursor ?? 0.5)
const slip = computed(() => bodySlipDeg(props.lap, at.value))
/** Tyre work in degrees of slip: under 2° rolling, 2-5 working, 5-8 at the limit, over 8 sliding. */
function tyreColor(deg: number | null) {
  if (deg === null) return '#3a3a40'
  const a = Math.abs(deg)
  return a < 2 ? '#4dabf7' : a < 5 ? '#3ddc5a' : a < 8 ? '#ffd43b' : '#ff5a6e'
}
const tyres = computed(() => WHEELS.map(w => {
  const slipRad = channelAt(props.lap, `slip_angle_${w.id}`, at.value)
  const travel = channelAt(props.lap, `susp_travel_mm_${w.id}`, at.value)
  const deg = slipRad === null ? null : slipRad * 57.2958
  return { ...w, deg, color: tyreColor(deg), load: travel === null ? null : Math.min(Math.max(travel / SUSPENSION_MAX_MM, 0), 1), travel }
}))
const g = (trace: LapTraceView | null, fraction: number | null) => {
  if (!trace || fraction === null) return null
  const lat = channelAt(trace, 'acc_lat_g', fraction), long = channelAt(trace, 'acc_long_g', fraction)
  return lat === null || long === null ? null : { lat, long }
}
const lapG = computed(() => g(props.lap, at.value))
const refG = computed(() => g(props.reference, props.refCursor ?? at.value))
// G meter: lateral across, braking up (deceleration pushes forward), acceleration down.
const gDot = (v: { lat: number, long: number } | null) => v ? { x: 50 + (v.lat / G_MAX) * 42, y: 50 - (-v.long / G_MAX) * 42 } : null
</script>

<template>
  <div v-if="available" class="car">
    <div class="car-body">
      <span class="car-title">{{ tr('telemetry.car.title') }}</span>
      <svg viewBox="0 0 100 124" :aria-label="tr('telemetry.car.aria')">
        <line x1="50" y1="4" x2="50" y2="120" class="car-path" />
        <g :transform="`rotate(${(slip ?? 0).toFixed(1)} 50 62)`">
          <rect x="34" y="14" width="32" height="96" rx="12" class="car-shell" />
          <path d="M40 22 L50 14 L60 22" class="car-nose" />
          <template v-for="t in tyres" :key="t.id">
            <rect :x="t.x - 6" :y="t.y - 11" width="12" height="22" rx="3" :fill="t.color" />
            <rect :x="t.x < 50 ? t.x - 13 : t.x + 9" :y="t.y + 11 - 22 * (t.load ?? 0)" width="4" :height="22 * (t.load ?? 0)" class="car-load" />
          </template>
        </g>
      </svg>
      <p class="car-fact" :title="tr('telemetry.car.slipTitle')">{{ tr('telemetry.car.slip') }} <b>{{ slip === null ? '--' : `${slip.toFixed(1)}°` }}</b></p>
    </div>
    <div class="car-g">
      <span class="car-title">G</span>
      <svg viewBox="0 0 100 100" :aria-label="tr('telemetry.car.gAria')">
        <circle cx="50" cy="50" r="42" class="g-ring" />
        <circle cx="50" cy="50" r="28" class="g-ring" />
        <circle cx="50" cy="50" r="14" class="g-ring" />
        <line x1="8" y1="50" x2="92" y2="50" class="g-axis" /><line x1="50" y1="8" x2="50" y2="92" class="g-axis" />
        <circle v-if="gDot(refG)" :cx="gDot(refG)!.x" :cy="gDot(refG)!.y" r="4" class="g-ref" />
        <circle v-if="gDot(lapG)" :cx="gDot(lapG)!.x" :cy="gDot(lapG)!.y" r="4" class="g-lap" />
      </svg>
      <p class="car-fact">Lat <b>{{ lapG ? lapG.lat.toFixed(2) : '--' }}</b> · Long <b>{{ lapG ? lapG.long.toFixed(2) : '--' }}</b></p>
    </div>
    <p class="car-legend"><i style="background:#4dabf7" />{{ tr('telemetry.car.rolls') }} <i style="background:#3ddc5a" />{{ tr('telemetry.car.works') }} <i style="background:#ffd43b" />{{ tr('telemetry.car.limit') }} <i style="background:#ff5a6e" />{{ tr('telemetry.car.slides') }} · {{ tr('telemetry.car.bar') }}</p>
  </div>
</template>

<style scoped lang="scss">
.car { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px; border: 1px solid #ffffff1f; background: #ffffff06; }
.car-title { color: #b3b3b8; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.car-body, .car-g { display: grid; justify-items: center; gap: 4px; svg { width: 100%; max-width: 120px; } }
.car-path { stroke: #ffffff26; stroke-width: 1; stroke-dasharray: 3 3; }
.car-shell { fill: #1c1c22; stroke: #ffffff59; stroke-width: 1; }
.car-nose { fill: none; stroke: #ff0024; stroke-width: 2; }
.car-load { fill: #e6e6ea; }
.g-ring { fill: none; stroke: #ffffff1f; stroke-width: 1; }
.g-axis { stroke: #ffffff14; stroke-width: 1; }
.g-lap { fill: #38bdf8; stroke: #fff; stroke-width: 1.2; }
.g-ref { fill: #0a0a0f; stroke: #fbbf24; stroke-width: 1.5; }
.car-fact { margin: 0; color: #8a8a90; font-size: 11px; b { color: #e6e6ea; font-variant-numeric: tabular-nums; } }
.car-legend { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 0; color: #77777d; font-size: 10px;
  i { width: 8px; height: 8px; margin-left: 4px; } }
</style>
