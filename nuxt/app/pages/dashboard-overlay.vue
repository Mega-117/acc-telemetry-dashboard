<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import DashboardHud from '~/components/overlay/DashboardHud.vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useHudOverlay } from '~/composables/useHudOverlay'
import {
  buildDashboardPresentation,
  DEFAULT_DASHBOARD_OPTIONS,
  normalizeFuelCriticalLapsThreshold,
  normalizeShiftRpmThreshold,
} from '~/utils/dashboardPresentation'

definePageMeta({ layout: false })

const route = useRoute()
const getApi = () => typeof window === 'undefined' ? null : (window as any).electronAPI || null
const overlay = useHudOverlay('dashboard', getApi)
const telemetry = useFastStatePoller(getApi)
const options = computed(() => ({
  electronicsReference: overlay.settings.value?.electronicsReference ?? DEFAULT_DASHBOARD_OPTIONS.electronicsReference,
  rpmReference: overlay.settings.value?.rpmReference ?? DEFAULT_DASHBOARD_OPTIONS.rpmReference,
  gearReference: overlay.settings.value?.gearReference ?? DEFAULT_DASHBOARD_OPTIONS.gearReference,
  speedDelta: overlay.settings.value?.speedDelta ?? DEFAULT_DASHBOARD_OPTIONS.speedDelta,
  shiftFlashEnabled: overlay.settings.value?.shiftFlashEnabled ?? DEFAULT_DASHBOARD_OPTIONS.shiftFlashEnabled,
  shiftRpmThreshold: normalizeShiftRpmThreshold(overlay.settings.value?.shiftRpmThreshold),
  fuelCriticalFlashEnabled: overlay.settings.value?.fuelCriticalFlashEnabled
    ?? DEFAULT_DASHBOARD_OPTIONS.fuelCriticalFlashEnabled,
  fuelCriticalLapsThreshold: normalizeFuelCriticalLapsThreshold(
    overlay.settings.value?.fuelCriticalLapsThreshold,
  ),
}))
const model = computed(() => buildDashboardPresentation(telemetry.fastState.value, options.value))
const canvasStyle = computed(() => ({ transform: `scale(${overlay.scale.value})` }))

onMounted(async () => {
  overlay.start(route.query.scale)
  await overlay.loadSettings()
  telemetry.startFastStatePolling()
})
onUnmounted(() => {
  telemetry.stopFastStatePolling()
  overlay.stop()
})
</script>

<template>
  <main class="overlay-root">
    <DashboardHud :model="model" class="overlay-canvas" :style="canvasStyle" />
  </main>
</template>

<style scoped>
:global(html),:global(body),:global(#__nuxt){margin:0;width:100%;height:100%;overflow:hidden;background:transparent!important}
.overlay-root{position:relative;width:100%;height:100%;overflow:hidden;background:transparent;-webkit-app-region:drag;user-select:none}
.overlay-canvas{position:absolute;left:0;top:0;transform-origin:top left;-webkit-app-region:drag}
</style>
