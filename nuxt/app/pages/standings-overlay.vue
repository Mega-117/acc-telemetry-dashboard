<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import StandingsHud from '~/components/overlay/StandingsHud.vue'
import { useHudOverlay } from '~/composables/useHudOverlay'
import { useHudOverlayBackground } from '~/composables/useHudOverlayBackground'
import { useStandingsHighlights } from '~/composables/useStandingsHighlights'
import { useStandingsState } from '~/composables/useStandingsState'
import { buildStandingsPresentation, DEFAULT_STANDINGS_OPTIONS } from '~/services/overlay/standingsPresentation'

definePageMeta({ layout: 'hud-overlay' })

const route = useRoute()
const getApi = () => typeof window === 'undefined' ? null : (window as any).electronAPI || null
const overlay = useHudOverlay('standings', getApi)
const standings = useStandingsState(getApi)
const standingsHighlights = useStandingsHighlights(standings.state, standings.nowMs)
const { backgroundOpacity } = useHudOverlayBackground(overlay.settings, 'standings')
const options = computed(() => ({ topCars:overlay.settings.value?.topCars ?? DEFAULT_STANDINGS_OPTIONS.topCars,carsAhead:overlay.settings.value?.carsAhead ?? DEFAULT_STANDINGS_OPTIONS.carsAhead,carsBehind:overlay.settings.value?.carsBehind ?? DEFAULT_STANDINGS_OPTIONS.carsBehind,showCarNumber:overlay.settings.value?.showCarNumber ?? DEFAULT_STANDINGS_OPTIONS.showCarNumber,showFastestLap:overlay.settings.value?.showFastestLap ?? DEFAULT_STANDINGS_OPTIONS.showFastestLap,showLastLap:overlay.settings.value?.showLastLap ?? DEFAULT_STANDINGS_OPTIONS.showLastLap,showLapProgressBar:overlay.settings.value?.showLapProgressBar ?? DEFAULT_STANDINGS_OPTIONS.showLapProgressBar }))
const model = computed(() => buildStandingsPresentation(standings.state.value, options.value, standings.nowMs.value, standingsHighlights.highlights.value))
const canvasStyle = computed(() => ({ transform: `scale(${overlay.scale.value})` }))

onMounted(async () => {
  overlay.start(route.query.scale)
  overlay.startInteractionSurface()
  await overlay.loadSettings()
  standings.start()
})
onUnmounted(() => {
  standingsHighlights.stop()
  standings.stop()
  overlay.stop()
})
</script>

<template><main class="overlay-root"><OverlaySoftwareCursor :state="overlay.pointerState" /><div class="overlay-canvas" :style="canvasStyle"><StandingsHud :model="model" :background-opacity="backgroundOpacity" /></div></main></template>
<style scoped>
:global(html),:global(body),:global(#__nuxt){margin:0;width:100%;height:100%;overflow:hidden;background:transparent!important}
.overlay-root{position:relative;width:100%;height:100%;overflow:hidden;background:transparent;-webkit-app-region:drag;user-select:none}
.overlay-canvas{position:absolute;left:0;top:0;width:900px;height:600px;transform-origin:top left;-webkit-app-region:drag}
</style>
