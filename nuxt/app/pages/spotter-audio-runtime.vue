<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'
import { usePublicPath } from '~/composables/usePublicPath'
import { useSpotterVoiceSettings } from '~/composables/useSpotterVoiceSettings'
import { useVoiceLabRuntime } from '~/composables/useVoiceLabRuntime'
import { resolveLocalRuntimeCapability } from '~/services/auth/localIdentityBridge'
import { resolveLapTimeVoiceEntry } from '~/services/overlay/lapTimeAnnouncer'
import {
  createVoicePlaybackQueue,
  type VoiceCue,
  type VoiceCueSource,
} from '~/services/audio/voicePlaybackQueue'
import { createVoiceRuntimeDiagnostics } from '~/services/monitoring/voiceRuntimeDiagnostics'
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
import {
  advancePostCorner,
  advancePreCorner,
  createPostCornerState,
  createPreCornerState,
  resolveCoachOverride,
  resolveCoachOverrides,
} from '~/services/spotter/coachVoiceController'
import { useCoachStatePoller } from '~/composables/useCoachStatePoller'
import { createPressureRecommendationVoiceRuntime } from '~/services/spotter/pressureRecommendationVoiceRuntime'

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
  adaptiveCoachEnabled,
  adaptiveCoachSessionModes,
  adaptiveCoachMode,
  load: loadSpotterVoiceSettings,
} = useSpotterVoiceSettings()
const { canEnterApp, isSecondaryLocalRuntime, isLocalRuntimeAttested } = useFirebaseAuth()
const canRunSpotterAudio = computed(() => resolveLocalRuntimeCapability({
  isSecondaryLocalRuntime: isSecondaryLocalRuntime.value,
  isLocalRuntimeAttested: isLocalRuntimeAttested.value,
  canEnterApp: canEnterApp.value,
}))
const voiceLabRuntime = useVoiceLabRuntime()

const trackVoiceReferences = ref<TrackVoiceReference[]>([])
const trackVoiceReferenceRuntimeState = ref(createTrackVoiceReferenceRuntimeState())
let removeTrackVoiceReferenceChangeListener = () => {}
let cueSequence = 0

const voiceRuntimeDiagnostics = createVoiceRuntimeDiagnostics()
const voiceQueue = createVoicePlaybackQueue({
  createAudio: path => new Audio(getPublicPath(path)),
  onEvent: event => voiceRuntimeDiagnostics.record({
    kind: event.kind,
    cueId: event.cue.id,
    correlationId: event.cue.correlationId,
    scenarioId: event.cue.scenarioId,
    source: event.cue.source,
    outcome: event.kind.startsWith('playback_') ? event.kind.slice('playback_'.length) : undefined,
    reason: event.reason,
  }),
})

const pressureVoiceRuntime = createPressureRecommendationVoiceRuntime({
  getVoice: () => selectedVoice.value,
  enqueue: cue => voiceQueue.enqueue(cue),
  onEvent: event => voiceRuntimeDiagnostics.record({
    kind: event.kind,
    cueId: event.cue?.id,
    correlationId: event.correlationId,
    scenarioId: event.cue?.scenarioId,
    source: event.cue?.source,
  }),
})

function getRuntimeApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const { liveLap, startLiveStatePolling, stopLiveStatePolling } = useLiveStatePoller(getRuntimeApi)
const { fastState, startFastStatePolling, stopFastStatePolling } = useFastStatePoller(getRuntimeApi)
// PIP-256: stato coach adattivo; attivo solo se pista coach = pista corrente
// e se la voce dedicata "Feedback coach" lo consente (PIP-260)
const { coachState, startCoachStatePolling, stopCoachStatePolling } = useCoachStatePoller(getRuntimeApi)
let postCornerState = createPostCornerState()
let preCornerState = createPreCornerState()
const coachAllowedForSession = computed(() => isSpotterFeatureAllowed(
  adaptiveCoachEnabled.value,
  adaptiveCoachSessionModes.value,
  fastState.value.sessionType,
))
const coachTrackMatches = computed(() => {
  const state = coachState.value
  return !!state && normalizeTrackName(state.track) === normalizeTrackName(liveLap.value.track)
})
const activeCoachFocus = computed(() => {
  if (!coachAllowedForSession.value || !coachTrackMatches.value) return null
  return coachState.value?.focus ?? null
})
// PIP-260: in modalita' "tutte le curve" ogni verdetto persistente parla sul
// proprio marker; in modalita' "focus" solo la curva-focus
const activeCoachAdvices = computed(() => {
  if (!coachAllowedForSession.value || !coachTrackMatches.value) return []
  if (adaptiveCoachMode.value === 'all') return coachState.value?.cornersAdvice ?? []
  return activeCoachFocus.value ? [activeCoachFocus.value] : []
})
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

function enqueueAudioPath(path: string, metadata: {
  source?: VoiceCueSource
  id?: string
  correlationId?: string
  scenarioId?: string
} = {}) {
  if (!path || !canRunSpotterAudio.value) return
  const source = metadata.source ?? 'track-reference'
  const cue: VoiceCue = {
    id: metadata.id || `${source}-${++cueSequence}`,
    path,
    source,
    correlationId: metadata.correlationId,
    scenarioId: metadata.scenarioId,
  }
  voiceRuntimeDiagnostics.record({
    kind: 'cue_created',
    cueId: cue.id,
    correlationId: cue.correlationId,
    scenarioId: cue.scenarioId,
    source: cue.source,
  })
  voiceQueue.enqueue(cue)
}

/** PIP-256: prova la correzione coach; se il WAV manca/fallisce suona il
 * riferimento standard (mai un marker muto per colpa del coach). */
function enqueueAudioPathWithFallback(primaryPath: string, fallbackPath: string) {
  if (!canRunSpotterAudio.value) return
  const cue: VoiceCue = {
    id: `coach-${++cueSequence}`,
    path: primaryPath,
    fallbackPath,
    source: 'coach',
  }
  voiceRuntimeDiagnostics.record({
    kind: 'cue_created',
    cueId: cue.id,
    source: cue.source,
  })
  voiceQueue.enqueue(cue)
}

function stopSpotterAudio() {
  voiceQueue.cancelAll()
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
  postCornerState = createPostCornerState()
  preCornerState = createPreCornerState()
}

function disarmTrackVoiceReferences() {
  resetTrackVoiceReferenceLapState()
}

function stopRuntimeAudioForLogout() {
  disarmTrackVoiceReferences()
  pressureVoiceRuntime.reset()
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
  // PIP-256/260: sui marker delle curve con verdetto suona la correzione
  // coach al posto del riferimento standard (una curva in modalita' focus,
  // tutte in modalita' "tutte le curve"); il resto e' invariato.
  const coachOverrides = resolveCoachOverrides(
    activeCoachAdvices.value,
    trackVoiceReferences.value.filter(point => normalizeTrackName(point.track) === track),
    selectedVoice.value,
  )
  for (const reference of outcome.toAnnounce) {
    if (!reference.audio_path) continue
    const coachOverride = coachOverrides.get(reference.id)
    if (coachOverride) {
      enqueueAudioPathWithFallback(coachOverride.correctionPath, coachOverride.fallbackPath)
      if (import.meta.dev) console.debug('[spotter-audio-runtime] correzione coach', reference.label || reference.id)
      continue
    }
    enqueueAudioPath(reference.audio_path)
    if (import.meta.dev) console.debug('[spotter-audio-runtime] riferimento vocale', reference.label || reference.id)
  }
  // Fallback pre-curva senza marker (QA 2026-07-20): se la curva-focus non
  // ha nessun marker in finestra, la correzione suona su base posizionale.
  const focusMarkerOverride = resolveCoachOverride(
    activeCoachFocus.value,
    trackVoiceReferences.value.filter(point => normalizeTrackName(point.track) === track),
    selectedVoice.value,
  )
  const preCorner = advancePreCorner(preCornerState, {
    position: currentPosition,
    focus: activeCoachFocus.value,
    voice: selectedVoice.value,
    hasMarkerOverride: focusMarkerOverride !== null,
  })
  preCornerState = preCorner.state
  if (preCorner.path) {
    enqueueAudioPath(preCorner.path)
    if (import.meta.dev) console.debug('[spotter-audio-runtime] correzione coach (fallback posizionale)')
  }
  // PIP-256: esito post-curva, una sola volta per giro, all'uscita del focus.
  const postCorner = advancePostCorner(postCornerState, {
    position: currentPosition,
    focus: activeCoachFocus.value,
    outcome: coachState.value?.lastLapOutcome ?? null,
    voice: selectedVoice.value,
  })
  postCornerState = postCorner.state
  if (postCorner.path) {
    enqueueAudioPath(postCorner.path)
    if (import.meta.dev) console.debug('[spotter-audio-runtime] esito coach post-curva')
  }
}

function announceLapTime(completedLaps: number) {
  if (!canRunSpotterAudio.value || !lapTimesAllowedForSession.value) return
  const audioEntry = resolveLapTimeVoiceEntry(
    liveLap.value.lastLapTimeMs,
    liveLap.value.lapValid ?? true,
    selectedVoice.value,
  )
  if (!audioEntry) return
  enqueueAudioPath(audioEntry.path, {
    source: 'lap-time',
    id: `lap-time-${completedLaps}`,
    correlationId: `lap-${completedLaps}`,
  })
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
  startCoachStatePolling()
})

watch(() => liveLap.value.lapsCompleted, (newVal, oldVal) => {
  if (!canRunSpotterAudio.value) return
  // Compatibilità con logger vecchi: con la fase autorevole presente, il
  // contatore giri non governa più l'arming.
  // Tempo giro solo su un incremento reale tra campioni freschi: le
  // transizioni da/verso null sono recuperi di dato stale. Il ciclo per-giro
  // dei riferimenti NON si resetta qui: lo governa il wrap del flusso di
  // posizione (PIP-216), immune al lag tra live poller e fast poller.
  if (!isLapCountIncrement(oldVal, newVal) || typeof newVal !== 'number') return
  // L'eventuale tempo entra per primo nella FIFO. Il coordinatore attende la
  // raccomandazione dello stesso giro di stint se il fast-state arriva dopo.
  announceLapTime(newVal)
  pressureVoiceRuntime.recordFinishCrossing(newVal)
})

watch(
  () => fastState.value.tyreSetup.pressureRecommendation,
  recommendation => pressureVoiceRuntime.recordRecommendation(recommendation),
  { deep: true },
)

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
  voiceRuntimeDiagnostics.record({
    kind: canRun ? 'runtime_authorized' : 'runtime_denied',
    reason: canRun ? 'local_runtime_capability_granted' : 'local_runtime_capability_revoked',
  })
  if (!canRun) {
    stopRuntimeAudioForLogout()
    return
  }
  resetTrackVoiceReferenceLapState()
  pressureVoiceRuntime.reset()
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
    pressureVoiceRuntime.reset()
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
  stopCoachStatePolling()
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
