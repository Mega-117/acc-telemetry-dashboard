<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'
import { usePublicPath } from '~/composables/usePublicPath'
import { useSpotterVoiceSettings } from '~/composables/useSpotterVoiceSettings'
import { useVoiceLabRuntime } from '~/composables/useVoiceLabRuntime'
import { resolveLapTimeVoiceEntry } from '~/services/overlay/lapTimeAnnouncer'
import {
  filterPlayableTrackVoiceReferences,
  isLapCountIncrement,
  normalizeTrackName,
  type TrackVoiceReference,
} from '~/services/spotter/trackVoiceReferences'
import {
  advanceTrackVoiceReferenceRuntime,
  createTrackVoiceReferenceRuntimeState,
} from '~/services/spotter/trackVoiceReferenceRuntime'
import { subscribeTrackVoiceReferencesChanged } from '~/services/spotter/trackVoiceReferenceChanges'
import {
  isSpotterFeatureAllowed,
  isSpotterSessionChange,
} from '~/services/spotter/spotterSessionPolicy'

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
  referenceSessionModes,
  lapTimeSessionModes,
  load: loadSpotterVoiceSettings,
} = useSpotterVoiceSettings()
const { canEnterApp } = useFirebaseAuth()
const voiceLabRuntime = useVoiceLabRuntime()
const canRunSpotterAudio = computed(() => canEnterApp.value)

const trackVoiceReferences = ref<TrackVoiceReference[]>([])
const trackVoiceReferenceRuntimeState = ref(createTrackVoiceReferenceRuntimeState())
let audio: HTMLAudioElement | null = null
let queue = Promise.resolve()
let generation = 0
let removeTrackVoiceReferenceChangeListener = () => {}

function getRuntimeApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const { liveLap, startLiveStatePolling, stopLiveStatePolling } = useLiveStatePoller(getRuntimeApi)
const { fastState, startFastStatePolling, stopFastStatePolling } = useFastStatePoller(getRuntimeApi)
const referencesAllowedForSession = computed(() => isSpotterFeatureAllowed(
  referencesEnabled.value,
  referenceSessionModes.value,
  fastState.value.sessionType,
))
const lapTimesAllowedForSession = computed(() => isSpotterFeatureAllowed(
  lapTimeAnnouncementsEnabled.value,
  lapTimeSessionModes.value,
  fastState.value.sessionType,
))

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
  trackVoiceReferenceRuntimeState.value = createTrackVoiceReferenceRuntimeState()
}

function disarmTrackVoiceReferences() {
  resetTrackVoiceReferenceLapState()
}

function stopRuntimeAudioForLogout() {
  disarmTrackVoiceReferences()
  stopSpotterAudio()
}

function tickTrackVoiceReferences() {
  if (!canRunSpotterAudio.value || !referencesAllowedForSession.value) return
  const currentPosition = fastState.value.normalizedCarPosition
  const track = normalizeTrackName(liveLap.value.track)
  const outcome = advanceTrackVoiceReferenceRuntime(trackVoiceReferenceRuntimeState.value, {
    phase: fastState.value.trackReferencePhase,
    eligible: fastState.value.trackReferencesEligible,
    legacyLapsCompleted: liveLap.value.lapsCompleted,
    position: currentPosition,
    now: Date.now(),
    references: trackVoiceReferences.value.filter(point => normalizeTrackName(point.track) === track),
  })
  trackVoiceReferenceRuntimeState.value = outcome.state
  for (const reference of outcome.toAnnounce) {
    if (!reference.audio_path) continue
    enqueueAudioPath(reference.audio_path)
    if (import.meta.dev) console.debug('[spotter-audio-runtime] riferimento vocale', reference.label || reference.id)
  }
}

function announceLapTime() {
  if (!canRunSpotterAudio.value || !lapTimesAllowedForSession.value) return
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
  removeTrackVoiceReferenceChangeListener = subscribeTrackVoiceReferencesChanged(async () => {
    await loadTrackVoiceReferences()
    tickTrackVoiceReferences()
  })
  startLiveStatePolling()
  startFastStatePolling()
})

watch(() => liveLap.value.lapsCompleted, (newVal, oldVal) => {
  if (!canRunSpotterAudio.value) return
  // Compatibilità con logger vecchi: con la fase autorevole presente, il
  // contatore giri non governa più l'arming.
  // Tempo giro solo su un incremento reale tra campioni freschi: le
  // transizioni da/verso null sono recuperi di dato stale. Il ciclo per-giro
  // dei riferimenti NON si resetta qui: lo governa il wrap del flusso di
  // posizione (PIP-216), immune al lag tra live poller e fast poller.
  if (!isLapCountIncrement(oldVal, newVal)) return
  announceLapTime()
})

watch(() => selectedVoice.value, async () => {
  await loadTrackVoiceReferences()
  resetTrackVoiceReferenceLapState()
})

watch(referencesAllowedForSession, (enabled) => {
  if (!enabled) {
    disarmTrackVoiceReferences()
    return
  }
  tickTrackVoiceReferences()
})

watch(canRunSpotterAudio, (canRun) => {
  if (!canRun) {
    stopRuntimeAudioForLogout()
    return
  }
  resetTrackVoiceReferenceLapState()
  tickTrackVoiceReferences()
})

watch(() => fastState.value.trackReferencePhase, async (phase, previousPhase) => {
  if (phase !== 'active' || previousPhase === 'active') return
  await loadTrackVoiceReferences()
  tickTrackVoiceReferences()
})

watch(() => fastState.value.sessionType, (sessionType, previousSessionType) => {
  if (isSpotterSessionChange(previousSessionType, sessionType)) {
    // Una nuova sessione e' un nuovo ciclo di riferimenti anche quando
    // entrambe le modalita' sono abilitate e ACC passa active -> active.
    // La FIFO audio resta intatta: si azzera solo lo stato per-giro.
    resetTrackVoiceReferenceLapState()
  }
  tickTrackVoiceReferences()
})

watch(
  () => [
    fastState.value.normalizedCarPosition,
    fastState.value.trackReferencePhase,
    fastState.value.trackReferencesEligible,
    liveLap.value.track,
  ],
  () => tickTrackVoiceReferences(),
)

onBeforeUnmount(() => {
  removeTrackVoiceReferenceChangeListener()
  stopLiveStatePolling()
  stopFastStatePolling()
  stopSpotterAudio()
})
</script>

<template>
  <main
    class="spotter-audio-runtime"
    aria-hidden="true"
  ></main>
</template>

<style scoped>
.spotter-audio-runtime {
  width: 1px;
  height: 1px;
  overflow: hidden;
  background: transparent;
}
</style>
