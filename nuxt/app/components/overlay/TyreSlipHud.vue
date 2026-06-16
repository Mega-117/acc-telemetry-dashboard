<script setup lang="ts">
import type { FastOverlayState, FastStateSlipBand, FastStateTyre } from '~/composables/useFastStatePoller'

const props = defineProps<{
  fastState: FastOverlayState
  compact?: boolean
}>()

const bandLabels: Record<FastStateSlipBand, string> = {
  white: 'ok',
  green: 'grip',
  yellow: 'limite',
  orange: 'scivola',
  red: 'troppo',
}

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
    v-if="fastState.isLive && fastState.tyres.length === 4"
    class="tyre-slip-hud"
    :class="{ 'tyre-slip-hud--compact': compact }"
    aria-label="Scivolamento pneumatici live"
  >
    <header class="tyre-slip-hud__header">
      <span>Gomme</span>
      <strong v-if="fastState.speedKmh !== null">{{ Math.round(fastState.speedKmh) }} km/h</strong>
    </header>
    <div class="tyre-slip-grid">
      <div
        v-for="tyre in props.fastState.tyres"
        :key="tyre.id"
        class="tyre-slip"
        :class="`tyre-slip--${tyre.slipBand}`"
      >
        <div class="tyre-slip__topline">
          <strong>{{ tyre.id }}</strong>
          <span>{{ bandLabels[tyre.slipBand] }}</span>
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
