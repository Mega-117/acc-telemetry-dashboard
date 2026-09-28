<script setup lang="ts">
import { Flag, Route, Gauge, Target } from '@lucide/vue'

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
      <button type="button" role="switch" class="quick-panel-voice-button" :class="{ 'is-on': coach }"
        :aria-checked="coach" aria-label="Avvisi giro" :disabled="disabled"
        data-overlay-wheel-action="coach" @click="emit('toggle-coach')">
        <Flag :size="20" aria-hidden="true" /><span>Giri</span>
        <small aria-hidden="true">{{ coach ? 'ON' : 'OFF' }}</small>
      </button>
      <button type="button" role="switch" class="quick-panel-voice-button" :class="{ 'is-on': references }"
        :aria-checked="references" aria-label="Riferimenti giro" :disabled="disabled"
        data-overlay-wheel-action="references" @click="emit('toggle-references')">
        <Route :size="20" aria-hidden="true" /><span>Riferimenti</span>
        <small aria-hidden="true">{{ references ? 'ON' : 'OFF' }}</small>
      </button>
      <button type="button" role="switch" class="quick-panel-voice-button" :class="{ 'is-on': pressure }"
        :aria-checked="pressure" aria-label="Avvisi pressioni" :disabled="disabled"
        data-overlay-wheel-action="pressure-audio" @click="emit('toggle-pressure')">
        <Gauge :size="20" aria-hidden="true" /><span>Pressioni</span>
        <small aria-hidden="true">{{ pressure ? 'ON' : 'OFF' }}</small>
      </button>
      <button type="button" role="switch" class="quick-panel-voice-button" :class="{ 'is-on': target }"
        :aria-checked="target" aria-label="Voce target giro" :disabled="disabled"
        data-overlay-wheel-action="target-voice" @click="emit('toggle-target')">
        <Target :size="20" aria-hidden="true" /><span>Target</span>
        <small aria-hidden="true">{{ target ? 'ON' : 'OFF' }}</small>
      </button>
    </div>
  </section>
</template>

<style scoped>
.quick-panel-voice-button {
  width: 64px;
  height: 64px;
  padding: 5px 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 1px solid #626262;
  border-radius: 0;
  --quick-action-bg: #292929;
  --quick-action-color: #d0d0d0;
  background: var(--quick-action-bg);
  color: var(--quick-action-color);
  font: inherit;
  font-size: 10px;
  font-weight: 600;
  line-height: 12px;
  cursor: pointer;
}
.quick-panel-voice-button.is-on {
  --quick-action-bg: #00e676;
  --quick-action-color: #052517;
  background: var(--quick-action-bg);
  border-color: #00ff88;
  color: var(--quick-action-color);
}
.quick-panel-voice-button small {
  font-size: 9px;
  font-weight: 800;
  line-height: 10px;
  letter-spacing: 0.6px;
}
.quick-panel-voice-button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
