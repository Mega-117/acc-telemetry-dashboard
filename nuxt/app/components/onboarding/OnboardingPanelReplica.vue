<script setup lang="ts">
// PIP-571: a faithful, inert copy of the real "pannello rapido" (Ctrl+K, ACC layout in Pausa):
// real RC logo, 2×5 buttons with the same icons and names, status row. It behaves like the real
// one: the mouse hovers to select and clicks to confirm; the wheel practice drives the same
// selection from the parent. Nothing here talks to the game.
import { Bell, CircleCheck, Flag, Fuel, Gauge, Headset, Info, Target, Timer, Volume2 } from '@lucide/vue'
import { usePublicPath } from '~/composables/usePublicPath'
import { PRACTICE_TILES } from '~/services/onboarding/commandPractice'

defineProps<{ selected?: number | null; confirmed?: number | null; status?: string }>()
const emit = defineEmits<{ select: [index: number]; confirm: [index: number] }>()
const { getPublicPath } = usePublicPath()

// Same icons as the real buttons (PressureTestPanel, SetupFuelPanel, PitwallOverlayButton, training-overlay).
const ICONS = [Gauge, CircleCheck, Fuel, Fuel, Headset, Target, Flag, Volume2, Timer, Bell]
const tiles = PRACTICE_TILES.map((label, i) => ({ label, icon: ICONS[i]! }))
</script>

<template>
  <div class="replica" aria-label="Pannello rapido (copia di prova)">
    <img class="replica__logo" :src="getPublicPath('/branding/auth/racercore-rc.svg')" alt="Racer Core" width="56" height="28">
    <div class="replica__grid">
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
        <component :is="tile.icon" :size="20" aria-hidden="true" />
        <span>{{ tile.label }}</span>
      </button>
    </div>
    <p class="replica__status"><Info :size="12" aria-hidden="true" /> {{ status || 'Seleziona una voce.' }}</p>
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
.replica__status { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; margin: 0; font: 400 11px/1.3 'Inter', sans-serif; color: #b3b3b8; }
@media (prefers-reduced-motion: reduce) { .replica { animation: none; } }
</style>
