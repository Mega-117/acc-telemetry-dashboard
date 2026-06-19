<script setup lang="ts">
// Overlay HUD Settori (PIP-175): gemello di tyres-overlay con i dati settori da
// live_state.json. Dimensione dal FORMATO; riusa SectorDeltaHud + poller.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'
import { useHudOverlay } from '~/composables/useHudOverlay'
import SectorDeltaHud from '~/components/overlay/SectorDeltaHud.vue'

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
const { liveLap, startLiveStatePolling, stopLiveStatePolling } = useLiveStatePoller(getApi)
const { isElectron, isPlacing, scale, settings, loadSettings, start, stop } = useHudOverlay('sectors', getApi)
const showReference = computed(() => settings.value?.showReference !== false)
const showBest = computed(() => settings.value?.showBest !== false)

onMounted(() => {
  startLiveStatePolling()
  start(route.query.scale)
  loadSettings()
})

onBeforeUnmount(() => {
  stopLiveStatePolling()
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
      <SectorDeltaHud :sector-hud="liveLap.sectorHud" :show-reference="showReference" :show-best="showBest" />
      <div v-if="isPlacing" class="hud-overlay__hint">Trascina per posizionare</div>
    </div>
  </div>
</template>

<style lang="scss">
@use '~/assets/scss/training-overlay' as *;

// Regole scopate sotto .hud-overlay per non toccare l'overlay allenamento.
.hud-overlay {
  --hud-scale: 1;
  --overlay-accent-rgb: 34, 197, 94;
  position: fixed;
  inset: 0;
  display: flex;
  padding: 6px;
  background: transparent;
  box-sizing: border-box;
  color: #f4f8ff;
}

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

// ── L'HUD riempie il pannello ────────────────────────────────────────────────
.hud-overlay .sector-delta-hud {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--hud-scale));
  background: transparent;
  border: none;
  padding: 0;
}

.hud-overlay .sector-delta-hud__grid {
  flex: 1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: calc(8px * var(--hud-scale));
}

.hud-overlay .sector-delta {
  min-height: 0;
  // Colonna: etichetta, tempo attuale, delta, tempo giro precedente.
  display: flex;
  flex-direction: column;
  justify-content: center;
  // Più spazio verticale tra le linee.
  gap: calc(8px * var(--hud-scale));
  padding: calc(8px * var(--hud-scale));
}

// ── Testi tutti BIANCHI per massima leggibilità ──────────────────────────────
.hud-overlay .sector-delta-hud__header span,
.hud-overlay .sector-delta-hud__header em {
  font-size: calc(13px * var(--hud-scale));
  color: #ffffff;
}

.hud-overlay .sector-delta__label,
.hud-overlay .sector-delta small {
  font-size: calc(13px * var(--hud-scale));
  color: #ffffff;
}

// Gerarchia: etichetta, tempo attuale (hero), delta EVIDENTE, "prec" piccolo/attenuato.
.hud-overlay .sector-delta__label { order: 0; }

.hud-overlay .sector-delta strong {
  order: 1;
  font-size: calc(22px * var(--hud-scale));
  color: #ffffff;
}

.hud-overlay .sector-delta__delta {
  order: 2;
  font-size: calc(17px * var(--hud-scale));
  font-weight: 900;
  color: #ffffff;
}

// Tempo del giro precedente per settore: secondario, attenuato.
.hud-overlay .sector-delta__ref {
  order: 3;
  font-size: calc(11px * var(--hud-scale));
  color: #ffffff;
  opacity: 0.6;
}

.hud-overlay .sector-delta__best {
  order: 4;
  font-size: calc(11px * var(--hud-scale));
  color: #ffffff;
  opacity: 0.72;
}

// Allinea a sinistra i testi piccoli sotto l'etichetta.
.hud-overlay .sector-delta small {
  align-self: flex-start;
}
</style>
