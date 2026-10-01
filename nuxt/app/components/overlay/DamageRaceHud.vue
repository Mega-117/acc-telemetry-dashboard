<script setup lang="ts">
import { computed } from 'vue'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import RaceWeatherHud from './RaceWeatherHud.vue'
import RaceVehicleStatus from './RaceVehicleStatus.vue'
import { raceDamagePaths } from '~/utils/raceDamageGeometry'
import { raceDamageColor, raceDamageZoneTime } from '~/utils/raceDamagePresentation'
import { raceNumber, raceDamageTime } from '~/utils/raceTyrePresentation'

const props = defineProps<{ fastState: FastOverlayState; flash?: boolean }>()
const available = computed(() => props.fastState.isFresh && props.fastState.isLive && props.fastState.dataSource !== 'focused')
const damage = computed(() => available.value ? props.fastState.damage : null)
const zones = [
  { id: 'front', x: 74, y: 24, anchor: 'middle', digits: 2 },
  { id: 'left', x: 23.68, y: 102.2, anchor: 'start', digits: 1 },
  { id: 'right', x: 124.32, y: 102.2, anchor: 'end', digits: 1 },
  { id: 'rear', x: 74, y: 192.4, anchor: 'middle', digits: 2 },
] as const
const corners = [
  { id: 'FL', x: 9.68, y: 50 }, { id: 'FR', x: 138.32, y: 50 },
  { id: 'RL', x: 9.68, y: 144 }, { id: 'RR', x: 138.32, y: 144 },
] as const
// Repair times remain canonical; only presentation consumes these measurements.
const suspensionSum = computed(() => damage.value ? corners.reduce((sum, c) => sum + (damage.value!.suspension[c.id].percentage ?? 0) / 100, 0) : 0)
const totalSeverity = computed(() => (damage.value?.body.rawValue ?? 0) + suspensionSum.value)
const suspensionSeverity = computed(() => suspensionSum.value * 30 * 2.9)
function pathValue(path: typeof raceDamagePaths[number]) {
  return path.suspension ? damage.value?.suspension[path.id as 'FL'].percentage : damage.value?.body[path.id as 'front'].rawValue
}
function percent(value: number | null | undefined) { return value == null ? '--' : `${raceNumber(value)}%` }
</script>

<template>
  <section class="damage-race" aria-label="Danni vettura">
    <RaceWeatherHud :fast-state="fastState" />
    <svg class="damage-race__matrix" viewBox="0 0 166 241" role="img" aria-label="Sagoma danni vettura vista dall'alto">
      <rect width="166" height="241" rx="8" fill="#000" fill-opacity=".65" />
      <rect v-if="fastState.flag === 2" x="1" y="1" width="164" height="239" rx="8" fill="none" stroke="#ffd400" stroke-width="1.5" />
      <!-- Reference car 148x208, with its 5px vertical margin. -->
      <g transform="translate(9 16.5)">
        <path v-for="path in raceDamagePaths" :key="path.id" :data-zone="path.id" :d="path.d"
          :transform="`translate(${path.x} ${path.y}) scale(${path.mirror ? -1 : 1} 1)`"
          :fill="raceDamageColor(pathValue(path), path.suspension ? 100 : 150)"
          :stroke="raceDamageColor(pathValue(path), path.suspension ? 100 : 150, false, true)" stroke-width="2" />
        <g v-for="zone in zones" :key="zone.id" class="damage-race__body" :class="`damage-race__body--${zone.id}`" :text-anchor="zone.anchor">
          <text class="damage-race__percentage" :x="zone.x" :y="zone.y">{{ percent(damage?.body[zone.id].percentage) }}</text>
          <text class="damage-race__time" :x="zone.x" :y="zone.y + (zone.id === 'rear' ? -15 : 13)">{{ raceDamageZoneTime(damage?.body[zone.id].repairTimeMs, zone.digits) }}</text>
        </g>
        <g class="damage-race__summary damage-race__summary--susp">
          <text x="74" y="61.6" class="damage-race__label">Suspension</text>
          <text x="74" y="77.6" :fill="raceDamageColor(suspensionSeverity, 100, true)">{{ raceDamageTime(damage?.suspension.repairTimeMs) }}</text>
        </g>
        <g class="damage-race__summary damage-race__summary--total">
          <text x="74" y="138.8" class="damage-race__label">Total</text>
          <text x="74" y="154.8" class="damage-race__total-time" :fill="raceDamageColor(totalSeverity, 150, true)">{{ raceDamageTime(damage?.totalRepairTimeMs) }}</text>
        </g>
        <template v-for="corner in corners" :key="corner.id">
          <g v-if="(damage?.suspension[corner.id].percentage ?? 0) > 0" class="damage-race__susp" :aria-label="corner.id" :transform="`translate(${corner.x} ${corner.y})`">
            <rect x="-14" width="28" height="14" rx="2" fill="#000" fill-opacity=".6" />
            <text y="10.5" font-size="11">{{ percent(damage?.suspension[corner.id].percentage) }}</text>
          </g>
        </template>
      </g>
      <rect v-if="flash" :key="fastState.damage?.eventSeq" class="damage-race__flash" width="166" height="241" rx="8" />
      <RaceVehicleStatus :fast-state="fastState" :has-physics="available" />
      <g v-if="!available" class="damage-race__unavailable">
        <rect width="166" height="241" rx="8" fill="#000" fill-opacity=".7" />
        <text x="83" y="114">{{ fastState.dataSource === 'focused' ? 'DATA N/A' : 'NO DATA' }}</text>
      </g>
    </svg>
  </section>
</template>

<style scoped>
.damage-race { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; color:#fff; font-family:"Segoe UI",sans-serif; font-variant-numeric:tabular-nums; }
.damage-race__matrix { display:block; width:100%; flex:1; min-height:0; font-family:"Segoe UI",sans-serif; font-size:12px; font-weight:700; fill:#fff; text-anchor:middle; }
.damage-race__time { font-size:10px; }
.damage-race__label { font-size:14px; }
.damage-race__flash { fill:red; opacity:0; animation:race-damage-flash .2s linear both; pointer-events:none; }
@keyframes race-damage-flash { 0%,100% { opacity:0; } 50% { opacity:.7; } }
@media (prefers-reduced-motion:reduce) { .damage-race__flash { animation:none; opacity:.15; } }
</style>
