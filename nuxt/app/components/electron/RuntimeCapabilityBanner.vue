<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRuntimeCapabilityGate } from '~/composables/useRuntimeCapabilityGate'
import type { RuntimeUiModel } from '~/services/runtime/rendererRuntimeBootstrapAdapter'

// Runtime status (data update, offline, cloud functions suspended): a small card in the top-right message column
// (AppNotifications' slot), no longer a bar across the page that pushed the content down. It goes away by itself
// when the status is back to normal; warnings stay as long as their cause.
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
  <Teleport defer to="#app-toast-slot">
    <Transition name="runtime-status">
      <section
        v-if="view.visible"
        class="runtime-capability-banner"
        :class="`runtime-capability-banner--${view.tone}`"
        :role="view.tone === 'danger' ? 'alert' : 'status'"
        :aria-live="view.tone === 'danger' ? 'assertive' : 'polite'"
        aria-atomic="true"
        :title="view.recovery || undefined"
      >
        <div class="runtime-capability-banner__copy">
          <strong>{{ view.title }}</strong>
          <span>{{ view.message }}</span>
          <div
            v-if="view.progress !== null"
            class="runtime-capability-banner__progress"
            role="progressbar"
            aria-label="Avanzamento aggiornamento dati"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="view.progress"
          >
            <i><span :style="{ width: `${view.progress}%` }" /></i>
            <em>{{ view.progress }}%</em>
          </div>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
@use '~/assets/scss/racing-toast' as toast;

.runtime-capability-banner {
  @include toast.toast;
  @include toast.toast-tones;
  align-items: flex-start;
  width: 360px;
  max-width: 100%;
}

.runtime-capability-banner__copy {
  display: grid;
  gap: 3px;
  min-width: 0;
  flex: 1;

  strong { font: italic 700 14px/1.2 'Racer Display', sans-serif; text-transform: uppercase; letter-spacing: .02em; }
  span { font-size: 12px; color: #ffffffbf; }
}

.runtime-capability-banner__progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;

  i { flex: 1; height: 3px; background: #ffffff1f; }
  span { display: block; height: 100%; background: var(--toast-tone); box-shadow: 0 0 6px var(--toast-tone); transition: width 180ms ease; }
  em { font: 600 11px 'Inter', sans-serif; font-style: normal; font-variant-numeric: tabular-nums; color: #ffffffcc; }
}

@include toast.toast-motion(runtime-status);
</style>
