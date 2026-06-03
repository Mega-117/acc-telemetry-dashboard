import { watch, type ComputedRef, type Ref } from 'vue'
import { type QualifyingVoiceScenario } from '~/config/qualifyingVoiceNotifications'
import { type TrainingOverlayDurationModeId, type TrainingOverlayId, type TrainingOverlayMode } from '~/config/trainingOverlayCatalog'
import { type LiveLapState } from '~/composables/useLiveStatePoller'

type OverlayPhase = 'loading' | 'placement' | 'launcher' | 'select' | 'running' | 'paused' | 'expired' | 'completed'

// ─── Composable ───────────────────────────────────────────────────────────────
/**
 * @description Owns the session timer and all core session-state transitions (start, pause, resume,
 * advance step, complete, stop). Keeps timer internals (deadlineAt, timerHandle) fully encapsulated
 * and coordinates voice cues, live-lap polling, and tracking record calls at the right lifecycle points.
 * @param phase - Ref for the current overlay phase ('loading' | 'placement' | 'running' | …).
 * @param activeStepIndex - Ref tracking which step of the training plan is currently running.
 * @param remainingMs - Ref tracking milliseconds remaining in the current step.
 * @param selectedTrainingId - Ref for the training plan currently selected.
 * @param isSettingsOpen - Ref controlling the settings panel visibility.
 * @param selectedMode - Computed for the resolved duration mode object.
 * @param canManuallyAdvanceStep - Computed flag controlling whether the user may skip ahead.
 * @param autoAdvanceStep - Ref controlling whether the overlay auto-advances after 30 s of 'expired'.
 * @param closeShortcutStopConfirm - Dismisses the stop-confirm modal.
 * @param cancelStopHold - Cancels any in-progress stop-hold gesture.
 * @param enqueueVoice - Schedules a voice notification scenario.
 * @param enqueueStepStart - Plays the pre-generated WAV intro for the given training+mode+step combo.
 * @param announceLap - Announces a lap crossing via Web Speech API.
 * @param primeStepAudio - Primes the AudioContext before a new step starts.
 * @param stopVoice - Stops any currently playing voice audio.
 * @param playStepDoneSound - Plays the step-completion sound effect.
 * @param liveLap - Ref with current live lap state (watched for lap announcements).
 * @param startLiveStatePolling - Begins polling for live lap data from the IPC API.
 * @param stopLiveStatePolling - Halts live lap polling.
 * @param resetLiveLap - Clears live lap state back to defaults.
 * @param trackingStart - Records the start of a training session in the Electron API.
 * @param trackingComplete - Records completion of a training step in the Electron API.
 * @returns Object with startSession, pauseSession, resumeSession, advanceStep, completeSession, stopSession functions.
 */
export function useSessionOrchestrator(
  phase: Ref<OverlayPhase>,
  activeStepIndex: Ref<number>,
  remainingMs: Ref<number>,
  selectedTrainingId: Ref<TrainingOverlayId>,
  selectedModeId: Ref<TrainingOverlayDurationModeId>,
  isSettingsOpen: Ref<boolean>,
  selectedMode: ComputedRef<TrainingOverlayMode>,
  canManuallyAdvanceStep: ComputedRef<boolean>,
  autoAdvanceStep: Ref<boolean>,
  closeShortcutStopConfirm: () => void,
  cancelStopHold: () => void,
  enqueueVoice: (scenario: QualifyingVoiceScenario, opts?: { replace?: boolean }) => void,
  enqueueStepStart: (trainingId: string, stepId: string) => void,
  announceLap: (lapNum: number, timeMs: number | null, valid: boolean) => void,
  primeStepAudio: () => Promise<void>,
  stopVoice: () => void,
  playStepDoneSound: () => void,
  liveLap: Ref<LiveLapState>,
  startLiveStatePolling: () => void,
  stopLiveStatePolling: () => void,
  resetLiveLap: () => void,
  trackingStart: () => Promise<void>,
  trackingComplete: (index: number) => Promise<void>,
  trackingAbandon: (index: number) => Promise<void>,
  savePreferences: () => Promise<void>,
) {
  // ── Timer ──────────────────────────────────────────────────────────────────
  let deadlineAt = 0
  let timerHandle: ReturnType<typeof setInterval> | null = null
  let autoAdvanceHandle: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null }
  }

  function clearAutoAdvance() {
    if (autoAdvanceHandle) { clearTimeout(autoAdvanceHandle); autoAdvanceHandle = null }
  }

  function tickTimer() {
    remainingMs.value = Math.max(0, deadlineAt - Date.now())
    if (remainingMs.value <= 0) {
      clearTimer(); playStepDoneSound(); phase.value = 'expired'
    }
  }

  function startTicking() {
    clearTimer(); timerHandle = setInterval(tickTimer, 250); tickTimer()
  }

  // ── Auto-advance on expired ────────────────────────────────────────────────
  watch(phase, (newPhase, oldPhase) => {
    if (newPhase === 'expired') {
      enqueueVoice('stepEnd')
      if (autoAdvanceStep.value) {
        clearAutoAdvance()
        autoAdvanceHandle = setTimeout(() => {
          clearAutoAdvance()
          goNextStep()
        }, 30_000) as unknown as ReturnType<typeof setTimeout>
      }
    } else if (oldPhase === 'expired') {
      clearAutoAdvance()
    }
  })

  // ── Lap announcement watcher ───────────────────────────────────────────────
  watch(() => liveLap.value.lapsCompleted, (newVal, oldVal) => {
    if (newVal === null || oldVal === null) return
    if (newVal <= oldVal) return
    if (phase.value !== 'running') return
    announceLap(liveLap.value.currentLap ?? newVal, liveLap.value.lastLapTimeMs, liveLap.value.lapValid ?? true)
  })

  // ── Session transitions ────────────────────────────────────────────────────
  function startStep(index: number) {
    closeShortcutStopConfirm(); clearAutoAdvance()
    const step = selectedMode.value.steps[index]
    if (!step) {
      phase.value = 'completed'; remainingMs.value = 0; clearTimer()
      enqueueVoice('sessionComplete', { replace: true })
      void trackingComplete(index); stopLiveStatePolling(); return
    }
    activeStepIndex.value = index; remainingMs.value = step.durationMinutes * 60_000
    deadlineAt = Date.now() + remainingMs.value; phase.value = 'running'; startTicking()
    enqueueStepStart(`${selectedTrainingId.value}-${selectedModeId.value}`, step.id)
  }

  function startSession() {
    void savePreferences(); void primeStepAudio()
    enqueueVoice('sessionStart', { replace: true })
    startLiveStatePolling(); void trackingStart(); startStep(0)
  }

  function openTrainingSelection() {
    closeShortcutStopConfirm(); clearTimer(); clearAutoAdvance(); isSettingsOpen.value = false
    activeStepIndex.value = 0; remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
    phase.value = 'select'
  }

  function pauseSession() {
    if (phase.value !== 'running') return
    closeShortcutStopConfirm(); tickTimer(); clearTimer(); phase.value = 'paused'
    enqueueVoice('manualPause', { replace: true })
  }

  function resumeSession() {
    if (phase.value !== 'paused') return
    closeShortcutStopConfirm(); deadlineAt = Date.now() + remainingMs.value
    phase.value = 'running'; startTicking()
    enqueueVoice('manualResume', { replace: true })
  }

  function completeCurrentStep() {
    if (phase.value !== 'running' || !canManuallyAdvanceStep.value) return
    closeShortcutStopConfirm(); clearAutoAdvance(); remainingMs.value = 0; clearTimer(); phase.value = 'expired'
  }

  function goNextStep() {
    closeShortcutStopConfirm(); clearAutoAdvance()
    if (activeStepIndex.value >= selectedMode.value.steps.length - 1) {
      phase.value = 'completed'; remainingMs.value = 0; clearTimer()
      enqueueVoice('sessionComplete', { replace: true })
      return
    }
    startStep(activeStepIndex.value + 1)
  }

  function stopSession() {
    cancelStopHold(); closeShortcutStopConfirm(); clearTimer(); clearAutoAdvance(); stopVoice()
    void trackingAbandon(activeStepIndex.value); stopLiveStatePolling(); resetLiveLap()
    isSettingsOpen.value = false; activeStepIndex.value = 0
    remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000; phase.value = 'select'
  }

  function resetCompleted() {
    closeShortcutStopConfirm(); clearAutoAdvance(); activeStepIndex.value = 0
    remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000; phase.value = 'launcher'
  }

  return {
    clearTimer,
    startStep, startSession, openTrainingSelection,
    pauseSession, resumeSession, completeCurrentStep,
    goNextStep, stopSession, resetCompleted,
  }
}
