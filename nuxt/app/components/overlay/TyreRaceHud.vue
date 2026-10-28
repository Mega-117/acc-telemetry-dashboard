<script setup lang="ts">
import { useI18n } from '~/i18n'
import { hudSourcePolicy } from '~/services/sim/hudSourceAdapter'

import { computed, ref } from 'vue'
import type { FastOverlayState, FastStateTyre } from '~/composables/useFastStatePoller'
import { tyreTemperatureColor, temperatureTargetColor } from '~/utils/tyreTemperaturePresentation'
import { brakeTemperatureColor } from '~/utils/brakeTemperaturePresentation'
import { raceSlip, raceNumber, racePressureFlash, raceTyreCorner, raceAxleBrake, raceAxleCenterY, RACE_TYRE_GEOMETRY as G, type RaceTyreValueKind } from '~/utils/raceTyrePresentation'
import { raceDamageSummary, raceDamageZoneTime } from '~/utils/raceDamagePresentation'
import RaceWeatherHud from './RaceWeatherHud.vue'
import RaceVehicleStatus from './RaceVehicleStatus.vue'

const props = defineProps<{ fastState: FastOverlayState }>()
const ids = ['FL', 'FR', 'RL', 'RR'] as const
const expiredFlashKeys = ref<Record<string, string>>({})
const hasPhysics = computed(() => props.fastState.isFresh && props.fastState.isLive && props.fastState.dataSource !== 'focused')
const hasCompoundTyrePolicy = computed(() => hudSourcePolicy(props.fastState).compoundTyreBands)
// HUD style v2 (27/10, third round 28/10): four tyres placed like a car; outside → in:
// slip bar, tyre (core temperature), brake; one averaged brake reading per axle in the middle.
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
// Like ACC Drive: one brake temperature and pad wear per axle, averaged over its two wheels;
// each brake rectangle keeps its own colour.
const axles = computed(() => [false, true].map(rear => ({
  id: rear ? 'rear' : 'front',
  centerY: raceAxleCenterY(rear),
  ...raceAxleBrake(tyres.value.filter(tyre => tyre.rear === rear)),
})))
const unavailable = computed(() => !hasPhysics.value)
const compound = computed(() => hasPhysics.value ? props.fastState.tyreCompound ?? '--' : '--')
const tyreSet = computed(() => hasPhysics.value && props.fastState.tyreSetAvailable ? props.fastState.currentTyreSet ?? '--' : '--')
// Damage now lives in the middle line: total repair time, only while the car is damaged.
const damageTime = computed(() => {
  const damage = hasPhysics.value ? raceDamageSummary(props.fastState.damage) : null
  return damage ? raceDamageZoneTime(damage.totalMs, 1) : null
})
const statusTop = (rear: boolean) => raceAxleCenterY(rear) - G.statusHeight / 2
const AVERAGE_LABEL = "Pressione media dell'ultimo giro concluso"
function valueText(tyre: typeof tyres.value[number], kind: RaceTyreValueKind) {
  if (kind === 'primary') return raceNumber(tyre.pressurePsi, 1)
  if (kind === 'average') return raceNumber(tyre.average, 1)
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

    <svg class="tyre-race__matrix" :viewBox="`0 0 ${G.width} ${G.height}`" aria-label="Stato quattro pneumatici" role="img">
      <!-- No background rect of its own (owner 28/10): the square outer panel is the only background
           layer, so "Trasparenza sfondo" reaches it while every value and rectangle stays opaque. -->
      <g v-for="tyre in tyres" :key="tyre.id" class="tyre-race__corner" :class="[`tyre-race__corner--${tyre.id.toLowerCase()}`, { 'tyre-race__corner--rear': tyre.rear }]" :data-wheel="tyre.id" :aria-label="tyre.id">
        <!-- Values centred on the tyre: above the front ones (pressure, AVG, loss), below the rear ones (reverse). -->
        <g class="tyre-race__values" text-anchor="middle">
          <text v-for="line in tyre.valueLines" :key="line.kind" :class="`tyre-race__${line.kind}`" :x="tyre.valuesX" :y="line.y"
            :aria-label="line.kind === 'average' ? AVERAGE_LABEL : undefined"><tspan v-if="line.kind === 'average'" class="tyre-race__average-label">AVG </tspan>{{ valueText(tyre, line.kind) }}</text>
        </g>
        <rect class="tyre-race__slip-track" :x="tyre.slipX" :y="tyre.top" :width="G.slipWidth" :height="G.tyreHeight" fill="#3a3d45" />
        <rect class="tyre-race__slip" :x="tyre.slipX" :y="tyre.centerY - tyre.slip.height / 2" :width="G.slipWidth" :height="tyre.slip.height" :fill="tyre.slip.color" />
        <g class="tyre-race__tyre">
          <rect :x="tyre.tyreX" :y="tyre.top" :width="G.tyreWidth" :height="G.tyreHeight" :rx="G.tyreRadius" :fill="tyre.color" stroke="#000" stroke-opacity=".4" stroke-width=".5" />
          <text :x="tyre.tyreX + G.tyreWidth / 2" :y="tyre.centerY + 4.5" class="tyre-race__temperature">{{ raceNumber(tyre.coreTempC) }}&#176;</text>
          <rect v-if="tyre.flash && expiredFlashKeys[tyre.id] !== tyre.flash.key" :key="tyre.flash.key" @animationend="expiredFlashKeys[tyre.id] = tyre.flash.key" :x="tyre.tyreX" :y="tyre.top" :width="G.tyreWidth" :height="G.tyreHeight" :rx="G.tyreRadius" class="tyre-race__pressure-flash" :style="{ animationDelay: tyre.flash.delay }" />
        </g>
        <rect class="tyre-race__brake" :class="`tyre-race__brake--${tyre.rear ? 'rear' : 'front'}`" :x="tyre.brakeX" :y="tyre.centerY - G.brakeHeight / 2" :width="G.brakeWidth" :height="G.brakeHeight" :rx="G.brakeRadius" :fill="tyre.brakeColor" stroke="#000" stroke-opacity=".4" stroke-width=".5" />
      </g>
      <!-- One reading per axle on the centre line: temperature centred on the axle, pad wear right under it. -->
      <g v-for="axle in axles" :key="axle.id" class="tyre-race__axle-brake" :class="`tyre-race__axle-brake--${axle.id}`" text-anchor="middle">
        <text :x="G.centerX" :y="axle.centerY + G.axleTempDy" class="tyre-race__brake-temp">{{ raceNumber(axle.brakeTempC) }}&#176;</text>
        <text :x="G.centerX" :y="axle.centerY + G.axlePadDy" class="tyre-race__pad">{{ raceNumber(axle.padLifePct) }}%</text>
      </g>
      <g class="tyre-race__compound">
        <line x1="6" x2="160" :y1="G.midTop" :y2="G.midTop" />
        <line x1="6" x2="160" :y1="G.midBottom" :y2="G.midBottom" />
        <!-- With damage the line is longer: it is fitted to the panel width. -->
        <text :x="G.centerX" :y="G.midText" :class="{ 'tyre-race__compound--damaged': damageTime }"
          :textLength="damageTime ? 156 : undefined" :lengthAdjust="damageTime ? 'spacingAndGlyphs' : undefined">{{ compound }} · {{ t('overlays.tyreRace.set') }} {{ tyreSet }}<template v-if="damageTime"> · <tspan class="tyre-race__damage">{{ t('overlays.tyreRace.damage') }} {{ damageTime }}</tspan></template></text>
      </g>
      <RaceVehicleStatus :fast-state="fastState" :has-physics="hasPhysics" :engine-top="statusTop(false)" :limiter-top="statusTop(true)" />
      <g v-if="unavailable" class="tyre-race__unavailable">
        <rect :width="G.width" :height="G.height" fill="black" fill-opacity=".7" />
        <text :x="G.centerX" :y="G.height / 2 + 6">{{ fastState.dataSource === 'focused' ? 'DATA N/A' : 'NO DATA' }}</text>
      </g>
    </svg>
  </section>
</template>

<style scoped>
.tyre-race { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; color:#f4f4f6; font-family:var(--hud-font-label); font-variant-numeric:tabular-nums; }
.tyre-race__matrix { display:block; width:100%; flex:1; min-height:0; overflow:visible; font-family:var(--hud-font-num); font-style:italic; font-size:10px; font-weight:700; fill:#f4f4f6; text-anchor:middle; }
/* Third round 28/10: pressure 13, AVG word 11 with its number 12, loss 12, tyre temperature 13. */
.tyre-race__primary { font-size:13px; }
.tyre-race__average { fill:#c3c5cc; font-size:12px; }
.tyre-race__average-label { font-size:11px; }
.tyre-race__loss { fill:#ffa500; font-size:12px; }
.tyre-race__temperature { font-size:13px; paint-order:stroke; stroke:#000; stroke-width:1.8px; stroke-opacity:.85; stroke-linejoin:round; filter:drop-shadow(0 0 1.2px rgba(0,0,0,.9)); }
.tyre-race__brake-temp { font-size:12px; }
.tyre-race__pad { fill:#c3c5cc; font-size:12px; }
.tyre-race__compound line { stroke:#fff; stroke-opacity:.15; stroke-width:.5; }
.tyre-race__compound text { font-size:13px; letter-spacing:.06em; }
.tyre-race__compound .tyre-race__compound--damaged { letter-spacing:0; }
.tyre-race__damage { fill:#ef4444; }
.tyre-race__unavailable text { font-size:18px; }
.tyre-race__pressure-flash { fill:red; opacity:0; animation:race-pressure-flash 2s linear both; }
@keyframes race-pressure-flash { 0%,100% { opacity:0; } 50% { opacity:.9; } }
@keyframes race-pressure-still { 0%,99% { opacity:.45; } 100% { opacity:0; } }
@media (prefers-reduced-motion:reduce) { .tyre-race__pressure-flash { animation-name:race-pressure-still; } }
</style>
