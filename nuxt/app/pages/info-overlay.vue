<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import InfoHud from '~/components/overlay/InfoHud.vue'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import { useOverlayTelemetrySource } from '~/composables/useOverlayTelemetrySource'
import { useHudOverlay } from '~/composables/useHudOverlay'
import { useHudOverlayBackground } from '~/composables/useHudOverlayBackground'
import {
  buildInfoPresentation,
  DEFAULT_INFO_OPTIONS,
  formatInfoLocalTime,
} from '~/utils/infoPresentation'

definePageMeta({ layout: 'hud-overlay' })

const route = useRoute()
const getApi = () => typeof window === 'undefined' ? null : (window as any).electronAPI || null
const overlay = useHudOverlay('info', getApi)
const { backgroundOpacity } = useHudOverlayBackground(overlay.settings)
const telemetry = useOverlayTelemetrySource(getApi)
const canvasElement = ref<HTMLDivElement | null>(null)
const clockMs = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
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
const model = computed(() => buildInfoPresentation(telemetry.fastState.value, options.value))
const localTimeValue = computed(() => formatInfoLocalTime(clockMs.value))
const canvasStyle = computed(() => ({ transform: `scale(${overlay.scale.value})` }))

async function syncInfoViewport() {
  await nextTick()
  const canvas = canvasElement.value
  const api = getApi()
  if (!canvas || typeof api?.hudOverlaySetSize !== 'function') return
  const rect = canvas.getBoundingClientRect()
  await api.hudOverlaySetSize('info', {
    width: Math.ceil(window.innerWidth),
    height: Math.ceil(rect.height),
  })
}

watch(() => overlay.scale.value, () => { void syncInfoViewport() })
onMounted(async () => {
  overlay.start(route.query.scale)
  overlay.startInteractionSurface()
  await overlay.loadSettings()
  telemetry.startFastStatePolling()
  timer = setInterval(() => { clockMs.value = Date.now() }, 1000)
  if (typeof ResizeObserver === 'function' && canvasElement.value) {
    resizeObserver = new ResizeObserver(() => { void syncInfoViewport() })
    resizeObserver.observe(canvasElement.value)
  }
  await syncInfoViewport()
})

onUnmounted(() => {
  telemetry.stopFastStatePolling()
  overlay.stop()
  resizeObserver?.disconnect()
  if (timer) clearInterval(timer)
})
</script>

<template>
  <main class="overlay-root">
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
