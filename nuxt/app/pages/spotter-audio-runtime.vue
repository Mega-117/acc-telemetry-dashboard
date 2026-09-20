<script setup lang="ts">
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'
import { usePublicPath } from '~/composables/usePublicPath'
import { useSpotterVoiceSettings } from '~/composables/useSpotterVoiceSettings'
import { useVoiceLabRuntime } from '~/composables/useVoiceLabRuntime'
import { resolveLocalRuntimeCapability } from '~/services/auth/localIdentityBridge'
import { lapTimeAnnouncementPaths } from '~/services/overlay/lapTimeAnnouncer'
import {
  createVoicePlaybackQueue,
  type VoiceCue,
  type VoiceCueSource,
} from '~/services/audio/voicePlaybackQueue'
import { createVoiceRuntimeDiagnostics } from '~/services/monitoring/voiceRuntimeDiagnostics'
import {
  filterPlayableTrackVoiceReferences,
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
import { createTargetLapVoiceRuntime } from '~/services/spotter/targetLapVoiceRuntime'
import type { InfoTargetSettings } from '~/utils/infoPresentation'
import { createFinishLineVoiceRuntime } from '~/services/spotter/finishLineVoiceRuntime'
import { createPressureRecommendationVoiceRuntime } from '~/services/spotter/pressureRecommendationVoiceRuntime'

definePageMeta({ layout: false })

useHead({
  htmlAttrs: { class: 'spotter-audio-runtime-document' },
  bodyAttrs: { class: 'spotter-audio-runtime-body' },
})

const { getPublicPath } = usePublicPath()
const {
  selectedVoice,
  targetLapVoiceEnabled,
  pressureWarningsEnabled,
  pressureWarningSessionModes,
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
  canAnnounce: () => canRunSpotterAudio.value && isSpotterFeatureAllowed(
    pressureWarningsEnabled.value,
    pressureWarningSessionModes.value,
    fastState.value.sessionType,
  ),
  enqueue: cue => voiceQueue.enqueue(cue),
  onEvent: event => voiceRuntimeDiagnostics.record({
    kind: event.kind,
    cueId: event.cue?.id,
    correlationId: event.correlationId,
    scenarioId: event.cue?.scenarioId,
    source: event.cue?.source,
  }),
})

const getRuntimeApi = useOverlayRegionApi()

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
  finishLineVoiceRuntime.reset()
  targetLapVoiceRuntime.reset()
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

function announceLapTime(id: string, timeMs: number, valid: boolean) {
  if (!canRunSpotterAudio.value || !lapTimesAllowedForSession.value) return
  // The time is spoken only when its full WAV exists; out of range stays silent.
  const paths = lapTimeAnnouncementPaths(timeMs, valid, selectedVoice.value)
  paths.forEach((path, index) => enqueueAudioPath(path, {
    source: 'lap-time', id: `${id}-${index}`, correlationId: id,
  }))
}

let targetSettings: InfoTargetSettings | null = null
let removeTargetSettingsListener: (() => void) | undefined
let targetSettingsRevision = 0
let targetSettingsDisposed = false
const targetLapVoiceRuntime = createTargetLapVoiceRuntime({
  getTarget: () => targetSettings,
  getVoice: () => selectedVoice.value,
  canAnnounce: () => canRunSpotterAudio.value && targetLapVoiceEnabled.value,
  enqueue: cue => voiceQueue.enqueue(cue),
})

const finishLineVoiceRuntime = createFinishLineVoiceRuntime({
  pressure: pressureVoiceRuntime,
  announceLap: announceLapTime,
})

onMounted(async () => {
  loadSpotterVoiceSettings()
  const api = getRuntimeApi()
  removeTargetSettingsListener = api?.onInfoTargetSettings?.((next: InfoTargetSettings) => {
    targetSettingsRevision += 1
    targetSettings = next
  })
  const revision = targetSettingsRevision
  try {
    const settings = await api?.infoTargetGetSettings?.()
    if (!targetSettingsDisposed && revision === targetSettingsRevision) targetSettings = settings || null
  } catch { /* No target feedback without the central settings; other audio remains available. */ }
  if (targetSettingsDisposed) return
  await loadTrackVoiceReferences()
  removeTrackVoiceReferenceChangeListener = subscribeTrackVoiceReferencesChanged(async () => {
    await loadTrackVoiceReferences()
    tickTrackVoiceReferences()
  })
  startLiveStatePolling()
  startFastStatePolling()
  startCoachStatePolling()
})

watch(fastState, frame => {
  if (canRunSpotterAudio.value) {
    finishLineVoiceRuntime.update(frame)
    targetLapVoiceRuntime.update(frame)
  }
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
  voiceRuntimeDiagnostics.record({
    kind: canRun ? 'runtime_authorized' : 'runtime_denied',
    reason: canRun ? 'local_runtime_capability_granted' : 'local_runtime_capability_revoked',
  })
  if (!canRun) {
    stopRuntimeAudioForLogout()
    return
  }
  resetTrackVoiceReferenceLapState()
  finishLineVoiceRuntime.reset()
  targetLapVoiceRuntime.reset()
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
  targetSettingsDisposed = true
  removeTargetSettingsListener?.()
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
