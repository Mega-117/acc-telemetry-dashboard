<script setup lang="ts">
import { useHudShownReport } from '~/services/overlay/hudShownReport'
import { useHudValuesReport } from '~/services/overlay/hudValuesReport'
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
import { useStandingsState } from '~/composables/useStandingsState'
import { rosterLapMs, spectatorTruth, useCameraSince } from '~/services/overlay/spectatorTruth'
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
// PIP-710: which lap this window shows and for how long it held retained data (hud.shown).
useHudShownReport('dashboard', telemetry.fastState)
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
// PIP-711: the numbers this window drew from and the texts it shows, compared in main (hud.check 'values').
useHudValuesReport('dashboard', telemetry.fastState, () => {
  const state = telemetry.fastState.value
  const shown = model.value
  return {
    inputs: { gear: state.gear, speedKmh: state.speedKmh, fuelL: state.fuelL, brakeBiasPct: state.brakeBiasPct,
      engineMap: state.engineMap, tractionControl: state.tractionControl, abs: state.abs,
      fuelPerLapL: state.fuelPerLapL, fuelLapsRemaining: state.fuelLapsRemaining, fuelLeftMs: state.fuelLeftTimeMs },
    shown: { gear: shown.gear, speed: shown.speed, fuel: shown.fuel, brakeBias: shown.brakeBias,
      engineMap: shown.engineMap, tc: shown.tractionControl, abs: shown.abs,
      fuelPerLap: shown.fuelPerLap, lapsLeft: shown.lapsLeft, fuelLeft: shown.fuelLeft },
  }
}, () => {
  // PIP-713: the view on the car ACC's camera is on, against the standings roster - a feed apart
  // from the focused-car feed it is drawn from. Values only when both carry the same UDP packet of
  // that car; the car itself once the camera has stayed on it for a few seconds.
  const spec = model.value.spectator
  const viewed = telemetry.focusedCar.value
  if (!spec || !roster.state.value.snapshot) return { inputs: {}, shown: {} }
  const { car: truth, samePacket, settled } = spectatorTruth(roster.state.value.snapshot, viewed, cameraSince.value, Date.now())
  const inputs: Record<string, unknown> = {}
  const shown: Record<string, string> = {}
  if (truth && settled) {
    inputs.specNumber = truth.race_number ?? null
    shown.specNumber = spec.carLabel
  }
  if (viewed && typeof viewed.realtime_updated_at_ms === 'number') {
    inputs.specAgeMs = roster.nowMs.value - viewed.realtime_updated_at_ms
    shown.specLive = spec.session
  }
  if (truth && samePacket) {
    const bestSplits = Array.isArray(truth.best_lap?.splits_ms) ? truth.best_lap.splits_ms : []
    Object.assign(inputs, {
      specPosition: truth.position ?? null, specLaps: truth.laps ?? null,
      specLastMs: rosterLapMs(truth.last_lap?.time_ms, truth.last_lap_ms),
      specBestMs: rosterLapMs(truth.best_lap?.time_ms, truth.best_lap_ms),
      specBestS1Ms: bestSplits[0] ?? null, specBestS2Ms: bestSplits[1] ?? null, specBestS3Ms: bestSplits[2] ?? null,
      gear: truth.gear ?? null, speedKmh: truth.kmh ?? null,
    })
    const [, last, best] = spec.timings
    Object.assign(shown, {
      specPos: spec.position, specLaps: spec.laps, specLast: last.lapTime, specBest: best.lapTime,
      specBestS1: best.splits[0], specBestS2: best.splits[1], specBestS3: best.splits[2],
      gear: model.value.gear, speed: model.value.speed,
    })
  }
  return { inputs, shown }
})
// PIP-713: the standings roster, the truth for the view on another car; when the camera last moved.
const roster = useStandingsState(getApi)
const cameraSince = useCameraSince(() => roster.state.value.snapshot)
onMounted(() => roster.start())
onUnmounted(() => roster.stop())
// The box being adjusted (TC, TC2, ABS, MAP, BB) is highlighted for 1.5 s; local live telemetry only.
const adjustmentEnabled = computed(() => {
  const state = telemetry.fastState.value
  return state.dataSource !== 'focused' && state.isFresh && state.isLive
})
const { active: adjusting } = useDashboardAdjustment(model, adjustmentEnabled)

// PIP-704: flash onset vs real upshift, every 10 upshifts, for the diary (own car only).
const shiftTrace = createShiftTraceAggregator(summary => reportHudTrace('hud.shift', { ...summary }))
// 02/11: the trace stayed silent for ~70 laps; every 5 minutes its health says why (frames fed,
// skipped by reason, upshifts seen, reports sent). Nothing is sent while nothing was fed.
let shiftHealthAt = Date.now()
function reportShiftHealth(now: number) {
  if (now - shiftHealthAt < 5 * 60_000) return
  shiftHealthAt = now
  const health = shiftTrace.takeHealth()
  if (health.frames > 0) reportHudTrace('hud.shift_health', { ...health })
}
watch(liveModel, (live) => {
  reportShiftHealth(Date.now())
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
