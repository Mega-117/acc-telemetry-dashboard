<script setup lang="ts">
import { useI18n } from '~/i18n'
import { hudSourcePolicy } from '~/services/sim/hudSourceAdapter'

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { FastOverlayState, FastStateTyre } from '~/composables/useFastStatePoller'
import { tyreTemperatureColor, tyreTemperatureOverheated, temperatureTargetColor } from '~/utils/tyreTemperaturePresentation'
import { brakeTemperatureColor } from '~/utils/brakeTemperaturePresentation'
import { raceSlipFill, raceNumber, racePressureFlash, raceAxleBrake, raceTyreValueOrder, type RaceTyreValueKind } from '~/utils/raceTyrePresentation'
import { raceDamageSummary, raceDamageZoneTime } from '~/utils/raceDamagePresentation'
import RaceWeatherHud from './RaceWeatherHud.vue'
import HudFixedDigits from './HudFixedDigits.vue'

const props = defineProps<{ fastState: FastOverlayState }>()
// The pressure warning lasts 2 s from its event. While one is shown a 250 ms clock keeps the
// computed fresh, so the warning also expires when telemetry stops sending new frames.
const clockMs = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null
function stopClock() {
  if (clockTimer) clearInterval(clockTimer)
  clockTimer = null
}
const ids = ['FL', 'FR', 'RL', 'RR'] as const
const hasPhysics = computed(() => props.fastState.isFresh && props.fastState.isLive && props.fastState.dataSource !== 'focused')
const hasCompoundTyrePolicy = computed(() => hudSourcePolicy(props.fastState).compoundTyreBands)
const compoundKind = computed(() => props.fastState.tyreCompound === 'WET' ? 'WET' : 'DRY')
// PIP-671 (approved draft "Gomme", 30/10): four wheels placed like a car. Each wheel: its readings
// (above the front wheels, below the rear ones), then slip bar, tyre with its core temperature and
// brake, mirrored left/right; one brake reading per axle in the middle.
const tyres = computed(() => ids.map((id, index) => {
  const tyre = (hasPhysics.value ? props.fastState.tyres.find(item => item.id === id) : null) ?? {
    id, wheelSlip: null, wheelSlipScaled: null, slipBand: 'white', slipState: 'ok', slipRatio: null,
    pressurePsi: null, pressureLossPsi: null, coreTempC: null, brakeTempC: null,
    brakeCompound: null, padLifePct: null, discLifePct: null,
  } as FastStateTyre
  const rear = index > 1
  const slip = hasCompoundTyrePolicy.value ? raceSlipFill(tyre.wheelSlipRaw ?? tyre.wheelSlip) : { ratio: 0, color: '#6b7280' }
  // Existing alarms in the draft's caution look: the pressure-drop event (2 s, the former red
  // flash) and a tyre in the top band of the ACC Drive temperature scale.
  const pressureWarning = hasPhysics.value && racePressureFlash(tyre, Math.max(clockMs.value, Date.now())) !== null
  const temperatureWarning = hasPhysics.value && hasCompoundTyrePolicy.value
    && tyreTemperatureOverheated(tyre.coreTempC, compoundKind.value)
  return {
    ...tyre,
    rear,
    right: index % 2 === 1,
    order: raceTyreValueOrder(rear),
    color: hasCompoundTyrePolicy.value ? tyreTemperatureColor(tyre.coreTempC, compoundKind.value) : temperatureTargetColor(tyre.temperatureTargetRatio),
    brakeColor: brakeColor(tyre),
    slip,
    average: hasPhysics.value && props.fastState.lapPressureAverage.status === 'available'
      ? props.fastState.lapPressureAverage.values[id] : null,
    pressureWarning,
    temperatureWarning,
  }
}))
watch(() => tyres.value.some(tyre => tyre.pressureWarning), active => {
  if (!active) return stopClock()
  if (!clockTimer) clockTimer = setInterval(() => { clockMs.value = Date.now() }, 250)
}, { immediate: true })
onBeforeUnmount(stopClock)
const axles = computed(() => [false, true].map(rear => ({
  id: rear ? 'rear' : 'front',
  rear,
  left: tyres.value[rear ? 2 : 0]!,
  right: tyres.value[rear ? 3 : 1]!,
  ...raceAxleBrake(tyres.value.filter(tyre => tyre.rear === rear)),
})))
const unavailable = computed(() => !hasPhysics.value)
const compound = computed(() => hasPhysics.value ? props.fastState.tyreCompound ?? '--' : '--')
const tyreSet = computed(() => hasPhysics.value && props.fastState.tyreSetAvailable ? props.fastState.currentTyreSet ?? '--' : '--')
// Damage: total repair time on the right of the middle line, only while the car is damaged.
const damageTime = computed(() => {
  const damage = hasPhysics.value ? raceDamageSummary(props.fastState.damage) : null
  return damage ? raceDamageZoneTime(damage.totalMs, 1).replace(/^0:/, '') : null
})
// Over a minute (m:ss.s) the colon already says it is a time: no " s" and a smaller size, so it
// stays inside its column beside a two-digit tyre set.
const damageLong = computed(() => damageTime.value?.includes(':') === true)
const limiterOn = computed(() => hasPhysics.value && props.fastState.pitLimiterOn === true)
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
  <section class="tyre-race" :class="{ 'tyre-race--damaged': damageTime }" aria-label="Race gomme e freni">
    <RaceWeatherHud :fast-state="fastState" />

    <div class="tyre-race__matrix" role="img" aria-label="Stato quattro pneumatici">
      <template v-for="axle in axles" :key="axle.id">
        <div class="tyre-race__axle" :class="`tyre-race__axle--${axle.id}`">
          <div
            v-for="tyre in [axle.left, axle.right]"
            :key="tyre.id"
            class="tyre-race__corner"
            :class="[
              `tyre-race__corner--${tyre.id.toLowerCase()}`,
              tyre.right ? 'tyre-race__corner--right' : 'tyre-race__corner--left',
              { 'tyre-race__corner--rear': tyre.rear, 'tyre-race__corner--warn': tyre.pressureWarning || tyre.temperatureWarning },
            ]"
            :data-wheel="tyre.id"
            :aria-label="tyre.id"
          >
            <div class="tyre-race__values">
              <span
                v-for="kind in tyre.order"
                :key="kind"
                :class="`tyre-race__${kind}`"
                :aria-label="kind === 'average' ? AVERAGE_LABEL : undefined"
              ><template v-if="kind === 'average'">AVG </template><HudFixedDigits :value="valueText(tyre, kind)" /></span>
            </div>
            <div class="tyre-race__hardware">
              <i class="tyre-race__slip"><b :style="{ height: `${tyre.slip.ratio * 100}%`, background: tyre.slip.color }" /></i>
              <span class="tyre-race__tyre" :style="{ '--t': tyre.color }"><span class="tyre-race__temperature"><HudFixedDigits :value="raceNumber(tyre.coreTempC)" />&#176;</span></span>
              <i class="tyre-race__brake" :class="`tyre-race__brake--${tyre.rear ? 'rear' : 'front'}`" :style="{ background: tyre.brakeColor }" />
            </div>
          </div>
          <!-- One reading per axle on the wheel centre line: hottest brake, lowest pad life above
               (front) or below (rear). The LIMITER ON box sits on the same spot (owner 30/10: no
               ENGINE OFF box on the tyres page). -->
          <div class="tyre-race__axle-brake" :class="`tyre-race__axle-brake--${axle.id}`">
            <span class="tyre-race__brake-temp"><HudFixedDigits :value="raceNumber(axle.brakeTempC)" />&#176;</span>
            <small class="tyre-race__pad"><HudFixedDigits :value="raceNumber(axle.padLifePct)" />%</small>
            <strong v-if="axle.rear && limiterOn" class="tyre-race__status tyre-race__limiter">LIMITER<br>ON</strong>
          </div>
        </div>
        <div v-if="!axle.rear" class="tyre-race__compound">
          <span class="tyre-race__compound-set">{{ compound }} · {{ t('overlays.tyreRace.set') }} {{ tyreSet }}</span>
          <strong v-if="damageTime" class="tyre-race__damage" :class="{ 'tyre-race__damage--long': damageLong }" :aria-label="`${t('overlays.tyreRace.damage')} ${damageTime} s`"><span aria-hidden="true">&#9888;</span>{{ damageTime }}<template v-if="!damageLong"> s</template></strong>
        </div>
      </template>
      <div v-if="unavailable" class="tyre-race__unavailable">
        <span>{{ fastState.dataSource === 'focused' ? 'DATA N/A' : 'NO DATA' }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '~/assets/scss/hud-gauge' as *;

// Draft sizes at scale 1 (the page zooms the whole Race window by the HUD scale).
// Owner (30/10): bigger wheels and numbers than the draft, same layout, rows one under the other.
$wheel-height: 112px;

.tyre-race {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  color: #f4f6f8;
  @include hud-gauge-type;
}

.tyre-race__matrix {
  position: relative;
  display: grid;
  flex: 1;
  align-content: center;
  gap: 10px;
  padding: 8px;
}

.tyre-race__axle {
  display: grid;
  grid-template-columns: 140px minmax(72px, 1fr) 140px;
  column-gap: 8px;
}

.tyre-race__corner {
  display: grid;
  grid-template-rows: auto auto;
  justify-items: center;
  gap: 8px;
  min-width: 0;
}
.tyre-race__corner--left { grid-area: 1 / 1; }
.tyre-race__corner--right { grid-area: 1 / 3; }
.tyre-race__corner--rear .tyre-race__hardware { grid-row: 1; }
.tyre-race__corner--rear .tyre-race__values { grid-row: 2; }

.tyre-race__values {
  display: grid;
  justify-items: center;
  gap: 4px;
  white-space: nowrap;
}
.tyre-race__primary { font: 800 36px/1 var(--hud-gauge-num); }
.tyre-race__average { color: #d4dce2; font: 700 27px/1.1 var(--hud-gauge-label); }
.tyre-race__loss { color: #ffa500; font: 700 29px/1.1 var(--hud-gauge-num); }

// Hardware: slip bar on the outside, tyre in the middle, brake on the inside.
// Owner (30/10): wider slip (24px) and brake (18px) bars beside the 80px tyre; 12px between slip
// bar and tyre, 6px between tyre and brake.
.tyre-race__hardware { position: relative; width: 140px; height: $wheel-height; }
.tyre-race__slip {
  position: absolute;
  top: 0;
  left: 0;
  width: 24px;
  height: 100%;
  background: #3a3d45;
  // Owner (30/10): the slip arrives 20 times a second; the fill glides to each sample over 50 ms
  // (linear) instead of jumping, like the Dashboard pedal bars.
  b { position: absolute; right: 0; bottom: 0; left: 0; display: block; transition: height 50ms linear; }
}
.tyre-race__tyre {
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 80px;
  height: 100%;
  margin: 0 0 0 36px;
  // Owner (30/10): fill and frame in the same ACC Drive palette colour.
  border: 4px solid var(--t);
  border-radius: 5px;
  background: var(--t);
}
// The shadow keeps the white number readable on the light palette colours (yellow, light green).
.tyre-race__temperature { color: #fff; font: 800 34px/1 var(--hud-gauge-num); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.7); }
.tyre-race__brake {
  position: absolute;
  top: 20px;
  right: 0;
  width: 18px;
  height: 72px;
  border: 1px solid #00000066;
  border-radius: 3px;
  box-sizing: border-box;
}
.tyre-race__corner--right {
  .tyre-race__slip { right: 0; left: auto; }
  .tyre-race__tyre { margin-left: 24px; }
  .tyre-race__brake { right: auto; left: 0; }
}

// Caution (pressure drop event, overheated tyre): the wheel's tyre and readings turn amber.
.tyre-race__corner--warn {
  .tyre-race__tyre { border-color: $hud-caution; background: $hud-caution-bg; }
  :is(.tyre-race__temperature, .tyre-race__primary, .tyre-race__loss) { color: $hud-caution; }
}

// Axle brake: the temperature on the wheel centre line, the pad life mirrored around it.
.tyre-race__axle-brake { position: relative; grid-area: 1 / 2; height: $wheel-height; }
.tyre-race__axle--front .tyre-race__axle-brake { align-self: end; }
.tyre-race__axle--rear .tyre-race__axle-brake { align-self: start; }
.tyre-race__brake-temp {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font: 700 34px/1 var(--hud-gauge-num);
  white-space: nowrap;
}
.tyre-race__pad {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  color: #d4dce2;
  font: 700 30px/1 var(--hud-gauge-num);
  white-space: nowrap;
}
.tyre-race__axle--front .tyre-race__pad { bottom: calc(50% + 24px); }
.tyre-race__axle--rear .tyre-race__pad { top: calc(50% + 24px); }

// LIMITER ON (blue) box on the rear axle centre, square corners.
.tyre-race__status {
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 84px;
  height: 48px;
  transform: translate(-50%, -50%);
  color: #fff;
  font: 800 17px/1.05 var(--hud-gauge-num);
  text-align: center;
}
.tyre-race__limiter { background: #0000ff; }

// Middle line: compound and set centred, damage (repair time) on the right.
.tyre-race__compound {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(170px, auto) minmax(0, 1fr);
  align-items: center;
  box-sizing: border-box;
  height: 52px;
  padding: 8px 0;
  border-block: 1px solid #465d52;
}
.tyre-race__compound-set { grid-column: 2; color: #e7eee9; font: 700 28px/34px var(--hud-gauge-num); text-align: center; white-space: nowrap; }
.tyre-race__damage {
  grid-column: 3;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  color: $hud-caution;
  font: 700 26px/34px var(--hud-gauge-num);
  white-space: nowrap;
  span { font: 22px/1 Arial, sans-serif; }
}
.tyre-race__damage--long { font-size: 22px; span { font-size: 18px; } }
.tyre-race--damaged .tyre-race__compound { border-color: $hud-caution; }

.tyre-race__unavailable {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.7);
  font: 800 28px/1 var(--hud-gauge-num);
}

</style>
