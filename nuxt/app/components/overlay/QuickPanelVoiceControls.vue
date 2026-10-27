<script setup lang="ts">
import { Flag, Route, Gauge, Target } from '@lucide/vue'
import { useI18n } from '~/i18n'

const { t } = useI18n()

withDefaults(defineProps<{
  coach: boolean
  references: boolean
  pressure: boolean
  target: boolean
  disabled: boolean
  extendedControls?: boolean
  /** PIP-533: the session the ON/OFF refers to ("Gara"); null when unknown. */
  sessionLabel?: string | null
}>(), { extendedControls: true, sessionLabel: null })
const emit = defineEmits<{
  'toggle-coach': []
  'toggle-references': []
  'toggle-pressure': []
  'toggle-target': []
}>()
</script>

<template>
  <section class="quick-panel-section" data-quick-panel-section="voice" :aria-label="t('controlK.voiceAlerts')">
    <h2 class="quick-panel-heading">{{ t('controlK.voiceAlerts') }}<template v-if="sessionLabel"> · {{ sessionLabel }}</template></h2>
    <div class="quick-panel-voice-grid">
      <button type="button" role="switch" class="quick-panel-voice-button" :class="{ 'is-on': coach }"
        :aria-checked="coach" :aria-label="t('quickPanel.voice.lapsAria')" :disabled="disabled"
        data-overlay-wheel-action="coach" @click="emit('toggle-coach')">
        <Flag :size="20" aria-hidden="true" /><span>{{ t('quickPanel.voice.laps') }}</span>
        <small aria-hidden="true">{{ coach ? 'ON' : 'OFF' }}</small>
      </button>
      <button type="button" role="switch" class="quick-panel-voice-button" :class="{ 'is-on': references }"
        :aria-checked="references" :aria-label="t('quickPanel.voice.referencesAria')" :disabled="disabled"
        data-overlay-wheel-action="references" @click="emit('toggle-references')">
        <Route :size="20" aria-hidden="true" /><span>{{ t('quickPanel.voice.references') }}</span>
        <small aria-hidden="true">{{ references ? 'ON' : 'OFF' }}</small>
      </button>
      <button v-if="extendedControls" type="button" role="switch" class="quick-panel-voice-button" :class="{ 'is-on': pressure }"
        :aria-checked="pressure" :aria-label="t('quickPanel.voice.pressuresAria')" :disabled="disabled"
        data-overlay-wheel-action="pressure-audio" @click="emit('toggle-pressure')">
        <Gauge :size="20" aria-hidden="true" /><span>{{ t('quickPanel.voice.pressures') }}</span>
        <small aria-hidden="true">{{ pressure ? 'ON' : 'OFF' }}</small>
      </button>
      <button v-if="extendedControls" type="button" role="switch" class="quick-panel-voice-button" :class="{ 'is-on': target }"
        :aria-checked="target" :aria-label="t('quickPanel.voice.targetAria')" :disabled="disabled"
        data-overlay-wheel-action="target-voice" @click="emit('toggle-target')">
        <Target :size="20" aria-hidden="true" /><span>{{ t('quickPanel.voice.target') }}</span>
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
