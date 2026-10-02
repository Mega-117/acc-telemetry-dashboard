<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
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
onMounted(() => { void live.startFastStatePolling() })
onBeforeUnmount(live.stopFastStatePolling)
function change(event: Event) {
  selectGame((event.target as HTMLSelectElement).value, canAccessDevTools.value)
}
</script>

<template>
  <label class="game-selector">
    <span :title="connectedLabel">GIOCO · {{ connectedLabel }}</span>
    <select aria-label="Gioco consultato" :value="consultedGame" @change="change">
      <option v-for="game in GAME_OPTIONS" :key="game.id" :value="game.id">{{ game.label }}{{ game.experimental ? ' · sperimentale' : game.available ? '' : ' · non disponibile' }}</option>
      <option v-if="canAccessDevTools" value="synthetic">Simulatore di test · DEV</option>
    </select>
  </label>
  <SourceChoice />
</template>

<style scoped lang="scss">
.game-selector { display: flex; flex-direction: column; gap: 3px; max-width: 235px; }
.game-selector span { font-size: 9px; letter-spacing: .1em; color: var(--rc-text-muted, #a6abb6); }
select { max-width: 100%; min-height: 30px; padding: 4px 26px 4px 9px; border: 1px solid var(--rc-line, #ffffff29); border-radius: 3px; background: var(--rc-surface, #1d2027); color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
select:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
@media (max-width: 700px) { .game-selector { max-width: 140px; } }
</style>
