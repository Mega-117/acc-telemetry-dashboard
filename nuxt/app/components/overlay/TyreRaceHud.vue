<script setup lang="ts">
import { computed } from 'vue'
import type { FastOverlayState, FastStateTyre } from '~/composables/useFastStatePoller'
import { tyreTemperatureColor } from '~/utils/tyreTemperaturePresentation'
import { buildBrakeAxlePresentation } from '~/utils/brakeAxlePresentation'

const props = defineProps<{ fastState: FastOverlayState }>()
const ids = ['FL', 'FR', 'RL', 'RR'] as const
const emptyTyre = (id: FastStateTyre['id']): FastStateTyre => ({
  id, wheelSlip: null, wheelSlipScaled: null, slipBand: 'white', slipState: 'ok',
  slipRatio: null, pressurePsi: null, pressureLossPsi: null, coreTempC: null,
  brakeTempC: null, brakeCompound: null, padLifePct: null, discLifePct: null,
})
const tyres = computed(() => Object.fromEntries(ids.map(id => [
  id, props.fastState.tyres.find(tyre => tyre.id === id) ?? emptyTyre(id),
])) as Record<FastStateTyre['id'], FastStateTyre>)
const brakes = computed(() => ({
  front: buildBrakeAxlePresentation(tyres.value.FL, tyres.value.FR),
  rear: buildBrakeAxlePresentation(tyres.value.RL, tyres.value.RR),
}))

function value(number: number | null, digits = 0) {
  return number === null ? '--' : number.toFixed(digits)
}

function average(id: FastStateTyre['id']) {
  const average = props.fastState.lapPressureAverage
  if (average.status !== 'available') return '--'
  const number = average.values[id]
  return number === null ? '--' : number.toFixed(1)
}

function loss(tyre: FastStateTyre) {
  return tyre.pressureLossPsi === null ? '--' : Math.max(0, tyre.pressureLossPsi).toFixed(2)
}

function slipFill(tyre: FastStateTyre) {
  if (tyre.wheelSlipScaled === null) return 0
  return Math.max(0, Math.min(6, Math.ceil(Math.abs(tyre.wheelSlipScaled) / 3)))
}

function segmentActive(tyre: FastStateTyre, index: number) {
  return index >= 6 - slipFill(tyre)
}

function tyreColor(tyre: FastStateTyre) {
  return tyreTemperatureColor(tyre.coreTempC, props.fastState.tyreCompound === 'WET' ? 'WET' : 'DRY')
}

function weatherIcon(intensity: number | null) {
  if (intensity === null) return '·'
  if (intensity <= 0) return '☀'
  if (intensity <= 2) return '☁'
  return '☂'
}

function brakeText(number: number | null, suffix: string) {
  return number === null ? '--' : `${number.toFixed(0)}${suffix}`
}
</script>

<template>
  <section class="tyre-race" aria-label="Race gomme e freni">
    <header class="tyre-race__weather">
      <div v-for="item in [
        { label: '0′', value: fastState.rainIntensity },
        { label: '10′', value: fastState.rainIntensity10Min },
        { label: '30′', value: fastState.rainIntensity30Min },
      ]" :key="item.label">
        <strong>{{ item.label }}</strong><span>{{ weatherIcon(item.value) }}</span>
      </div>
    </header>

    <div class="tyre-race__axle tyre-race__axle--front">
      <article v-for="id in ['FL', 'FR'] as const" :key="id" class="tyre-race__corner">
        <b class="tyre-race__id">{{ id }}</b>
        <strong class="tyre-race__pressure">{{ value(tyres[id].pressurePsi, 1) }}</strong>
        <span class="tyre-race__average">AVG {{ average(id) }}</span>
        <div class="tyre-race__wheel-row" :class="`tyre-race__wheel-row--${id.endsWith('L') ? 'left' : 'right'}`">
          <div class="tyre-race__slip" :class="`tyre-race__slip--${tyres[id].slipBand}`">
            <small>SLIP</small>
            <i v-for="index in 6" :key="index" :class="{ active: segmentActive(tyres[id], index - 1) }" />
          </div>
          <div class="tyre-race__tyre" :style="{ '--tyre-temp-color': tyreColor(tyres[id]) }">
            <b>{{ value(tyres[id].coreTempC) }}°</b>
          </div>
        </div>
        <span class="tyre-race__loss" :class="{ alert: (tyres[id].pressureLossPsi ?? 0) >= .05 }">LOSS {{ loss(tyres[id]) }}</span>
      </article>
    </div>

    <div class="tyre-race__brakes">
      <div v-for="axle in ['front', 'rear'] as const" :key="axle">
        <strong>{{ axle.toUpperCase() }}</strong>
        <b :style="{ color: brakes[axle].leftTemperatureColor }">{{ brakeText(brakes[axle].temperatureAverageC, '°') }}</b>
        <span>{{ brakeText(brakes[axle].padLifeAveragePct, '%') }}</span>
      </div>
    </div>

    <div class="tyre-race__compound">{{ fastState.tyreCompound ?? '--' }} {{ fastState.tyreSetAvailable ? fastState.currentTyreSet ?? '--' : '--' }}</div>

    <div class="tyre-race__axle tyre-race__axle--rear">
      <article v-for="id in ['RL', 'RR'] as const" :key="id" class="tyre-race__corner tyre-race__corner--rear">
        <b class="tyre-race__id">{{ id }}</b>
        <span class="tyre-race__loss" :class="{ alert: (tyres[id].pressureLossPsi ?? 0) >= .05 }">LOSS {{ loss(tyres[id]) }}</span>
        <div class="tyre-race__wheel-row" :class="`tyre-race__wheel-row--${id.endsWith('L') ? 'left' : 'right'}`">
          <div class="tyre-race__slip" :class="`tyre-race__slip--${tyres[id].slipBand}`">
            <small>SLIP</small>
            <i v-for="index in 6" :key="index" :class="{ active: segmentActive(tyres[id], index - 1) }" />
          </div>
          <div class="tyre-race__tyre" :style="{ '--tyre-temp-color': tyreColor(tyres[id]) }">
            <b>{{ value(tyres[id].coreTempC) }}°</b>
          </div>
        </div>
        <span class="tyre-race__average">AVG {{ average(id) }}</span>
        <strong class="tyre-race__pressure">{{ value(tyres[id].pressurePsi, 1) }}</strong>
      </article>
    </div>
  </section>
</template>

<style scoped>
.tyre-race { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; color:#fff; font-family:Inter,"Segoe UI",sans-serif; font-variant-numeric:tabular-nums; }
.tyre-race__weather { display:grid; grid-template-columns:repeat(3,1fr); flex:0 0 calc(78px * var(--hud-scale,1)); border-bottom:1px solid #555; }
.tyre-race__weather div { display:grid; place-items:center; align-content:center; }
.tyre-race__weather div+div { border-left:1px solid #333; }
.tyre-race__weather strong { font-size:max(18px,calc(25px * var(--hud-scale,1))); line-height:1; }
.tyre-race__weather span { font-size:max(20px,calc(30px * var(--hud-scale,1))); line-height:1.1; }
.tyre-race__axle { display:grid; grid-template-columns:1fr 1fr; flex:1 1 0; min-height:0; padding:calc(7px * var(--hud-scale,1)) calc(10px * var(--hud-scale,1)); gap:calc(18px * var(--hud-scale,1)); box-sizing:border-box; }
.tyre-race__axle--front { border-bottom:1px solid #444; }
.tyre-race__axle--rear { border-top:1px solid #444; }
.tyre-race__corner { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; }
.tyre-race__id { color:#aaa; font-size:max(14px,calc(18px * var(--hud-scale,1))); line-height:1; }
.tyre-race__pressure { font-size:max(34px,calc(48px * var(--hud-scale,1))); font-weight:950; letter-spacing:-.04em; line-height:.98; }
.tyre-race__average,.tyre-race__loss { font-size:max(14px,calc(18px * var(--hud-scale,1))); font-weight:900; line-height:1.1; white-space:nowrap; }
.tyre-race__average { color:#ccc; }
.tyre-race__loss { color:#aaa; }
.tyre-race__loss.alert { color:#ff3b30; text-shadow:0 0 8px rgba(255,59,48,.7); }
.tyre-race__wheel-row { display:flex; align-items:flex-end; justify-content:center; gap:calc(6px * var(--hud-scale,1)); margin:calc(5px * var(--hud-scale,1)) 0; }
.tyre-race__wheel-row--right { flex-direction:row-reverse; }
.tyre-race__tyre { display:grid; place-items:center; width:calc(82px * var(--hud-scale,1)); height:calc(106px * var(--hud-scale,1)); border:calc(3px * var(--hud-scale,1)) solid #f5f5f5; border-radius:calc(22px * var(--hud-scale,1)); background:color-mix(in srgb,var(--tyre-temp-color) 26%,#050505); box-sizing:border-box; }
.tyre-race__tyre b { font-size:max(25px,calc(34px * var(--hud-scale,1))); text-shadow:0 2px 4px #000; }
.tyre-race__slip { display:grid; grid-template-rows:auto repeat(6,1fr); gap:calc(3px * var(--hud-scale,1)); width:calc(28px * var(--hud-scale,1)); height:calc(113px * var(--hud-scale,1)); }
.tyre-race__slip small { font-size:max(11px,calc(12px * var(--hud-scale,1))); font-weight:950; text-align:center; writing-mode:vertical-rl; position:absolute; opacity:0; }
.tyre-race__slip i { display:block; min-height:4px; border-radius:2px; background:#333; }
.tyre-race__slip i.active { background:#19bdf2; box-shadow:0 0 5px rgba(25,189,242,.5); }
.tyre-race__slip--yellow i.active { background:#fff200; }.tyre-race__slip--orange i.active { background:#ff9d00; }.tyre-race__slip--red i.active { background:#ff2b2b; }
.tyre-race__brakes { display:grid; grid-template-columns:1fr 1fr; flex:0 0 calc(82px * var(--hud-scale,1)); align-items:center; border-bottom:1px solid #444; }
.tyre-race__brakes div { display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:calc(10px * var(--hud-scale,1)); padding:0 calc(12px * var(--hud-scale,1)); }
.tyre-race__brakes div+div { border-left:1px solid #444; }
.tyre-race__brakes strong,.tyre-race__brakes span { font-size:max(14px,calc(18px * var(--hud-scale,1))); }.tyre-race__brakes b { font-size:max(19px,calc(25px * var(--hud-scale,1))); }
.tyre-race__compound { display:grid; place-items:center; flex:0 0 calc(42px * var(--hud-scale,1)); border-bottom:1px solid #444; font-size:max(21px,calc(28px * var(--hud-scale,1))); font-weight:950; }
@media (max-width: 280px) {
  .tyre-race__weather { flex-basis:36px; }
  .tyre-race__weather strong { font-size:18px; }
  .tyre-race__weather span { font-size:20px; line-height:1; }
  .tyre-race__axle { padding:2px 4px; gap:4px; }
  .tyre-race__axle--rear { padding-bottom:6px; }
  .tyre-race__id { font-size:14px; line-height:1; }
  .tyre-race__pressure { font-size:34px; line-height:.92; }
  .tyre-race__average,.tyre-race__loss { font-size:14px; line-height:1; }
  .tyre-race__wheel-row { gap:2px; margin:1px 0; }
  .tyre-race__tyre { width:46px; height:40px; border-width:2px; border-radius:12px; }
  .tyre-race__tyre b { font-size:25px; }
  .tyre-race__slip { width:14px; height:42px; gap:1px; }
  .tyre-race__brakes { grid-template-columns:1fr; flex-basis:44px; }
  .tyre-race__brakes div { grid-template-columns:44px 1fr 35px; gap:4px; padding:0 8px; line-height:1; }
  .tyre-race__brakes div+div { border-top:1px solid #333; border-left:0; }
  .tyre-race__brakes strong,.tyre-race__brakes span { font-size:14px; }
  .tyre-race__brakes b { font-size:19px; text-align:center; }
  .tyre-race__compound { flex-basis:24px; font-size:21px; }
}
@media (prefers-reduced-motion: reduce) { * { transition:none!important; } }
</style>
