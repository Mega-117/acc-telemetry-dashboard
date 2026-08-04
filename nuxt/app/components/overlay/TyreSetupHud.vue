<script setup lang="ts">
import { computed } from 'vue'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import {
  TYRE_WHEEL_IDS,
  type TyreWheelId,
  type TyreWheelValues,
} from '~/services/overlay/tyreSetupViewModel'
import { tyreTemperatureColor } from '~/utils/tyreTemperaturePresentation'
import { brakeTemperatureColor } from '~/utils/brakeTemperaturePresentation'

const props = defineProps<{ fastState: FastOverlayState }>()

const setup = computed(() => props.fastState.tyreSetup)
const hasSnapshot = computed(() => setup.value.status === 'available' && setup.value.lastLap !== null)
const emptyValues: TyreWheelValues = { FL: null, FR: null, RL: null, RR: null }

function formatPressure(value: number | null) {
  return value === null ? '--' : value.toFixed(1)
}

function formatTemperature(value: number | null) {
  return value === null ? '--' : `${value.toFixed(0)}°`
}

function formatLoss(value: number | null) {
  if (value === null) return '--'
  const normalized = Math.max(0, value)
  return normalized < 0.005 ? '0' : normalized.toFixed(2)
}

function tyreTemperatureStyle(value: number | null) {
  return {
    color: tyreTemperatureColor(
      value,
      setup.value.lastLap?.compound === 'WET' ? 'WET' : 'DRY',
    ),
  }
}

function brakeTemperatureStyle(value: number | null, id: TyreWheelId) {
  return {
    color: brakeTemperatureColor(
      value,
      id,
      setup.value.lastLap?.brakeCompounds[id] ?? null,
    ),
  }
}

function tyreMetric(stat: 'high' | 'avg' | 'low') {
  return setup.value.lastLap?.tyreTemperature?.[stat] ?? emptyValues
}

function brakeMetric(stat: 'high' | 'avg' | 'low') {
  return setup.value.lastLap?.brakeTemperature?.[stat] ?? emptyValues
}

function pressureMetric(stat: 'high' | 'avg') {
  return setup.value.lastLap?.pressure[stat] ?? emptyValues
}

function startingPressure(id: TyreWheelId) {
  return setup.value.startingPressure.status === 'available'
    ? setup.value.startingPressure.values?.[id] ?? null
    : null
}
</script>

<template>
  <section class="tyre-setup" aria-label="Dati setup gomme ultimo run">
    <header class="tyre-setup__header">
      <strong>SETUP</strong>
      <span>LAST LAP</span>
    </header>

    <div v-if="!hasSnapshot" class="tyre-setup__empty" role="status">
      <strong>NESSUN DATO</strong>
      <span>Completa un giro valido</span>
    </div>

    <div v-else class="tyre-setup__columns">
      <section class="tyre-setup__column">
        <h2>TYRE PRESSURE</h2>
        <div v-for="stat in ['high', 'avg'] as const" :key="stat" class="tyre-setup__metric">
          <h3>{{ stat.toUpperCase() }}</h3>
          <div class="tyre-setup__wheel-grid">
            <span v-for="id in TYRE_WHEEL_IDS" :key="id">
              {{ formatPressure(pressureMetric(stat)[id]) }}
            </span>
          </div>
        </div>
        <div class="tyre-setup__metric tyre-setup__metric--loss">
          <h3>TOTAL LOSS <small>RUN</small></h3>
          <div class="tyre-setup__wheel-grid">
            <span v-for="id in TYRE_WHEEL_IDS" :key="id">
              {{ formatLoss(setup.totalPressureLoss[id]) }}
            </span>
          </div>
        </div>
      </section>

      <section class="tyre-setup__column">
        <h2>TYRE TEMPS</h2>
        <div v-for="stat in ['high', 'avg', 'low'] as const" :key="stat" class="tyre-setup__metric">
          <h3>{{ stat.toUpperCase() }}</h3>
          <div class="tyre-setup__wheel-grid">
            <span
              v-for="id in TYRE_WHEEL_IDS"
              :key="id"
              :style="tyreTemperatureStyle(tyreMetric(stat)[id])"
            >
              {{ formatTemperature(tyreMetric(stat)[id]) }}
            </span>
          </div>
        </div>
      </section>

      <section class="tyre-setup__column">
        <h2>BRAKE TEMPS</h2>
        <div v-for="stat in ['high', 'avg', 'low'] as const" :key="stat" class="tyre-setup__metric">
          <h3>{{ stat.toUpperCase() }}</h3>
          <div class="tyre-setup__wheel-grid">
            <span
              v-for="id in TYRE_WHEEL_IDS"
              :key="id"
              :style="brakeTemperatureStyle(brakeMetric(stat)[id], id)"
            >
              {{ formatTemperature(brakeMetric(stat)[id]) }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <footer v-if="hasSnapshot" class="tyre-setup__start">
      <div>
        <strong>START PRESSURE</strong>
        <span>RUN START · SET VALUE</span>
      </div>
      <div class="tyre-setup__start-values">
        <span v-for="id in TYRE_WHEEL_IDS" :key="id">
          <small>{{ id }}</small>
          {{ formatPressure(startingPressure(id)) }}
        </span>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.tyre-setup {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: #fff;
  font-family: Inter, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums;
}

.tyre-setup__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: calc(5px * var(--hud-scale, 1)) calc(8px * var(--hud-scale, 1));
  border-bottom: 1px solid rgba(255, 255, 255, .18);
}

.tyre-setup__header strong {
  font-size: max(13px, calc(17px * var(--hud-scale, 1)));
}

.tyre-setup__header span {
  color: rgba(255, 255, 255, .58);
  font-size: max(9px, calc(10px * var(--hud-scale, 1)));
  font-weight: 800;
  letter-spacing: .08em;
}

.tyre-setup__empty {
  display: grid;
  grid-row: 2 / -1;
  place-content: center;
  gap: calc(5px * var(--hud-scale, 1));
  color: rgba(255, 255, 255, .58);
  text-align: center;
}

.tyre-setup__empty strong {
  color: #fff;
  font-size: max(16px, calc(22px * var(--hud-scale, 1)));
}

.tyre-setup__empty span {
  font-size: max(10px, calc(12px * var(--hud-scale, 1)));
}

.tyre-setup__columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 0;
}

.tyre-setup__column {
  display: grid;
  grid-template-rows: auto repeat(3, minmax(0, 1fr));
  min-width: 0;
}

.tyre-setup__column + .tyre-setup__column {
  border-left: 1px solid rgba(255, 255, 255, .14);
}

.tyre-setup__column h2 {
  min-width: 0;
  margin: 0;
  padding: calc(6px * var(--hud-scale, 1)) 2px;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, .10);
  color: rgba(255, 255, 255, .88);
  font-size: max(9px, calc(11px * var(--hud-scale, 1)));
  line-height: 1;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tyre-setup__metric {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  padding: calc(4px * var(--hud-scale, 1)) calc(5px * var(--hud-scale, 1));
  border-bottom: 1px solid rgba(255, 255, 255, .08);
}

.tyre-setup__column:first-child .tyre-setup__metric--loss {
  grid-row: 4;
}

.tyre-setup__metric h3 {
  margin: 0 0 calc(3px * var(--hud-scale, 1));
  color: rgba(255, 255, 255, .86);
  font-size: max(11px, calc(15px * var(--hud-scale, 1)));
  line-height: 1;
  text-align: center;
}

.tyre-setup__metric h3 small {
  display: block;
  margin-top: 2px;
  color: rgba(255, 255, 255, .48);
  font-size: max(7px, calc(8px * var(--hud-scale, 1)));
  letter-spacing: .08em;
}

.tyre-setup__wheel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  place-content: center;
  align-items: center;
  min-height: 0;
}

.tyre-setup__wheel-grid span {
  min-width: 0;
  font-size: max(11px, calc(14px * var(--hud-scale, 1)));
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  white-space: nowrap;
}

.tyre-setup__metric--loss,
.tyre-setup__metric--loss h3,
.tyre-setup__metric--loss h3 small {
  color: #ff8a24;
}

.tyre-setup__start {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: calc(8px * var(--hud-scale, 1));
  padding: calc(7px * var(--hud-scale, 1)) calc(8px * var(--hud-scale, 1));
  border-top: 1px solid rgba(255, 255, 255, .18);
}

.tyre-setup__start > div:first-child {
  display: grid;
}

.tyre-setup__start strong {
  font-size: max(10px, calc(12px * var(--hud-scale, 1)));
  line-height: 1;
}

.tyre-setup__start > div:first-child span {
  margin-top: 3px;
  color: rgba(255, 255, 255, .50);
  font-size: max(7px, calc(8px * var(--hud-scale, 1)));
  font-weight: 800;
}

.tyre-setup__start-values {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  min-width: 0;
}

.tyre-setup__start-values span {
  display: grid;
  justify-items: center;
  min-width: 0;
  font-size: max(11px, calc(14px * var(--hud-scale, 1)));
  font-weight: 800;
}

.tyre-setup__start-values small {
  color: rgba(255, 255, 255, .48);
  font-size: max(7px, calc(8px * var(--hud-scale, 1)));
}

@container (max-width: 300px) {
  .tyre-setup__header,
  .tyre-setup__start {
    padding-right: 4px;
    padding-left: 4px;
  }

  .tyre-setup__column h2 {
    font-size: 8px;
    letter-spacing: -.02em;
  }

  .tyre-setup__metric {
    padding-right: 2px;
    padding-left: 2px;
  }

  .tyre-setup__metric h3 {
    font-size: 11px;
  }

  .tyre-setup__wheel-grid span {
    font-size: 10px;
  }

  .tyre-setup__start {
    grid-template-columns: 74px minmax(0, 1fr);
    gap: 3px;
  }

  .tyre-setup__start strong {
    font-size: 9px;
  }

  .tyre-setup__start-values span {
    font-size: 10px;
  }
}
</style>
