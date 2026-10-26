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
        :class="['rc-btn', 'rc-btn--toggle', `mode-${mode}`, { 'is-active': modelValue.includes(mode) }]"
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
// Interruttori rc-btn--toggle nel colore della sessione (stile nel tema): qui solo colore e misure.
// Un po' piu' bassi dei bottoni d'azione: sono tre per riga, accanto ad ogni funzione.
.session-mode-buttons button { --rc-toggle-color: var(--racing-practice); min-width: 0; min-height: 32px; padding: 5px 10px; font-size: 13px; }
.session-mode-buttons .mode-qualify { --rc-toggle-color: var(--racing-qualify); }
.session-mode-buttons .mode-race { --rc-toggle-color: var(--racing-race); }
@media(max-width:700px) { .session-mode-buttons { gap: 8px; }.session-mode-buttons button { padding-inline: 8px; } }
</style>
