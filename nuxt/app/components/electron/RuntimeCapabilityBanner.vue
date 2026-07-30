<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRuntimeCapabilityGate } from '~/composables/useRuntimeCapabilityGate'
import type { RuntimeUiModel } from '~/services/runtime/rendererRuntimeBootstrapAdapter'

const props = defineProps<{
  model?: RuntimeUiModel | null
}>()

const runtime = useRuntimeCapabilityGate()
const view = computed(() => props.model || runtime.model.value)
let release: (() => void) | null = null

onMounted(() => {
  release = runtime.connect()
})

onBeforeUnmount(() => {
  release?.()
  release = null
})
</script>

<template>
  <section
    v-if="view.visible"
    class="runtime-capability-banner"
    :class="`runtime-capability-banner--${view.tone}`"
    :role="view.tone === 'danger' ? 'alert' : 'status'"
    :aria-live="view.tone === 'danger' ? 'assertive' : 'polite'"
    aria-atomic="true"
  >
    <div class="runtime-capability-banner__copy">
      <strong>{{ view.title }}</strong>
      <span>{{ view.message }}</span>
      <small v-if="view.recovery">{{ view.recovery }}</small>
    </div>
    <div
      v-if="view.progress !== null"
      class="runtime-capability-banner__progress"
      role="progressbar"
      aria-label="Avanzamento aggiornamento dati"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="view.progress"
    >
      <span :style="{ width: `${view.progress}%` }" />
      <em>{{ view.progress }}%</em>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.runtime-capability-banner {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(24, 34, 48, 0.97);
  color: #f8fafc;
  font-family: 'Inter', sans-serif;
  z-index: 9000;

  &--warning {
    background: rgba(74, 50, 8, 0.97);
    border-color: rgba(251, 191, 36, 0.38);
  }

  &--danger {
    background: rgba(69, 19, 25, 0.98);
    border-color: rgba(248, 113, 113, 0.42);
  }
}

.runtime-capability-banner__copy {
  display: grid;
  gap: 2px;
  min-width: 0;

  strong {
    font-size: 13px;
  }

  span,
  small {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.78);
  }
}

.runtime-capability-banner__progress {
  position: relative;
  flex: 0 0 180px;
  height: 6px;
  overflow: visible;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #38bdf8;
    transition: width 180ms ease;
  }

  em {
    position: absolute;
    top: -5px;
    right: -38px;
    width: 34px;
    font-size: 11px;
    font-style: normal;
  }
}

@media (max-width: 720px) {
  .runtime-capability-banner {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .runtime-capability-banner__progress {
    flex-basis: 6px;
    margin-right: 38px;
  }
}
</style>
