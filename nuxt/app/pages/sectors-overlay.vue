<script setup lang="ts">
// Overlay HUD Settori (PIP-175): gemello di tyres-overlay con i dati settori da
// live_state.json. Dimensione dal FORMATO; riusa SectorDeltaHud + poller.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'
import { useHudOverlay } from '~/composables/useHudOverlay'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useCompletedLapHold } from '~/composables/useCompletedLapHold'
import SectorDeltaHud from '~/components/overlay/SectorDeltaHud.vue'
import { normalizeSectorDeltaReference } from '~/utils/sectorDeltaPresentation'

definePageMeta({ layout: 'hud-overlay' })

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
const { fastState, startFastStatePolling, stopFastStatePolling } = useFastStatePoller(getApi)
const { displayedLapTimeMs, displayedLapValid } = useCompletedLapHold(fastState)
const compactDisplayLap = computed(() => ({
  timeMs: displayedLapTimeMs.value,
  valid: displayedLapValid.value,
}))
const { isElectron, scale, settings, loadSettings, start, stop } = useHudOverlay('sectors', getApi)
const showReference = computed(() => settings.value?.showReference !== false)
const showBest = computed(() => settings.value?.showBest !== false)
const showCurrentLap = computed(() => settings.value?.showCurrentLap !== false)
const deltaReference = computed(() => normalizeSectorDeltaReference(settings.value?.deltaReference))
const variant = computed(() => settings.value?.variant === 'compact' ? 'compact' : 'classic')
// Stessa sorgente e stessa semantica dell'overlay Info: nessuna regola locale
// per outlap, pit exit, reset del giro o invalidazione.
const liveCurrentLapTimeMs = computed(() => (
  fastState.value.info?.currentLapTimeMs ?? null
))
const liveLapValid = computed(() => (
  fastState.value.info?.lapValid ?? null
))

onMounted(() => {
  startLiveStatePolling()
  startFastStatePolling()
  start(route.query.scale)
  loadSettings()
})

onBeforeUnmount(() => {
  stopLiveStatePolling()
  stopFastStatePolling()
  stop()
})
</script>

<template>
  <div
    class="hud-overlay"
    :style="{ '--hud-scale': scale }"
    :class="{ 'hud-overlay--web': !isElectron }"
  >
    <div
      class="hud-overlay__panel"
      :class="{ 'hud-overlay__panel--compact': variant === 'compact' }"
    >
      <SectorDeltaHud
        :sector-hud="liveLap.sectorHud"
        :show-reference="showReference"
        :show-best="showBest"
        :show-current-lap="showCurrentLap"
        :delta-reference="deltaReference"
        :variant="variant"
        :live-running="variant === 'compact'"
        :live-current-lap-time-ms="variant === 'compact' ? liveCurrentLapTimeMs : undefined"
        :live-lap-valid="variant === 'compact' ? liveLapValid : undefined"
        :compact-display-lap="variant === 'compact' ? compactDisplayLap : undefined"
      />
    </div>
  </div>
</template>

<style lang="scss">
@use '~/assets/scss/training-overlay' as *;

// Regole scopate sotto .hud-overlay per non toccare l'overlay allenamento.
.hud-overlay {
  --hud-scale: 1;
  --overlay-accent-rgb: 34, 197, 94;
  position: absolute;
  inset: 0;
  display: flex;
  padding: calc(6px * var(--hud-scale));
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
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  -webkit-app-region: drag;
  padding: calc(12px * var(--hud-scale));
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  // Sfondo completamente OPACO (nessuna trasparenza) e nessuna ombra.
  background: #0b0e15;
}

// ── L'HUD riempie il pannello ────────────────────────────────────────────────
.hud-overlay__panel--compact {
  padding: calc(8px * var(--hud-scale)) calc(14px * var(--hud-scale)) calc(10px * var(--hud-scale));
  border-color: rgba(255, 255, 255, 0.62);
  border-radius: calc(12px * var(--hud-scale));
  background: #000;
}

.hud-overlay .sector-delta-hud {
  flex: 1;
  width: 100%;
  display: flex;
  min-height: 0;
  overflow: hidden;
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
