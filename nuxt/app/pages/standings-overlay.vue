<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted } from 'vue'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import StandingsHud from '~/components/overlay/StandingsHud.vue'
import { useHudOverlay } from '~/composables/useHudOverlay'
import type { HudOverlayBridge, HudOverlaySettings } from '~/composables/useHudOverlay'
import { useHudOverlayBackground } from '~/composables/useHudOverlayBackground'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useStandingsHighlights } from '~/composables/useStandingsHighlights'
import { useStandingsState } from '~/composables/useStandingsState'
import { usePublicPath } from '~/composables/usePublicPath'
import { buildStandingsPresentation, DEFAULT_STANDINGS_OPTIONS } from '~/services/overlay/standingsPresentation'

definePageMeta({ layout: 'hud-overlay' })

const route = useRoute()
function parseStandingsBootstrap(value: unknown): Record<string, unknown> | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  }
  catch {
    return null
  }
}
const standingsBootstrap = parseStandingsBootstrap(route.query.standingsBootstrap)
const getApi = (): HudOverlayBridge | null => typeof window === 'undefined'
  ? null
  : (window as Window & { electronAPI?: HudOverlayBridge }).electronAPI ?? null
const overlay = useHudOverlay('standings', getApi)
const standings = useStandingsState(getApi)
const fastState = useFastStatePoller(getApi)
const standingsHighlights = useStandingsHighlights(standings.state, standings.nowMs)
const { backgroundOpacity } = useHudOverlayBackground(overlay.settings, 'standings')
const { getPublicPath } = usePublicPath()
function setting<K extends keyof HudOverlaySettings>(key: K): HudOverlaySettings[K] | undefined {
  const live = overlay.settings.value?.[key]
  if (live !== undefined) return live
  return standingsBootstrap?.[key] as HudOverlaySettings[K] | undefined
}
const options = computed(() => ({
  topCars: setting('topCars') ?? DEFAULT_STANDINGS_OPTIONS.topCars,
  carsAhead: setting('carsAhead') ?? DEFAULT_STANDINGS_OPTIONS.carsAhead,
  carsBehind: setting('carsBehind') ?? DEFAULT_STANDINGS_OPTIONS.carsBehind,
  showCarNumber: setting('showCarNumber') ?? DEFAULT_STANDINGS_OPTIONS.showCarNumber,
  showFastestLap: setting('showFastestLap') ?? DEFAULT_STANDINGS_OPTIONS.showFastestLap,
  showLastLap: setting('showLastLap') ?? DEFAULT_STANDINGS_OPTIONS.showLastLap,
  showLapProgressBar: setting('showLapProgressBar') ?? DEFAULT_STANDINGS_OPTIONS.showLapProgressBar,
  standingsLayout: setting('standingsLayout') ?? null,
}))
const localDriver = computed(() => {
  const state = fastState.fastState.value
  if (!state.localDriver) return null
  return {
    ...state.localDriver,
    isFresh: state.isFresh,
    isLive: state.isLive,
  }
})
const model = computed(() => buildStandingsPresentation(
  standings.state.value,
  options.value,
  standings.nowMs.value,
  standingsHighlights.highlights.value,
  localDriver.value,
  getPublicPath,
))
const canvasStyle = computed(() => ({
  width: `${model.value.layout.width}px`,
  height: `${model.value.layout.height}px`,
  transform: `scale(${overlay.scale.value})`,
}))

onMounted(async () => {
  overlay.start(route.query.scale)
  const firstFastState = fastState.startFastStatePolling()
  overlay.startInteractionSurface()
  await overlay.loadSettings()
  standings.start()
  await firstFastState
  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  await getApi()?.hudOverlayContentReady?.('standings')
})
onUnmounted(() => {
  standingsHighlights.stop()
  standings.stop()
  fastState.stopFastStatePolling()
  overlay.stop()
})
</script>

<template>
  <main class="overlay-root">
    <OverlaySoftwareCursor :state="overlay.pointerState" />
    <div
      class="overlay-canvas"
      :style="canvasStyle"
    >
      <StandingsHud
        :model="model"
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
