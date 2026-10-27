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
import { useHudOverlayBackground } from '~/composables/useHudOverlayBackground'
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
// Classic keeps its own lap-tile option, off unless the pilot turns it on (27/10).
const showClassicLap = computed(() => settings.value?.showClassicLap === true)
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
const { backgroundOpacity } = useHudOverlayBackground(settings, 'sectors') // default 1 = opaque panel
const panelBackgroundOpacity = computed(() => onTargetPage.value ? 1 : backgroundOpacity.value)
// PIP-524: compact and classic read the same 20 Hz source.
const liveSectorHud = computed(() => telemetry.source.value === 'focused'
  ? telemetry.sectorHud.value
  : fastState.value.sectorHud)
const compactDisplayLap = useHudPresentationMemory(liveCompactDisplayLap, fastState)
const liveCurrentLapTimeMs = useHudPresentationMemory(currentLapTimeMs, fastState)
const visibleSectorHud = useHudPresentationMemory(liveSectorHud, fastState)
// Classic lap tile delta (mock 27/10): the Info live delta, hidden while a finished lap is held.
const liveLapDeltaMs = computed(() => {
  const delta = fastState.value.info?.delta
  return !heldLap.value && delta?.available ? delta.ms : null
})
const lapDeltaMs = useHudPresentationMemory(liveLapDeltaMs, fastState)
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
      :style="{ '--hud-sectors-bg-opacity': String(panelBackgroundOpacity) }"
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
        :show-current-lap="showClassicLap"
        :delta-reference="deltaReference"
        :custom-sector-times="customSectorTimes"
        variant="classic"
        :live-current-lap-time-ms="liveCurrentLapTimeMs"
        :compact-display-lap="compactDisplayLap"
        :lap-delta-ms="lapDeltaMs"
      />
    </div>
  </div>
  </div>
</template>

<style lang="scss" src="../assets/scss/components/sectors-overlay.scss"></style>
