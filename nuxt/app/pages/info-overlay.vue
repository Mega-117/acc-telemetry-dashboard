<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import InfoHud from '~/components/overlay/InfoHud.vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useHudOverlay } from '~/composables/useHudOverlay'
import { useHudOverlayBackground } from '~/composables/useHudOverlayBackground'
import {
  buildInfoPresentation,
  DEFAULT_INFO_OPTIONS,
  evaluateInfoTarget,
  formatInfoLapTime,
  formatInfoLocalTime,
  formatInfoRunningLapTime,
  type InfoTargetOutcome,
  type InfoTargetSettings,
} from '~/utils/infoPresentation'

definePageMeta({ layout: 'hud-overlay' })

const route = useRoute()
const getApi = () => typeof window === 'undefined' ? null : (window as any).electronAPI || null
const overlay = useHudOverlay('info', getApi)
const { backgroundOpacity } = useHudOverlayBackground(overlay.settings)
const telemetry = useFastStatePoller(getApi)
const target = ref<InfoTargetSettings | null>(null)
const clockMs = ref(Date.now())
const heldLap = ref<{ timeMs: number, outcome: InfoTargetOutcome, startedAtMs: number } | null>(null)
let previousLapsCompleted: number | null = null
let timer: ReturnType<typeof setInterval> | null = null
let removeTargetListener: (() => void) | null = null

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
const heldAgeMs = computed(() => heldLap.value ? clockMs.value - heldLap.value.startedAtMs : Infinity)
const isHoldingLap = computed(() => heldAgeMs.value < 3500)
const isFading = computed(() => heldAgeMs.value >= 3000 && heldAgeMs.value < 3500)
const lapTimerOutcome = computed<InfoTargetOutcome>(() =>
  heldLap.value && heldAgeMs.value < 3000 ? heldLap.value.outcome : 'neutral',
)
const lapTimerValue = computed(() => {
  if (heldLap.value && isHoldingLap.value) return formatInfoLapTime(heldLap.value.timeMs)
  return formatInfoRunningLapTime(telemetry.fastState.value.info?.currentLapTimeMs)
})
const localTimeValue = computed(() => formatInfoLocalTime(clockMs.value))
const canvasStyle = computed(() => ({ transform: `scale(${overlay.scale.value})` }))
watch(
  () => telemetry.fastState.value.info,
  (info) => {
    if (!info) return
    if (previousLapsCompleted === null) {
      previousLapsCompleted = info.lapsCompleted
      return
    }
    if (info.lapsCompleted > previousLapsCompleted && info.lastLapTimeMs) {
      heldLap.value = {
        timeMs: info.lastLapTimeMs,
        outcome: evaluateInfoTarget(info.lastLapTimeMs, info.lastLapValid === true, target.value),
        startedAtMs: Date.now(),
      }
    }
    previousLapsCompleted = info.lapsCompleted
  },
  { deep: true },
)

onMounted(async () => {
  overlay.start(route.query.scale)
  await overlay.loadSettings()
  telemetry.startFastStatePolling()
  const api = getApi()
  target.value = await api?.infoTargetGetSettings?.() || null
  if (typeof api?.onInfoTargetSettings === 'function') {
    removeTargetListener = api.onInfoTargetSettings((settings: InfoTargetSettings) => {
      target.value = settings
    })
  }
  timer = setInterval(() => { clockMs.value = Date.now() }, 50)
})

onUnmounted(() => {
  telemetry.stopFastStatePolling()
  overlay.stop()
  removeTargetListener?.()
  if (timer) clearInterval(timer)
})
</script>

<template>
  <main class="overlay-root">
    <InfoHud
      :model="model"
      :local-time-value="localTimeValue"
      :lap-timer-value="lapTimerValue"
      :lap-timer-outcome="lapTimerOutcome"
      :lap-timer-fading="isFading"
      :background-opacity="backgroundOpacity"
      class="overlay-canvas"
      :style="canvasStyle"
    />
  </main>
</template>

<style scoped>
:global(html),:global(body),:global(#__nuxt){margin:0;width:100%;height:100%;overflow:hidden;background:transparent!important}
.overlay-root{position:relative;width:100%;height:100%;overflow:hidden;background:transparent;-webkit-app-region:drag;user-select:none}
.overlay-canvas{position:absolute;left:0;top:0;transform-origin:top left;-webkit-app-region:drag}
</style>
