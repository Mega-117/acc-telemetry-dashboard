import { ref, type ComputedRef, type Ref } from 'vue'
import { type QualifyingVoiceId } from '~/config/qualifyingVoiceNotifications'
import { type TrainingOverlayDurationModeId, type TrainingOverlayId } from '~/config/trainingOverlayCatalog'

// ─── Types ────────────────────────────────────────────────────────────────────
export type OverlayOriginCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type OverlayOriginMode = 'auto' | 'manual'

// ─── Module-level helpers (used by page outside the composable) ───────────────
const _originCornerOptions: Array<{ id: OverlayOriginCorner; label: string }> = [
  { id: 'top-left', label: 'Alto sx' }, { id: 'top-right', label: 'Alto dx' },
  { id: 'bottom-left', label: 'Basso sx' }, { id: 'bottom-right', label: 'Basso dx' },
]

export const originCornerOptions = _originCornerOptions

export function resolveOverlayOriginCorner(value: unknown): OverlayOriginCorner {
  return _originCornerOptions.some(o => o.id === value) ? value as OverlayOriginCorner : 'top-left'
}

// Currently always returns 'manual' — kept as a hook for future modes
export function resolveOverlayOriginMode(_value: unknown): OverlayOriginMode { return 'manual' }

// ─── Composable ───────────────────────────────────────────────────────────────
/**
 * @description Manages all user-configurable overlay preferences (position, corner, sound, voice,
 * training/mode defaults) and persists them via the Electron API. Also owns the settings panel
 * open/close state and coordinates with the sound/voice and overlay-size systems on save.
 * @param getApi - Factory that returns the current Electron API instance, or null.
 * @param soundEnabled - Ref tracking whether audio feedback is enabled.
 * @param stopVoice - Stops any currently playing voice audio.
 * @param primeStepAudio - Primes the AudioContext after user gesture when sound is re-enabled.
 * @param scheduleOverlaySizeSync - Requests an overlay size recalculation after layout changes.
 * @param isActiveSession - Computed flag indicating whether a training session is in progress.
 * @param closeShortcutStopConfirm - Dismisses the stop-confirm modal if open.
 * @param selectedTrainingId - Ref for the currently selected training overlay id.
 * @param selectedModeId - Ref for the currently selected duration mode id.
 * @returns Object with settings state refs and savePreferences / openSettings / closeSettings functions.
 */
export function useOverlaySettings(
  getApi: () => any | null,
  soundEnabled: Ref<boolean>,
  stopVoice: () => void,
  primeStepAudio: () => Promise<void>,
  scheduleOverlaySizeSync: () => void,
  isActiveSession: ComputedRef<boolean>,
  closeShortcutStopConfirm: () => void,
  selectedTrainingId: Ref<TrainingOverlayId>,
  selectedModeId: Ref<TrainingOverlayDurationModeId>,
) {
  const autoDimDuringRun = ref(true)
  const autoAdvanceStep = ref(true)
  const originMode = ref<OverlayOriginMode>('manual')
  const originCorner = ref<OverlayOriginCorner>('top-left')
  const selectedQualifyingVoiceId = ref<QualifyingVoiceId>('if_sara')
  const isTrainingPickerOpen = ref(false)
  const isSettingsOpen = ref(false)

  async function savePreferences() {
    await getApi()?.trainingOverlaySavePreferences?.({
      lastTrainingId: selectedTrainingId.value, lastDurationId: selectedModeId.value,
      soundEnabled: soundEnabled.value, autoDimDuringRun: autoDimDuringRun.value,
      autoAdvanceStep: autoAdvanceStep.value,
      originMode: originMode.value, originCorner: originCorner.value,
      qualifyingVoiceId: selectedQualifyingVoiceId.value,
    })
  }

  function toggleTrainingPicker() {
    if (isActiveSession.value) return
    closeShortcutStopConfirm(); isTrainingPickerOpen.value = !isTrainingPickerOpen.value
    if (isTrainingPickerOpen.value) isSettingsOpen.value = false
    scheduleOverlaySizeSync()
  }

  function toggleSettingsPanel() {
    if (isActiveSession.value) return
    closeShortcutStopConfirm(); isSettingsOpen.value = !isSettingsOpen.value
    if (isSettingsOpen.value) isTrainingPickerOpen.value = false
    scheduleOverlaySizeSync()
  }

  function toggleAutoDimDuringRun() { autoDimDuringRun.value = !autoDimDuringRun.value; void savePreferences() }

  function selectOriginCorner(c: OverlayOriginCorner) {
    if (isActiveSession.value) return
    originMode.value = 'manual'; originCorner.value = c; void savePreferences(); scheduleOverlaySizeSync()
  }

  function selectQualifyingVoice(id: QualifyingVoiceId) {
    if (isActiveSession.value) return; selectedQualifyingVoiceId.value = id; void savePreferences()
  }

  function toggleAutoAdvanceStep() { autoAdvanceStep.value = !autoAdvanceStep.value; void savePreferences() }

  function toggleSound() {
    soundEnabled.value = !soundEnabled.value
    if (!soundEnabled.value) stopVoice()
    void savePreferences()
    if (soundEnabled.value) void primeStepAudio()
  }

  return {
    autoDimDuringRun, autoAdvanceStep, originMode, originCorner, selectedQualifyingVoiceId,
    isTrainingPickerOpen, isSettingsOpen,
    savePreferences, toggleTrainingPicker, toggleSettingsPanel,
    toggleAutoDimDuringRun, toggleAutoAdvanceStep, selectOriginCorner, selectQualifyingVoice, toggleSound,
  }
}
