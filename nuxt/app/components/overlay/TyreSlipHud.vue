<script setup lang="ts">
import { useI18n } from '~/i18n'
import { hudSourcePolicy } from '~/services/sim/hudSourceAdapter'

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

const hasLiveTyres = computed(() => props.fastState.isLive && props.fastState.isFresh && props.fastState.tyres.length > 0)
// Partial connectors publish only measured corners; preserve each known value.
const visibleTyres = computed(() => idleTyres.map(idle => hasLiveTyres.value
  ? props.fastState.tyres.find(tyre => tyre.id === idle.id) ?? idle : idle))
const hasSlipPolicy = computed(() => hudSourcePolicy(props.fastState).slipBands)

function tyreFillStyle(tyre: FastStateTyre) {
  return tyreSlipBarStyle(tyre.wheelSlipScaled)
}

// Without a measured slip the card shows WAIT and never an alarm tint.
function hasSlipData(tyre: FastStateTyre) {
  return hasLiveTyres.value && hasSlipPolicy.value && tyre.wheelSlip !== null
}

function formatSlip(tyre: FastStateTyre) {
  return typeof tyre.wheelSlip === 'number' ? tyre.wheelSlip.toFixed(1) : '--'
}
const { t } = useI18n()
</script>

<template>
  <section
    class="tyre-slip-hud"
    :class="{ 'tyre-slip-hud--compact': compact, 'tyre-slip-hud--idle': !hasLiveTyres }"
    aria-label="Scivolamento pneumatici live"
  >
    <!-- HUD style v2 (27/10): a title bar only; the speed left this HUD by product decision. -->
    <header class="tyre-slip-hud__header">
      <span>{{ t('overlays.tyres') }}</span>
    </header>
    <div class="tyre-slip-grid">
      <div
        v-for="tyre in visibleTyres"
        :key="tyre.id"
        class="tyre-slip"
        :class="[`tyre-slip--${tyre.slipBand}`, `tyre-slip--state-${tyre.slipState}`, { 'tyre-slip--waiting': !hasSlipData(tyre) }]"
      >
        <div class="tyre-slip__topline">
          <strong>{{ tyre.id }}</strong>
          <span class="tyre-slip__state">{{ tyreSlipStateLabel(tyre.slipState, hasLiveTyres && hasSlipPolicy && tyre.wheelSlip !== null) }}</span>
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
