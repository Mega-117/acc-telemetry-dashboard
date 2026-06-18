<script setup lang="ts">
// Overlay HUD Settori (PIP-175): gemello di tyres-overlay ma con i dati settori
// da live_state.json. Stessa chrome drag/placement via useHudOverlay.
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
const panelEl = ref<HTMLElement | null>(null)

const { liveLap, startLiveStatePolling, stopLiveStatePolling } = useLiveStatePoller(getApi)
const {
  isElectron, isPlacing, enterPlacement, confirmPlacement,
  onSurfaceEnter, onSurfaceLeave, start, stop,
} = useHudOverlay('sectors', getApi)

onMounted(() => {
  startLiveStatePolling()
  start(panelEl.value)
  if (route.query.place === '1') enterPlacement()
})

onBeforeUnmount(() => {
  stopLiveStatePolling()
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
      <SectorDeltaHud :sector-hud="liveLap.sectorHud" />
      <div v-if="isPlacing" class="hud-overlay__place">
        <span>Trascina per posizionare</span>
        <button type="button" class="hud-overlay__confirm" @click="confirmPlacement">Conferma</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '~/assets/scss/training-overlay' as *;

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
