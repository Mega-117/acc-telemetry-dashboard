<script setup lang="ts">
import { computed, ref } from 'vue'
import ControlKNumberField from '~/components/overlay/ControlKNumberField.vue'
import ControlKViewHeader from '~/components/overlay/ControlKViewHeader.vue'
import { fieldStartPart, fieldWheelCommand, type NumberFieldSpec } from '~/utils/controlKNumberField'
// armed: while running, the first wheel press only reveals "Annulla timer";
// a second OK cancels it (no accidental stop while driving, no permanent highlight).
defineProps<{ status: 'idle' | 'running' | 'finished'; display: string; armed?: boolean }>()
const emit = defineEmits<{ start: [seconds: number]; cancel: []; back: [] }>()
// PIP-526: presets reachable from the wheel. PIP-611: one MM:SS field in seconds
// (typed 1 3 0 = 01:30; wheel OK engages the minutes, OK again the seconds).
const duration = ref(5 * 60)
const valid = computed(() => duration.value > 0)
const PRESETS = [5, 10, 20, 30]
function preset(value: number) { duration.value = value * 60 }
const SPEC: NumberFieldSpec = {
  parts: [
    { label: 'MIN', min: 0, max: 99, wrap: false, digits: 2, unit: 60, pad: 2 },
    { label: 'SEC', min: 0, max: 59, wrap: true, digits: 2, unit: 1, separator: ':' },
  ],
  min: 0, max: 99 * 60 + 59,
}
const part = ref<number | null>(null)
function toggle() { part.value = part.value === null ? fieldStartPart(SPEC) : null }
function handleWheelCommand(command: string | undefined): boolean {
  const result = fieldWheelCommand(part.value, duration.value, command, SPEC)
  if (!result.handled) return false
  if (result.value !== null) duration.value = result.value
  part.value = result.part
  return true
}
defineExpose({ handleWheelCommand })
</script>

<template>
  <section class="quick-countdown" :class="{ 'quick-countdown--quiet': status === 'running' && !armed }" aria-label="Timer">
    <!-- PIP-556: shared Control K structure: ← header, fields, shortcuts, hint, one primary action. -->
    <ControlKViewHeader title="Timer" action="timer-back"
      @back="status === 'idle' ? emit('cancel') : emit('back')" />
    <template v-if="status === 'idle'">
      <div class="ck-editor__fields">
        <ControlKNumberField class="ck-field--time" :value="duration" :spec="SPEC" label="DURATA" action="timer-time" name="Durata timer"
          :part="part" @toggle="toggle" @release="part = null" @update:value="duration = $event ?? duration" />
      </div>
      <div class="ck-editor__shortcuts" role="group" aria-label="Durate rapide">
        <button v-for="value in PRESETS" :key="value" type="button" :data-overlay-wheel-action="`timer-preset-${value}`"
          :aria-pressed="duration === value * 60" @click="preset(value)">{{ value }} min</button>
      </div>
      <p v-if="part !== null" class="ck-editor__hint">Su/Giù cambiano {{ SPEC.parts[part]!.label }} · OK passa al successivo · Indietro fatto</p>
      <div class="ck-editor__actions">
        <button type="button" class="ck-editor__primary" aria-label="Avvia timer" data-overlay-wheel-action="timer-start" :disabled="!valid" @click="emit('start', duration)">Avvia</button>
      </div>
    </template>
    <template v-else>
      <div class="quick-countdown__time" role="timer" aria-label="Tempo rimanente">{{ display }}</div>
      <p class="ck-editor__hint quick-countdown__state" role="status">{{ status === 'finished' ? 'Tempo scaduto.'
        : armed ? 'Premi OK di nuovo per annullare il timer.' : 'Timer in corso · Indietro chiude il pannello, il timer continua.' }}</p>
      <div class="ck-editor__actions">
        <button type="button" class="quick-countdown__end" :class="{ 'ck-editor__primary': status === 'finished' || armed }"
          data-overlay-wheel-action="timer-end" @click="emit('cancel')">{{ status === 'finished' ? 'Chiudi timer' : 'Annulla timer' }}</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.quick-countdown { display: grid; gap: 10px; width: 100%; color: #eee; }
.quick-countdown__time { margin: 4px 0 0; font-size: 56px; font-weight: 700; line-height: 1; text-align: center; font-variant-numeric: tabular-nums; }
.quick-countdown__state { text-align: center; }
.quick-countdown__end { min-width: 140px; min-height: 36px; padding: 0 16px; border: 1px solid #ffffff30; border-radius: 0; background: #ffffff08; color: #eee; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
/* Running and not armed: the wheel selection is not shown until a command is pressed. */
.quick-countdown--quiet :deep([data-overlay-selected]) { outline: none !important; box-shadow: none !important; }
</style>
