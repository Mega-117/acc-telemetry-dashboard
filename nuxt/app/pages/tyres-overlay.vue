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
import { useHudOverlayBackground } from '~/composables/useHudOverlayBackground'

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
// "Trasparenza sfondo" (owner 28/10): reaches ONLY the outer panel background (default 1 = opaque),
// never the cards, values, tyre/brake rectangles, slip bars, borders or icons.
const { backgroundOpacity } = useHudOverlayBackground(settings, 'tyres')
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
        'hud-overlay__panel--classic': variant === 'classic',
        'hud-overlay__panel--yellow-flag': displayFastState.flag === 2,
      }"
      :style="{ '--hud-tyres-bg-opacity': String(backgroundOpacity) }"
    >
      <!-- Classic and Race: clip-path removes the border on the cut corner, this line draws it back. -->
      <i class="hud-cut-corner__line" aria-hidden="true" />
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
@use '~/assets/scss/hud-cut-corner' as *;

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
  // Owner (28/10): square outer corners and an even 12px inner margin (scaled) on every side.
  border-radius: 0;
  // The ONLY background layer of the HUD (Classic and Race, tyres and Damage pages): opaque by
  // default, "Trasparenza sfondo" lowers its alpha only. No shadow.
  background: rgba(13, 14, 18, var(--hud-tyres-bg-opacity, 1));
}

// Classic and Race (owner 28/10): the Info shape on the outer panel, only the top-right corner cut
// with its border drawn back and the yellow frame following the cut. The four Classic tiles are flat, with no cut.
.hud-overlay__panel--classic,
.hud-overlay__panel--race {
  @include hud-cut-corner(calc(14px * var(--hud-scale)), rgba(255, 255, 255, 0.15), 'hud-overlay__panel--yellow-flag', calc(4px * var(--hud-scale)));
}

.hud-overlay__panel--race {
  padding: 0;
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

// ── Classic aligned (owner 28/10, HUD style guide): title bar and 2×2 flat tiles ──
.hud-overlay .tyre-slip-hud {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--hud-scale));
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--hud-font-num);
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
    font: italic 700 max(12px, calc(12px * var(--hud-scale)))/1 var(--hud-font-num);
    letter-spacing: .14em;
    text-transform: uppercase;
  }
}

.hud-overlay .tyre-slip-grid {
  flex: 1;
  // The tiles fill the panel width, so the 12px panel padding is the same margin on all four sides.
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: 1fr 1fr;
  justify-content: center;
  gap: calc(8px * var(--hud-scale));
}

// Flat tile, a touch lighter than the panel: no border, band or cut of its own. The state adds a
// light tint of the slip colour that grows with it (limit < slide < spin/lock), none while waiting.
// The tile never reads "Trasparenza sfondo": only the outer panel background does.
.hud-overlay .tyre-slip {
  position: relative;
  grid-template-columns: 1fr;
  align-content: space-between;
  gap: calc(8px * var(--hud-scale));
  // Padding and gap scale with the HUD: at 0.6 the text floors (id and state 12px, values 14px)
  // keep the four tiles inside the 268px window.
  padding: calc(10px * var(--hud-scale)) calc(12px * var(--hud-scale));
  border: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--tyre-slip-color) var(--tyre-slip-alarm, 0%), rgba(255, 255, 255, 0.045));
}

// The OK band reads as plain white text and fill, like every other value.
.hud-overlay .tyre-slip--white { --tyre-slip-color: #f4f4f6; }

.hud-overlay .tyre-slip--state-limit { --tyre-slip-alarm: 8%; }
.hud-overlay .tyre-slip--state-sliding { --tyre-slip-alarm: 14%; }
.hud-overlay .tyre-slip--state-wheelspin,
.hud-overlay .tyre-slip--state-lockup { --tyre-slip-alarm: 20%; }
.hud-overlay .tyre-slip--waiting { --tyre-slip-alarm: 0%; }

.hud-overlay .tyre-slip__topline {
  align-items: baseline;
}

.hud-overlay .tyre-slip__topline strong {
  color: #f4f4f6;
  font: italic 700 max(12px, calc(16px * var(--hud-scale)))/1 var(--hud-font-num);
  letter-spacing: .04em;
}

// The state is coloured text only (no filled tag), in the slip colour; grey while waiting.
.hud-overlay .tyre-slip__state,
.hud-overlay .tyre-slip--state-limit .tyre-slip__state,
.hud-overlay .tyre-slip--state-sliding .tyre-slip__state,
.hud-overlay .tyre-slip--state-wheelspin .tyre-slip__state,
.hud-overlay .tyre-slip--state-lockup .tyre-slip__state {
  max-width: none;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--tyre-slip-color, #f4f4f6);
  font: italic 700 max(12px, calc(13px * var(--hud-scale)))/1 var(--hud-font-num);
  letter-spacing: .06em;
}

.hud-overlay .tyre-slip--waiting .tyre-slip__state { color: #a3a5ae; }

// Straight gauge: ONE continuous fill sized by the slip formula, with thin separators drawn over
// it every tenth, so a partial value shows a partly filled step, never steps lighting up.
.hud-overlay .tyre-slip__bar {
  --tyre-slip-tick-gap: max(1px, calc(2px * var(--hud-scale)));
  position: relative;
  height: max(4px, calc(8px * var(--hud-scale)));
  overflow: hidden;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.08);
}

.hud-overlay .tyre-slip__bar .tyre-slip__fill {
  position: absolute;
  inset: 0 auto 0 0;
  height: auto;
  border-radius: 0;
  background: var(--tyre-slip-color);
}

.hud-overlay .tyre-slip--waiting .tyre-slip__bar .tyre-slip__fill { background: rgba(255, 255, 255, 0.2); }

.hud-overlay .tyre-slip__ticks {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(90deg, transparent 0 calc(100% / var(--tyre-slip-ticks) - var(--tyre-slip-tick-gap)), #0d0e12 calc(100% / var(--tyre-slip-ticks) - var(--tyre-slip-tick-gap)) calc(100% / var(--tyre-slip-ticks)));
  pointer-events: none;
}

// Slip bottom-left and pressure bottom-right on the same row.
.hud-overlay .tyre-slip__meta {
  align-items: baseline;
}

.hud-overlay .tyre-slip__slip,
.hud-overlay .tyre-slip__psi {
  overflow: visible;
  color: #f4f4f6;
  font: italic 700 max(14px, calc(20px * var(--hud-scale)))/1 var(--hud-font-num);
}

// The shared base styles size every `.tyre-slip__meta span` at 10px: the fixed-digit slots inherit instead.
.hud-overlay .tyre-slip__meta .hud-fixed-digits,
.hud-overlay .tyre-slip__meta .hud-fixed-digits__glyph {
  overflow: visible;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
}

// Units small and grey.
.hud-overlay .tyre-slip__meta small {
  color: #a3a5ae;
  font: italic 700 max(11px, calc(11px * var(--hud-scale)))/1 var(--hud-font-num);
  letter-spacing: .04em;
}
}
</style>
