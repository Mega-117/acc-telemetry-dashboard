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
@use '@/assets/scss/racing-settings' as controls;
.session-mode-buttons { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
.session-mode-buttons button { @include controls.action; --mode-color: var(--racing-practice); min-width: 0; padding-inline: 10px; color: #bbb; background: transparent; }
.session-mode-buttons button::before { display: none; }
.session-mode-buttons .mode-qualify { --mode-color: var(--racing-qualify); }.session-mode-buttons .mode-race { --mode-color: var(--racing-race); }
.session-mode-buttons button.is-active { --mode-text: var(--mode-color); --mode-fill: color-mix(in srgb,var(--mode-color) 8%,transparent); color: var(--mode-text); background: var(--mode-fill); }
// Hover must never hide the selected state immediately after a click.
.session-mode-buttons button:hover:not(:disabled) { color: var(--mode-text, #bbb); background: var(--mode-fill, #ffffff08); }
.session-mode-buttons button:hover:not(:disabled)::after { opacity: .7; }
@media(max-width:700px) { .session-mode-buttons { gap: 8px; }.session-mode-buttons button { padding-inline: 8px; } }
</style>
