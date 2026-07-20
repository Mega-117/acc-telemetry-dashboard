import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  DEFAULT_SPOTTER_SESSION_MODES,
  normalizeSpotterSessionModes,
  serializeSpotterSessionModes,
  toggleSpotterSessionMode,
  type SpotterSessionMode,
} from '~/services/spotter/spotterSessionPolicy'

export type SpotterVoiceId = 'if_sara' | 'im_nicola'

export const spotterVoiceOptions: Array<{ id: SpotterVoiceId; label: string }> = [
  { id: 'if_sara', label: 'Sara' },
  { id: 'im_nicola', label: 'Nicola' },
]

const STORAGE_KEYS = {
  voice: 'acc.spotter.voice',
  referencesEnabled: 'acc.trackVoiceReferences.enabled',
  coachEnabled: 'acc.spotter.trainingCoach.enabled',
  referenceSessionModes: 'acc.trackVoiceReferences.sessionModes',
  lapTimeSessionModes: 'acc.spotter.trainingCoach.sessionModes',
  adaptiveCoachEnabled: 'acc.adaptiveCoach.enabled',
  adaptiveCoachSessionModes: 'acc.adaptiveCoach.sessionModes',
  adaptiveCoachMode: 'acc.adaptiveCoach.mode',
}

/** PIP-260: 'focus' = una curva alla volta (default), 'all' = ogni curva
 * con errore persistente parla sul proprio marker. */
export type AdaptiveCoachMode = 'focus' | 'all'

const SETTINGS_CHANGED_EVENT = 'acc-spotter-voice-settings-change'

const selectedVoice = ref<SpotterVoiceId>('if_sara')
const referencesEnabled = ref(false)
const coachEnabled = ref(false)
const referenceSessionModes = ref<SpotterSessionMode[]>([...DEFAULT_SPOTTER_SESSION_MODES])
const lapTimeSessionModes = ref<SpotterSessionMode[]>([...DEFAULT_SPOTTER_SESSION_MODES])
const adaptiveCoachEnabled = ref(false)
const adaptiveCoachSessionModes = ref<SpotterSessionMode[]>([...DEFAULT_SPOTTER_SESSION_MODES])
const adaptiveCoachMode = ref<AdaptiveCoachMode>('focus')
const loaded = ref(false)

function resolveVoiceId(value: unknown): SpotterVoiceId {
  return value === 'im_nicola' ? 'im_nicola' : 'if_sara'
}

function canUseStorage() {
  return typeof window !== 'undefined'
}

function readSettings() {
  if (!canUseStorage()) return
  selectedVoice.value = resolveVoiceId(window.localStorage.getItem(STORAGE_KEYS.voice))
  const referencesRaw = window.localStorage.getItem(STORAGE_KEYS.referencesEnabled)
  const coachRaw = window.localStorage.getItem(STORAGE_KEYS.coachEnabled)
  referencesEnabled.value = referencesRaw === null ? true : referencesRaw === '1'
  coachEnabled.value = coachRaw === null ? true : coachRaw === '1'
  referenceSessionModes.value = normalizeSpotterSessionModes(window.localStorage.getItem(STORAGE_KEYS.referenceSessionModes))
  lapTimeSessionModes.value = normalizeSpotterSessionModes(window.localStorage.getItem(STORAGE_KEYS.lapTimeSessionModes))
  const adaptiveRaw = window.localStorage.getItem(STORAGE_KEYS.adaptiveCoachEnabled)
  adaptiveCoachEnabled.value = adaptiveRaw === null ? true : adaptiveRaw === '1'
  adaptiveCoachSessionModes.value = normalizeSpotterSessionModes(window.localStorage.getItem(STORAGE_KEYS.adaptiveCoachSessionModes))
  adaptiveCoachMode.value = window.localStorage.getItem(STORAGE_KEYS.adaptiveCoachMode) === 'all' ? 'all' : 'focus'
  loaded.value = true
}

function emitSettingsChanged() {
  if (!canUseStorage()) return
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT))
}

function writeSetting(key: string, value: string) {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, value)
  emitSettingsChanged()
}

function selectVoice(voice: SpotterVoiceId) {
  selectedVoice.value = resolveVoiceId(voice)
  writeSetting(STORAGE_KEYS.voice, selectedVoice.value)
}

function setReferencesEnabled(enabled: boolean) {
  referencesEnabled.value = enabled
  writeSetting(STORAGE_KEYS.referencesEnabled, enabled ? '1' : '0')
}

function toggleReferences() {
  setReferencesEnabled(!referencesEnabled.value)
}

function setCoachEnabled(enabled: boolean) {
  coachEnabled.value = enabled
  writeSetting(STORAGE_KEYS.coachEnabled, enabled ? '1' : '0')
}

function toggleCoach() {
  setCoachEnabled(!coachEnabled.value)
}

function setReferenceSessionModes(modes: SpotterSessionMode[]) {
  referenceSessionModes.value = normalizeSpotterSessionModes(modes)
  writeSetting(STORAGE_KEYS.referenceSessionModes, serializeSpotterSessionModes(referenceSessionModes.value))
}

function toggleReferenceSessionMode(mode: SpotterSessionMode) {
  setReferenceSessionModes(toggleSpotterSessionMode(referenceSessionModes.value, mode))
}

function setAdaptiveCoachEnabled(enabled: boolean) {
  adaptiveCoachEnabled.value = enabled
  writeSetting(STORAGE_KEYS.adaptiveCoachEnabled, enabled ? '1' : '0')
}

function toggleAdaptiveCoach() {
  setAdaptiveCoachEnabled(!adaptiveCoachEnabled.value)
}

function setAdaptiveCoachSessionModes(modes: SpotterSessionMode[]) {
  adaptiveCoachSessionModes.value = normalizeSpotterSessionModes(modes)
  writeSetting(STORAGE_KEYS.adaptiveCoachSessionModes, serializeSpotterSessionModes(adaptiveCoachSessionModes.value))
}

function toggleAdaptiveCoachSessionMode(mode: SpotterSessionMode) {
  setAdaptiveCoachSessionModes(toggleSpotterSessionMode(adaptiveCoachSessionModes.value, mode))
}

function setAdaptiveCoachMode(mode: AdaptiveCoachMode) {
  adaptiveCoachMode.value = mode === 'all' ? 'all' : 'focus'
  writeSetting(STORAGE_KEYS.adaptiveCoachMode, adaptiveCoachMode.value)
}

function setLapTimeSessionModes(modes: SpotterSessionMode[]) {
  lapTimeSessionModes.value = normalizeSpotterSessionModes(modes)
  writeSetting(STORAGE_KEYS.lapTimeSessionModes, serializeSpotterSessionModes(lapTimeSessionModes.value))
}

function toggleLapTimeSessionMode(mode: SpotterSessionMode) {
  setLapTimeSessionModes(toggleSpotterSessionMode(lapTimeSessionModes.value, mode))
}

export function useSpotterVoiceSettings() {
  const voiceLabel = computed(() => spotterVoiceOptions.find(voice => voice.id === selectedVoice.value)?.label || 'Sara')

  let stopSync: (() => void) | null = null

  onMounted(() => {
    readSettings()
    const sync = () => readSettings()
    window.addEventListener('storage', sync)
    window.addEventListener(SETTINGS_CHANGED_EVENT, sync)
    stopSync = () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(SETTINGS_CHANGED_EVENT, sync)
    }
  })

  onBeforeUnmount(() => {
    stopSync?.()
    stopSync = null
  })

  return {
    loaded,
    selectedVoice,
    voiceLabel,
    referencesEnabled,
    coachEnabled,
    referenceSessionModes,
    lapTimeSessionModes,
    adaptiveCoachEnabled,
    adaptiveCoachSessionModes,
    adaptiveCoachMode,
    load: readSettings,
    selectVoice,
    setReferencesEnabled,
    toggleReferences,
    setCoachEnabled,
    toggleCoach,
    setReferenceSessionModes,
    toggleReferenceSessionMode,
    setLapTimeSessionModes,
    toggleLapTimeSessionMode,
    setAdaptiveCoachEnabled,
    toggleAdaptiveCoach,
    setAdaptiveCoachSessionModes,
    toggleAdaptiveCoachSessionMode,
    setAdaptiveCoachMode,
  }
}
