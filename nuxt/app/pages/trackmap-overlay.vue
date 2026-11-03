<script setup lang="ts">
import { useI18n } from '~/i18n'
import TelemetryFeatureNotice from '~/components/overlay/TelemetryFeatureNotice.vue'
import { useHudPresentationMemory } from '~/services/overlay/hudPresentationMemory'
import { hudTrackMapScene, hudSourcePolicy, usesLegacyHudInput } from '~/services/sim/hudSourceAdapter'
import { useHudValuesReport } from '~/services/overlay/hudValuesReport'
import OverlayPlacementLock from '~/components/overlay/OverlayPlacementLock.vue'
import { stableComputed } from '~/services/overlay/stableTelemetry'
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
// PIP-428 — HUD minimappa. La pagina collega soltanto le sorgenti: roster UDP
// (standings), auto locale e pit prediction (fast_state, shared memory) e
// coordinate della pista (file inclusi nel programma, via IPC). Tutta la logica
// di disegno e' in services/overlay/trackMapPresentation.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import TrackMapHud from '~/components/overlay/TrackMapHud.vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useHudOverlay } from '~/composables/useHudOverlay'
import { useStandingsState } from '~/composables/useStandingsState'
import {
  TRACK_MAP_CIRCLE_KEY,
  buildTrackMapView,
  normalizeTrackOutline,
  pointAtSpline,
  type TrackMapPoint,
} from '~/services/overlay/trackMapPresentation'
// L'UNICO punto della minimappa che conosce un simulatore: l'adattatore traduce
// il suo feed nella scena neutra che il disegno consuma. Un altro simulatore =
// un altro adattatore (e la sua cartella di mappe), nient'altro.
import { type AccStandingsCar } from '~/services/sim/acc/accTrackMapScene'

definePageMeta({ layout: 'hud-overlay' })

const BASE_SIZE = 300

const route = useRoute()
const getApi = useOverlayRegionApi()
const overlay = useHudOverlay('trackmap', getApi)
const standings = useStandingsState(getApi)
const telemetry = useFastStatePoller(getApi)
const sim = computed(() => telemetry.fastState.value.commonLive?.gameId ?? 'acc')

const outline = ref<TrackMapPoint[]>([])
const rotationDeg = ref(0)
let requestedTrack: string | null | undefined
async function loadTrackMap (track: string | null) {
  const key = JSON.stringify([sim.value, track, telemetry.fastState.value.commonLive?.identity?.variant])
  if (key === requestedTrack) return
  requestedTrack = key
  outline.value = []
  try {
    const map = await getApi()?.hudOverlayGetTrackMap?.(track, sim.value, telemetry.fastState.value.commonLive?.identity?.variant)
    // Una risposta arrivata dopo un altro cambio pista non deve sovrascrivere quella nuova.
    if (requestedTrack !== key) return
    // Rotazione e riempimento li dichiara chi fornisce i dati della mappa.
    const available = map?.status === 'available'
    rotationDeg.value = available && Number.isFinite(map.rotationDeg) ? map.rotationDeg : 0
    outline.value = normalizeTrackOutline(
      available ? map.points : null,
      undefined,
      available && map.fill > 0 ? map.fill : 1,
    )
  } catch {
    if (requestedTrack === key) outline.value = []
  }
}
// Vista a cerchio (il "Circle of Doom" di ACC Drive): stessa spline, stessi
// pallini, ma il giro e' un cerchio invece della forma della pista.
const track = computed(() => overlay.settings.value?.circleView === true
  ? TRACK_MAP_CIRCLE_KEY
  : telemetry.fastState.value.context?.track ?? null)
watch([track, sim, () => telemetry.fastState.value.commonLive?.identity?.variant], ([value]) => { void loadTrackMap(value) })

const liveView = stableComputed(() => {
  const fast = telemetry.fastState.value
  const snapshot = standings.state.value.snapshot as {
    cars?: AccStandingsCar[], freshness?: { ttl_ms?: number }, session?: { focused_car_index?: number | null }
  } | null
  const scene = hudTrackMapScene(fast, snapshot, standings.nowMs.value)
  return buildTrackMapView({
    outline: outline.value,
    scene,
    pitPrediction: fast.pitPrediction,
    showPitPrediction: overlay.settings.value?.showPitPrediction ?? true,
    showCarNumbers: overlay.settings.value?.showCarNumbers ?? true,
  })
})
const view = useHudPresentationMemory(liveView, telemetry.fastState)

// The local car's last place on the lap, and when it last jumped (a teleport, not driving: at
// 20 Hz a car moves well under 1% of a lap per frame).
const LOCAL_JUMP_SETTLE_MS = 2000
let lastLocalPosition: number | null = null
let localJumpAt = 0
watch(() => telemetry.fastState.value.normalizedCarPosition, (position) => {
  if (typeof position !== 'number') return
  if (lastLocalPosition !== null) {
    const step = Math.abs(position - lastLocalPosition) % 1
    if (Math.min(step, 1 - step) > 0.02) localJumpAt = Date.now()
  }
  lastLocalPosition = position
}, { flush: 'sync' })

// PIP-714: what the minimap draws, counted on the page, against the cars it should draw - counted
// here with the plain rule (fresh UDP row with a place on the lap, the local car also from shared
// memory), not through the scene that drew them. ACC only: other simulators use another feed.
useHudValuesReport('trackmap', telemetry.fastState, () => {
  const fast = telemetry.fastState.value
  // A loaded map with no drawing is drawn as empty, never skipped (Codex 03/11).
  if (!usesLegacyHudInput(fast.commonLive) || outline.value.length === 0) return { inputs: {}, shown: {} }
  const svg = document.querySelector('.track-map')
  const count = (selector: string) => svg?.querySelectorAll(selector).length ?? 0
  const snapshot = standings.state.value.snapshot as {
    cars?: AccStandingsCar[], freshness?: { ttl_ms?: number }, session?: { focused_car_index?: number | null }
  } | null
  const nowMs = standings.nowMs.value
  const ttl = snapshot?.freshness?.ttl_ms
  const local = fast.localDriver?.carIndex ?? null
  const onLap = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 2
  const localOnLap = fast.isLive === true && onLap(fast.normalizedCarPosition)
  const drawn = new Set<number>()
  for (const car of snapshot?.cars ?? []) {
    const updated = car.realtime_updated_at_ms
    const fresh = typeof ttl !== 'number' || !(ttl > 0)
      || (typeof updated === 'number' && nowMs - updated >= -1000 && nowMs - updated <= ttl)
    if (typeof car.car_index !== 'number' || car.has_realtime === false || !fresh) continue
    if (onLap(car.spline_position) || (car.car_index === local && localOnLap)) drawn.add(car.car_index)
  }
  if (local !== null && localOnLap) drawn.add(local)
  const focused = snapshot?.session?.focused_car_index ?? local
  const pit = overlay.settings.value?.showPitPrediction !== false && (local === null || focused === local)
    && fast.pitPrediction?.available === true && typeof fast.pitPrediction?.spline === 'number'
  const inputs: Record<string, unknown> = { mapCars: drawn.size, mapLocal: local !== null && drawn.has(local), mapPit: pit }
  const shown: Record<string, string> = {
    mapCars: String(count('.track-map__item') - count('[class*="track-map__marker--"]')),
    mapLocal: String(count('.track-map__item--local')),
    mapPit: String(count('.track-map__marker--pit')),
  }
  // Where the local dot is drawn against where shared memory puts the car (Codex 03/11: a dot frozen
  // after "back to pits" passed on counts alone). The drawing glides along the line: some slack.
  const expected = localOnLap
    ? pointAtSpline(outline.value, Number(fast.normalizedCarPosition) % 1, hudSourcePolicy(fast).interpolateMap)
    : null
  const at = (svg?.querySelector('.track-map__item--local') as SVGElement | null)?.style.transform
    .match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/)
  // Right after a jump on the lap (ESC -> back to pits: Oulton 03/11, read 0.4 s after) the dot
  // reappears in place on the next animation frame: no verdict for a moment - and no report either,
  // so the check stays due and runs as soon as the moment has passed (Codex 03/11: not a minute later).
  if (expected && at && Date.now() - localJumpAt < LOCAL_JUMP_SETTLE_MS) return null
  if (expected && at) {
    inputs.mapLocalX = expected.x
    inputs.mapLocalY = expected.y
    shown.mapLocalAt = `${Math.round(Number(at[1]))},${Math.round(Number(at[2]))}`
  }
  return { inputs, shown }
})
const displayOutline = useHudPresentationMemory(outline, telemetry.fastState)
const displayRotation = useHudPresentationMemory(rotationDeg, telemetry.fastState)
const canvasStyle = computed(() => ({
  width: `${BASE_SIZE}px`,
  height: `${BASE_SIZE}px`,
  transform: `scale(${overlay.scale.value})`,
}))

onMounted(async () => {
  overlay.start(route.query.scale)
  overlay.startInteractionSurface()
  await overlay.loadSettings()
  standings.start()
  telemetry.startFastStatePolling()
  await loadTrackMap(track.value)
  await overlay.notifyContentReady()
})
onUnmounted(() => {
  telemetry.stopFastStatePolling()
  standings.stop()
  overlay.stop()
})
const { t } = useI18n()
</script>

<template>
  <main class="overlay-root">
    <OverlayPlacementLock overlay-id="trackmap" />
    <TelemetryFeatureNotice :live="telemetry.fastState.value.commonLive" :feature="overlay.settings.value?.circleView ? 'trackReferences' : 'trackMap'" :unsupported-text="t('overlays.trackmapCircleUnsupported')" />
    <OverlaySoftwareCursor :state="overlay.pointerState" />
    <TrackMapHud :view="view" :outline="displayOutline" :rotation-deg="displayRotation" :show-start="hudSourcePolicy(telemetry.fastState.value).mapStartMarker" :interpolate-positions="hudSourcePolicy(telemetry.fastState.value).interpolateMap" class="overlay-canvas" :style="canvasStyle" />
  </main>
</template>

<style scoped>
:global(html),:global(body),:global(#__nuxt){margin:0;width:100%;height:100%;overflow:hidden;background:transparent!important}
.overlay-root{position:relative;width:100%;height:100%;overflow:hidden;background:transparent;-webkit-app-region:drag;user-select:none}
.overlay-canvas{position:absolute;left:0;top:0;transform-origin:top left;-webkit-app-region:drag}
</style>
