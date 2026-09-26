<script setup lang="ts">
import RacingSwitch from '~/components/ui/RacingSwitch.vue'

defineProps<{
  coach: boolean
  references: boolean
  pressure: boolean
  target: boolean
  disabled: boolean
}>()
const emit = defineEmits<{
  'toggle-coach': []
  'toggle-references': []
  'toggle-pressure': []
  'toggle-target': []
}>()
</script>

<template>
  <section class="quick-panel-section" aria-label="Avvisi vocali">
    <h2 class="quick-panel-heading">Avvisi vocali</h2>
    <div class="quick-panel-voice-grid">
      <label class="quick-panel-voice-row">
        <span>Giri</span>
        <RacingSwitch :model-value="coach" label="Avvisi giro" :disabled="disabled"
          data-overlay-wheel-action="coach" @update:model-value="emit('toggle-coach')" />
      </label>
      <label class="quick-panel-voice-row">
        <span>Riferimenti</span>
        <RacingSwitch :model-value="references" label="Riferimenti giro" :disabled="disabled"
          data-overlay-wheel-action="references" @update:model-value="emit('toggle-references')" />
      </label>
      <label class="quick-panel-voice-row">
        <span>Pressioni</span>
        <RacingSwitch :model-value="pressure" label="Avvisi pressioni" :disabled="disabled"
          data-overlay-wheel-action="pressure-audio" @update:model-value="emit('toggle-pressure')" />
      </label>
      <label class="quick-panel-voice-row">
        <span>Target</span>
        <RacingSwitch :model-value="target" label="Voce target giro" :disabled="disabled"
          data-overlay-wheel-action="target-voice" @update:model-value="emit('toggle-target')" />
      </label>
    </div>
  </section>
</template>
