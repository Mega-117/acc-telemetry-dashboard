<script setup lang="ts">
import { useI18n } from '~/i18n'
import { hudSourcePolicy } from '~/services/sim/hudSourceAdapter'

import { computed, ref } from 'vue'
import type { FastOverlayState, FastStateTyre } from '~/composables/useFastStatePoller'
import { tyreTemperatureColor, temperatureTargetColor } from '~/utils/tyreTemperaturePresentation'
import { brakeTemperatureColor } from '~/utils/brakeTemperaturePresentation'
import { raceSlip, raceNumber, raceDamageTime, racePressureFlash, raceTyreCorner, RACE_TYRE_GEOMETRY as G, type RaceTyreValueKind } from '~/utils/raceTyrePresentation'
import { raceDamageSummary } from '~/utils/raceDamagePresentation'
import RaceWeatherHud from './RaceWeatherHud.vue'
import RaceVehicleStatus from './RaceVehicleStatus.vue'

const props = defineProps<{ fastState: FastOverlayState }>()
const ids = ['FL', 'FR', 'RL', 'RR'] as const
const expiredFlashKeys = ref<Record<string, string>>({})
const hasPhysics = computed(() => props.fastState.isFresh && props.fastState.isLive && props.fastState.dataSource !== 'focused')
const hasCompoundTyrePolicy = computed(() => hudSourcePolicy(props.fastState).compoundTyreBands)
// HUD style v2 (27/10): four tyres placed like a car; outside → in: values, slip bar,
// tyre (core temperature), brake, then brake temperature and pad wear toward the centre.
const tyres = computed(() => ids.map((id, index) => {
  const tyre = (hasPhysics.value ? props.fastState.tyres.find(item => item.id === id) : null) ?? {
    id, wheelSlip: null, wheelSlipScaled: null, slipBand: 'white', slipState: 'ok', slipRatio: null,
    pressurePsi: null, pressureLossPsi: null, coreTempC: null, brakeTempC: null,
    brakeCompound: null, padLifePct: null, discLifePct: null,
  } as FastStateTyre
  const slip = hasCompoundTyrePolicy.value ? raceSlip(tyre.wheelSlipRaw ?? tyre.wheelSlip) : { height: 0, color: '#6b7280' }
  return {
    ...tyre,
    ...raceTyreCorner(index),
    color: hasCompoundTyrePolicy.value ? tyreTemperatureColor(tyre.coreTempC, props.fastState.tyreCompound === 'WET' ? 'WET' : 'DRY') : temperatureTargetColor(tyre.temperatureTargetRatio),
    brakeColor: brakeColor(tyre),
    // Same rule and colours as before: the fill grows from the middle of the bar.
    slip: { color: slip.color, height: slip.height / 56 * G.tyreHeight },
    average: hasPhysics.value && props.fastState.lapPressureAverage.status === 'available'
      ? props.fastState.lapPressureAverage.values[id] : null,
    flash: hasPhysics.value ? racePressureFlash(tyre, Date.now()) : null,
  }
}))
const unavailable = computed(() => !hasPhysics.value)
const damage = computed(() => hasPhysics.value ? raceDamageSummary(props.fastState.damage) : null)
// Without the damage section the car sits in the middle of the panel.
const offsetY = computed(() => damage.value ? G.offsetWithDamage : G.offsetWithoutDamage)
const compound = computed(() => hasPhysics.value ? props.fastState.tyreCompound ?? '--' : '--')
const tyreSet = computed(() => hasPhysics.value && props.fastState.tyreSetAvailable ? props.fastState.currentTyreSet ?? '--' : '--')
const damageItems = computed(() => damage.value ? [
  { label: t('overlays.tyreRace.body'), ms: damage.value.bodyMs },
  { label: t('overlays.tyreRace.suspension'), ms: damage.value.suspensionMs },
  { label: t('overlays.tyreRace.total'), ms: damage.value.totalMs },
] : [])
const AVERAGE_LABEL = "Pressione media dell'ultimo giro concluso"
function valueText(tyre: typeof tyres.value[number], kind: RaceTyreValueKind) {
  if (kind === 'primary') return raceNumber(tyre.pressurePsi, 1)
  if (kind === 'average') return `AVG ${raceNumber(tyre.average, 1)}`
  return raceNumber(tyre.racePressure?.variationPsi, 2)
}
function brakeColor(tyre: FastStateTyre) {
  return hasCompoundTyrePolicy.value ? brakeTemperatureColor(tyre.brakeTempC, tyre.id, tyre.brakeCompound) : temperatureTargetColor(tyre.brakeTemperatureTargetRatio)
}
const { t } = useI18n()
</script>

<template>
  <section class="tyre-race" aria-label="Race gomme e freni">
    <RaceWeatherHud :fast-state="fastState" />

    <svg class="tyre-race__matrix" viewBox="0 0 166 241" aria-label="Stato quattro pneumatici" role="img">
      <rect width="166" height="241" rx="8" fill="#0d0e12" fill-opacity=".9" />
      <rect v-if="fastState.flag === 2" x="1" y="1" width="164" height="239" rx="8" fill="none" stroke="#ffd400" stroke-width="1.5" />
      <g :transform="`translate(0 ${offsetY})`">
        <g v-for="tyre in tyres" :key="tyre.id" class="tyre-race__corner" :class="[`tyre-race__corner--${tyre.id.toLowerCase()}`, { 'tyre-race__corner--rear': tyre.rear }]" :data-wheel="tyre.id" :aria-label="tyre.id">
          <!-- Values centred on the tyre: above the front ones (pressure, AVG, loss), below the rear ones (reverse). -->
          <g class="tyre-race__values" text-anchor="middle">
            <text v-for="line in tyre.valueLines" :key="line.kind" :class="`tyre-race__${line.kind}`" :x="tyre.valuesX" :y="line.y"
              :aria-label="line.kind === 'average' ? AVERAGE_LABEL : undefined">{{ valueText(tyre, line.kind) }}</text>
          </g>
          <rect class="tyre-race__slip-track" :x="tyre.slipX" :y="tyre.top" :width="G.slipWidth" :height="G.tyreHeight" fill="#3a3d45" />
          <rect class="tyre-race__slip" :x="tyre.slipX" :y="tyre.centerY - tyre.slip.height / 2" :width="G.slipWidth" :height="tyre.slip.height" :fill="tyre.slip.color" />
          <g class="tyre-race__tyre">
            <rect :x="tyre.tyreX" :y="tyre.top" :width="G.tyreWidth" :height="G.tyreHeight" :rx="G.tyreRadius" :fill="tyre.color" stroke="#000" stroke-opacity=".4" stroke-width=".5" />
            <text :x="tyre.tyreX + G.tyreWidth / 2" :y="tyre.centerY + 3.2" class="tyre-race__temperature">{{ raceNumber(tyre.coreTempC) }}&#176;</text>
            <rect v-if="tyre.flash && expiredFlashKeys[tyre.id] !== tyre.flash.key" :key="tyre.flash.key" @animationend="expiredFlashKeys[tyre.id] = tyre.flash.key" :x="tyre.tyreX" :y="tyre.top" :width="G.tyreWidth" :height="G.tyreHeight" :rx="G.tyreRadius" class="tyre-race__pressure-flash" :style="{ animationDelay: tyre.flash.delay }" />
          </g>
          <g class="tyre-race__brake" :class="`tyre-race__brake--${tyre.rear ? 'rear' : 'front'}`">
            <rect :x="tyre.brakeX" :y="tyre.centerY - G.brakeHeight / 2" :width="G.brakeWidth" :height="G.brakeHeight" :rx="G.brakeRadius" :fill="tyre.brakeColor" stroke="#000" stroke-opacity=".4" stroke-width=".5" />
            <g :text-anchor="tyre.right ? 'end' : 'start'">
              <text :x="tyre.brakeInfoX" :y="tyre.centerY - 1" class="tyre-race__brake-temp">{{ raceNumber(tyre.brakeTempC) }}&#176;</text>
              <text :x="tyre.brakeInfoX" :y="tyre.centerY + 8.5" class="tyre-race__pad">{{ raceNumber(tyre.padLifePct) }}%</text>
            </g>
          </g>
        </g>
        <g class="tyre-race__compound">
          <line x1="6" x2="160" :y1="G.midTop" :y2="G.midTop" />
          <line x1="6" x2="160" :y1="G.midBottom" :y2="G.midBottom" />
          <text x="83" :y="G.midText">{{ compound }} · {{ t('overlays.tyreRace.set') }} {{ tyreSet }}</text>
        </g>
        <g v-if="damage" class="tyre-race__damage">
          <line x1="4" x2="162" :y1="G.damageTop" :y2="G.damageTop" />
          <text x="4" :y="G.damageTop + 10" class="tyre-race__damage-title">{{ t('overlays.tabDamage') }}</text>
          <g v-for="(item, column) in damageItems" :key="column" text-anchor="middle">
            <text :x="28 + column * 55" :y="G.damageTop + 21" class="tyre-race__damage-label">{{ item.label }}</text>
            <text :x="28 + column * 55" :y="G.damageTop + 32" class="tyre-race__damage-time">{{ raceDamageTime(item.ms) }}</text>
          </g>
        </g>
      </g>
      <RaceVehicleStatus :fast-state="fastState" :has-physics="hasPhysics" />
      <g v-if="unavailable" class="tyre-race__unavailable">
        <rect width="166" height="241" rx="8" fill="black" fill-opacity=".7" />
        <text x="83" y="114">{{ fastState.dataSource === 'focused' ? 'DATA N/A' : 'NO DATA' }}</text>
      </g>
    </svg>
  </section>
</template>

<style scoped>
.tyre-race { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; color:#f4f4f6; font-family:var(--hud-font-label); font-variant-numeric:tabular-nums; }
.tyre-race__matrix { display:block; width:100%; flex:1; min-height:0; overflow:visible; font-family:var(--hud-font-num); font-style:italic; font-size:10px; font-weight:700; fill:#f4f4f6; text-anchor:middle; }
.tyre-race__primary { font-size:12px; }
.tyre-race__average { fill:#c3c5cc; font:normal 700 8px var(--hud-font-label); letter-spacing:.02em; }
.tyre-race__loss { fill:#ffa500; font-size:8.5px; }
.tyre-race__temperature { font-size:12px; paint-order:stroke; stroke:#000; stroke-width:.8px; stroke-opacity:.65; }
.tyre-race__brake-temp { font-size:8.5px; }
.tyre-race__pad { fill:#c3c5cc; font:normal 700 7.5px var(--hud-font-label); }
.tyre-race__compound line, .tyre-race__damage line { stroke:#fff; stroke-opacity:.15; stroke-width:.5; }
.tyre-race__compound text { font-size:9px; letter-spacing:.06em; }
.tyre-race__damage-title { fill:#ef4444; font:normal 700 6.5px var(--hud-font-label); letter-spacing:.14em; text-anchor:start; text-transform:uppercase; }
.tyre-race__damage-label { fill:#c3c5cc; font:normal 700 7px var(--hud-font-label); }
.tyre-race__damage-time { font-size:9.5px; }
.tyre-race__unavailable text { font-size:18px; }
.tyre-race__pressure-flash { fill:red; opacity:0; animation:race-pressure-flash 2s linear both; }
@keyframes race-pressure-flash { 0%,100% { opacity:0; } 50% { opacity:.9; } }
@keyframes race-pressure-still { 0%,99% { opacity:.45; } 100% { opacity:0; } }
@media (prefers-reduced-motion:reduce) { .tyre-race__pressure-flash { animation-name:race-pressure-still; } }
</style>
