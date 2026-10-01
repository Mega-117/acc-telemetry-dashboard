<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FastOverlayState, FastStateTyre } from '~/composables/useFastStatePoller'
import { tyreTemperatureColor } from '~/utils/tyreTemperaturePresentation'
import { brakeTemperatureColor } from '~/utils/brakeTemperaturePresentation'
import { raceSlip, racePressureHeight, raceNumber, raceDamageTime, racePressureFlash } from '~/utils/raceTyrePresentation'
import RaceWeatherHud from './RaceWeatherHud.vue'
import RaceVehicleStatus from './RaceVehicleStatus.vue'

const props = defineProps<{ fastState: FastOverlayState }>()
const ids = ['FL', 'FR', 'RL', 'RR'] as const
const expiredFlashKeys = ref<Record<string, string>>({})
const hasPhysics = computed(() => props.fastState.isFresh && props.fastState.isLive && props.fastState.dataSource !== 'focused')
const tyres = computed(() => ids.map((id, index) => {
  const tyre = (hasPhysics.value ? props.fastState.tyres.find(item => item.id === id) : null) ?? {
    id, wheelSlip: null, wheelSlipScaled: null, slipBand: 'white', slipState: 'ok', slipRatio: null,
    pressurePsi: null, pressureLossPsi: null, coreTempC: null, brakeTempC: null,
    brakeCompound: null, padLifePct: null, discLifePct: null,
  } as FastStateTyre
  return {
    ...tyre, x: index % 2 === 0 ? 10 : 106, y: index < 2 ? 38 : 154,
    rear: index > 1, right: index % 2 === 1,
    color: tyreTemperatureColor(tyre.coreTempC, props.fastState.tyreCompound === 'WET' ? 'WET' : 'DRY'),
    slip: raceSlip(tyre.wheelSlipRaw ?? tyre.wheelSlip),
    height: racePressureHeight(tyre.pressurePsi, props.fastState.tyreCompound),
    average: hasPhysics.value && props.fastState.lapPressureAverage.status === 'available'
      ? props.fastState.lapPressureAverage.values[id] : null,
    flash: hasPhysics.value ? racePressureFlash(tyre, Date.now()) : null,
  }
}))
const axles = computed(() => [0, 2].map(index => ({
  left: tyres.value[index]!, right: tyres.value[index + 1]!,
  y: index === 0 ? 56 : 154, rear: index > 0,
})))
const unavailable = computed(() => !hasPhysics.value)
function brakeColor(tyre: FastStateTyre) {
  return brakeTemperatureColor(tyre.brakeTempC, tyre.id, tyre.brakeCompound)
}
</script>

<template>
  <section class="tyre-race" aria-label="Race gomme e freni">
    <RaceWeatherHud :fast-state="fastState" />

    <svg class="tyre-race__matrix" viewBox="0 0 166 241" aria-label="Stato quattro pneumatici" role="img">
      <rect width="166" height="241" rx="8" fill="#000" fill-opacity=".65" />
      <rect v-if="fastState.flag === 2" x="1" y="1" width="164" height="239" rx="8" fill="none" stroke="#ffd400" stroke-width="1.5" />
      <g v-for="tyre in tyres" :key="tyre.id" class="tyre-race__corner" :class="[`tyre-race__corner--${tyre.id.toLowerCase()}`, { 'tyre-race__corner--rear': tyre.rear }]" :data-wheel="tyre.id" :aria-label="tyre.id">
        <text class="tyre-race__primary" :x="tyre.x + 25" :y="tyre.rear ? 225 : 17">{{ raceNumber(tyre.pressurePsi, 1) }}</text>
        <text class="tyre-race__average" aria-label="Pressione media dell'ultimo giro concluso" :x="tyre.x + 25" :y="tyre.rear ? 239 : 31">AVG {{ raceNumber(tyre.average, 1) }}</text>
        <g :transform="`translate(${tyre.x} ${tyre.y})`" class="tyre-race__tyre">
          <rect width="50" height="56" rx="8" :fill="tyre.color" />
          <rect x="16" width="18" height="56" fill="#000" />
          <rect x="18" width="14" :y="tyre.rear ? 0 : 56 - tyre.height" :height="tyre.height" :fill="tyre.color" class="tyre-race__pressure-shape" />
          <svg :x="tyre.right ? 34 : 0" width="16" height="56" viewBox="0 0 16 56" overflow="hidden" :style="{ borderRadius: tyre.right ? '0 8px 8px 0' : '8px 0 0 8px' }">
            <path :d="tyre.right ? 'M0 0H8Q16 0 16 8V48Q16 56 8 56H0Z' : 'M16 0H8Q0 0 0 8V48Q0 56 8 56H16Z'" fill="#808080" />
            <rect :y="(56 - tyre.slip.height) / 2" width="16" :height="tyre.slip.height" :fill="tyre.slip.color" class="tyre-race__slip" />
          </svg>
          <text x="27" y="35" class="tyre-race__temperature">{{ raceNumber(tyre.coreTempC) }}&#176;</text>
          <rect v-if="tyre.flash && expiredFlashKeys[tyre.id] !== tyre.flash.key" :key="tyre.flash.key" @animationend="expiredFlashKeys[tyre.id] = tyre.flash.key" width="50" height="56" rx="8" class="tyre-race__pressure-flash" :style="{ animationDelay: tyre.flash.delay }" />
        </g>
        <text :x="tyre.x + 25" :y="tyre.rear ? 147 : 112" class="tyre-race__loss">{{ raceNumber(tyre.racePressure?.variationPsi, 2) }}</text>
      </g>
      <g v-for="axle in axles" :key="axle.left.id" class="tyre-race__brake" :class="`tyre-race__brake--${axle.rear ? 'rear' : 'front'}`">
        <rect x="65" :y="axle.y" width="15" height="38" rx="4" :fill="brakeColor(axle.left)" />
        <rect x="85" :y="axle.y" width="15" height="38" rx="4" :fill="brakeColor(axle.right)" />
        <text x="83" :y="axle.y + 25" class="tyre-race__temperature">{{ raceNumber(axle.left.brakeTempC) }}&#176;</text>
        <text x="83" :y="axle.rear ? axle.y + 52 : axle.y - 7">{{ raceNumber(axle.left.padLifePct) }}%</text>
      </g>
      <text x="83" y="129" class="tyre-race__compound"><tspan class="tyre-race__damage-time">{{ raceDamageTime(hasPhysics ? fastState.damage?.totalRepairTimeMs : null) }}</tspan><tspan dx="5">{{ hasPhysics ? fastState.tyreCompound ?? '--' : '--' }} {{ hasPhysics && fastState.tyreSetAvailable ? fastState.currentTyreSet ?? '--' : '--' }}</tspan></text>
      <RaceVehicleStatus :fast-state="fastState" :has-physics="hasPhysics" />
      <g v-if="unavailable" class="tyre-race__unavailable">
        <rect width="166" height="241" rx="8" fill="black" fill-opacity=".7" />
        <text x="83" y="114">{{ fastState.dataSource === 'focused' ? 'DATA N/A' : 'NO DATA' }}</text>
      </g>
    </svg>
  </section>
</template>

<style scoped>
.tyre-race { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; color:#fff; font-family:"Segoe UI",sans-serif; font-variant-numeric:tabular-nums; }
.tyre-race__matrix { display:block; width:100%; flex:1; min-height:0; overflow:visible; font-family:"Segoe UI",sans-serif; font-size:18px; font-weight:700; fill:#fff; text-anchor:middle; }
.tyre-race__loss { fill:#ffa500; font-size:14px; }
.tyre-race__average { fill:#cbd5e1; font-size:11.5px; }
.tyre-race__temperature { paint-order:stroke; stroke:#000; stroke-width:.8px; stroke-opacity:.65; }
.tyre-race__compound { font-size:16px; }
.tyre-race__pressure-flash { fill:red; opacity:0; animation:race-pressure-flash 2s linear both; }
@keyframes race-pressure-flash { 0%,100% { opacity:0; } 50% { opacity:.9; } }
@keyframes race-pressure-still { 0%,99% { opacity:.45; } 100% { opacity:0; } }
@media (prefers-reduced-motion:reduce) { .tyre-race__pressure-flash { animation-name:race-pressure-still; } }
</style>
