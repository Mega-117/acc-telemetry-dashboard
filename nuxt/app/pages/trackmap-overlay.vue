<script setup lang="ts">
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
  type TrackMapPoint,
} from '~/services/overlay/trackMapPresentation'
// L'UNICO punto della minimappa che conosce un simulatore: l'adattatore traduce
// il suo feed nella scena neutra che il disegno consuma. Un altro simulatore =
// un altro adattatore (e la sua cartella di mappe), nient'altro.
import { buildAccTrackMapScene, type AccStandingsCar } from '~/services/sim/acc/accTrackMapScene'

definePageMeta({ layout: 'hud-overlay' })

const BASE_SIZE = 300
const SIM = 'acc'

const route = useRoute()
const getApi = useOverlayRegionApi()
const overlay = useHudOverlay('trackmap', getApi)
const standings = useStandingsState(getApi)
const telemetry = useFastStatePoller(getApi)

const outline = ref<TrackMapPoint[]>([])
const rotationDeg = ref(0)
let requestedTrack: string | null | undefined
async function loadTrackMap (track: string | null) {
  if (track === requestedTrack) return
  requestedTrack = track
  try {
    const map = await getApi()?.hudOverlayGetTrackMap?.(track, SIM)
    // Una risposta arrivata dopo un altro cambio pista non deve sovrascrivere quella nuova.
    if (requestedTrack !== track) return
    // Rotazione e riempimento li dichiara chi fornisce i dati della mappa.
    const available = map?.status === 'available'
    rotationDeg.value = available && Number.isFinite(map.rotationDeg) ? map.rotationDeg : 0
    outline.value = normalizeTrackOutline(
      available ? map.points : null,
      undefined,
      available && map.fill > 0 ? map.fill : 1,
    )
  } catch {
    if (requestedTrack === track) outline.value = []
  }
}
// Vista a cerchio (il "Circle of Doom" di ACC Drive): stessa spline, stessi
// pallini, ma il giro e' un cerchio invece della forma della pista.
const track = computed(() => overlay.settings.value?.circleView === true
  ? TRACK_MAP_CIRCLE_KEY
  : telemetry.fastState.value.context?.track ?? null)
watch(track, value => { void loadTrackMap(value) })

const view = stableComputed(() => {
  const fast = telemetry.fastState.value
  const snapshot = standings.state.value.snapshot as {
    cars?: AccStandingsCar[], freshness?: { ttl_ms?: number }, session?: { focused_car_index?: number | null }
  } | null
  const scene = buildAccTrackMapScene({
    cars: snapshot?.cars ?? [],
    focusedCarIndex: snapshot?.session?.focused_car_index ?? null,
    localCarIndex: fast.localDriver?.carIndex ?? null,
    localLapPosition: fast.isLive ? fast.normalizedCarPosition : null,
    sessionType: fast.sessionType,
    // Chi ha lasciato il server resta in lista ma smette di aggiornarsi: non si disegna.
    nowMs: standings.nowMs.value,
    ttlMs: snapshot?.freshness?.ttl_ms ?? null,
  })
  return buildTrackMapView({
    outline: outline.value,
    scene,
    pitPrediction: fast.pitPrediction,
    showPitPrediction: overlay.settings.value?.showPitPrediction ?? true,
    showCarNumbers: overlay.settings.value?.showCarNumbers ?? true,
  })
})
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
</script>

<template>
  <main class="overlay-root">
    <OverlaySoftwareCursor :state="overlay.pointerState" />
    <TrackMapHud :view="view" :outline="outline" :rotation-deg="rotationDeg" class="overlay-canvas" :style="canvasStyle" />
  </main>
</template>

<style scoped>
:global(html),:global(body),:global(#__nuxt){margin:0;width:100%;height:100%;overflow:hidden;background:transparent!important}
.overlay-root{position:relative;width:100%;height:100%;overflow:hidden;background:transparent;-webkit-app-region:drag;user-select:none}
.overlay-canvas{position:absolute;left:0;top:0;transform-origin:top left;-webkit-app-region:drag}
</style>
