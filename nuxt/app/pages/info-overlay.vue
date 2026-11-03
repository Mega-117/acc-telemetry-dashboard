<script setup lang="ts">
import { useHudShownReport } from '~/services/overlay/hudShownReport'
import { useHudValuesReport } from '~/services/overlay/hudValuesReport'
import TelemetryFeatureNotice from '~/components/overlay/TelemetryFeatureNotice.vue'
import { useHudPresentationMemory } from '~/services/overlay/hudPresentationMemory'
import OverlayPlacementLock from '~/components/overlay/OverlayPlacementLock.vue'
import { usePresentationInterval } from '~/composables/usePresentationVisibility'
import { stableComputed } from '~/services/overlay/stableTelemetry'
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { createValueEpisodeCounter } from '~/services/overlay/valueEpisodes'
import { reportHudTrace } from '~/services/overlay/hudTrace'
import InfoHud from '~/components/overlay/InfoHud.vue'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import { useOverlayTelemetrySource } from '~/composables/useOverlayTelemetrySource'
import { useHudOverlay } from '~/composables/useHudOverlay'
import { rosterLapMs, useSpectatorCheck } from '~/services/overlay/spectatorTruth'
import { useHudOverlayBackground } from '~/composables/useHudOverlayBackground'
import {
  buildInfoPresentation,
  DEFAULT_INFO_OPTIONS,
  formatInfoLocalTime,
} from '~/utils/infoPresentation'

definePageMeta({ layout: 'hud-overlay' })

const route = useRoute()
const getApi = useOverlayRegionApi()
const overlay = useHudOverlay('info', getApi)
const { backgroundOpacity } = useHudOverlayBackground(overlay.settings)
const telemetry = useOverlayTelemetrySource(getApi)
// PIP-710: which lap this window shows and for how long it held retained data (hud.shown).
useHudShownReport('info', telemetry.fastState)
const canvasElement = ref<HTMLDivElement | null>(null)
const clockMs = ref(Date.now())
const clockActivity = usePresentationInterval(() => { clockMs.value = Date.now() }, 1000)
let resizeObserver: ResizeObserver | null = null

const options = computed(() => ({
  showYellowFlag: overlay.settings.value?.showYellowFlag ?? DEFAULT_INFO_OPTIONS.showYellowFlag,
  showDelta: overlay.settings.value?.showDelta ?? DEFAULT_INFO_OPTIONS.showDelta,
  showStint: overlay.settings.value?.showStint ?? DEFAULT_INFO_OPTIONS.showStint,
  showQFuel: overlay.settings.value?.showQFuel ?? DEFAULT_INFO_OPTIONS.showQFuel,
  showFuelLeft: overlay.settings.value?.showFuelLeft ?? DEFAULT_INFO_OPTIONS.showFuelLeft,
  showIncidents: overlay.settings.value?.showIncidents ?? DEFAULT_INFO_OPTIONS.showIncidents,
  showGrip: overlay.settings.value?.showGrip ?? DEFAULT_INFO_OPTIONS.showGrip,
  showPitExitTraffic: overlay.settings.value?.showPitExitTraffic ?? DEFAULT_INFO_OPTIONS.showPitExitTraffic,
  showOptimal: overlay.settings.value?.showOptimal ?? DEFAULT_INFO_OPTIONS.showOptimal,
  showBest: overlay.settings.value?.showBest ?? DEFAULT_INFO_OPTIONS.showBest,
  showDamage: overlay.settings.value?.showDamage ?? DEFAULT_INFO_OPTIONS.showDamage,
  showTime: overlay.settings.value?.showTime ?? DEFAULT_INFO_OPTIONS.showTime,
}))
const liveModel = stableComputed(() => buildInfoPresentation(telemetry.fastState.value, options.value))
const model = useHudPresentationMemory(liveModel, telemetry.fastState)
// PIP-711: the numbers this window drew from and the texts it shows, compared in main (hud.check 'values').
// Rows the driver turned off are not on screen, so they are not sent.
// PIP-713: the standings roster, the truth for the view on another car.
const spectator = useSpectatorCheck(getApi, telemetry)
useHudValuesReport('info', telemetry.fastState, () => {
  const info = telemetry.fastState.value.info
  const own = spectator.readOwn(telemetry.fastState.value.localDriver?.carIndex)
  const shown: Record<string, string> = { ...own?.shown }
  if (model.value.delta.visible) shown.delta = model.value.delta.value
  for (const row of model.value.rows) {
    if (['best', 'optimal', 'incidents', 'stint', 'fuel-left'].includes(row.id)) shown[row.id] = row.value
  }
  return {
    inputs: { deltaMs: info?.delta.ms ?? null, deltaAvailable: info?.delta.available ?? null,
      deltaAbsent: info?.delta.absent ?? false, bestLapMs: info?.bestLapTimeMs ?? null,
      optimalLapMs: info?.optimalLapTimeMs ?? null, incidents: info?.incidents ?? null,
      stintMs: info?.stintTimeLeftMs ?? info?.stintTimeElapsedMs ?? null, fuelLeftMs: info?.fuelLeftTimeMs ?? null,
      ...own?.inputs },
    shown,
  }
}, () => {
  // PIP-713: on another car Info draws its best lap from the focused-car feed; the truth is the
  // standings roster, compared when both carry the same UDP packet (services/overlay/spectatorTruth).
  // Not the stint: the logger refreshes it on session packets, apart from the car's (Codex 03/11).
  const reading = spectator.read()
  if (!reading) return null
  const { car, samePacket, inputs, shown } = reading
  const best = model.value.rows.find(row => row.id === 'best')
  if (car && samePacket && best) {
    inputs.bestLapMs = rosterLapMs(car.best_lap?.time_ms, car.best_lap_ms)
    shown.best = best.value
  }
  return { inputs, shown }
}, spectator.roster.state)
const localTimeValue = computed(() => formatInfoLocalTime(clockMs.value))

// PIP-704: the delta on screen dropping out for a moment while driving (own car, on track,
// away from the line where a reset is expected).
const deltaEpisodes = createValueEpisodeCounter(
  summary => reportHudTrace('hud.value_episode', { hud: 'info', field: 'delta', ...summary }), Date.now())
watch(model, (shown) => {
  const state = telemetry.fastState.value
  const lapMs = state.info?.currentLapTimeMs ?? null
  const watching = shown.delta.visible && state.dataSource !== 'focused' && state.isFresh && state.isLive
    && !state.isInPitLane && typeof state.speedKmh === 'number' && state.speedKmh > 30
    && typeof lapMs === 'number' && lapMs > 3_000
  // A real zero crossing (+0.001 -> +0.000 -> -0.001) is not a drop-out (Codex 02/11): blank
  // only when the delta on screen is a placeholder because the data behind it is missing.
  const placeholder = shown.delta.value === '+0.000' || shown.delta.value === '—'
  deltaEpisodes.feed({ now: Date.now(), blank: placeholder && state.info?.delta.available !== true, watch: watching })
})
// The canvas scales by transform; --hud-scale lets InfoHud keep pixel floors on the RENDERED text size.
// --hud-frame-unit keeps the panel frames whole screen pixels under the scale (hud-cut-corner).
const canvasStyle = computed(() => ({ 'transform': `scale(${overlay.scale.value})`, '--hud-scale': String(overlay.scale.value), '--hud-frame-unit': `${1 / overlay.scale.value}px` }))

async function syncInfoViewport() {
  await nextTick()
  const canvas = canvasElement.value
  const api = getApi()
  if (!canvas || typeof api?.hudOverlaySetSize !== 'function') return
  const rect = canvas.getBoundingClientRect()
  await api.hudOverlaySetSize('info', {
    width: Math.ceil(api.overlayRegionId ? canvas.parentElement?.clientWidth || rect.width : window.innerWidth),
    height: Math.ceil(rect.height),
  })
}

watch(() => overlay.scale.value, () => { void syncInfoViewport() })
onMounted(async () => {
  overlay.start(route.query.scale)
  overlay.startInteractionSurface()
  await overlay.loadSettings()
  telemetry.startFastStatePolling()
  clockActivity.start()
  if (typeof ResizeObserver === 'function' && canvasElement.value) {
    resizeObserver = new ResizeObserver(() => { void syncInfoViewport() })
    resizeObserver.observe(canvasElement.value)
  }
  await syncInfoViewport()
  await overlay.notifyContentReady()
})

onUnmounted(() => {
  deltaEpisodes.final(Date.now())
  telemetry.stopFastStatePolling()
  overlay.stop()
  resizeObserver?.disconnect()
  clockActivity.stop()
})
</script>

<template>
  <main class="overlay-root">
    <OverlayPlacementLock overlay-id="info" />
    <TelemetryFeatureNotice :live="telemetry.fastState.value.commonLive" feature="lapTiming" />
    <OverlaySoftwareCursor :state="overlay.pointerState" />
    <div
      ref="canvasElement"
      class="overlay-canvas"
      :style="canvasStyle"
    >
      <InfoHud
        :model="model"
        :local-time-value="localTimeValue"
        :background-opacity="backgroundOpacity"
      />
    </div>
  </main>
</template>

<style scoped>
:global(html),:global(body),:global(#__nuxt){margin:0;width:100%;height:100%;overflow:hidden;background:transparent!important}
.overlay-root{position:relative;width:100%;height:100%;overflow:hidden;background:transparent;-webkit-app-region:drag;user-select:none}
.overlay-canvas{position:absolute;left:0;top:0;transform-origin:top left;-webkit-app-region:drag}
</style>
