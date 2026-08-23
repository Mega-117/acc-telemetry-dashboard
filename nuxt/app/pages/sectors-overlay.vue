<script setup lang="ts">
// Overlay HUD Settori (PIP-175/PIP-276): Classico e Compatto condividono
// telemetria, riferimento delta e target runtime. TARGET e' solo un secondo
// accesso alla stessa configurazione usata da Ctrl+K.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'
import { useHudOverlay } from '~/composables/useHudOverlay'
import { useOverlayTelemetrySource } from '~/composables/useOverlayTelemetrySource'
import { useCompletedLapHold } from '~/composables/useCompletedLapHold'
import SectorDeltaHud from '~/components/overlay/SectorDeltaHud.vue'
import HudTimedPager from '~/components/overlay/HudTimedPager.vue'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import InfoTargetSetup from '~/components/overlay/InfoTargetSetup.vue'
import { normalizeSectorDeltaReference } from '~/utils/sectorDeltaPresentation'
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

function getApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const route = useRoute()
const { liveLap, startLiveStatePolling, stopLiveStatePolling } = useLiveStatePoller(getApi)
const telemetry = useOverlayTelemetrySource(getApi)
const { fastState, startFastStatePolling, stopFastStatePolling } = telemetry
const {
  heldLap,
  displayedLapTimeMs,
  displayedLapValid,
} = useCompletedLapHold(fastState)
const {
  isElectron,
  isPlacing,
  scale,
  settings,
  loadSettings,
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
const variant = computed(() => settings.value?.variant === 'compact' ? 'compact' : 'classic')
const onTargetPage = computed(() => variant.value === 'compact' && compactPage.value === 'target')
const compactDisplayLap = computed(() => ({
  timeMs: displayedLapTimeMs.value,
  valid: displayedLapValid.value,
}))
const liveCurrentLapTimeMs = computed(() => fastState.value.info?.currentLapTimeMs ?? null)
const rootScale = computed(() => onTargetPage.value ? 1 : scale.value)
const visibleSectorHud = computed(() => telemetry.source.value === 'focused'
  ? telemetry.sectorHud.value
  : liveLap.value.sectorHud)
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
  startLiveStatePolling()
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
})

onBeforeUnmount(() => {
  void setTransientViewport({ active: false, key: TARGET_VIEWPORT_KEY })
  removeTargetListener?.()
  stopLiveStatePolling()
  stopFastStatePolling()
  stop()
})
</script>

<template>
  <div
    class="hud-overlay"
    :style="{ '--hud-scale': rootScale }"
    :class="{
      'hud-overlay--web': !isElectron,
      'hud-overlay--target': onTargetPage,
    }"
  >
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
            :show-reference="showReference"
            :show-best="showBest"
            :show-current-lap="showCurrentLap"
            :delta-reference="deltaReference"
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
        :show-reference="showReference"
        :show-best="showBest"
        :show-current-lap="showCurrentLap"
        :delta-reference="deltaReference"
        variant="classic"
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

.hud-overlay .sector-delta-hud__header--classic {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(8px * var(--hud-scale));
}

.hud-overlay .sector-delta-hud__title {
  font-weight: 950;
  letter-spacing: .08em;
}

.hud-overlay .sector-delta-hud__comparison {
  font-style: normal;
  font-weight: 900;
  letter-spacing: .04em;
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
</style>
