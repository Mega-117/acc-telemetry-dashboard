<script setup lang="ts">
import { computed, ref } from 'vue'
import { Timer } from '@lucide/vue'
import ControlKNumberField from '~/components/overlay/ControlKNumberField.vue'
import { stepNumberField, type NumberFieldLimits } from '~/utils/controlKNumberField'
defineProps<{ status: 'idle' | 'running' | 'finished'; display: string }>()
const emit = defineEmits<{ start: [seconds: number]; cancel: [] }>()
const minutes = ref(1)
const seconds = ref(0)
const duration = computed(() => Number(minutes.value) * 60 + Number(seconds.value))
const valid = computed(() => duration.value > 0)
// PIP-526: presets reachable from the wheel. PIP-556: MIN | SEC with the shared
// number field (wheel OK + Up/Down, mouse scroll, typed digits), no +/- buttons.
const PRESETS = [1, 3, 5, 10]
function preset(value: number) { minutes.value = value; seconds.value = 0 }
type Field = 'minutes' | 'seconds'
const LIMITS: Record<Field, NumberFieldLimits> = {
  minutes: { min: 0, max: 99, digits: 2, wrap: false },
  seconds: { min: 0, max: 59, digits: 2, wrap: true },
}
const editing = ref<Field | null>(null)
function set(field: Field, value: number) { (field === 'minutes' ? minutes : seconds).value = value }
function toggle(field: Field) { editing.value = editing.value === field ? null : field }
function handleWheelCommand(command: string | undefined): boolean {
  if (!editing.value) return false
  if (command === 'activate-action' || command === 'primary' || command === 'back') { editing.value = null; return true }
  if (command !== 'next-action' && command !== 'previous-action') return false
  const field = editing.value
  set(field, stepNumberField((field === 'minutes' ? minutes : seconds).value, command === 'next-action' ? 1 : -1, LIMITS[field]))
  return true
}
defineExpose({ handleWheelCommand })
</script>

<template>
  <section class="quick-countdown" aria-label="Timer">
    <header><Timer :size="20" aria-hidden="true" /><h2>Timer</h2></header>
    <template v-if="status === 'idle'">
      <div class="quick-countdown__presets" role="group" aria-label="Durate rapide">
        <button v-for="value in PRESETS" :key="value" type="button" :data-overlay-wheel-action="`timer-preset-${value}`"
          :aria-pressed="minutes === value && seconds === 0" @click="preset(value)">{{ value }} min</button>
      </div>
      <div class="quick-countdown__fields">
        <ControlKNumberField :value="minutes" label="MIN" action="timer-minutes" name="Minuti timer" v-bind="LIMITS.minutes"
          :editing="editing === 'minutes'" @toggle="toggle('minutes')" @update:value="set('minutes', $event)" />
        <ControlKNumberField :value="seconds" label="SEC" action="timer-seconds" name="Secondi timer" v-bind="LIMITS.seconds"
          :editing="editing === 'seconds'" @toggle="toggle('seconds')" @update:value="set('seconds', $event)" />
        <p>Riappare negli ultimi 5 secondi, tre bip alla fine.</p>
      </div>
      <div class="quick-countdown__actions">
        <button type="button" aria-label="Avvia timer" data-overlay-wheel-action="timer-start" :disabled="!valid" @click="emit('start', duration)">Avvia</button>
        <button type="button" data-overlay-wheel-action="timer-back" @click="emit('cancel')">Indietro</button>
      </div>
    </template>
    <template v-else>
      <div class="quick-countdown__time" role="timer" aria-label="Tempo rimanente">{{ display }}</div>
      <p role="status">{{ status === 'finished' ? 'Tempo scaduto' : 'Timer in corso' }}</p>
      <button type="button" class="quick-countdown__end" data-overlay-wheel-action="timer-end" @click="emit('cancel')">{{ status === 'finished' ? 'Chiudi timer' : 'Annulla timer' }}</button>
    </template>
  </section>
</template>

<style scoped>
.quick-countdown { width: 100%; color: #eee; }
header { display:flex; align-items:center; gap:8px; padding-bottom:16px; border-bottom:1px solid #ffffff24; }
h2 { font-size:16px; margin:0; }
.quick-countdown__fields { display:grid; grid-template-columns:72px 72px minmax(0,1fr); align-items:center; gap:6px; margin-top:12px; }
.quick-countdown__fields p { margin:0; }
.quick-countdown__presets { display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin-top:16px; }
.quick-countdown__presets button { min-height:34px; font-size:12px; }
.quick-countdown__presets button[aria-pressed="true"] { border-color:#ffffff90; background:#ffffff14; box-shadow:inset 0 -2px #ff0024; }
button[data-overlay-selected] { outline:2px solid #ffff00; outline-offset:2px; }
p { font-size:12px; color:#bbb; line-height:1.5; }
.quick-countdown__actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.quick-countdown__actions button, .quick-countdown__presets button, .quick-countdown__end { min-height:40px; border:1px solid #555; border-radius:0; background:#191919; color:#fff; font-weight:600; cursor:pointer; }
.quick-countdown__actions button:disabled { opacity:.35; cursor:default; }
.quick-countdown__actions button:focus-visible, .quick-countdown__presets button:focus-visible { outline:2px solid #ffff00; outline-offset:2px; }
.quick-countdown__actions button:first-child { background:#49000b; border-color:#ff2440; }
.quick-countdown__time { margin-top:20px; font-size:64px; font-weight:700; text-align:center; font-variant-numeric:tabular-nums; }
.quick-countdown__time + p { text-align:center; }
.quick-countdown__end { width:100%; }
</style>
