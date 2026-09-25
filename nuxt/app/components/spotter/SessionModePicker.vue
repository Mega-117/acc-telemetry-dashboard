<script setup lang="ts">
import {
  SPOTTER_SESSION_MODES,
  toggleSpotterSessionMode,
  type SpotterSessionMode,
} from '~/services/spotter/spotterSessionPolicy'

const props = defineProps<{
  modelValue: SpotterSessionMode[]
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SpotterSessionMode[]]
}>()

const labels: Record<SpotterSessionMode, string> = {
  practice: 'Prove libere',
  qualify: 'Qualifica',
  race: 'Gara',
}

function toggle(mode: SpotterSessionMode) {
  emit('update:modelValue', toggleSpotterSessionMode(props.modelValue, mode))
}
</script>

<template>
  <div class="session-mode-picker">
    <div
      class="session-mode-buttons"
      role="group"
      :aria-label="label"
    >
      <button
        v-for="mode in SPOTTER_SESSION_MODES"
        :key="mode"
        type="button"
        :class="['racing-button', `mode-${mode}`, { 'is-active': modelValue.includes(mode) }]"
        :aria-pressed="modelValue.includes(mode)"
        @click="toggle(mode)"
      >
        {{ labels[mode] }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.session-mode-buttons { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
.session-mode-buttons button { --mode-color: var(--racing-practice); isolation: isolate; position: relative; min-height: 42px; min-width: 0; padding: 9px 10px; border: 0; background: #858585; color: #bbb; font: 600 11px/1.2 'Segoe UI',sans-serif; }
.session-mode-buttons .mode-qualify { --mode-color: var(--racing-qualify); }.session-mode-buttons .mode-race { --mode-color: var(--racing-race); }
.session-mode-buttons button::before { content: ''; position: absolute; inset: 1px; width: auto; height: auto; transform: none; z-index: -1; background: #080808; clip-path: polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px)); }
.session-mode-buttons button::after { display: none; }
.session-mode-buttons button.is-active { color: var(--mode-color); background: var(--mode-color); }
.session-mode-buttons button.is-active::before { background: linear-gradient(110deg,color-mix(in srgb,var(--mode-color) 23%,transparent),color-mix(in srgb,var(--mode-color) 8%,transparent)),#080808; }
.session-mode-buttons button:hover { color: #fff; }.session-mode-buttons button:focus-visible { outline: 2px solid #fff; outline-offset: -3px; }
@media(max-width: 700px) { .session-mode-buttons { gap: 8px; }.session-mode-buttons button { padding-inline: 8px; } }
</style>
