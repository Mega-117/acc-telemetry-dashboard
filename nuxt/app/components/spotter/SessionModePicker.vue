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
    <span>Sessioni abilitate</span>
    <div class="session-mode-buttons" role="group" :aria-label="label">
      <button
        v-for="mode in SPOTTER_SESSION_MODES"
        :key="mode"
        type="button"
        :class="{ 'is-active': modelValue.includes(mode) }"
        :aria-pressed="modelValue.includes(mode)"
        @click="toggle(mode)"
      >
        {{ labels[mode] }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.session-mode-picker {
  display: grid;
  gap: 8px;
  margin-top: 4px;
}

.session-mode-picker > span {
  color: rgba(255, 255, 255, 0.54);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.session-mode-buttons {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.session-mode-buttons button {
  min-height: 34px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.055);
  color: rgba(255, 255, 255, 0.66);
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}

.session-mode-buttons button:hover {
  border-color: rgba(255, 255, 255, 0.28);
  color: #fff;
}

.session-mode-buttons button.is-active {
  border-color: rgba(76, 210, 112, 0.58);
  background: rgba(44, 145, 75, 0.2);
  color: #e9ffed;
}

.session-mode-buttons button:focus-visible {
  outline: 2px solid #ff5a1f;
  outline-offset: 2px;
}
</style>
