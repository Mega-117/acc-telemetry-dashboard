<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import GameLogo from './GameLogo.vue'
import { gameLabel } from '~/services/telemetry/gameCatalog'
const props = defineProps<{ gameId: string; busy: boolean }>()
const minimumElapsed = ref(true)
const switching = ref(false)
const revealing = ref(false)
let minimumTimer: ReturnType<typeof setTimeout> | undefined
let revealTimer: ReturnType<typeof setTimeout> | undefined
const covered = computed(() => switching.value && (!minimumElapsed.value || props.busy))
watch(() => props.gameId, () => {
  clearTimeout(minimumTimer)
  clearTimeout(revealTimer)
  revealing.value = false
  switching.value = true
  minimumElapsed.value = false
  // 300 ms outgoing fade, then one full second with the destination logo.
  minimumTimer = setTimeout(() => { minimumElapsed.value = true }, 1300)
}, { flush: 'sync' })
watch(covered, (value, previous) => {
  if (previous && !value) {
    revealing.value = true
    revealTimer = setTimeout(() => { revealing.value = false; switching.value = false }, 300)
  }
}, { flush: 'post' })
onBeforeUnmount(() => { clearTimeout(minimumTimer); clearTimeout(revealTimer) })
</script>
<template>
  <div class="game-context" :aria-busy="covered">
    <div class="game-context__content" :class="{ 'is-covered': covered, 'is-revealing': revealing }" :inert="covered" :aria-hidden="covered || undefined">
      <slot />
    </div>
    <div v-if="covered" class="game-context__cover" role="status" aria-live="polite">
      <GameLogo :key="gameId" :game-id="gameId" />
      <span>{{ busy ? 'Caricamento' : 'Panoramica' }} · {{ gameLabel(gameId) }}</span>
    </div>
  </div>
</template>
<style scoped>
.game-context { position: relative; min-height: 360px; display: flex; flex-direction: column; flex: 1 0 auto; }
.game-context__content { display: flex; flex-direction: column; flex: 1 0 auto; }
.game-context__content.is-covered { visibility: hidden; }
.game-context__content.is-revealing { animation: game-reveal 300ms cubic-bezier(.22, .61, .36, 1) both; transform-origin: center; }
.game-context__cover { position: absolute; inset: 0; min-height: 360px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; background: radial-gradient(ellipse at center, #19191b, #09090b 72%); animation: game-cover 120ms ease-out both; }
.game-context__cover :deep(.game-logo) { width: min(260px, 65%); height: 90px; max-height: 90px; }
.game-context__cover span { color: #bfc1c7; font-size: 12px; letter-spacing: .08em; }
@keyframes game-cover { from { opacity: .4; } to { opacity: 1; } }
@keyframes game-reveal { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .game-context__cover, .game-context__content.is-revealing { animation: none; } }
</style>
<style>
/* Only the overview participates: header/selector stay still, and the browser
   must not interpolate the old/new page bounds (which looks like sliding). */
html.game-switch-motion { view-transition-name: none; }
html.game-switch-motion .game-context { view-transition-name: game-overview; }
::view-transition-group(game-overview) { animation: none; }
::view-transition-old(game-overview) { animation: overview-zoom-away 300ms ease-in both; transform-origin: center; }
::view-transition-new(game-overview) { animation: overview-cover-in 300ms ease-out both; }
@keyframes overview-zoom-away { to { opacity: 0; transform: scale(1.06); } }
@keyframes overview-cover-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(game-overview), ::view-transition-new(game-overview) { animation: none; }
}
</style>
