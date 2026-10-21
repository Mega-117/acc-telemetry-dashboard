<script setup lang="ts">
// PIP-571: a faithful, inert copy of the real "pannello rapido" (Ctrl+K, ACC layout in Pausa):
// real RC logo, 2×5 buttons with the same icons and names, status row. It behaves like the real
// one: the mouse hovers to select and clicks to confirm; the wheel practice drives the same
// selection from the parent. Like the real panel, "Avvisi" (n/4) can open the view with the four
// voice alerts. Nothing here talks to the game.
import { ArrowLeft, Bell, CircleCheck, Flag, Fuel, Gauge, Headset, Info, Route, Target, Timer, Volume2 } from '@lucide/vue'
import { computed } from 'vue'
import { usePublicPath } from '~/composables/usePublicPath'
import { PRACTICE_TILES, VOICE_ALERTS, VOICE_TILE } from '~/services/onboarding/commandPractice'

const props = withDefaults(defineProps<{
  selected?: number | null
  confirmed?: number | null
  status?: string
  /** Shows the voice alerts view instead of the buttons. */
  voiceOpen?: boolean
  /** ON/OFF of the four voice alerts, in VOICE_ALERTS order. */
  voice?: readonly boolean[]
}>(), { selected: null, confirmed: null, status: '', voiceOpen: false, voice: () => VOICE_ALERTS.map(() => true) })
const emit = defineEmits<{ select: [index: number]; confirm: [index: number]; back: []; toggleVoice: [index: number] }>()
const { getPublicPath } = usePublicPath()

// Same icons as the real buttons (PressureTestPanel, SetupFuelPanel, PitwallOverlayButton, training-overlay).
const ICONS = [Gauge, CircleCheck, Fuel, Fuel, Headset, Target, Flag, Volume2, Timer, Bell]
const VOICE_ICONS = [Flag, Route, Gauge, Target]
const tiles = PRACTICE_TILES.map((label, i) => ({ label, icon: ICONS[i]! }))
const voiceOn = computed(() => props.voice.filter(Boolean).length)
</script>

<template>
  <div class="replica" aria-label="Pannello rapido (copia di prova)">
    <img class="replica__logo" :src="getPublicPath('/branding/auth/racercore-rc.svg')" alt="Racer Core" width="56" height="28">
    <div v-if="voiceOpen" class="replica__voice" data-replica-voice>
      <button type="button" class="replica__tile replica__back" aria-label="Indietro" data-replica-back @click="emit('back')">
        <ArrowLeft :size="16" aria-hidden="true" />
      </button>
      <p class="replica__voice-title">Avvisi vocali · Prove libere</p>
      <div class="replica__voice-grid">
        <button
          v-for="(name, i) in VOICE_ALERTS"
          :key="name"
          type="button"
          role="switch"
          class="replica__switch"
          :class="{ 'is-on': voice[i] }"
          :aria-checked="voice[i]"
          :data-replica-switch="i"
          @click="emit('toggleVoice', i)"
        >
          <component :is="VOICE_ICONS[i]" :size="20" aria-hidden="true" />
          <span>{{ name }}</span>
          <small aria-hidden="true">{{ voice[i] ? 'ON' : 'OFF' }}</small>
        </button>
      </div>
    </div>
    <div v-else class="replica__grid">
      <button
        v-for="(tile, i) in tiles"
        :key="tile.label"
        type="button"
        class="replica__tile"
        :class="{ 'is-selected': i === selected, 'is-confirmed': i === confirmed }"
        :data-replica-tile="i"
        @mouseenter="emit('select', i)"
        @focus="emit('select', i)"
        @click="emit('confirm', i)"
      >
        <small v-if="i === 0" class="replica__badge">BETA</small>
        <small v-else-if="i === VOICE_TILE" class="replica__badge replica__badge--count">{{ voiceOn }}/4</small>
        <component :is="tile.icon" :size="20" aria-hidden="true" />
        <span>{{ tile.label }}</span>
      </button>
    </div>
    <p class="replica__status" :class="{ 'is-voice': voiceOpen }"><Info :size="12" aria-hidden="true" /> {{ status || 'Seleziona una voce.' }}</p>
  </div>
</template>

<style scoped lang="scss">
$sel: #ffd400;
.replica { box-sizing: border-box; max-width: calc(100% - 24px); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px 12px; padding: 12px 12px 10px; background: #0b0b0b; border: 1px solid #ffffff26; box-shadow: 0 24px 60px rgba(0, 0, 0, .7); animation: replica-open .45s cubic-bezier(.22, .61, .36, 1); }
@keyframes replica-open { from { opacity: 0; transform: scale(.97) } to { opacity: 1; transform: none } }
.replica__logo { align-self: center; width: 56px; height: 28px; object-fit: contain; }
.replica__grid { display: grid; grid-template-columns: repeat(5, minmax(0, 72px)); gap: 5px; }
.replica__tile { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; height: 62px; padding: 4px; border: 1px solid #ffffff1f; border-radius: 0; background: #ffffff0f; color: #d9d9de; font: 600 10px/1.15 'Inter', sans-serif; text-align: center; cursor: pointer; transition: background .35s ease, color .35s ease, outline-color .35s ease;
  &:focus-visible { outline: none; }
  &.is-selected { outline: 2px solid $sel; outline-offset: -2px; color: #fff; }
  &.is-confirmed { background: $sel; color: #241c00; } }
.replica__badge { position: absolute; top: 3px; right: 3px; padding: 1px 3px; border: 1px solid #ffd43b88; color: #ffd43b; font-size: 7px; line-height: 1; }
.replica__badge--count { border-color: #00ff8888; color: #00ff88; .is-confirmed & { border-color: #241c0066; color: #241c00; } }
// Voice view: same height as the 2×5 grid, so the panel does not jump.
.replica__voice { display: grid; grid-template-columns: 40px auto; grid-template-rows: auto 64px; align-content: center; justify-content: start; gap: 8px; min-height: 129px; animation: replica-open .45s cubic-bezier(.22, .61, .36, 1); }
.replica__back { grid-row: 2; grid-column: 1; height: 64px; }
.replica__voice-title { grid-row: 1; grid-column: 2; margin: 0; font: 700 10px/1.2 'Inter', sans-serif; text-transform: uppercase; letter-spacing: .06em; color: #d9d9de; }
.replica__voice-grid { grid-row: 2; grid-column: 2; }
.replica__status.is-voice { color: $sel; font-weight: 600; }
.replica__voice-grid { display: grid; grid-template-columns: repeat(4, 64px); gap: 5px; align-content: start; }
.replica__switch { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; height: 64px; padding: 5px 2px; border: 1px solid #626262; border-radius: 0; background: #292929; color: #d0d0d0; font: 600 10px/12px 'Inter', sans-serif; cursor: pointer; transition: background .35s ease, color .35s ease;
  small { font-size: 9px; font-weight: 800; line-height: 10px; letter-spacing: .6px; }
  &.is-on { background: #00e676; border-color: #00ff88; color: #052517; }
  &:focus-visible { outline: 2px solid $sel; outline-offset: -2px; } }
.replica__status { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; margin: 0; font: 400 11px/1.3 'Inter', sans-serif; color: #b3b3b8; }
@media (prefers-reduced-motion: reduce) { .replica, .replica__voice { animation: none; } }
</style>
