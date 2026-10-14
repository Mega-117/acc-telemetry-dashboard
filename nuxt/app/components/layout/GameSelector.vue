<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import GameLogo from './GameLogo.vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useGameContext } from '~/composables/useGameContext'
import { useDevToolsAccess } from '~/composables/useDevToolsAccess'
import { GAME_OPTIONS, gameLabel, simulatorConnection } from '~/services/telemetry/gameCatalog'
import SourceChoice from './SourceChoice.vue'
import { gameSwitchDestination } from '~/services/ui/gameSwitchDestination'
const router = useRouter()
const { consultedGame, selectGame } = useGameContext()
const { canAccessDevTools } = useDevToolsAccess()
const live = useFastStatePoller(() => typeof window === 'undefined' ? null : (window as Window & { electronAPI?: unknown }).electronAPI)
// PIP-510: "ACC avviato" from the menus on, "Collegato: ACC" once data flows.
const connection = computed(() => simulatorConnection(live.fastState.value.commonLive))
const isConnected = computed(() => connection.value.state === 'connected')
const connectedLabel = computed(() => connection.value.label)
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
    if (gameId !== consultedGame.value) {
      const destination = gameSwitchDestination(router.currentRoute.value.path)
      selectGame(gameId, canAccessDevTools.value)
      if (destination) await router.replace(destination)
      if (revision !== selectionRevision) return
    }
    selectGame(gameId, canAccessDevTools.value)
    await nextTick()
  }
  // Capture the outgoing shared page before clearing its game-scoped data.
  // Detail routes return to their parent list; unsupported browsers still switch.
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
    <details ref="menu" @keydown.esc.prevent="menu && (menu.open = false)">
      <summary :aria-label="`Gioco consultato: ${gameLabel(consultedGame)}. Cambia gioco`">
        <GameLogo :game-id="consultedGame" />
        <svg class="arrow-icon" width="18" height="18" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </summary>
      <div class="game-options" aria-label="Scegli il gioco">
        <button v-for="game in GAME_OPTIONS" :key="game.id" type="button" :aria-pressed="consultedGame === game.id" @click="change(game.id)">
          <GameLogo :game-id="game.id" /><span>{{ game.name }}<small v-if="game.experimental">Sperimentale</small></span><span v-if="consultedGame === game.id" aria-hidden="true">✓</span>
        </button>
        <button v-if="canAccessDevTools" type="button" @click="change('synthetic')">Simulatore di test · DEV</button>
      </div>
    </details>
    <span class="connection" :class="{ 'is-connected': isConnected, 'is-started': connection.state === 'started' }" :title="connectedLabel" role="status">
      <span class="connection__dot" aria-hidden="true" />{{ connectedLabel }}
    </span>
  </div>
  <SourceChoice />
</template>

<style scoped lang="scss">
.game-selector { position: relative; width: 190px; max-width: 100%; height: 46px; margin-right: 8px; }
.connection { position: absolute; top: calc(100% + 4px); left: 0; display: flex; align-items: center; gap: 6px; padding-inline: 2px; font-size: 10px; line-height: 14px; white-space: nowrap; color: var(--rc-text-muted, #a6abb6); }
.connection__dot { flex: 0 0 5px; height: 5px; border-radius: 50%; background: #777d87; }
.connection.is-connected .connection__dot { background: #42cda5; }
.connection.is-started .connection__dot { background: #e0b84a; }
details { position: relative; }
summary { display: flex; align-items: center; gap: 14px; box-sizing: border-box; height: 46px; padding: 5px 14px; border: 1px solid #ffffff85; background: transparent; color: #eee; cursor: pointer; font-size: 12px; }
summary::-webkit-details-marker { display: none; }
summary :deep(.game-logo) { width: 120px; height: 32px; }
.arrow-icon { margin-left: auto; flex-shrink: 0; color: #ddd; transition: transform .2s ease; }
details[open] .arrow-icon { transform: rotate(180deg); }
.game-options { position: absolute; top: calc(100% + 6px); right: 0; width: min(320px, 85vw); z-index: 100; border: 1px solid #ffffff40; background: #141417; box-shadow: 0 10px 30px #000a; padding: 5px; }
.game-options button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px; text-align: left; background: transparent; border: 0; color: #eee; cursor: pointer; font: inherit; font-size: 12px; }
.game-options button:hover, .game-options button[aria-pressed=true] { background: #ffffff12; }
.game-options :deep(.game-logo) { width: 90px; height: 36px; }
.game-options small { display: block; color: #aaa; margin-top: 4px; }
summary:focus-visible, button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
@media (max-width: 700px) { .game-selector { width: 160px; } summary { padding-inline: 10px; gap: 10px; } summary :deep(.game-logo) { width: 104px; } }
@media (prefers-reduced-motion: reduce) { .arrow-icon { transition: none; } }
</style>
