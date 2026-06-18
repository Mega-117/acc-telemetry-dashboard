<script setup lang="ts">
// Overlay HUD Settori (PIP-175): gemello di tyres-overlay con i dati settori da
// live_state.json. Dimensione dal FORMATO; riusa SectorDeltaHud + poller.
import { onBeforeUnmount, onMounted, ref } from 'vue'
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
const { isElectron, isPlacing, format, loadSettings, start, stop } = useHudOverlay('sectors', getApi)

onMounted(() => {
  startLiveStatePolling()
  start(route.query.format)
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
    :class="[`hud-overlay--size-${format}`, { 'hud-overlay--web': !isElectron, 'hud-overlay--placing': isPlacing }]"
  >
    <div class="hud-overlay__panel">
      <SectorDeltaHud :sector-hud="liveLap.sectorHud" />
      <div v-if="isPlacing" class="hud-overlay__hint">Trascina per posizionare</div>
    </div>
  </div>
</template>

<style lang="scss">
@use '~/assets/scss/training-overlay' as *;

// Regole scopate sotto .hud-overlay per non toccare l'overlay allenamento.
.hud-overlay {
  --hud-scale: 1.06;
  --overlay-accent-rgb: 34, 197, 94;
  position: fixed;
  inset: 0;
  display: flex;
  padding: 6px;
  background: transparent;
  box-sizing: border-box;
  color: #f4f8ff;
}

.hud-overlay--size-small { --hud-scale: 1; }
.hud-overlay--size-medium { --hud-scale: 1.18; }
.hud-overlay--size-large { --hud-scale: 1.36; }

.hud-overlay--web { background: #0d0d12; }

.hud-overlay__panel {
  position: relative;
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  background: rgba(10, 13, 20, 0.97);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
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
  grid-template-rows: auto 1fr auto;
  gap: calc(4px * var(--hud-scale));
  padding: calc(8px * var(--hud-scale));
}

// ── Testi più grandi e leggibili ─────────────────────────────────────────────
.hud-overlay .sector-delta-hud__header span,
.hud-overlay .sector-delta-hud__header em {
  font-size: calc(13px * var(--hud-scale));
  color: rgba(255, 255, 255, 0.92);
}

.hud-overlay .sector-delta__label,
.hud-overlay .sector-delta small {
  font-size: calc(13px * var(--hud-scale));
  color: rgba(235, 243, 251, 0.95);
}

.hud-overlay .sector-delta strong {
  font-size: calc(22px * var(--hud-scale));
  color: #ffffff;
}
</style>
