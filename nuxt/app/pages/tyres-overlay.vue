<script setup lang="ts">
// Overlay HUD Gomme (PIP-175): finestra Electron indipendente, accesa/spenta e
// riposizionata dalla pagina Test HUD. Riusa il componente di rendering e il
// poller gia' esistenti; aggiunge solo drag/placement via useHudOverlay.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useHudOverlay } from '~/composables/useHudOverlay'
import TyreSlipHud from '~/components/overlay/TyreSlipHud.vue'

definePageMeta({ layout: false })

useHead({
  htmlAttrs: { class: 'training-overlay-document' },
  bodyAttrs: { class: 'training-overlay-runtime' },
})

function getApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const route = useRoute()
const panelEl = ref<HTMLElement | null>(null)

const { fastState, startFastStatePolling, stopFastStatePolling } = useFastStatePoller(getApi)
const {
  isElectron, isPlacing, enterPlacement, confirmPlacement,
  onSurfaceEnter, onSurfaceLeave, start, stop,
} = useHudOverlay('tyres', getApi)

onMounted(() => {
  startFastStatePolling()
  start(panelEl.value)
  // Apertura in modalita' riposiziona dalla pagina Test HUD (?place=1).
  if (route.query.place === '1') enterPlacement()
})

onBeforeUnmount(() => {
  stopFastStatePolling()
  stop()
})
</script>

<template>
  <div
    class="hud-overlay"
    :class="{ 'hud-overlay--web': !isElectron, 'hud-overlay--placing': isPlacing }"
  >
    <div
      ref="panelEl"
      class="hud-overlay__panel"
      @pointerenter="onSurfaceEnter"
      @pointerleave="onSurfaceLeave"
    >
      <TyreSlipHud :fast-state="fastState" />
      <div v-if="isPlacing" class="hud-overlay__place">
        <span>Trascina per posizionare</span>
        <button type="button" class="hud-overlay__confirm" @click="confirmPlacement">Conferma</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '~/assets/scss/training-overlay' as *;

// Le classi .tyre-slip-hud arrivano dal partial sopra; qui solo la chrome
// della pagina-finestra (trasparenza, posizione, drag durante il placement).
.hud-overlay {
  --overlay-accent-rgb: 34, 197, 94;
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 8px;
  background: transparent;
}

// Fuori da Electron (browser/Playwright): sfondo visibile per poter testare.
.hud-overlay--web {
  background: #0d0d12;
}

.hud-overlay__panel {
  position: relative;
  width: max-content;
}

.hud-overlay--placing .hud-overlay__panel {
  -webkit-app-region: drag;
  cursor: move;
}

.hud-overlay__place {
  -webkit-app-region: no-drag;
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(2, 6, 12, 0.72);
  color: #f7fbff;
  font-size: 12px;
}

.hud-overlay__confirm {
  -webkit-app-region: no-drag;
  padding: 4px 12px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(90deg, #22c55e, #14b8a6);
  color: #04110a;
  font-weight: 800;
  cursor: pointer;
}
</style>
