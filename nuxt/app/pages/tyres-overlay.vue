<script setup lang="ts">
import { useI18n } from '~/i18n'
import TelemetryFeatureNotice from '~/components/overlay/TelemetryFeatureNotice.vue'
import { useHudPresentationMemory } from '~/services/overlay/hudPresentationMemory'
import OverlayPlacementLock from '~/components/overlay/OverlayPlacementLock.vue'
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
// Overlay HUD Gomme (PIP-175): finestra Electron indipendente. Dimensione decisa
// dal FORMATO (small/medium/large) lato Electron; qui si applica la scala dei
// font e lo stato di posizionamento. Riusa TyreSlipHud + il poller esistente.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useOverlayTelemetrySource } from '~/composables/useOverlayTelemetrySource'
import { useHudOverlay } from '~/composables/useHudOverlay'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import TyreRaceHud from '~/components/overlay/TyreRaceHud.vue'
import DamageRaceHud from '~/components/overlay/DamageRaceHud.vue'
import TyreSlipHud from '~/components/overlay/TyreSlipHud.vue'
import { useRaceHudPage, type RaceHudPage } from '~/composables/useRaceHudPage'

definePageMeta({ layout: 'hud-overlay' })

useHead({
  htmlAttrs: { class: 'training-overlay-document' },
  bodyAttrs: { class: 'training-overlay-runtime' },
})

const getApi = useOverlayRegionApi()

const route = useRoute()
const { fastState, startFastStatePolling, stopFastStatePolling } = useOverlayTelemetrySource(getApi)
const displayFastState = useHudPresentationMemory(fastState, fastState)
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
} = overlay
const variant = computed<'classic' | 'race'>(() => {
  const requested = route.query.variant ?? settings.value?.variant
  return requested === 'advanced' || requested === 'race' ? 'race' : 'classic'
})
const racePager = useRaceHudPage(fastState)
const { activePage: racePage, damageFlash: raceDamageFlash } = racePager

// PIP-270: la Race non si spegne piu'. Nascondere l'intera sezione lasciava
// visibile il solo pannello opaco, cioe' il rettangolo nero segnalato dal
// pilota quando passava alla visuale di un altro. Come Classico,
// la griglia resta montata e una fascia dice perche' i valori sono `--`.

function selectRacePage(page: RaceHudPage) {
  racePager.selectPage(page)
}

onMounted(async () => {
  startFastStatePolling()
  start(route.query.scale)
  startInteractionSurface()
  await loadSettings()
  await overlay.notifyContentReady()
})

onBeforeUnmount(() => {
  stopFastStatePolling()
  stop()
})
const { t } = useI18n()
</script>

<template>
  <div class="hud-tyres-scope" style="position:relative;width:100%;height:100%">
  <div
    class="hud-overlay"
    :style="{ '--hud-scale': scale }"
    :class="{ 'hud-overlay--web': !isElectron }"
  >
    <OverlayPlacementLock overlay-id="tyres" />
    <TelemetryFeatureNotice :live="fastState.commonLive" feature="tyrePressure" />
    <OverlaySoftwareCursor :state="pointerState" />
    <div
      class="hud-overlay__panel"
      :class="{
        'hud-overlay__panel--race': variant === 'race',
        'hud-overlay__panel--yellow-flag': displayFastState.flag === 2,
      }"
    >
      <section
        v-if="variant === 'race'"
        class="race-hud"
        :data-active-page="racePage"
      >
        <nav class="race-hud__switcher" data-overlay-interactive aria-label="Pagina Race HUD">
          <button type="button" :class="{ active: racePage === 'tyres' }" @click="selectRacePage('tyres')">{{ t('overlays.tabTyres') }}</button>
          <button type="button" :class="{ active: racePage === 'damage' }" @click="selectRacePage('damage')">{{ t('overlays.tabDamage') }}</button>
        </nav>
        <TyreRaceHud v-if="racePage === 'tyres'" :fast-state="displayFastState" />
        <DamageRaceHud v-else :fast-state="displayFastState" :flash="raceDamageFlash" />
      </section>
      <TyreSlipHud v-else :fast-state="displayFastState" />
    </div>
  </div>
  </div>
</template>

<style lang="scss">
@use '~/assets/scss/training-overlay' as *;

.hud-tyres-scope {

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

// HUD style v2 (27/10): one opaque panel colour and a light border for both variants.
.hud-overlay__panel {
  position: relative;
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  -webkit-app-region: drag;
  padding: calc(12px * var(--hud-scale));
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  // Sfondo completamente OPACO (nessuna trasparenza) e nessuna ombra.
  background: #0d0e12;
}

.hud-overlay__panel--race {
  padding: 0;
  overflow: hidden;
  border-radius: calc(12px * var(--hud-scale));
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

// Yellow flag (third round 28/10): a 4px frame (at scale 1, scaling with the HUD) on the
// whole outer panel, for Classic and Race (tyres and Damage pages, weather strip included).
// Drawn by an overlay above the content, so nothing moves and nothing covers it.
.hud-overlay__panel--yellow-flag::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 15;
  border: calc(4px * var(--hud-scale)) solid #ffd400;
  border-radius: inherit;
  pointer-events: none;
}

.race-hud__switcher { position:absolute; top:calc(7px * var(--hud-scale)); right:calc(7px * var(--hud-scale)); z-index:20; display:flex; overflow:hidden; border:1px solid #666; border-radius:999px; background:#050608; opacity:0; transition:opacity 120ms ease; -webkit-app-region:no-drag; }
.hud-overlay__panel:hover .race-hud__switcher { opacity:1; }
.race-hud__switcher button { min-width:calc(52px * var(--hud-scale)); padding:calc(4px * var(--hud-scale)) calc(7px * var(--hud-scale)); border:0; background:transparent; color:#aaa; font:900 max(10px,calc(11px * var(--hud-scale)))/1 Inter,"Segoe UI",sans-serif; cursor:pointer; }
.race-hud__switcher button+button { border-left:1px solid #555; }.race-hud__switcher button.active { background:#f28a20;color:#050608; }
@media (prefers-reduced-motion: reduce) { .race-hud__switcher { transition:none; } }

// ── Classico v2: title bar, 2×2 cards up to 256px wide, tinted as the slip worsens ──
.hud-overlay .tyre-slip-hud {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--hud-scale));
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--hud-font-label);
}

.hud-overlay .tyre-slip-hud__header {
  justify-content: center;
  gap: calc(10px * var(--hud-scale));

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.15);
  }

  span {
    color: #f4f4f6;
    font: 700 max(11px, calc(12px * var(--hud-scale)))/1 var(--hud-font-label);
    letter-spacing: .14em;
    text-transform: uppercase;
  }
}

.hud-overlay .tyre-slip-grid {
  flex: 1;
  grid-template-columns: repeat(2, minmax(0, calc(256px * var(--hud-scale))));
  grid-template-rows: 1fr 1fr;
  justify-content: center;
  gap: calc(10px * var(--hud-scale)) calc(14px * var(--hud-scale));
}

// The background takes more of the slip colour as the state worsens: limit < slide < spin/lock.
.hud-overlay .tyre-slip {
  grid-template-columns: 1fr;
  align-content: space-between;
  gap: calc(6px * var(--hud-scale));
  padding: calc(10px * var(--hud-scale)) calc(8px * var(--hud-scale));
  border: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--tyre-slip-color) var(--tyre-slip-alarm, 0%), rgba(255, 255, 255, 0.045));
}

.hud-overlay .tyre-slip--state-limit { --tyre-slip-alarm: 12%; }
.hud-overlay .tyre-slip--state-sliding { --tyre-slip-alarm: 24%; }
.hud-overlay .tyre-slip--state-wheelspin,
.hud-overlay .tyre-slip--state-lockup { --tyre-slip-alarm: 38%; }
.hud-overlay .tyre-slip--waiting { --tyre-slip-alarm: 0%; }

.hud-overlay .tyre-slip__topline strong {
  font-family: var(--hud-font-label);
  font-size: max(16px, calc(18px * var(--hud-scale)));
  letter-spacing: .08em;
  color: #a3a5ae;
}

// The state sits in a pill filled with the slip colour.
.hud-overlay .tyre-slip__state,
.hud-overlay .tyre-slip--state-limit .tyre-slip__state,
.hud-overlay .tyre-slip--state-sliding .tyre-slip__state,
.hud-overlay .tyre-slip--state-wheelspin .tyre-slip__state,
.hud-overlay .tyre-slip--state-lockup .tyre-slip__state {
  max-width: none;
  padding: calc(2px * var(--hud-scale)) calc(6px * var(--hud-scale));
  border-radius: 999px;
  background: var(--tyre-slip-color, #fff);
  color: #000;
  font: 700 max(11px, calc(13px * var(--hud-scale)))/1 var(--hud-font-label);
  letter-spacing: .1em;
}

.hud-overlay .tyre-slip--waiting .tyre-slip__state {
  background: rgba(255, 255, 255, 0.12);
  color: #a3a5ae;
}

// Slip bottom-left and pressure bottom-right on the same row.
.hud-overlay .tyre-slip__meta {
  align-items: baseline;
}

.hud-overlay .tyre-slip__meta span {
  color: #f4f4f6;
  font-family: var(--hud-font-num);
  font-style: italic;
}

.hud-overlay .tyre-slip__meta span:first-child {
  font-size: max(14px, calc(15px * var(--hud-scale)));
  font-weight: 700;
}

.hud-overlay .tyre-slip__meta span:first-child::after {
  content: ' slip';
  font-family: var(--hud-font-label);
  font-size: 0.72em;
  font-style: normal;
  color: #a3a5ae;
}

.hud-overlay .tyre-slip__meta span + span {
  font-size: max(12px, calc(14px * var(--hud-scale)));
  color: #a3a5ae;
}

.hud-overlay .tyre-slip__bar {
  height: calc(7px * var(--hud-scale));
  border-radius: 0;
  background: rgba(255, 255, 255, 0.08);
}

.hud-overlay .tyre-slip__bar span {
  border-radius: 0;
}
}
</style>
