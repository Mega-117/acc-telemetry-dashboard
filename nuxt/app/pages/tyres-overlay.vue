<script setup lang="ts">
// Overlay HUD Gomme (PIP-175): finestra Electron indipendente. Dimensione decisa
// dal FORMATO (small/medium/large) lato Electron; qui si applica la scala dei
// font e lo stato di posizionamento. Riusa TyreSlipHud + il poller esistente.
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useOverlayTelemetrySource } from '~/composables/useOverlayTelemetrySource'
import { useHudOverlay } from '~/composables/useHudOverlay'
import { useHudOverlayBackground } from '~/composables/useHudOverlayBackground'
import HudOverlayBackground from '~/components/overlay/HudOverlayBackground.vue'
import HudTimedPager from '~/components/overlay/HudTimedPager.vue'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import TyreAdvancedHud from '~/components/overlay/TyreAdvancedHud.vue'
import TyreRaceHud from '~/components/overlay/TyreRaceHud.vue'
import DamageRaceHud from '~/components/overlay/DamageRaceHud.vue'
import TyreSlipHud from '~/components/overlay/TyreSlipHud.vue'
import { useRaceHudPage, type RaceHudPage } from '~/composables/useRaceHudPage'

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
const { fastState, startFastStatePolling, stopFastStatePolling } = useOverlayTelemetrySource(getApi)
const overlay = useHudOverlay('tyres', getApi)
const {
  isElectron,
  scale,
  settings,
  loadSettings,
  start,
  stop,
  startInteractionSurface,
  pointerState,
  setTransientViewport,
} = overlay
const { backgroundOpacity } = useHudOverlayBackground(settings)
const variant = computed<'classic' | 'advanced' | 'race'>(() => {
  const requested = route.query.variant ?? settings.value?.variant
  return requested === 'advanced' || requested === 'race' ? requested : 'classic'
})
const racePager = useRaceHudPage(fastState)
const { activePage: racePage, damageFlash: raceDamageFlash } = racePager
const raceVisible = computed(() => fastState.value.isFresh && fastState.value.isLive && fastState.value.tyres.length === 4)
const raceBanner = computed(() => {
  if (!fastState.value.isEngineRunning) return 'ENGINE OFF'
  if (fastState.value.pitLimiterOn) return 'LIMITER ON'
  return null
})

function selectRacePage(page: RaceHudPage) {
  racePager.selectPage(page)
}
const advancedPage = computed<'live' | 'setup'>(() => (
  import.meta.dev && route.query.page === 'setup' ? 'setup' : 'live'
))
const advancedPages = [
  { id: 'live', label: 'LIVE' },
  {
    id: 'setup',
    label: 'SETUP',
    temporary: true,
    // Sopra i 300 px di contenuto non scatta il layout ultra-compatto:
    // le tre colonne mantengono intestazioni e valori leggibili.
    minViewport: { width: 360, height: 440 },
  },
]

function handleAdvancedPageChange(page: {
  id: string
  minViewport?: { width: number; height: number }
}) {
  const minViewport = page.id === 'setup' ? page.minViewport : undefined
  void setTransientViewport({
    active: !!minViewport,
    key: 'tyres-setup',
    minWidth: minViewport?.width,
    minHeight: minViewport?.height,
  })
}

watch(variant, (nextVariant) => {
  if (nextVariant !== 'advanced') {
    void setTransientViewport({ active: false, key: 'tyres-setup' })
  }
})

onMounted(() => {
  startFastStatePolling()
  start(route.query.scale)
  startInteractionSurface()
  loadSettings()
})

onBeforeUnmount(() => {
  void setTransientViewport({ active: false, key: 'tyres-setup' })
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
    <OverlaySoftwareCursor :state="pointerState" />
    <div
      class="hud-overlay__panel"
      :class="{
        'hud-overlay__panel--advanced': variant === 'advanced',
        'hud-overlay__panel--race': variant === 'race',
      }"
    >
      <HudOverlayBackground v-if="variant === 'advanced'" :opacity="backgroundOpacity" />
      <HudTimedPager
        v-if="variant === 'advanced'"
        :pages="advancedPages"
        default-page="live"
        :initial-page="advancedPage"
        :temporary-duration-ms="30_000"
        :reveal-controls="pointerState.surfaceHovered"
        @page-change="handleAdvancedPageChange"
      >
        <template #live>
          <TyreAdvancedHud :fast-state="fastState" page="live" />
        </template>
        <template #setup>
          <TyreAdvancedHud :fast-state="fastState" page="setup" />
        </template>
      </HudTimedPager>
      <section
        v-else-if="variant === 'race'"
        v-show="raceVisible"
        class="race-hud"
        :class="{
          'race-hud--yellow': fastState.flag === 2,
          'race-hud--damage-flash': raceDamageFlash,
          'race-hud--has-banner': !!raceBanner,
        }"
        :data-active-page="racePage"
      >
        <nav class="race-hud__switcher" data-overlay-interactive aria-label="Pagina Race HUD">
          <button type="button" :class="{ active: racePage === 'tyres' }" @click="selectRacePage('tyres')">GOMME</button>
          <button type="button" :class="{ active: racePage === 'damage' }" @click="selectRacePage('damage')">DANNI</button>
        </nav>
        <TyreRaceHud v-if="racePage === 'tyres'" :fast-state="fastState" />
        <DamageRaceHud v-else :fast-state="fastState" />
        <div v-if="raceBanner" class="race-hud__banner">{{ raceBanner }}</div>
      </section>
      <TyreSlipHud v-else :fast-state="fastState" />
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
  position: absolute;
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
  -webkit-app-region: drag;
  padding: calc(12px * var(--hud-scale));
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  // Sfondo completamente OPACO (nessuna trasparenza) e nessuna ombra.
  background: #0b0e15;
}

.hud-overlay__panel--advanced {
  border-color: transparent;
  background: transparent;
}

.hud-overlay__panel--advanced > :not(.hud-overlay-background) {
  position: relative;
  z-index: 1;
}

.hud-overlay__panel--race {
  padding: 0;
  overflow: hidden;
  border-color: #555;
  border-radius: calc(12px * var(--hud-scale));
  background: #050608;
}

.race-hud {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: calc(8px * var(--hud-scale));
  border: calc(2px * var(--hud-scale)) solid transparent;
  box-sizing: border-box;
}

.race-hud--has-banner { padding-bottom: calc(54px * var(--hud-scale)); }
.race-hud--yellow { border-color: #ffd400; }
.race-hud--damage-flash { border-color: #ff2525; box-shadow: inset 0 0 calc(24px * var(--hud-scale)) rgba(255, 20, 20, .55); }
.race-hud__switcher { position:absolute; top:calc(7px * var(--hud-scale)); right:calc(7px * var(--hud-scale)); z-index:20; display:flex; overflow:hidden; border:1px solid #666; border-radius:999px; background:#050608; opacity:0; transition:opacity 120ms ease; -webkit-app-region:no-drag; }
.hud-overlay__panel:hover .race-hud__switcher { opacity:1; }
.race-hud__switcher button { min-width:calc(52px * var(--hud-scale)); padding:calc(4px * var(--hud-scale)) calc(7px * var(--hud-scale)); border:0; background:transparent; color:#aaa; font:900 max(10px,calc(11px * var(--hud-scale)))/1 Inter,"Segoe UI",sans-serif; cursor:pointer; }
.race-hud__switcher button+button { border-left:1px solid #555; }.race-hud__switcher button.active { background:#f28a20;color:#050608; }
.race-hud__banner { position:absolute; right:0; bottom:0; left:0; display:grid; place-items:center; height:calc(46px * var(--hud-scale)); background:#075be8; color:#fff; font:950 max(20px,calc(28px * var(--hud-scale)))/1 Inter,"Segoe UI",sans-serif; letter-spacing:.05em; }
@media (prefers-reduced-motion: reduce) { .race-hud__switcher { transition:none; }.race-hud--damage-flash { box-shadow:none; } }

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
  font-size: max(11px, calc(14px * var(--hud-scale)));
  color: #ffffff;
}

.hud-overlay .tyre-slip__topline strong {
  font-size: max(16px, calc(18px * var(--hud-scale)));
  color: #ffffff;
}

.hud-overlay .tyre-slip__meta span {
  font-size: max(11px, calc(13px * var(--hud-scale)));
  color: #ffffff;
}

.hud-overlay .tyre-slip__state {
  font-size: max(11px, calc(13px * var(--hud-scale)));
}

// Gerarchia gomma: lo SLIP è primario (numero più grande + micro-label),
// la PRESSIONE è secondaria (più piccola e attenuata).
.hud-overlay .tyre-slip__meta span:first-child {
  font-size: max(14px, calc(15px * var(--hud-scale)));
  font-weight: 900;
}

.hud-overlay .tyre-slip__meta span:first-child::after {
  content: ' slip';
  font-size: 0.62em;
  font-weight: 700;
  opacity: 0.55;
}

.hud-overlay .tyre-slip__meta span:last-child {
  font-size: max(10px, calc(11px * var(--hud-scale)));
  opacity: 0.6;
}


.hud-overlay .tyre-slip__state {
  max-width: none;
}

.hud-overlay .tyre-slip__bar {
  height: calc(7px * var(--hud-scale));
}
</style>
