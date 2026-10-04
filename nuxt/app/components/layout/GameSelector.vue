<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import GameLogo from './GameLogo.vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useGameContext } from '~/composables/useGameContext'
import { useDevToolsAccess } from '~/composables/useDevToolsAccess'
import { GAME_OPTIONS, gameLabel } from '~/services/telemetry/gameCatalog'
import SourceChoice from './SourceChoice.vue'
const { consultedGame, selectGame } = useGameContext()
const { canAccessDevTools } = useDevToolsAccess()
const live = useFastStatePoller(() => typeof window === 'undefined' ? null : (window as Window & { electronAPI?: unknown }).electronAPI)
const connectedLabel = computed(() => live.fastState.value.commonLive?.connected
  ? `Connesso: ${gameLabel(live.fastState.value.commonLive.gameId)}` : 'Nessun gioco connesso')
const menu = ref<HTMLDetailsElement | null>(null)
let selectionRevision = 0
let activeTransition: { skipTransition: () => void } | undefined
function dismiss(event: PointerEvent) {
  if (menu.value && !menu.value.contains(event.target as Node)) menu.value.open = false
}
onMounted(() => { void live.startFastStatePolling(); document.addEventListener('pointerdown', dismiss) })
onBeforeUnmount(() => {
  selectionRevision++
  activeTransition?.skipTransition()
  document.documentElement.classList.remove('game-switch-motion')
  live.stopFastStatePolling(); document.removeEventListener('pointerdown', dismiss)
})
function change(gameId: string) {
  if (menu.value) { menu.value.open = false; menu.value.querySelector('summary')?.focus() }
  const revision = ++selectionRevision
  activeTransition?.skipTransition()
  document.documentElement.classList.remove('game-switch-motion')
  const update = async () => {
    if (revision !== selectionRevision) return
    selectGame(gameId, canAccessDevTools.value)
    await nextTick()
  }
  // Capture the outgoing overview before its game-scoped data is cleared.
  // Other pages keep their existing navigation and older browsers still switch.
  if (gameId === consultedGame.value || !document.startViewTransition ||
      !document.querySelector('.game-context') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    void update()
    return
  }
  document.documentElement.classList.add('game-switch-motion')
  const transition = document.startViewTransition(update)
  activeTransition = transition
  void transition.ready.catch(() => {}) // A rapid selection may skip the snapshot.
  void transition.finished.catch(() => {}).finally(() => {
    if (revision !== selectionRevision) return
    activeTransition = undefined
    document.documentElement.classList.remove('game-switch-motion')
  })
}
</script>

<template>
  <div class="game-selector">
    <span class="connection" :title="connectedLabel">GIOCO · {{ connectedLabel }}</span>
    <details ref="menu" @keydown.esc.prevent="menu && (menu.open = false)">
      <summary :aria-label="`Gioco consultato: ${gameLabel(consultedGame)}. Cambia gioco`">
        <GameLogo :game-id="consultedGame" /><span>{{ gameLabel(consultedGame) }}</span><span aria-hidden="true">⌄</span>
      </summary>
      <div class="game-options" aria-label="Scegli il gioco">
        <button v-for="game in GAME_OPTIONS" :key="game.id" type="button" :aria-pressed="consultedGame === game.id" @click="change(game.id)">
          <GameLogo :game-id="game.id" /><span>{{ game.name }}<small v-if="game.experimental">Sperimentale</small></span><span v-if="consultedGame === game.id" aria-hidden="true">✓</span>
        </button>
        <button v-if="canAccessDevTools" type="button" @click="change('synthetic')">Simulatore di test · DEV</button>
      </div>
    </details>
  </div>
  <SourceChoice />
</template>

<style scoped lang="scss">
.game-selector { display: flex; flex-direction: column; gap: 3px; width: 260px; max-width: 100%; }
.connection { font-size: 9px; letter-spacing: .1em; color: var(--rc-text-muted, #a6abb6); }
details { position: relative; }
summary { display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 5px 10px; border: 1px solid #ffffff40; background: #1d2027; cursor: pointer; font-size: 12px; }
summary::-webkit-details-marker { display: none; }
summary :deep(.game-logo) { width: 62px; height: 26px; }
summary > span:last-child { margin-left: auto; }
.game-options { position: absolute; top: calc(100% + 6px); right: 0; width: min(320px, 85vw); z-index: 100; border: 1px solid #ffffff40; background: #141417; box-shadow: 0 10px 30px #000a; padding: 5px; }
.game-options button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px; text-align: left; background: transparent; border: 0; color: #eee; cursor: pointer; font: inherit; font-size: 12px; }
.game-options button:hover, .game-options button[aria-pressed=true] { background: #ffffff12; }
.game-options :deep(.game-logo) { width: 90px; height: 36px; }
.game-options small { display: block; color: #aaa; margin-top: 4px; }
summary:focus-visible, button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
@media (max-width: 700px) { .game-selector { width: 160px; } summary > span:not(:last-child) { display: none; } }
</style>
