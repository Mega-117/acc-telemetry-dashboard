<script setup lang="ts">
import { computed } from 'vue'
import type { FastOverlayState, FastStateTyre } from '~/composables/useFastStatePoller'
import { resolveTyreHudStatus, tyreSlipBarStyle } from '~/utils/tyreSlipPresentation'
import { tyreTemperatureColor } from '~/utils/tyreTemperaturePresentation'
import {
  buildBrakeAxlePresentation,
  type BrakeAxlePresentation,
} from '~/utils/brakeAxlePresentation'
import TyreSetupHud from './TyreSetupHud.vue'

const props = withDefaults(defineProps<{
  fastState: FastOverlayState
  page?: 'live' | 'setup'
}>(), {
  page: 'live',
})

const wheelIds = ['FL', 'FR', 'RL', 'RR'] as const
const axles = [
  { key: 'front', left: 'FL', right: 'FR' },
  { key: 'rear', left: 'RL', right: 'RR' },
] as const

const emptyTyre = (id: FastStateTyre['id']): FastStateTyre => ({
  id,
  wheelSlip: null,
  wheelSlipScaled: null,
  slipBand: 'white',
  slipState: 'ok',
  slipRatio: null,
  pressurePsi: null,
  pressureLossPsi: null,
  coreTempC: null,
  brakeTempC: null,
  brakeCompound: null,
  padLifePct: null,
  discLifePct: null,
})

const tyresById = computed(() => Object.fromEntries(
  wheelIds.map(id => [id, props.fastState.tyres.find(tyre => tyre.id === id) ?? emptyTyre(id)]),
) as Record<FastStateTyre['id'], FastStateTyre>)
const brakeAxleByKey = computed(() => ({
  front: buildBrakeAxlePresentation(tyresById.value.FL, tyresById.value.FR),
  rear: buildBrakeAxlePresentation(tyresById.value.RL, tyresById.value.RR),
}))

const setLabel = computed(() => {
  const compound = props.fastState.tyreCompound ?? '--'
  const set = props.fastState.tyreSetAvailable && props.fastState.currentTyreSet !== null
    ? props.fastState.currentTyreSet
    : '--'
  return `${compound} ${set}`
})

const ADVANCED_STATUS_LABELS: Record<string, string> = {
  'no-data': 'NO DATA',
  'data-unavailable': 'DATA N/A',
  'engine-off': 'ENGINE OFF',
  'pit-limiter': 'PIT LIMITER',
}

const globalStatus = computed(() => {
  const status = resolveTyreHudStatus(props.fastState)
  return status === null ? null : ADVANCED_STATUS_LABELS[status]
})

function format(value: number | null, digits = 0) {
  return value === null ? '--' : value.toFixed(digits)
}

function averageFor(id: FastStateTyre['id']) {
  const avg = props.fastState.lapPressureAverage
  if (
    avg.status !== 'available'
    || avg.tyreSet === null
    || avg.tyreSet !== props.fastState.currentTyreSet
  ) return '--'
  const value = avg.values[id]
  return value === null ? '--' : value.toFixed(1)
}

function pressureLoss(tyre: FastStateTyre) {
  if (tyre.pressureLossPsi === null) return '--'
  const value = Math.max(0, tyre.pressureLossPsi)
  if (value < 0.005) return '0'
  return Number(value.toFixed(2)).toString()
}

function weatherIcon(value: number | null) {
  if (value === null) return '·'
  if (value <= 0) return '☀'
  if (value <= 2) return '☁'
  return '☂'
}

function verticalSlipFill(tyre: FastStateTyre) {
  return tyreSlipBarStyle(tyre.wheelSlipScaled, 'vertical')
}

function tyreStyle(tyre: FastStateTyre) {
  return {
    backgroundColor: tyreTemperatureColor(
      tyre.coreTempC,
      props.fastState.tyreCompound === 'WET' ? 'WET' : 'DRY',
    ),
  }
}

function brakeAxleStyle(model: BrakeAxlePresentation) {
  return {
    background: `linear-gradient(90deg, ${model.leftTemperatureColor} 0 50%, ${model.rightTemperatureColor} 50% 100%)`,
  }
}

function formatBrakeAverage(value: number | null, suffix: '°' | '%') {
  return value === null ? '—' : `${value.toFixed(0)}${suffix}`
}
</script>

<template>
  <TyreSetupHud v-if="page === 'setup'" :fast-state="fastState" />
  <section v-else class="tyre-advanced" aria-label="Stato avanzato gomme e freni">
    <div class="tyre-advanced__weather">
      <div v-for="item in [
        { label: '0′', value: fastState.rainIntensity },
        { label: '10′', value: fastState.rainIntensity10Min },
        { label: '30′', value: fastState.rainIntensity30Min },
      ]" :key="item.label">
        <strong>{{ item.label }}</strong>
        <span>{{ weatherIcon(item.value) }}</span>
      </div>
    </div>

    <div class="tyre-advanced__panel">
      <div v-for="axle in axles" :key="axle.key" class="tyre-advanced__axle">
        <div class="tyre-advanced__corner tyre-advanced__corner--left">
          <strong>{{ format(tyresById[axle.left].pressurePsi, 1) }}</strong>
          <small class="tyre-advanced__average">AVG {{ averageFor(axle.left) }}</small>
          <div class="tyre-advanced__wheel">
            <div
              class="tyre-advanced__grip-bar"
              :class="`tyre-slip--${tyresById[axle.left].slipBand}`"
              role="progressbar"
              aria-label="Grip"
            >
              <span :style="verticalSlipFill(tyresById[axle.left])" />
            </div>
            <div class="tyre-advanced__tyre" :style="tyreStyle(tyresById[axle.left])">
              <b>{{ format(tyresById[axle.left].coreTempC) }}°</b>
            </div>
          </div>
          <small class="tyre-advanced__pressure-loss">{{ pressureLoss(tyresById[axle.left]) }}</small>
        </div>

        <div
          class="tyre-advanced__brake-axle"
          :class="{
            'tyre-advanced__brake-axle--alert': brakeAxleByKey[axle.key].temperatureAnomaly || brakeAxleByKey[axle.key].wearAnomaly,
            'tyre-advanced__brake-axle--missing': brakeAxleByKey[axle.key].hasMissingData,
          }"
        >
          <small>{{ axle.key === 'front' ? 'FRONT AVG' : 'REAR AVG' }}</small>
          <span>{{ formatBrakeAverage(brakeAxleByKey[axle.key].temperatureAverageC, '°') }}</span>
          <i :style="brakeAxleStyle(brakeAxleByKey[axle.key])" />
          <strong>{{ formatBrakeAverage(brakeAxleByKey[axle.key].padLifeAveragePct, '%') }}</strong>
        </div>

        <div class="tyre-advanced__corner tyre-advanced__corner--right">
          <strong>{{ format(tyresById[axle.right].pressurePsi, 1) }}</strong>
          <small class="tyre-advanced__average">AVG {{ averageFor(axle.right) }}</small>
          <div class="tyre-advanced__wheel">
            <div class="tyre-advanced__tyre" :style="tyreStyle(tyresById[axle.right])">
              <b>{{ format(tyresById[axle.right].coreTempC) }}°</b>
            </div>
            <div
              class="tyre-advanced__grip-bar"
              :class="`tyre-slip--${tyresById[axle.right].slipBand}`"
              role="progressbar"
              aria-label="Grip"
            >
              <span :style="verticalSlipFill(tyresById[axle.right])" />
            </div>
          </div>
          <small class="tyre-advanced__pressure-loss">{{ pressureLoss(tyresById[axle.right]) }}</small>
        </div>
      </div>

      <div class="tyre-advanced__set">{{ setLabel }}</div>
      <div v-if="globalStatus" class="tyre-advanced__status">{{ globalStatus }}</div>
    </div>
  </section>
</template>

<style scoped>
.tyre-advanced {
  --tyre-hud-type-weather: max(10px, calc(14px * var(--hud-scale, 1)));
  --tyre-hud-type-weather-icon: max(11px, calc(15px * var(--hud-scale, 1)));
  --tyre-hud-type-label: max(11px, calc(11px * var(--hud-scale, 1)));
  --tyre-hud-type-secondary: max(13px, calc(15px * var(--hud-scale, 1)));
  --tyre-hud-type-primary: max(18px, calc(21px * var(--hud-scale, 1)));
  --tyre-hud-type-tyre: max(22px, calc(27px * var(--hud-scale, 1)));
  --tyre-hud-type-pad: max(14px, calc(17px * var(--hud-scale, 1)));
  --tyre-hud-type-set: max(14px, calc(17px * var(--hud-scale, 1)));
  --tyre-hud-type-status: max(14px, calc(19px * var(--hud-scale, 1)));
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  container-type: inline-size;
  gap: 0;
  width: 100%;
  min-height: 0;
  color: #fff;
  font-family: Inter, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums;
}

.tyre-advanced__weather {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  width: 100%;
  padding: 0 calc(8px * var(--hud-scale, 1)) calc(7px * var(--hud-scale, 1));
  border-bottom: 1px solid rgba(255, 255, 255, .18);
  box-sizing: border-box;
}

.tyre-advanced__weather div {
  display: grid;
  place-items: center;
  min-width: 0;
}

.tyre-advanced__weather div + div {
  border-left: 1px solid rgba(255, 255, 255, .12);
}

.tyre-advanced__weather strong {
  padding-top: calc(3px * var(--hud-scale, 1));
  font-size: var(--tyre-hud-type-weather);
}

.tyre-advanced__weather span {
  width: 100%;
  padding: calc(2px * var(--hud-scale, 1)) 0;
  color: #fff;
  font-size: var(--tyre-hud-type-weather-icon);
  text-align: center;
}

.tyre-advanced__panel {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: stretch;
  gap: 0;
  width: 100%;
  min-height: 0;
  padding: calc(7px * var(--hud-scale, 1)) calc(8px * var(--hud-scale, 1));
  overflow: hidden;
  box-sizing: border-box;
}

.tyre-advanced__axle {
  position: relative;
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    minmax(calc(34px * var(--hud-scale, 1)), .30fr)
    minmax(calc(34px * var(--hud-scale, 1)), .30fr)
    minmax(0, 1fr);
  align-items: center;
  align-content: center;
  gap: calc(8px * var(--hud-scale, 1));
  grid-template-rows: auto auto auto auto;
  row-gap: calc(4px * var(--hud-scale, 1));
  flex: 1;
  min-height: 0;
}

.tyre-advanced__axle + .tyre-advanced__axle {
  border-top: 1px solid rgba(255, 255, 255, .16);
}

.tyre-advanced__corner,
.tyre-advanced__brake-axle {
  display: grid;
  grid-row: 1 / -1;
  grid-template-rows: subgrid;
  justify-items: center;
  min-width: 0;
}

.tyre-advanced__corner > strong {
  grid-row: 1;
  font-size: var(--tyre-hud-type-primary);
  line-height: 1;
}

.tyre-advanced__average {
  grid-row: 2;
  color: rgba(255, 255, 255, .72);
  font-size: var(--tyre-hud-type-label);
  font-weight: 800;
  white-space: nowrap;
}

.tyre-advanced__pressure-loss {
  grid-row: 4;
  color: #ff8a24;
  font-size: var(--tyre-hud-type-secondary);
  font-weight: 900;
  line-height: 1;
}

.tyre-advanced__wheel {
  display: grid;
  grid-row: 3;
  align-items: stretch;
  justify-content: center;
  gap: calc(4px * var(--hud-scale, 1));
  width: 100%;
}

.tyre-advanced__corner--left .tyre-advanced__wheel {
  grid-template-columns: calc(14px * var(--hud-scale, 1)) minmax(42px, 62px);
}

.tyre-advanced__corner--right .tyre-advanced__wheel {
  grid-template-columns: minmax(42px, 62px) calc(14px * var(--hud-scale, 1));
}

.tyre-advanced__grip-bar {
  position: relative;
  height: calc(92px * var(--hud-scale, 1));
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, .14);
}

.tyre-advanced__grip-bar span {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: block;
  border-radius: inherit;
  background: var(--tyre-slip-color, rgba(226, 238, 247, .72));
  transition: height 90ms linear;
}

.tyre-advanced__tyre {
  position: relative;
  display: grid;
  place-items: center;
  height: calc(92px * var(--hud-scale, 1));
  border: 1px solid rgba(255, 255, 255, .38);
  border-radius: calc(16px * var(--hud-scale, 1));
  box-sizing: border-box;
  transition: background-color 160ms linear;
}

.tyre-advanced__tyre b {
  position: relative;
  z-index: 1;
  color: #fff;
  font-size: var(--tyre-hud-type-tyre);
  text-shadow: 0 1px 3px #000, 0 0 5px rgba(0, 0, 0, .75);
}

.tyre-advanced__brake-axle {
  grid-column: 2 / 4;
  align-items: center;
}

.tyre-advanced__brake-axle > small {
  grid-row: 1;
  align-self: end;
  color: rgba(255, 255, 255, .72);
  font-size: var(--tyre-hud-type-label);
  font-weight: 900;
  white-space: nowrap;
}

.tyre-advanced__brake-axle span {
  grid-row: 2;
  align-self: end;
  font-size: var(--tyre-hud-type-secondary);
  font-weight: 900;
  white-space: nowrap;
}

.tyre-advanced__brake-axle i {
  grid-row: 3;
  align-self: center;
  width: 54%;
  height: calc(54px * var(--hud-scale, 1));
  border: 1px solid rgba(255, 255, 255, .32);
  border-radius: calc(4px * var(--hud-scale, 1));
  background: #142bd0;
  transition: background-color 120ms linear;
}

.tyre-advanced__brake-axle strong {
  grid-row: 4;
  font-size: var(--tyre-hud-type-pad);
  line-height: 1;
}

.tyre-advanced__brake-axle--alert i {
  outline: max(1px, calc(2px * var(--hud-scale, 1))) solid #ff3b30;
  box-shadow: 0 0 calc(10px * var(--hud-scale, 1)) rgba(255, 59, 48, .72);
}

.tyre-advanced__brake-axle--missing i {
  border-style: dashed;
}

.tyre-advanced__set {
  position: absolute;
  top: 50%;
  left: 50%;
  padding: calc(2px * var(--hud-scale, 1)) calc(10px * var(--hud-scale, 1));
  color: #fff;
  font-size: var(--tyre-hud-type-set);
  font-weight: 900;
  transform: translate(-50%, -50%);
  white-space: nowrap;
  text-shadow: 0 1px 3px #000;
}

.tyre-advanced__status {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  max-width: 48%;
  padding: calc(5px * var(--hud-scale, 1)) calc(9px * var(--hud-scale, 1));
  border-radius: calc(5px * var(--hud-scale, 1));
  background: rgba(120, 0, 0, .92);
  color: #fff;
  font-size: var(--tyre-hud-type-status);
  font-weight: 950;
  line-height: .95;
  text-align: center;
  transform: translate(-50%, calc(-50% + 28px * var(--hud-scale, 1)));
}

@container (max-width: 300px) {
  .tyre-advanced__weather {
    padding-right: 4px;
    padding-left: 4px;
  }

  .tyre-advanced__panel {
    padding: 5px 3px;
  }

  .tyre-advanced__axle {
    grid-template-columns: minmax(0, 1fr) 31px 31px minmax(0, 1fr);
    gap: 3px;
    row-gap: 2px;
  }

  .tyre-advanced__corner > strong {
    line-height: .95;
  }

  .tyre-advanced__average {
    letter-spacing: -.025em;
  }

  .tyre-advanced__wheel {
    gap: 3px;
  }

  .tyre-advanced__corner--left .tyre-advanced__wheel {
    grid-template-columns: 10px minmax(36px, 48px);
  }

  .tyre-advanced__corner--right .tyre-advanced__wheel {
    grid-template-columns: minmax(36px, 48px) 10px;
  }

  .tyre-advanced__grip-bar,
  .tyre-advanced__tyre {
    height: 62px;
  }

  .tyre-advanced__tyre {
    border-width: 1px;
    border-radius: 10px;
  }

  .tyre-advanced__pressure-loss {
    font-size: 10px;
  }

  .tyre-advanced__brake-axle > small {
    font-size: 10px;
  }

  .tyre-advanced__brake-axle span,
  .tyre-advanced__brake-axle strong {
    font-size: 12px;
  }

  .tyre-advanced__brake-axle i {
    width: 52%;
    height: 36px;
  }
}
</style>
