<script setup lang="ts">
import { computed } from 'vue'
import {
  CHATTERBOX_PROSODY_MAX,
  CHATTERBOX_PROSODY_MIN,
  CHATTERBOX_PROSODY_PRESETS,
} from '#shared/chatterboxProsody'

const props = defineProps<{
  exaggeration: number
  cfgWeight: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:exaggeration': [value: number]
  'update:cfgWeight': [value: number]
}>()

const activePreset = computed(() => CHATTERBOX_PROSODY_PRESETS.find(preset => (
  preset.exaggeration === props.exaggeration && preset.cfgWeight === props.cfgWeight
))?.id || 'custom')

function applyPreset(preset: typeof CHATTERBOX_PROSODY_PRESETS[number]) {
  emit('update:exaggeration', preset.exaggeration)
  emit('update:cfgWeight', preset.cfgWeight)
}

function sliderValue(event: Event) {
  return Number((event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="prosody-panel" aria-labelledby="chatterbox-prosody-title">
    <header>
      <div>
        <strong id="chatterbox-prosody-title">Tonalità</strong>
        <p>Questi controlli funzionano con Multilingual V3 italiano; i tag nel testo no.</p>
      </div>
      <span v-if="activePreset === 'custom'" class="custom-badge">Personalizzata</span>
    </header>

    <div class="preset-grid">
      <button
        v-for="preset in CHATTERBOX_PROSODY_PRESETS"
        :key="preset.id"
        type="button"
        :class="{ active: activePreset === preset.id }"
        :disabled="disabled"
        @click="applyPreset(preset)"
      >
        <strong>{{ preset.label }}</strong>
        <small>{{ preset.description }}</small>
      </button>
    </div>

    <div class="slider-grid">
      <label>
        <span>Espressività <output>{{ exaggeration.toFixed(2) }}</output></span>
        <input
          :value="exaggeration"
          type="range"
          :min="CHATTERBOX_PROSODY_MIN"
          :max="CHATTERBOX_PROSODY_MAX"
          step="0.05"
          :disabled="disabled"
          @input="emit('update:exaggeration', sliderValue($event))"
        >
      </label>
      <label>
        <span>Aderenza e ritmo <output>{{ cfgWeight.toFixed(2) }}</output></span>
        <input
          :value="cfgWeight"
          type="range"
          :min="CHATTERBOX_PROSODY_MIN"
          :max="CHATTERBOX_PROSODY_MAX"
          step="0.05"
          :disabled="disabled"
          @input="emit('update:cfgWeight', sliderValue($event))"
        >
      </label>
    </div>
  </section>
</template>

<style scoped>
.prosody-panel { display: grid; gap: 1rem; padding: 1rem; border: 1px solid #293744; border-radius: 14px; background: rgba(8, 13, 19, .62); }
.prosody-panel header { display: flex; justify-content: space-between; gap: 1rem; }
.prosody-panel p { margin: .25rem 0 0; color: #8f9ba8; font-size: .8rem; }
.custom-badge { align-self: flex-start; color: #e2c777; font-size: .75rem; font-weight: 800; }
.preset-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .65rem; }
.preset-grid button { display: grid; gap: .25rem; padding: .7rem; border: 1px solid #354453; border-radius: 10px; background: #17222d; color: #edf2f7; text-align: left; cursor: pointer; }
.preset-grid button.active { border-color: #d6b25b; background: rgba(214, 178, 91, .14); }
.preset-grid button:disabled { opacity: .5; cursor: not-allowed; }
.preset-grid small { color: #9da9b6; line-height: 1.35; }
.slider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.slider-grid label { display: grid; gap: .45rem; color: #dfe6ee; font-size: .82rem; font-weight: 750; }
.slider-grid span { display: flex; justify-content: space-between; gap: 1rem; }
.slider-grid output { color: #e2c777; }
.slider-grid input { width: 100%; accent-color: #d6b25b; }

@media (max-width: 760px) {
  .preset-grid,
  .slider-grid { grid-template-columns: 1fr 1fr; }
}
</style>
