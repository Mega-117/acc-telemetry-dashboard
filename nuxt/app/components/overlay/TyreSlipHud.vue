<script setup lang="ts">
import { computed } from 'vue'
import type { FastOverlayState, FastStateSlipState, FastStateTyre } from '~/composables/useFastStatePoller'

const props = defineProps<{
  fastState: FastOverlayState
  compact?: boolean
}>()

const stateLabels: Record<FastStateSlipState, string> = {
  ok: 'OK',
  limit: 'LIMITE',
  sliding: 'SCIVOLA',
  wheelspin: 'PATTINA',
  lockup: 'BLOCCAGGIO',
}

const idleTyres: FastStateTyre[] = (['FL', 'FR', 'RL', 'RR'] as const).map((id) => ({
  id,
  wheelSlip: null,
  wheelSlipScaled: null,
  slipBand: 'white',
  slipState: 'ok',
  slipRatio: null,
  pressurePsi: null,
  coreTempC: null,
}))

const hasLiveTyres = computed(() => props.fastState.isLive && props.fastState.tyres.length === 4)
const visibleTyres = computed(() => hasLiveTyres.value ? props.fastState.tyres : idleTyres)
const speedLabel = computed(() => hasLiveTyres.value && props.fastState.speedKmh !== null
  ? `${Math.round(props.fastState.speedKmh)} km/h`
  : 'in attesa')

function tyreFillStyle(tyre: FastStateTyre) {
  const scaled = typeof tyre.wheelSlipScaled === 'number' ? tyre.wheelSlipScaled : 0
  return { width: `${Math.max(4, Math.min(100, (scaled / 18) * 100))}%` }
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
          <span class="tyre-slip__state">{{ hasLiveTyres ? stateLabels[tyre.slipState] : 'WAIT' }}</span>
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
