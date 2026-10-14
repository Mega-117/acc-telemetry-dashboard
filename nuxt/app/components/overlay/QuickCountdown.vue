<script setup lang="ts">
import { computed, ref } from 'vue'
import { Timer } from '@lucide/vue'
defineProps<{ status: 'idle' | 'running' | 'finished'; display: string }>()
const emit = defineEmits<{ start: [seconds: number]; cancel: [] }>()
const minutes = ref(1)
const seconds = ref(0)
const duration = computed(() => Number(minutes.value) * 60 + Number(seconds.value))
const valid = computed(() => Number.isInteger(Number(minutes.value)) && Number.isInteger(Number(seconds.value))
  && minutes.value >= 0 && minutes.value <= 99 && seconds.value >= 0 && seconds.value <= 59 && duration.value > 0)
// PIP-526: presets and steps reachable from the wheel; seconds move by 5.
const PRESETS = [1, 3, 5, 10]
function preset(value: number) { minutes.value = value; seconds.value = 0 }
function stepSeconds(direction: 1 | -1) {
  const total = Math.max(0, Math.min(99 * 60 + 55, Number(minutes.value) * 60 + Number(seconds.value) + direction * 5))
  minutes.value = Math.floor(total / 60); seconds.value = total % 60
}
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
        <div class="quick-countdown__field"><label for="timer-minutes">Minuti</label><div class="quick-countdown__stepper">
          <button type="button" aria-label="Diminuisci minuti" data-overlay-wheel-action="timer-minutes-minus" :disabled="minutes <= 0" @click="minutes = Math.max(0, Number(minutes) - 1)">−</button>
          <input id="timer-minutes" v-model="minutes" type="number" min="0" max="99" step="1" aria-label="Minuti timer">
          <button type="button" aria-label="Aumenta minuti" data-overlay-wheel-action="timer-minutes-plus" :disabled="minutes >= 99" @click="minutes = Math.min(99, Number(minutes) + 1)">+</button>
        </div></div>
        <div class="quick-countdown__field"><label for="timer-seconds">Secondi</label><div class="quick-countdown__stepper">
          <button type="button" aria-label="Diminuisci secondi" data-overlay-wheel-action="timer-seconds-minus" :disabled="duration <= 0" @click="stepSeconds(-1)">−</button>
          <input id="timer-seconds" v-model="seconds" type="number" min="0" max="59" step="1" aria-label="Secondi timer">
          <button type="button" aria-label="Aumenta secondi" data-overlay-wheel-action="timer-seconds-plus" @click="stepSeconds(1)">+</button>
        </div></div>
      </div>
      <p>Riapparirà negli ultimi 5 secondi. Tre bip alla fine.</p>
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
.quick-countdown__fields { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
.quick-countdown__presets { display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin-top:16px; }
.quick-countdown__presets button { min-height:34px; font-size:12px; }
.quick-countdown__presets button[aria-pressed="true"] { border-color:#ffffff90; background:#ffffff14; box-shadow:inset 0 -2px #ff0024; }
button[data-overlay-selected] { outline:2px solid #ffff00; outline-offset:2px; }
label { display:grid; gap:8px; font-size:12px; color:#bbb; }
.quick-countdown__field { display:grid; gap:8px; }
.quick-countdown__stepper { display:grid; grid-template-columns:28px minmax(0,1fr) 28px; gap:4px; }
.quick-countdown__stepper input { padding:8px 0; appearance:textfield; }
.quick-countdown__stepper input::-webkit-inner-spin-button { appearance:none; }
input { width:100%; min-width:0; box-sizing:border-box; background:#111; color:#fff; border:1px solid #555; border-radius:0; padding:10px; font-size:26px; text-align:center; }
p { font-size:12px; color:#bbb; line-height:1.5; }
.quick-countdown__actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
button { min-height:40px; border:1px solid #555; border-radius:0; background:#191919; color:#fff; font-weight:600; cursor:pointer; }
button:disabled { opacity:.35; cursor:default; }
button:focus-visible, input:focus-visible { outline:2px solid #ffff00; outline-offset:2px; }
.quick-countdown__actions button:first-child { background:#49000b; border-color:#ff2440; }
.quick-countdown__time { margin-top:20px; font-size:64px; font-weight:700; text-align:center; font-variant-numeric:tabular-nums; }
.quick-countdown__time + p { text-align:center; }
.quick-countdown__end { width:100%; }
</style>
