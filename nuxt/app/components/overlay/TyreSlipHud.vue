<script setup lang="ts">
import { computed } from 'vue'
import type { FastOverlayState, FastStateTyre } from '~/composables/useFastStatePoller'
import { tyreSlipBarStyle, tyreSlipStateLabel } from '~/utils/tyreSlipPresentation'

const props = defineProps<{
  fastState: FastOverlayState
  compact?: boolean
}>()


const idleTyres: FastStateTyre[] = (['FL', 'FR', 'RL', 'RR'] as const).map((id) => ({
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
}))

const hasLiveTyres = computed(() => props.fastState.isLive && props.fastState.tyres.length === 4)
const visibleTyres = computed(() => hasLiveTyres.value ? props.fastState.tyres : idleTyres)
const speedLabel = computed(() => props.fastState.speedKmh !== null
  ? `${Math.round(props.fastState.speedKmh)} km/h`
  : 'in attesa')

function tyreFillStyle(tyre: FastStateTyre) {
  return tyreSlipBarStyle(tyre.wheelSlipScaled)
}

function formatSlip(tyre: FastStateTyre) {
  return typeof tyre.wheelSlip === 'number' ? tyre.wheelSlip.toFixed(1) : '--'
}
</script>

<template>
  <section
    class="tyre-slip-hud"
    :class="{ 'tyre-slip-hud--compact': compact, 'tyre-slip-hud--idle': !hasLiveTyres }"
    aria-label="Scivolamento pneumatici live"
  >
    <header class="tyre-slip-hud__header">
      <span>Gomme</span>
      <strong>{{ speedLabel }}</strong>
    </header>
    <div class="tyre-slip-grid">
      <div
        v-for="tyre in visibleTyres"
        :key="tyre.id"
        class="tyre-slip"
        :class="[`tyre-slip--${tyre.slipBand}`, `tyre-slip--state-${tyre.slipState}`]"
      >
        <div class="tyre-slip__topline">
          <strong>{{ tyre.id }}</strong>
          <span class="tyre-slip__state">{{ tyreSlipStateLabel(tyre.slipState, hasLiveTyres) }}</span>
        </div>
        <div class="tyre-slip__bar" aria-hidden="true">
          <span :style="tyreFillStyle(tyre)" />
        </div>
        <div class="tyre-slip__meta">
          <span>{{ formatSlip(tyre) }}</span>
          <span v-if="!compact && tyre.pressurePsi !== null">{{ tyre.pressurePsi.toFixed(1) }} psi</span>
        </div>
      </div>
    </div>
  </section>
</template>
