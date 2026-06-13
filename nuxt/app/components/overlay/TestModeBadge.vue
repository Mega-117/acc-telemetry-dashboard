<script setup lang="ts">
/**
 * TestModeBadge.vue (PIP-106)
 * Badge "TEST MODE" riutilizzabile: appare solo quando la test-mode dev è
 * attiva. Mostra il budget corrente (es. "TEST 90s"). Solo-sviluppo.
 */
import { useDevTestMode } from '~/composables/useDevTestMode'

const { isTestMode, badgeLabel } = useDevTestMode()
</script>

<template>
  <Transition name="chip-pop">
    <span v-if="isTestMode" class="test-mode-badge" role="status" aria-label="Modalità test attiva">
      {{ badgeLabel }}
    </span>
  </Transition>
</template>

<style scoped>
.test-mode-badge {
  display: inline-grid;
  place-items: center;
  padding: 2px 8px;
  border: 1px solid rgba(255, 196, 0, 0.6);
  border-radius: 999px;
  background: rgba(255, 196, 0, 0.16);
  color: #ffd84d;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}

.chip-pop-enter-active {
  transition: opacity 200ms ease-out, transform 240ms cubic-bezier(0.3, 1.36, 0.56, 1);
}
.chip-pop-leave-active {
  transition: opacity 140ms ease-in, transform 140ms ease-in;
}
.chip-pop-enter-from,
.chip-pop-leave-to {
  opacity: 0;
  transform: scale(0.82);
}
</style>
