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

// Tutte le regole scopate sotto .hud-overlay per NON toccare l'overlay
// allenamento (le classi .tyre-slip-hud ecc. sono globali e condivise).
.hud-overlay {
  --overlay-accent-rgb: 34, 197, 94;
  position: fixed;
  inset: 0;
  display: flex;
  background: transparent;
  box-sizing: border-box;
}

// Fuori da Electron (browser/Playwright): sfondo scuro per poter testare.
.hud-overlay--web {
  background: #0d0d12;
}

.hud-overlay__panel {
  position: relative;
  box-sizing: border-box;
  // Riempie l'intera finestra: lo sfondo opaco copre tutto, niente striscia
  // trasparente quando la finestra e' clampata al minimo.
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  // Sfondo OPACO: l'overlay deve essere ben visibile sopra il gioco.
  background: rgba(8, 10, 16, 0.97);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
}

// In riposizionamento: bordo evidenziato + spazio sotto per la barra conferma.
.hud-overlay--placing .hud-overlay__panel {
  -webkit-app-region: drag;
  cursor: move;
  padding-bottom: 48px;
  border-color: rgba(34, 197, 94, 0.6);
}

// L'HUD figlio riempie il pannello opaco: niente doppio bordo/sfondo.
.hud-overlay .tyre-slip-hud {
  width: 100%;
  background: transparent;
  border: none;
  padding: 0;
}

.hud-overlay .tyre-slip-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

// Barra conferma posizione: sovrapposta in basso, sempre visibile.
.hud-overlay__place {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.92);
  border: 1px solid rgba(34, 197, 94, 0.45);
  color: #f7fbff;
  font-size: 12px;
  font-weight: 700;
}

.hud-overlay__confirm {
  -webkit-app-region: no-drag;
  padding: 5px 14px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(90deg, #22c55e, #14b8a6);
  color: #04110a;
  font-weight: 800;
  cursor: pointer;
}
</style>
