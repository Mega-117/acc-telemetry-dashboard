<script setup lang="ts">
import TelemetryFeatureNotice from '~/components/overlay/TelemetryFeatureNotice.vue'
import { useHudPresentationMemory } from '~/services/overlay/hudPresentationMemory'
import OverlayPlacementLock from '~/components/overlay/OverlayPlacementLock.vue'
import { stableComputed } from '~/services/overlay/stableTelemetry'
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { createShiftTraceAggregator } from '~/services/overlay/shiftTrace'
import { reportHudTrace } from '~/services/overlay/hudTrace'
import { hudSourcePolicy } from '~/services/sim/hudSourceAdapter'
import DashboardHud from '~/components/overlay/DashboardHud.vue'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import {
  FOCUSED_CAR_FEED_INTERVAL_MS,
  useOverlayTelemetrySource,
} from '~/composables/useOverlayTelemetrySource'
import { useHudOverlay } from '~/composables/useHudOverlay'
import { useHudOverlayBackground } from '~/composables/useHudOverlayBackground'
import { useDashboardAdjustment } from '~/composables/useDashboardAdjustment'
import {
  buildDashboardPresentation,
  withoutStaleShiftFlash,
  DEFAULT_DASHBOARD_OPTIONS,
  normalizeFuelCriticalLapsThreshold,
} from '~/utils/dashboardPresentation'

definePageMeta({ layout: 'hud-overlay' })

const route = useRoute()
const getApi = useOverlayRegionApi()
const overlay = useHudOverlay('dashboard', getApi)
const { backgroundOpacity } = useHudOverlayBackground(overlay.settings, 'dashboard')
const telemetry = useOverlayTelemetrySource(getApi, FOCUSED_CAR_FEED_INTERVAL_MS)
const options = computed(() => ({
  electronicsReference: overlay.settings.value?.electronicsReference ?? DEFAULT_DASHBOARD_OPTIONS.electronicsReference,
  rpmReference: overlay.settings.value?.rpmReference ?? DEFAULT_DASHBOARD_OPTIONS.rpmReference,
  gearReference: overlay.settings.value?.gearReference ?? DEFAULT_DASHBOARD_OPTIONS.gearReference,
  fuelCriticalFlashEnabled: overlay.settings.value?.fuelCriticalFlashEnabled
    ?? DEFAULT_DASHBOARD_OPTIONS.fuelCriticalFlashEnabled,
  fuelCriticalLapsThreshold: normalizeFuelCriticalLapsThreshold(
    overlay.settings.value?.fuelCriticalLapsThreshold,
  ),
}))
const liveModel = stableComputed(() => buildDashboardPresentation(
  telemetry.fastState.value,
  options.value,
  telemetry.focusedCar.value,
))
// --hud-frame-unit keeps the panel frames whole screen pixels under the scale (hud-cut-corner).
const canvasStyle = computed(() => ({ 'transform': `scale(${overlay.scale.value})`, '--hud-frame-unit': `${1 / overlay.scale.value}px` }))
const retainedModel = useHudPresentationMemory(liveModel, telemetry.fastState)
const model = computed(() => withoutStaleShiftFlash(retainedModel.value, liveModel.value))
// The box being adjusted (TC, TC2, ABS, MAP, BB) is highlighted for 1.5 s; local live telemetry only.
const adjustmentEnabled = computed(() => {
  const state = telemetry.fastState.value
  return state.dataSource !== 'focused' && state.isFresh && state.isLive
})
const { active: adjusting } = useDashboardAdjustment(model, adjustmentEnabled)

// PIP-704: flash onset vs real upshift, every 10 upshifts, for the diary (own car only).
const shiftTrace = createShiftTraceAggregator(summary => reportHudTrace('hud.shift', { ...summary }))
watch(liveModel, (live) => {
  const state = telemetry.fastState.value
  const own = state.dataSource !== 'focused' && state.isFresh && state.isLive
  shiftTrace.feed({
    now: Date.now(),
    car: own && typeof state.context?.car === 'string' ? state.context.car : null,
    gear: own && typeof state.gear === 'number' ? state.gear : null,
    rpm: own && typeof state.rpm === 'number' ? state.rpm : null,
    flash: live.shiftFlash,
    targetRpm: own ? hudSourcePolicy(state).shiftRpm ?? null : null,
  })
})

onMounted(async () => {
  overlay.start(route.query.scale)
  overlay.startInteractionSurface()
  await overlay.loadSettings()
  telemetry.startFastStatePolling()
  await overlay.notifyContentReady()
})
onUnmounted(() => {
  telemetry.stopFastStatePolling()
  overlay.stop()
})
</script>

<template>
  <main class="overlay-root">
    <OverlayPlacementLock overlay-id="dashboard" />
    <OverlaySoftwareCursor :state="overlay.pointerState" />
    <DashboardHud
      :model="model"
      :background-opacity="backgroundOpacity"
      :adjusting="adjusting"
      :shift-color="overlay.settings.value?.shiftFlashColor === 'blue' ? 'blue' : 'red'"
      class="overlay-canvas"
      :style="canvasStyle"
    />
    <TelemetryFeatureNotice :live="telemetry.fastState.value.commonLive" feature="speed" />
  </main>
</template>

<style scoped>
:global(html),:global(body),:global(#__nuxt){margin:0;width:100%;height:100%;overflow:hidden;background:transparent!important}
.overlay-root{position:relative;width:100%;height:100%;overflow:hidden;background:transparent;-webkit-app-region:drag;user-select:none}
.overlay-canvas{position:absolute;left:0;top:0;transform-origin:top left;-webkit-app-region:drag}
</style>
