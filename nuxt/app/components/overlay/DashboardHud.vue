<script setup lang="ts">
import { computed } from 'vue'
import HudFixedDigits from '~/components/overlay/HudFixedDigits.vue'
import HudOverlayBackground from '~/components/overlay/HudOverlayBackground.vue'
import { useI18n } from '~/i18n'
import type { DashboardAdjustableKey } from '~/utils/dashboardAdjustment'
import type { DashboardPresentation } from '~/utils/dashboardPresentation'

const props = withDefaults(defineProps<{
  model: DashboardPresentation
  backgroundOpacity?: number
  adjusting?: DashboardAdjustableKey | null
}>(), { backgroundOpacity: 1, adjusting: null })

const { t } = useI18n()

interface DashboardCell {
  id: string
  label: string
  value: string
  reference?: string | null
  wide?: boolean
  state?: Partial<Record<string, boolean>>
}

// Item colours live in the stylesheet (one class per box); English HUD words stay in the component.
const fuelCells = computed<DashboardCell[]>(() => [
  { id: 'fuel', label: 'Fuel', value: props.model.fuel },
  { id: 'fuel-lap', label: 'Fuel/lap', value: props.model.fuelPerLap },
  { id: 'laps', label: 'Laps left', value: props.model.lapsLeft },
  { id: 'fuel-left', label: 'Fuel left', value: props.model.fuelLeft },
])

const electronicsCells = computed<DashboardCell[]>(() => [
  {
    id: 'tc', label: 'TC', value: props.model.tractionControl, reference: props.model.tractionControlReference,
    state: {
      'dash-cell--active': props.model.tractionControlActive,
      'dash-cell--off-warning': props.model.tractionControlOffWarning,
    },
  },
  { id: 'tc2', label: 'TC2', value: props.model.tractionControl2, reference: props.model.tractionControl2Reference },
  {
    id: 'abs', label: 'ABS', value: props.model.abs, reference: props.model.absReference,
    state: { 'dash-cell--active': props.model.absActive },
  },
  { id: 'map', label: 'MAP', value: props.model.engineMap, reference: props.model.engineMapReference },
  { id: 'bb', label: 'BB', value: props.model.brakeBias, wide: true },
])

function cellClass(cell: DashboardCell) {
  return [
    `dash-cell--${cell.id}`,
    { 'dash-cell--wide': cell.wide === true, 'dash-cell--on': props.adjusting === cell.id, ...cell.state },
  ]
}
</script>

<template>
  <!-- Dashboard v3 (owner 28/10, mock "Cruscotto · nuova proposta"): square corners with only the
       top-right corner cut, plain RPM bar on top, fuel boxes left, tall gear column, electronics right. -->
  <section
    class="dash-hud"
    :class="{
      'dash-hud--yellow-flag': model.yellowFlagActive,
      'dash-hud--fuel-warning': model.fuelUrgency === 'warning',
      'dash-hud--fuel-low': model.fuelUrgency === 'low' || model.fuelUrgency === 'critical',
      'dash-hud--fuel-critical-pulse': model.fuelCriticalPulse,
      'dash-hud--spectator': model.spectator !== null,
    }"
    :aria-label="t('overlays.dashboardHud.aria')"
  >
    <!-- Background transparency acts on this layer only, never on the content. -->
    <HudOverlayBackground :opacity="backgroundOpacity" />
    <!-- clip-path removes the border on the cut: this line draws it back. -->
    <i class="hud-cut-corner__line" aria-hidden="true" />

    <section v-if="model.spectator" class="spectator" :aria-label="t('overlays.dashboardHud.spectatorAria')">
      <header class="spectator__header">
        <div class="spectator__identity">
          <strong>{{ model.spectator.driverName }}</strong>
          <span>{{ model.spectator.carLabel }}</span>
        </div>
        <div class="spectator__meta">
          <strong>{{ model.spectator.position }}</strong>
          <span>LAP {{ model.spectator.laps }}</span>
          <span>{{ model.spectator.progress }}</span>
          <small>{{ model.spectator.session }}</small>
        </div>
      </header>

      <div class="spectator__main">
        <div class="spectator__metric spectator__speed">
          <b>SPEED</b>
          <strong>{{ model.speed }}</strong>
          <small>KM/H</small>
        </div>
        <div class="spectator__metric spectator__gear">
          <b>GEAR</b>
          <strong>{{ model.gear }}</strong>
        </div>
        <article
          v-for="timing in model.spectator.timings"
          :key="timing.label"
          class="spectator__timing"
        >
          <header class="spectator__timing-header">
            <b>{{ timing.label }}</b>
            <span :class="{ 'is-invalid': timing.validity === 'INVALID' }">{{ timing.validity }}</span>
          </header>
          <strong>{{ timing.lapTime }}</strong>
          <div class="spectator__splits">
            <span v-for="(split, index) in timing.splits" :key="`${timing.label}-${index}`">
              <b>S{{ index + 1 }}</b>
              <em>{{ split }}</em>
            </span>
          </div>
        </article>
      </div>

      <footer class="spectator__unavailable" :aria-label="t('overlays.dashboardHud.unavailableAria')">
        <span v-for="label in ['RPM', 'INPUT', 'FUEL', 'MAP', 'TC', 'TC2', 'ABS', 'BB', 'DELTA']" :key="label">
          <b>{{ label }}</b>
          <small>N/A</small>
        </span>
      </footer>
    </section>

    <template v-else>
      <!-- ACC Drive indicators: the panel edges blink while the direction lights are on. -->
      <span class="dash-indicator dash-indicator--left" :class="{ 'is-active': model.leftIndicatorActive }" aria-hidden="true" />
      <span class="dash-indicator dash-indicator--right" :class="{ 'is-active': model.rightIndicatorActive }" aria-hidden="true" />

      <div
        class="dash-rpm"
        :class="[`dash-rpm--${model.rpmBand}`, { 'dash-rpm--flash': model.shiftFlash, 'dash-rpm--pulse': model.rpmPulse }]"
      >
        <span class="dash-rpm__fill" :style="{ width: `${model.rpmRatio * 100}%` }" />
        <span
          v-if="model.rpmReferenceRatio !== null"
          class="dash-rpm__reference"
          :style="{ left: `${model.rpmReferenceRatio * 100}%` }"
        />
        <span
          v-if="model.shiftThresholdRatio !== null"
          class="dash-rpm__shift-reference"
          :style="{ left: `${model.shiftThresholdRatio * 100}%` }"
        />
        <strong class="dash-rpm__value"><HudFixedDigits :value="model.ignitionLabel" /></strong>
      </div>

      <div class="dash-body">
        <div class="dash-grid dash-grid--fuel">
          <div v-for="cell in fuelCells" :key="cell.id" class="dash-cell" :class="cellClass(cell)">
            <span class="dash-cell__label"><b>{{ cell.label }}</b></span>
            <strong class="dash-cell__value"><HudFixedDigits :value="cell.value" /></strong>
          </div>
        </div>

        <div class="dash-gear" :class="{ 'dash-gear--pit': model.pitLimiterOn }">
          <span class="dash-cell__label"><b>GEAR</b></span>
          <strong class="dash-gear__value">{{ model.gear }}</strong>
          <small v-if="model.gearReference !== null" class="dash-ref">{{ model.gearReference }}</small>
          <div class="dash-pedals" :class="{ 'dash-pedals--unavailable': !model.inputsAvailable }">
            <i class="dash-pedals__gas"><span :style="{ width: `${model.throttlePct}%` }" /></i>
            <i class="dash-pedals__brake"><span :style="{ width: `${model.brakePct}%` }" /></i>
          </div>
        </div>

        <div class="dash-grid dash-grid--electronics">
          <div v-for="cell in electronicsCells" :key="cell.id" class="dash-cell" :class="cellClass(cell)">
            <span class="dash-cell__label"><b>{{ cell.label }}</b></span>
            <strong class="dash-cell__value"><HudFixedDigits :value="cell.value" /></strong>
            <small v-if="cell.reference" class="dash-ref">{{ cell.reference }}</small>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style lang="scss">
// Not scoped: every rule sits under .dash-hud (kept in its own file so this component stays small).
@use '~/assets/scss/components/dashboard-hud';
</style>
