<script setup lang="ts">
import { useHudPresentationMemory } from '~/services/overlay/hudPresentationMemory'
import { hudSourcePolicy } from '~/services/sim/hudSourceAdapter'

import { completedLapHoldSample } from '~/utils/completedLapHoldSample'
import TelemetryFeatureNotice from '~/components/overlay/TelemetryFeatureNotice.vue'
import OverlayPlacementLock from '~/components/overlay/OverlayPlacementLock.vue'
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
// Overlay HUD Settori (PIP-175/PIP-276): Classico e Compatto condividono
// telemetria, riferimento delta e target runtime. TARGET e' solo un secondo
// accesso alla stessa configurazione usata da Ctrl+K.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useHudOverlay } from '~/composables/useHudOverlay'
import { useOverlayTelemetrySource } from '~/composables/useOverlayTelemetrySource'
import { useCompletedLapHold } from '~/composables/useCompletedLapHold'
import SectorDeltaHud from '~/components/overlay/SectorDeltaHud.vue'
import HudTimedPager from '~/components/overlay/HudTimedPager.vue'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import InfoTargetSetup from '~/components/overlay/InfoTargetSetup.vue'
import { resolveCustomSectorTimes } from '~/utils/customSectorReferences'
import { normalizeSectorDeltaReference } from '~/utils/sectorDeltaPresentation'
import { resolveLocalCompactPresentation } from '~/utils/compactSectorPresentation'
import {
  evaluateInfoTarget,
  type InfoTargetOutcome,
  type InfoTargetSettings,
} from '~/utils/infoPresentation'

definePageMeta({ layout: 'hud-overlay' })

useHead({
  htmlAttrs: { class: 'training-overlay-document' },
  bodyAttrs: { class: 'training-overlay-runtime' },
})

type RuntimeInfoTargetSettings = InfoTargetSettings & { resetReason?: string | null }
type PagerRef = { returnToDefault: () => void }
type PagerPage = {
  id: 'live' | 'target'
  label: string
  temporary?: boolean
  minViewport?: { width: number, height: number }
}

const TARGET_VIEWPORT = { width: 432, height: 468 }
const TARGET_VIEWPORT_KEY = 'sectors-target'
const pagerPages: PagerPage[] = [
  { id: 'live', label: 'LIVE' },
  { id: 'target', label: 'TARGET', temporary: false, minViewport: TARGET_VIEWPORT },
]

const getApi = useOverlayRegionApi()

const route = useRoute()
const telemetry = useOverlayTelemetrySource(getApi)
const { fastState, startFastStatePolling, stopFastStatePolling } = telemetry
const {
  heldLap: focusedHeldLap,
  displayedLapTimeMs: focusedDisplayedLapTimeMs,
  displayedLapValid: focusedDisplayedLapValid,
} = useCompletedLapHold(fastState)
const {
  isElectron,
  isPlacing,
  scale,
  settings,
  loadSettings,
  notifyContentReady,
  start,
  stop,
  startInteractionSurface,
  pointerState,
  setTransientViewport,
} = useHudOverlay('sectors', getApi)

const pagerRef = ref<PagerRef | null>(null)
const compactPage = ref<'live' | 'target'>(
  route.query.page === 'target' ? 'target' : 'live',
)
const mounted = ref(false)
const targetLoaded = ref(false)
const targetSettings = ref<RuntimeInfoTargetSettings | null>(null)
const targetTimeMs = ref(120_000)
const targetToleranceMs = ref(500)
const targetKeepBetweenSessions = ref(false)
const frozenTargetOutcome = ref<InfoTargetOutcome>('neutral')
let evaluatedHoldStartedAtMs: number | null = null
let removeTargetListener: (() => void) | null = null

const showReference = computed(() => settings.value?.showReference !== false)
const showBest = computed(() => settings.value?.showBest !== false)
const showCurrentLap = computed(() => settings.value?.showCurrentLap !== false)
const deltaReference = computed(() => normalizeSectorDeltaReference(settings.value?.deltaReference))
const customSectorTimes = computed(() => fastState.value.isFresh
  ? resolveCustomSectorTimes(settings.value?.customSectorReferences, { ...fastState.value.context,
    sectorCount: hudSourcePolicy(fastState.value).sectorCount }) : null)
const variant = computed(() => settings.value?.variant === 'compact' ? 'compact' : 'classic')
const onTargetPage = computed(() => variant.value === 'compact' && compactPage.value === 'target')
const localCompactPresentation = computed(() => resolveLocalCompactPresentation(fastState.value))
const liveCompactDisplayLap = computed(() => telemetry.source.value === 'focused'
  ? { timeMs: focusedDisplayedLapTimeMs.value, valid: focusedDisplayedLapValid.value }
  : localCompactPresentation.value.displayLap)
const heldLap = computed(() => telemetry.source.value === 'focused'
  ? focusedHeldLap.value
  : localCompactPresentation.value.heldLap)
const currentLapTimeMs = computed(() => telemetry.source.value === 'focused'
  ? fastState.value.info?.currentLapTimeMs ?? null
  : fastState.value.sectorHud?.currentLapTimeMs ?? fastState.value.info?.currentLapTimeMs ?? null)
const rootScale = computed(() => onTargetPage.value ? 1 : scale.value)
// PIP-524: compact and classic read the same 20 Hz source.
const liveSectorHud = computed(() => telemetry.source.value === 'focused'
  ? telemetry.sectorHud.value
  : fastState.value.sectorHud)
const compactDisplayLap = useHudPresentationMemory(liveCompactDisplayLap, fastState)
const liveCurrentLapTimeMs = useHudPresentationMemory(currentLapTimeMs, fastState)
const visibleSectorHud = useHudPresentationMemory(liveSectorHud, fastState)
function contextualTargetTimeMs(): number {
  const contextual = fastState.value.info?.bestLapTimeMs
    || fastState.value.info?.lastLapTimeMs
    || fastState.value.info?.currentLapTimeMs
  return contextual && contextual >= 1_000
    ? Math.round(contextual / 100) * 100
    : 120_000
}

function syncTargetDraft(next: RuntimeInfoTargetSettings | null) {
  targetTimeMs.value = typeof next?.targetTimeMs === 'number' && next.targetTimeMs >= 1_000
    ? next.targetTimeMs
    : contextualTargetTimeMs()
  targetToleranceMs.value = Math.min(Math.max(Math.round(next?.toleranceMs || 500), 100), 1_000)
  targetKeepBetweenSessions.value = next?.keepBetweenSessions === true
}

function returnToLive() {
  pagerRef.value?.returnToDefault()
}

async function updateTransientViewport(active: boolean) {
  if (!mounted.value) return
  await setTransientViewport({
    active,
    key: TARGET_VIEWPORT_KEY,
    ...(active ? { minWidth: TARGET_VIEWPORT.width, minHeight: TARGET_VIEWPORT.height } : {}),
  })
}

function handlePageChange(page: { id: string }) {
  if (page.id !== `live` && page.id !== `target`) return
  compactPage.value = page.id
  if (page.id === 'target') {
    if (variant.value !== 'compact' || isPlacing.value) {
      returnToLive()
      return
    }
    syncTargetDraft(targetSettings.value)
    void updateTransientViewport(true)
    return
  }
  syncTargetDraft(targetSettings.value)
  void updateTransientViewport(false)
}

async function confirmTarget() {
  const saved = await getApi()?.infoTargetSaveSettings?.({
    targetTimeMs: targetTimeMs.value,
    toleranceMs: targetToleranceMs.value,
    keepBetweenSessions: targetKeepBetweenSessions.value,
  }) as RuntimeInfoTargetSettings | undefined
  if (saved) {
    targetSettings.value = saved
    syncTargetDraft(saved)
  }
  returnToLive()
}

function cancelTarget() {
  syncTargetDraft(targetSettings.value)
  returnToLive()
}

watch(() => completedLapHoldSample(fastState.value).contextKey, (next, previous) => {
  if (next !== previous && compactPage.value === 'target') cancelTarget()
}, { flush: 'sync' })

watch(
  [heldLap, targetLoaded],
  ([lap, loaded]) => {
    if (!lap) {
      evaluatedHoldStartedAtMs = null
      frozenTargetOutcome.value = 'neutral'
      return
    }
    if (!loaded || evaluatedHoldStartedAtMs === lap.startedAtMs) return
    evaluatedHoldStartedAtMs = lap.startedAtMs
    frozenTargetOutcome.value = evaluateInfoTarget(
      lap.timeMs,
      lap.valid,
      targetSettings.value,
    )
  },
  { immediate: true },
)

watch(variant, (next) => {
  if (next !== 'compact' && compactPage.value === 'target') returnToLive()
})
watch(isPlacing, (active) => {
  if (active && compactPage.value === 'target') returnToLive()
})
watch(scale, () => {
  if (compactPage.value === 'target') returnToLive()
})

onMounted(async () => {
  startFastStatePolling()
  start(route.query.scale)
  await loadSettings()
  const api = getApi()
  targetSettings.value = await api?.infoTargetGetSettings?.() || null
  targetLoaded.value = true
  syncTargetDraft(targetSettings.value)
  if (typeof api?.onInfoTargetSettings === 'function') {
    removeTargetListener = api.onInfoTargetSettings((next: RuntimeInfoTargetSettings) => {
      targetSettings.value = next
      if (next?.resetReason && compactPage.value === 'target') {
        returnToLive()
      } else if (compactPage.value !== 'target') {
        syncTargetDraft(next)
      }
    })
  }
  mounted.value = true
  startInteractionSurface()
  if (compactPage.value === 'target') {
    if (variant.value === 'compact' && !isPlacing.value) {
      await updateTransientViewport(true)
    } else {
      returnToLive()
    }
  }
  await notifyContentReady()
})

onBeforeUnmount(() => {
  void setTransientViewport({ active: false, key: TARGET_VIEWPORT_KEY })
  removeTargetListener?.()
  stopFastStatePolling()
  stop()
})
</script>

<template>
  <div class="hud-sectors-scope" style="position:relative;width:100%;height:100%">
  <div
    class="hud-overlay"
    :style="{ '--hud-scale': rootScale }"
    :class="{
      'hud-overlay--web': !isElectron,
      'hud-overlay--target': onTargetPage,
    }"
  >
    <OverlayPlacementLock overlay-id="sectors" />
    <TelemetryFeatureNotice :live="fastState.commonLive" feature="sectors" />
    <OverlaySoftwareCursor :state="pointerState" />
    <div
      class="hud-overlay__panel"
      :class="{
        'hud-overlay__panel--compact': variant === 'compact',
        'hud-overlay__panel--target': onTargetPage,
      }"
    >
      <HudTimedPager
        v-if="variant === 'compact'"
        ref="pagerRef"
        :pages="pagerPages"
        default-page="live"
        :initial-page="compactPage"
        floating-switcher
        :reveal-controls="pointerState.surfaceHovered"
        @page-change="handlePageChange"
      >
        <template #live>
          <SectorDeltaHud
            :sector-hud="visibleSectorHud"
            :idle-sector-count="hudSourcePolicy(fastState).sectorCount"
            :show-reference="showReference"
            :show-best="showBest"
            :show-current-lap="showCurrentLap"
            :delta-reference="deltaReference"
        :custom-sector-times="customSectorTimes"
            variant="compact"
            live-running
            :live-current-lap-time-ms="liveCurrentLapTimeMs"
            :compact-display-lap="compactDisplayLap"
            :target-outcome="frozenTargetOutcome"
          />
        </template>
        <template #target>
          <InfoTargetSetup
            :target-time-ms="targetTimeMs"
            :tolerance-ms="targetToleranceMs"
            :keep-between-sessions="targetKeepBetweenSessions"
            context-label="SECTORS · TARGET"
            appearance="sectors"
            @set-target-time="targetTimeMs = $event"
            @select-tolerance="targetToleranceMs = $event"
            @toggle-keep="targetKeepBetweenSessions = !targetKeepBetweenSessions"
            @confirm="confirmTarget"
            @cancel="cancelTarget"
          />
        </template>
      </HudTimedPager>
      <SectorDeltaHud
        v-else
        :sector-hud="visibleSectorHud"
        :idle-sector-count="hudSourcePolicy(fastState).sectorCount"
        :show-reference="showReference"
        :show-best="showBest"
        :show-current-lap="showCurrentLap"
        :delta-reference="deltaReference"
        :custom-sector-times="customSectorTimes"
        variant="classic"
        :live-current-lap-time-ms="liveCurrentLapTimeMs"
        :compact-display-lap="compactDisplayLap"
      />
    </div>
  </div>
  </div>
</template>

<style lang="scss">
@use '~/assets/scss/training-overlay' as *;

.hud-sectors-scope {

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
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  // Sfondo OPACO e nessuna ombra (pannello stile v2).
  background: #0d0e12;
}

// ── L'HUD riempie il pannello ────────────────────────────────────────────────
.hud-overlay__panel--compact {
  padding: calc(8px * var(--hud-scale)) calc(14px * var(--hud-scale)) calc(10px * var(--hud-scale));
  border-radius: calc(12px * var(--hud-scale));
}

// HUD style v2 (27/10): title bar "SETTORI vs BEST", lap tile in yellow, then one tile per
// sector with time, delta and the boxed PREV/BEST minis. The tile tint keeps the sector colour.
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
  font-family: var(--hud-font-label);
}

.hud-overlay .sector-delta-hud__body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: calc(8px * var(--hud-scale));
  min-height: 0;
}

.hud-overlay .sector-delta-hud__grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: calc(8px * var(--hud-scale));
  min-height: 0;
}

.hud-overlay .sector-delta-hud__header--classic {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(8px * var(--hud-scale));

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.15);
  }
}

.hud-overlay .sector-delta-hud__header span,
.hud-overlay .sector-delta-hud__header em {
  overflow: visible;
  font: 700 calc(12px * var(--hud-scale))/1 var(--hud-font-label);
  letter-spacing: .14em;
  text-transform: uppercase;
}

.hud-overlay .sector-delta-hud__title {
  color: #f4f4f6;
}

.hud-overlay .sector-delta-hud__comparison {
  color: #a3a5ae;
  font-style: normal;
}

.hud-overlay .sector-delta-hud__lap,
.hud-overlay .sector-delta {
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: calc(3px * var(--hud-scale));
  padding: calc(6px * var(--hud-scale)) calc(8px * var(--hud-scale));
  overflow: hidden;
  border: 0;
  border-radius: 0;
}

.hud-overlay .sector-delta-hud__lap {
  background: rgba(255, 255, 255, 0.045);
}

.hud-overlay .sector-delta-hud__lap-label,
.hud-overlay .sector-delta__label {
  overflow: hidden;
  color: #a3a5ae;
  font: 700 calc(12px * var(--hud-scale))/1 var(--hud-font-label);
  letter-spacing: .08em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.hud-overlay .sector-delta-hud__lap-time {
  overflow: hidden;
  color: #facc15;
  font: italic 700 calc(21px * var(--hud-scale))/1 var(--hud-font-num);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hud-overlay .sector-delta-hud__lap-time.sector-compact__lap--invalid { color: #dc1010; }
.hud-overlay .sector-delta-hud__lap-time.sector-compact__lap--unknown { color: #6f7277; }

.hud-overlay .sector-delta strong {
  color: #f4f4f6;
  font: italic 700 calc(20px * var(--hud-scale))/1 var(--hud-font-num);
}

.hud-overlay .sector-delta .sector-delta__delta {
  align-self: flex-start;
  color: #f4f4f6;
  font: italic 700 calc(15px * var(--hud-scale))/1 var(--hud-font-num);
}

.hud-overlay .sector-delta--purple .sector-delta__delta { color: rgb(217, 70, 239); }
.hud-overlay .sector-delta--green .sector-delta__delta { color: rgb(34, 197, 94); }
.hud-overlay .sector-delta--yellow .sector-delta__delta { color: rgb(250, 204, 21); }
.hud-overlay .sector-delta--red .sector-delta__delta { color: rgb(239, 68, 68); }
.hud-overlay .sector-delta .sector-delta__delta--placeholder { color: #a3a5ae; text-transform: uppercase; }

.hud-overlay .sector-delta__minis {
  display: grid;
  gap: calc(2px * var(--hud-scale));
  margin-top: calc(1px * var(--hud-scale));
}

.hud-overlay .sector-delta__ref,
.hud-overlay .sector-delta__best {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: calc(4px * var(--hud-scale));
  min-width: 0;
  padding: calc(2px * var(--hud-scale)) calc(5px * var(--hud-scale));
  background: rgba(255, 255, 255, 0.06);

  b {
    color: #a3a5ae;
    font: 700 calc(10px * var(--hud-scale))/1 var(--hud-font-label);
    letter-spacing: .1em;
    text-transform: uppercase;
  }

  em {
    overflow: hidden;
    color: #f4f4f6;
    font: italic 600 calc(12px * var(--hud-scale))/1 var(--hud-font-num);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.hud-overlay--target {
  padding: 6px;
}

.hud-overlay__panel--target {
  padding: 8px;
  border-radius: 12px;
}

.hud-overlay__panel--target .hud-timed-pager__content,
.hud-overlay__panel--target .info-target-setup {
  width: 100%;
  height: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .hud-overlay--target *,
  .hud-overlay--target *::before,
  .hud-overlay--target *::after {
    transition: none !important;
  }
}
}
</style>
