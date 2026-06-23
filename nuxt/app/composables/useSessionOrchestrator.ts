import { ref, watch, type ComputedRef, type Ref } from 'vue'
import { type QualifyingVoiceScenario } from '~/config/qualifyingVoiceNotifications'
import { type TrainingOverlayDurationModeId, type TrainingOverlayId, type TrainingOverlayMode } from '~/config/trainingOverlayCatalog'
import { type LiveLapState } from '~/composables/useLiveStatePoller'

type OverlayPhase = 'loading' | 'placement' | 'launcher' | 'select' | 'running' | 'paused' | 'expired' | 'completed'

// ─── Composable ───────────────────────────────────────────────────────────────
/**
 * @description Owns the session timer and all core session-state transitions (start, pause, resume,
 * advance step, complete, stop). Keeps timer internals (deadlineAt, timerHandle) fully encapsulated
 * and coordinates voice cues and tracking record calls at the right lifecycle points.
 * @param phase - Ref for the current overlay phase ('loading' | 'placement' | 'running' | …).
 * @param activeStepIndex - Ref tracking which step of the training plan is currently running.
 * @param remainingMs - Ref tracking milliseconds remaining in the current step.
 * @param selectedTrainingId - Ref for the training plan currently selected.
 * @param isSettingsOpen - Ref controlling the settings panel visibility.
 * @param selectedMode - Computed for the resolved duration mode object.
 * @param canManuallyAdvanceStep - Computed flag controlling whether the user may skip ahead.
 * @param autoAdvanceStep - Ref controlling whether the overlay auto-advances after the visible countdown in 'expired'.
 * @param autoAdvanceSeconds - Ref with the countdown duration in seconds before auto-advancing.
 * @param closeShortcutStopConfirm - Dismisses the stop-confirm modal.
 * @param cancelStopHold - Cancels any in-progress stop-hold gesture.
 * @param enqueueVoice - Schedules a voice notification scenario.
 * @param enqueueStepStart - Plays the pre-generated WAV intro for the given training+mode+step combo.
 * @param announceLap - Announces a lap crossing through the coach audio channel.
 * @param primeStepAudio - Primes the AudioContext before a new step starts.
 * @param stopVoice - Stops any currently playing voice audio.
 * @param playStepDoneSound - Plays the step-completion sound effect.
 * @param liveLap - Ref with current live lap state (watched for lap announcements).
 * @param startLiveStatePolling - Live-lap polling is owned by the overlay lifecycle; kept for API compatibility.
 * @param stopLiveStatePolling - Live-lap polling is owned by the overlay lifecycle; kept for API compatibility.
 * @param resetLiveLap - Live-lap state is owned by the overlay lifecycle; kept for API compatibility.
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
  autoAdvanceSeconds: Ref<number>,
  closeShortcutStopConfirm: () => void,
  cancelStopHold: () => void,
  enqueueVoice: (scenario: QualifyingVoiceScenario, opts?: { replace?: boolean }) => void,
  enqueueStepStart: (trainingId: string, stepId: string) => void,
  announceLap: (lapNum: number, timeMs: number | null, valid: boolean) => void,
  primeStepAudio: () => Promise<void>,
  stopVoice: () => void,
  playStepDoneSound: () => void,
  playCountdownBeep: (final?: boolean) => void,
  liveLap: Ref<LiveLapState>,
  startLiveStatePolling: () => void,
  stopLiveStatePolling: () => void,
  resetLiveLap: () => void,
  trackingStart: () => Promise<void>,
  trackingComplete: (index: number) => Promise<void>,
  trackingAbandon: (index: number) => Promise<void>,
  savePreferences: () => Promise<void>,
  // Budget del cronometro per lo step (PIP-106). Default = durata reale; la
  // test-mode dev lo comprime. Le decisioni (saltabile, avviso ultimo minuto)
  // restano sulla durata reale, non su questo budget.
  getStepBudgetMs: (step: { durationMinutes: number }) => number = (s) => s.durationMinutes * 60_000,
  // PIP-203: gli annunci live del tempo giro sono controllati dalla voce coach,
  // mentre le voci step restano sempre legate all'allenamento.
  canAnnounceLiveLap: () => boolean = () => true,
) {
  // ── Timer ──────────────────────────────────────────────────────────────────
  let deadlineAt = 0
  let timerHandle: ReturnType<typeof setInterval> | null = null
  let autoAdvanceHandle: ReturnType<typeof setInterval> | null = null
  const autoAdvanceRemainingSec = ref<number | null>(null)
  // Cue "ultimo minuto" (PIP-99): una sola volta per step, solo step >= 5'.
  const LAST_MINUTE_MS = 60_000
  const LAST_MINUTE_MIN_STEP_MINUTES = 5
  let lastMinuteAnnounced = false

  function clearTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null }
  }

  function clearAutoAdvance() {
    if (autoAdvanceHandle) { clearInterval(autoAdvanceHandle); autoAdvanceHandle = null }
    autoAdvanceRemainingSec.value = null
  }

  function tickTimer() {
    remainingMs.value = Math.max(0, deadlineAt - Date.now())
    const step = selectedMode.value.steps[activeStepIndex.value]
    if (
      !lastMinuteAnnounced
      && remainingMs.value > 0
      && remainingMs.value <= LAST_MINUTE_MS
      && (step?.durationMinutes ?? 0) >= LAST_MINUTE_MIN_STEP_MINUTES
    ) {
      // In pausa il timer non ticchetta, quindi l'avviso arriva sempre sul
      // tempo residuo reale; il flag evita il doppio dopo pausa/ripresa.
      lastMinuteAnnounced = true
      enqueueVoice('lastMinute')
    }
    if (remainingMs.value <= 0) {
      clearTimer(); playStepDoneSound()
      // Ultimo step (PIP-113): niente limbo "prossimo step", vai diretto a
      // completed -> la voce di completamento parte subito dopo il tri-bip.
      if (activeStepIndex.value >= selectedMode.value.steps.length - 1) {
        completeSession(activeStepIndex.value + 1)
        return
      }
      phase.value = 'expired'
    }
  }

  function startTicking() {
    clearTimer(); timerHandle = setInterval(tickTimer, 250); tickTimer()
  }

  // ── Auto-advance on expired ────────────────────────────────────────────────
  // Niente voce a fine step (PIP-98): il tri-bip di scadenza basta, la voce
  // "blocco terminato" era ridondante.
  watch(phase, (newPhase, oldPhase) => {
    if (newPhase === 'expired') {
      if (autoAdvanceStep.value) {
        clearAutoAdvance()
        autoAdvanceRemainingSec.value = Math.max(3, Math.round(autoAdvanceSeconds.value) || 10)
        autoAdvanceHandle = setInterval(() => {
          if (autoAdvanceRemainingSec.value === null) return
          autoAdvanceRemainingSec.value -= 1
          // Bip "da palestra" (PIP-97): corti a -3/-2, lungo sull'1, poi avanza.
          if (autoAdvanceRemainingSec.value === 3 || autoAdvanceRemainingSec.value === 2) playCountdownBeep(false)
          else if (autoAdvanceRemainingSec.value === 1) playCountdownBeep(true)
          if (autoAdvanceRemainingSec.value <= 0) goNextStep()
        }, 1_000) as unknown as ReturnType<typeof setInterval>
      }
    } else if (oldPhase === 'expired') {
      clearAutoAdvance()
    }
  })

  // ── Live lap announcement watcher ──────────────────────────────────────────
  // La voce coach deve poter dire il tempo giro anche fuori da un allenamento.
  // Il gate resta canAnnounceLiveLap(), non la phase del training.
  watch(() => liveLap.value.lapsCompleted, (newVal, oldVal) => {
    if (newVal === null || oldVal === null) return
    if (newVal <= oldVal) return
    if (!canAnnounceLiveLap()) return
    announceLap(liveLap.value.currentLap ?? newVal, liveLap.value.lastLapTimeMs, liveLap.value.lapValid ?? true)
  })

  // ── Session transitions ────────────────────────────────────────────────────
  // Percorso di chiusura unico (PIP-95): qualunque via porti a 'completed'
  // (Avanti, auto-advance, skip, completamento manuale) deve registrare la
  // sessione nel Training Tracker. Il polling live resta acceso finche'
  // l'overlay e' aperto, cosi' i widget launcher/select restano aggiornati.
  function completeSession(stepsCompleted: number) {
    phase.value = 'completed'; remainingMs.value = 0; clearTimer()
    enqueueVoice('sessionComplete', { replace: true })
    void trackingComplete(stepsCompleted)
  }

  function startStep(index: number) {
    closeShortcutStopConfirm(); clearAutoAdvance()
    const step = selectedMode.value.steps[index]
    if (!step) {
      completeSession(index); return
    }
    activeStepIndex.value = index; remainingMs.value = getStepBudgetMs(step)
    lastMinuteAnnounced = false
    deadlineAt = Date.now() + remainingMs.value; phase.value = 'running'; startTicking()
    enqueueStepStart(`${selectedTrainingId.value}-${selectedModeId.value}`, step.id)
  }

  function startSession() {
    // Pannello impostazioni mai aperto al rientro in select (PIP-97).
    isSettingsOpen.value = false
    void savePreferences(); void primeStepAudio()
    // L'avvio e' annunciato dall'intro del primo step ("allenamento X. ..."),
    // niente voce di scenario separata (PIP-98).
    void trackingStart(); startStep(0)
  }

  function openTrainingSelection() {
    closeShortcutStopConfirm(); clearTimer(); clearAutoAdvance(); isSettingsOpen.value = false
    activeStepIndex.value = 0; remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
    phase.value = 'select'
  }

  // Pausa/ripresa senza voce (PIP-98): il glow della card e il timer che
  // pulsa bastano, la voce annunciava un'azione appena fatta dall'utente.
  function pauseSession() {
    if (phase.value !== 'running') return
    closeShortcutStopConfirm(); tickTimer(); clearTimer(); phase.value = 'paused'
    stopVoice()
  }

  function resumeSession() {
    if (phase.value !== 'paused') return
    closeShortcutStopConfirm(); deadlineAt = Date.now() + remainingMs.value
    phase.value = 'running'; startTicking()
  }

  function completeCurrentStep() {
    if (phase.value !== 'running' || !canManuallyAdvanceStep.value) return
    // Completamento manuale: avanza diretto, la conferma resta solo per la scadenza naturale.
    clearTimer()
    goNextStep()
  }

  function skipPausedStep() {
    if (phase.value !== 'paused') return
    goNextStep()
  }

  function goNextStep() {
    closeShortcutStopConfirm(); clearAutoAdvance()
    if (activeStepIndex.value >= selectedMode.value.steps.length - 1) {
      completeSession(activeStepIndex.value + 1)
      return
    }
    startStep(activeStepIndex.value + 1)
  }

  function stopSession() {
    cancelStopHold(); closeShortcutStopConfirm(); clearTimer(); clearAutoAdvance(); stopVoice()
    void trackingAbandon(activeStepIndex.value)
    isSettingsOpen.value = false; activeStepIndex.value = 0
    remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000; phase.value = 'select'
  }

  function resetCompleted() {
    // Dalla schermata completata si torna alla selezione allenamento (PIP-93).
    closeShortcutStopConfirm(); clearAutoAdvance(); isSettingsOpen.value = false
    activeStepIndex.value = 0
    remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000; phase.value = 'select'
  }

  return {
    clearTimer,
    startStep, startSession, openTrainingSelection,
    pauseSession, resumeSession, completeCurrentStep, skipPausedStep,
    goNextStep, stopSession, resetCompleted,
    autoAdvanceRemainingSec, cancelAutoAdvance: clearAutoAdvance,
  }
}
