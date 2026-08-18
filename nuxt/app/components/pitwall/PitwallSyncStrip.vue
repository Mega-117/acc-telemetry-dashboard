<script setup lang="ts">
// ============================================
// PitwallSyncStrip - una riga sola che dice se l'ordine e' allineato
// alla macchina, ancora da mandare, in attesa dei box, o fallito.
// ============================================

import type { PitwallOrderStatus } from '~/utils/pitwallPresentation'

defineProps<{ status: PitwallOrderStatus }>()
</script>

<template>
  <p
    class="sync"
    :class="`sync--${status.state}`"
    aria-live="polite"
  >
    <span
      class="sync__dot"
      aria-hidden="true"
    ></span>
    <strong>{{ status.label }}</strong>
    <span
      v-if="status.detail"
      class="sync__detail"
    >{{ status.detail }}</span>
  </p>
</template>

<style lang="scss" scoped>
.sync {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 7px 12px;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
}

.sync__dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: currentcolor;
}

.sync strong {
  flex: none;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sync__detail {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync--in-sync { border-color: rgba(79, 209, 197, 0.4); color: #4fd1c5; }
.sync--draft { border-color: rgba(var(--accent-rgb), 0.5); color: var(--accent); }
.sync--pending { border-color: rgba(255, 176, 46, 0.45); color: #ffb02e; }
.sync--failed { border-color: rgba(255, 91, 91, 0.5); color: #ff5b5b; }
</style>
