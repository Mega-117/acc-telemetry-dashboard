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

    <div class="tyre-race__matrix">
      <article
        v-for="id in ids"
        :key="id"
        class="tyre-race__corner"
        :class="[
          `tyre-race__corner--${id.toLowerCase()}`,
          { 'tyre-race__corner--rear': id.startsWith('R') },
        ]"
      >
        <div class="tyre-race__primary">
          <b>{{ id }}</b>
          <strong>{{ value(tyres[id].pressurePsi, 1) }}</strong>
        </div>
        <span class="tyre-race__average">AVG {{ average(id) }}</span>
        <div
          class="tyre-race__wheel-row"
          :class="`tyre-race__wheel-row--${id.endsWith('L') ? 'left' : 'right'}`"
        >
          <div class="tyre-race__slip" :class="`tyre-race__slip--${tyres[id].slipBand}`">
            <small>SLIP</small>
            <i v-for="index in 6" :key="index" :class="{ active: segmentActive(tyres[id], index - 1) }" />
          </div>
          <div class="tyre-race__tyre" :style="{ '--tyre-temp-color': tyreColor(tyres[id]) }">
            <b>{{ value(tyres[id].coreTempC) }}°</b>
          </div>
        </div>
        <span class="tyre-race__loss" :class="{ alert: (tyres[id].pressureLossPsi ?? 0) >= .05 }">
          LOSS {{ loss(tyres[id]) }}
        </span>
      </article>

      <div v-for="axle in ['front', 'rear'] as const" :key="axle" class="tyre-race__brake" :class="`tyre-race__brake--${axle}`">
        <div class="tyre-race__brake-bars">
          <i :style="{ background: brakes[axle].leftTemperatureColor }" />
          <i :style="{ background: brakes[axle].rightTemperatureColor }" />
        </div>
        <span class="tyre-race__brake-wear">{{ brakeText(brakes[axle].padLifeAveragePct, '%') }}</span>
        <strong :style="{ color: brakes[axle].temperatureAverageColor }">
          {{ brakeText(brakes[axle].temperatureAverageC, '°') }}
        </strong>
      </div>

      <div class="tyre-race__compound">
        <span>{{ fastState.tyreCompound ?? '--' }}</span>
        <b>{{ fastState.tyreSetAvailable ? fastState.currentTyreSet ?? '--' : '--' }}</b>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tyre-race {
  display:flex; flex:1; flex-direction:column; min-width:0; min-height:0;
  color:#f7f8fa; font-family:"Bahnschrift Condensed","Arial Narrow","Segoe UI",sans-serif;
  font-variant-numeric:tabular-nums; font-stretch:condensed;
}
.tyre-race__weather {
  display:grid; grid-template-columns:repeat(3,1fr); flex:0 0 calc(78px * var(--hud-scale,1));
  border-bottom:1px solid #45484e; background:#080a0e;
}
.tyre-race__weather div { display:grid; place-items:center; align-content:center; }
.tyre-race__weather div+div { border-left:1px solid #303238; }
.tyre-race__weather strong { font-size:max(18px,calc(25px * var(--hud-scale,1))); line-height:1; }
.tyre-race__weather span { min-height:1em; font-size:max(21px,calc(30px * var(--hud-scale,1))); line-height:1.05; }
.tyre-race__matrix {
  display:grid; grid-template-columns:minmax(0,1fr) calc(94px * var(--hud-scale,1)) minmax(0,1fr);
  grid-template-rows:minmax(0,1fr) calc(48px * var(--hud-scale,1)) minmax(0,1fr);
  grid-template-areas:"fl bf fr" ". compound ." "rl br rr";
  flex:1; min-height:0; padding:calc(9px * var(--hud-scale,1)); box-sizing:border-box;
}
.tyre-race__corner { display:grid; grid-template-rows:auto auto minmax(0,1fr) auto; grid-template-areas:"primary" "average" "wheel" "loss"; align-items:center; justify-items:center; min-width:0; min-height:0; padding:calc(4px * var(--hud-scale,1)); }
.tyre-race__corner--fl{grid-area:fl}.tyre-race__corner--fr{grid-area:fr}.tyre-race__corner--rl{grid-area:rl}.tyre-race__corner--rr{grid-area:rr}
.tyre-race__corner--rear { grid-template-rows:auto minmax(0,1fr) auto auto; grid-template-areas:"loss" "wheel" "average" "primary"; }
.tyre-race__primary { grid-area:primary; display:flex; align-items:baseline; justify-content:center; gap:calc(7px * var(--hud-scale,1)); min-width:0; }
.tyre-race__primary b { color:#9ca0a8; font-size:max(15px,calc(19px * var(--hud-scale,1))); line-height:1; }
.tyre-race__primary strong { font-size:max(35px,calc(49px * var(--hud-scale,1))); font-weight:900; letter-spacing:-.035em; line-height:.96; }
.tyre-race__average,.tyre-race__loss { font-size:max(15px,calc(19px * var(--hud-scale,1))); font-weight:800; line-height:1.05; white-space:nowrap; }
.tyre-race__average { grid-area:average; color:#c6c8cd; }
.tyre-race__loss { grid-area:loss; color:#ffab00; }
.tyre-race__loss.alert { color:#ff3131; text-shadow:0 0 calc(8px * var(--hud-scale,1)) rgba(255,49,49,.75); }
.tyre-race__wheel-row { grid-area:wheel; display:flex; align-items:center; justify-content:center; gap:calc(5px * var(--hud-scale,1)); min-height:0; }
.tyre-race__wheel-row--right { flex-direction:row-reverse; }
.tyre-race__tyre {
  --tyre-temp-color:#1769ff; position:relative; display:grid; place-items:center;
  width:calc(72px * var(--hud-scale,1)); height:calc(104px * var(--hud-scale,1));
  border-radius:calc(11px * var(--hud-scale,1)); background:color-mix(in srgb,var(--tyre-temp-color) 82%,#030405);
  box-shadow:inset 0 0 0 calc(2px * var(--hud-scale,1)) rgba(255,255,255,.16); overflow:hidden;
}
.tyre-race__tyre::before,.tyre-race__tyre::after { content:""; position:absolute; top:0; bottom:0; width:22%; background:color-mix(in srgb,var(--tyre-temp-color) 48%,#0a0b0d); }
.tyre-race__tyre::before{left:0}.tyre-race__tyre::after{right:0}
.tyre-race__tyre b { position:relative; z-index:1; font-size:max(26px,calc(35px * var(--hud-scale,1))); font-weight:900; text-shadow:0 2px 3px #000; }
.tyre-race__slip { display:grid; grid-template-rows:auto repeat(6,1fr); gap:calc(3px * var(--hud-scale,1)); width:calc(25px * var(--hud-scale,1)); height:calc(110px * var(--hud-scale,1)); }
.tyre-race__slip small { color:#a9abb1; font-size:max(11px,calc(12px * var(--hud-scale,1))); font-weight:900; line-height:1; text-align:center; }
.tyre-race__slip i { display:block; min-height:4px; border-radius:2px; background:#303238; }
.tyre-race__slip i.active { background:#19bdf2; box-shadow:0 0 5px rgba(25,189,242,.5); }
.tyre-race__slip--yellow i.active{background:#fff200}.tyre-race__slip--orange i.active{background:#ff9d00}.tyre-race__slip--red i.active{background:#ff2b2b}
.tyre-race__brake { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:0; }
.tyre-race__brake--front{grid-area:bf}.tyre-race__brake--rear{grid-area:br}
.tyre-race__brake-bars { display:flex; gap:calc(5px * var(--hud-scale,1)); height:calc(47px * var(--hud-scale,1)); }
.tyre-race__brake-bars i { width:calc(19px * var(--hud-scale,1)); border-radius:calc(5px * var(--hud-scale,1)); box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }
.tyre-race__brake strong { font-size:max(20px,calc(27px * var(--hud-scale,1))); font-weight:900; line-height:1; text-shadow:0 1px 2px #000; }
.tyre-race__brake-wear { color:#f5f6f7; font-size:max(17px,calc(21px * var(--hud-scale,1))); font-weight:900; line-height:1; }
.tyre-race__brake--front .tyre-race__brake-wear { order:-1; margin-bottom:calc(4px * var(--hud-scale,1)); }
.tyre-race__brake--rear .tyre-race__brake-wear { order:3; margin-top:calc(4px * var(--hud-scale,1)); }
.tyre-race__compound { grid-area:compound; display:flex; align-items:center; justify-content:center; gap:calc(7px * var(--hud-scale,1)); color:#fff; font-size:max(22px,calc(29px * var(--hud-scale,1))); font-weight:900; white-space:nowrap; }
.tyre-race__compound::before,.tyre-race__compound::after { content:""; flex:1; height:1px; background:#74777e; }
@media (max-width:280px) {
  .tyre-race__weather{flex-basis:38px}.tyre-race__weather strong{font-size:18px}.tyre-race__weather span{font-size:21px}
  .tyre-race__matrix{grid-template-columns:minmax(0,1fr) 50px minmax(0,1fr);grid-template-rows:minmax(0,1fr) 24px minmax(0,1fr);padding:2px}
  .tyre-race__corner{padding:1px}.tyre-race__primary{gap:3px}.tyre-race__primary b{font-size:15px}.tyre-race__primary strong{font-size:35px}
  .tyre-race__average,.tyre-race__loss{font-size:15px}.tyre-race__wheel-row{gap:2px}.tyre-race__tyre{width:48px;height:48px;border-radius:7px}.tyre-race__tyre b{font-size:26px}
  .tyre-race__slip{width:15px;height:58px;gap:1px}.tyre-race__slip small{font-size:11px}.tyre-race__brake-bars{height:29px;gap:2px}.tyre-race__brake-bars i{width:11px;border-radius:3px}
  .tyre-race__brake strong{font-size:20px}.tyre-race__brake-wear{font-size:17px}.tyre-race__compound{font-size:22px;gap:3px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
