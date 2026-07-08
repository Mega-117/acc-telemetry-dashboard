<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'
import { usePublicPath } from '~/composables/usePublicPath'
import { useSpotterVoiceSettings } from '~/composables/useSpotterVoiceSettings'
import { resolveLapTimeVoiceEntry } from '~/services/overlay/lapTimeAnnouncer'
import {
  crossedReferencePoint,
  effectiveReferencePosition,
  filterPlayableTrackVoiceReferences,
  isLapCountIncrement,
  normalizedSpeedPerSecond,
  normalizeTrackName,
  shouldArmTrackVoiceReferences,
  type TrackVoiceReference,
} from '~/services/spotter/trackVoiceReferences'

definePageMeta({ layout: false })

useHead({
  htmlAttrs: { class: 'spotter-audio-runtime-document' },
  bodyAttrs: { class: 'spotter-audio-runtime-body' },
})

const { getPublicPath } = usePublicPath()
const {
  selectedVoice,
  referencesEnabled,
  coachEnabled: lapTimeAnnouncementsEnabled,
  load: loadSpotterVoiceSettings,
} = useSpotterVoiceSettings()
const { canEnterApp } = useFirebaseAuth()
const voiceLabRuntime = useVoiceLabRuntime()
const canRunSpotterAudio = computed(() => canEnterApp.value)

const trackVoiceReferences = ref<TrackVoiceReference[]>([])
const trackVoiceReferencesArmed = ref(false)
const playedTrackVoiceReferenceIds = ref<Set<string>>(new Set())
let previousVoiceReferencePosition: number | null = null
let previousVoiceReferenceTs: number | null = null
let audio: HTMLAudioElement | null = null
let queue = Promise.resolve()
let generation = 0

function getRuntimeApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const { liveLap, startLiveStatePolling, stopLiveStatePolling } = useLiveStatePoller(getRuntimeApi)
const { fastState, startFastStatePolling, stopFastStatePolling } = useFastStatePoller(getRuntimeApi)

function playAudioPath(path: string, gen: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!path || gen !== generation || !canRunSpotterAudio.value) { resolve(); return }
    const el = new Audio(getPublicPath(path))
    audio = el
    el.onended = () => { if (audio === el) audio = null; resolve() }
    el.onerror = () => { if (audio === el) audio = null; resolve() }
    void el.play().catch(() => { if (audio === el) audio = null; resolve() })
  })
}

function enqueueAudioPath(path: string) {
  if (!path || !canRunSpotterAudio.value) return
  const gen = generation
  queue = queue.then(() => playAudioPath(path, gen))
}

function stopSpotterAudio() {
  generation += 1
  if (audio) {
    audio.pause()
    audio.currentTime = 0
    audio = null
  }
  queue = Promise.resolve()
}

async function loadTrackVoiceReferences() {
  try {
    const data = await voiceLabRuntime.readVoicePoints<{ points: TrackVoiceReference[] }>()
    trackVoiceReferences.value = filterPlayableTrackVoiceReferences(
      Array.isArray(data.points) ? data.points : [],
      selectedVoice.value,
    )
  } catch (error) {
    trackVoiceReferences.value = []
    if (import.meta.dev) console.warn('[spotter-audio-runtime] riferimenti non caricati', error)
  }
}

function resetTrackVoiceReferenceLapState() {
  playedTrackVoiceReferenceIds.value = new Set()
  previousVoiceReferencePosition = fastState.value.normalizedCarPosition
  previousVoiceReferenceTs = Date.now()
}

// PIP-220: arming level-triggered — arma appena lapsCompleted >= 1, senza
// dipendere dall'edge (che live_state puo' non esporre mai come 0 -> 1).
function evaluateTrackVoiceReferencesArming() {
  if (trackVoiceReferencesArmed.value) return
  if (!canRunSpotterAudio.value || !referencesEnabled.value) return
  if (!shouldArmTrackVoiceReferences(liveLap.value.lapsCompleted)) return
  trackVoiceReferencesArmed.value = true
  resetTrackVoiceReferenceLapState()
}

function disarmTrackVoiceReferences() {
  trackVoiceReferencesArmed.value = false
  playedTrackVoiceReferenceIds.value = new Set()
  previousVoiceReferencePosition = null
  previousVoiceReferenceTs = null
}

function stopRuntimeAudioForLogout() {
  disarmTrackVoiceReferences()
  stopSpotterAudio()
}

function tickTrackVoiceReferences() {
  if (!canRunSpotterAudio.value || !referencesEnabled.value || !trackVoiceReferencesArmed.value) return
  const currentPosition = fastState.value.normalizedCarPosition
  const track = normalizeTrackName(liveLap.value.track)
  if (currentPosition === null || !track) return

  const now = Date.now()
  const previous = previousVoiceReferencePosition
  const previousTs = previousVoiceReferenceTs
  previousVoiceReferencePosition = currentPosition
  previousVoiceReferenceTs = now
  if (previous === null || previousTs === null) return

  const speedPerSecond = normalizedSpeedPerSecond(previous, currentPosition, now - previousTs)

  const alreadyPlayed = playedTrackVoiceReferenceIds.value
  const nextReference = trackVoiceReferences.value.find(point =>
    normalizeTrackName(point.track) === track &&
    !alreadyPlayed.has(point.id) &&
    crossedReferencePoint(previous, currentPosition, effectiveReferencePosition(point, speedPerSecond))
  )
  if (!nextReference?.audio_path) return

  playedTrackVoiceReferenceIds.value = new Set([...alreadyPlayed, nextReference.id])
  enqueueAudioPath(nextReference.audio_path)
  if (import.meta.dev) console.debug('[spotter-audio-runtime] riferimento vocale', nextReference.label || nextReference.id)
}

function announceLapTime() {
  if (!canRunSpotterAudio.value || !lapTimeAnnouncementsEnabled.value) return
  const audioEntry = resolveLapTimeVoiceEntry(
    liveLap.value.lastLapTimeMs,
    liveLap.value.lapValid ?? true,
    selectedVoice.value,
  )
  if (!audioEntry) return
  enqueueAudioPath(audioEntry.path)
}

onMounted(async () => {
  loadSpotterVoiceSettings()
  await loadTrackVoiceReferences()
  startLiveStatePolling()
  startFastStatePolling()
})

watch(() => liveLap.value.lapsCompleted, (newVal, oldVal) => {
  if (!canRunSpotterAudio.value) return
  evaluateTrackVoiceReferencesArming()
  // Reset per-giro e tempo giro solo su un incremento reale tra campioni
  // freschi: le transizioni da/verso null sono recuperi di dato stale.
  if (!isLapCountIncrement(oldVal, newVal)) return
  resetTrackVoiceReferenceLapState()
  announceLapTime()
})

watch(() => selectedVoice.value, async () => {
  await loadTrackVoiceReferences()
  resetTrackVoiceReferenceLapState()
})

watch(() => referencesEnabled.value, (enabled) => {
  if (!enabled) {
    disarmTrackVoiceReferences()
    return
  }
  evaluateTrackVoiceReferencesArming()
})

watch(canRunSpotterAudio, (canRun) => {
  if (!canRun) {
    stopRuntimeAudioForLogout()
    return
  }
  resetTrackVoiceReferenceLapState()
  evaluateTrackVoiceReferencesArming()
})

watch(() => [fastState.value.normalizedCarPosition, liveLap.value.track], () => tickTrackVoiceReferences())

onBeforeUnmount(() => {
  stopLiveStatePolling()
  stopFastStatePolling()
  stopSpotterAudio()
})
</script>

<template>
  <main class="spotter-audio-runtime" aria-hidden="true" />
</template>

<style scoped>
.spotter-audio-runtime {
  width: 1px;
  height: 1px;
  overflow: hidden;
  background: transparent;
}
</style>
