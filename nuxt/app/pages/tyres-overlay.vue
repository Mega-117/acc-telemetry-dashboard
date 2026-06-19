<script setup lang="ts">
// Overlay HUD Gomme (PIP-175): finestra Electron indipendente. Dimensione decisa
// dal FORMATO (small/medium/large) lato Electron; qui si applica la scala dei
// font e lo stato di posizionamento. Riusa TyreSlipHud + il poller esistente.
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
const { fastState, startFastStatePolling, stopFastStatePolling } = useFastStatePoller(getApi)
const { isElectron, isPlacing, scale, loadSettings, start, stop } = useHudOverlay('tyres', getApi)

onMounted(() => {
  startFastStatePolling()
  start(route.query.scale)
  loadSettings()
})

onBeforeUnmount(() => {
  stopFastStatePolling()
  stop()
})
</script>

<template>
  <div
    class="hud-overlay"
    :style="{ '--hud-scale': scale }"
    :class="{ 'hud-overlay--web': !isElectron, 'hud-overlay--placing': isPlacing }"
  >
    <div class="hud-overlay__panel">
      <TyreSlipHud :fast-state="fastState" />
      <div v-if="isPlacing" class="hud-overlay__hint">Trascina per posizionare</div>
    </div>
  </div>
</template>

<style lang="scss">
@use '~/assets/scss/training-overlay' as *;

// Tutte le regole sono scopate sotto .hud-overlay per NON toccare l'overlay
// allenamento (le classi .tyre-slip-hud ecc. sono globali e condivise).
.hud-overlay {
  --hud-scale: 1;
  --overlay-accent-rgb: 34, 197, 94;
  position: fixed;
  inset: 0;
  display: flex;
  padding: 6px; // margine flottante: il pannello non tocca i bordi finestra
  background: transparent;
  box-sizing: border-box;
  color: #f4f8ff;
}

// Fuori da Electron (browser/Playwright): sfondo scuro per poter testare.
.hud-overlay--web { background: #0d0d12; }

.hud-overlay__panel {
  position: relative;
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: calc(12px * var(--hud-scale));
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  // Sfondo completamente OPACO (nessuna trasparenza) e nessuna ombra.
  background: #0b0e15;
}

.hud-overlay--placing .hud-overlay__panel {
  -webkit-app-region: drag;
  cursor: move;
  border-color: rgba(34, 197, 94, 0.7);
}

.hud-overlay__hint {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.92);
  color: #04110a;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

// ── L'HUD riempie il pannello (niente spazio vuoto sopra/sotto) ──────────────
.hud-overlay .tyre-slip-hud {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: calc(9px * var(--hud-scale));
  background: transparent;
  border: none;
  padding: 0;
}

.hud-overlay .tyre-slip-grid {
  flex: 1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: 1fr 1fr;
  // Riga (front/rear) più distanziata della colonna: raggruppa anteriore/posteriore.
  gap: calc(18px * var(--hud-scale)) calc(9px * var(--hud-scale));
}

.hud-overlay .tyre-slip {
  // Il contenuto riempie la larghezza della card (barra a tutta larghezza),
  // niente spazio laterale; verticalmente centrato nella card.
  grid-template-columns: 1fr;
  align-content: center;
  gap: calc(7px * var(--hud-scale));
  padding: calc(10px * var(--hud-scale));
}

// ── Testi tutti BIANCHI per massima leggibilità ──────────────────────────────
.hud-overlay .tyre-slip-hud__header span,
.hud-overlay .tyre-slip-hud__header strong {
  font-size: calc(14px * var(--hud-scale));
  color: #ffffff;
}

.hud-overlay .tyre-slip__topline strong {
  font-size: calc(18px * var(--hud-scale));
  color: #ffffff;
}

.hud-overlay .tyre-slip__meta span {
  font-size: calc(13px * var(--hud-scale));
  color: #ffffff;
}

.hud-overlay .tyre-slip__state {
  font-size: calc(13px * var(--hud-scale));
}

// Gerarchia gomma: lo SLIP è primario (numero più grande + micro-label),
// la PRESSIONE è secondaria (più piccola e attenuata).
.hud-overlay .tyre-slip__meta span:first-child {
  font-size: calc(15px * var(--hud-scale));
  font-weight: 900;
}

.hud-overlay .tyre-slip__meta span:first-child::after {
  content: ' slip';
  font-size: 0.62em;
  font-weight: 700;
  opacity: 0.55;
}

.hud-overlay .tyre-slip__meta span:last-child {
  font-size: calc(11px * var(--hud-scale));
  opacity: 0.6;
}


.hud-overlay .tyre-slip__state {
  max-width: none;
}

.hud-overlay .tyre-slip__bar {
  height: calc(7px * var(--hud-scale));
}
</style>
