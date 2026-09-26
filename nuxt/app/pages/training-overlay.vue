<script setup lang="ts">
import { usePresentationInterval, usePresentationVisibility } from '~/composables/usePresentationVisibility'
const presentationVisible = usePresentationVisibility()
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  resolveTrainingOverlayModeId,
  resolveTrainingOverlayTrainingId,
  trainingOverlayStepTypeLabels,
  trainingOverlayTrainingList,
  type TrainingOverlayDurationModeId,
  type TrainingOverlayStep,
  type TrainingOverlayTraining,
  type TrainingOverlayId
} from '~/config/trainingOverlayCatalog'
import {
  type QualifyingVoiceScenario
} from '~/config/qualifyingVoiceNotifications'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useTrackingRecord } from '~/composables/useTrackingRecord'
import { useStopHold } from '~/composables/useStopHold'
import { useQualifyingVoice } from '~/composables/useQualifyingVoice'
import { useOverlaySize } from '~/composables/useOverlaySize'
import { useOverlayInteractionContract } from '~/composables/useOverlayInteractionContract'
import { useTrainingSelection, type PlanPreviewChip } from '~/composables/useTrainingSelection'
import { useSessionOrchestrator } from '~/composables/useSessionOrchestrator'
import {
  useOverlaySettings, resolveOverlayOriginCorner, resolveOverlayOriginMode,
  resolveAutoAdvanceSeconds,
  type OverlayOriginCorner, type OverlayOriginMode,
} from '~/composables/useOverlaySettings'
import { CircleCheck, CircleMinus, LoaderCircle } from '@lucide/vue'
import QuickPanelVoiceControls from '~/components/overlay/QuickPanelVoiceControls.vue'
import OverlaySelectSetup from '~/components/overlay/OverlaySelectSetup.vue'
import OverlayHud from '~/components/overlay/OverlayHud.vue'
import SetupFuelPanel from '~/components/overlay/SetupFuelPanel.vue'
import InfoTargetSetup from '~/components/overlay/InfoTargetSetup.vue'
import SectorReferenceSetup from '~/components/overlay/SectorReferenceSetup.vue'
import TestModeBadge from '~/components/overlay/TestModeBadge.vue'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import PitwallOverlayButton from '~/components/pitwall/PitwallOverlayButton.vue'
import { resolveOverlayKeyboardCommand, type OverlayInputCommand } from '~/services/overlay/overlayInputModel'
import { resetsOverlayMenuOnHide } from '~/services/overlay/overlayActionNavigation'
import { useOverlayActionSelection } from '~/composables/useOverlayActionSelection'
import {
  normalizeQaBotSnapshot,
  qaBotPresentation,
  type QaBotSnapshot,
} from '~/services/overlay/qaBotPresentation'
import { pressureActionPresentation } from '~/services/overlay/pressureActionPresentation'
import { usePublicPath } from '~/composables/usePublicPath'
import { useDevTestMode } from '~/composables/useDevTestMode'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { resolveLocalRuntimeCapability } from '~/services/auth/localIdentityBridge'
import { useSpotterVoiceSettings } from '~/composables/useSpotterVoiceSettings'

definePageMeta({ layout: false })

const { getPublicPath } = usePublicPath()
useHead({
  htmlAttrs: { class: 'training-overlay-document' },
  bodyAttrs: { class: 'training-overlay-runtime' },
})

// ─── Types ───────────────────────────────────────────────────────────────────
type OverlayPhase = 'loading' | 'launcher' | 'select' | 'running' | 'paused' | 'expired' | 'completed'
type OverlayCommand = Exclude<OverlayInputCommand, 'toggle'>
type OverlaySizePreset = 'launcher' | 'placement' | 'select' | 'session' | 'expired' | 'completed'
type OverlaySize = { width: number; height: number }
type PrimaryOverlayAction = 'open-selection' | 'start' | 'pause' | 'resume' | 'complete-step' | 'next' | 'reset' | 'none'

interface TrainingOverlaySettings {
  hasConfiguredPosition?: boolean; lastTrainingId?: string
  lastDurationId?: TrainingOverlayDurationModeId; soundEnabled?: boolean
  spotterEnabled?: boolean
  autoDimDuringRun?: boolean; autoAdvanceStep?: boolean; autoAdvanceSeconds?: number
  originMode?: OverlayOriginMode
  originCorner?: OverlayOriginCorner
  enableVoicePointRecorder?: boolean
}
interface InfoTargetSettings {
  active: boolean
  targetTimeMs: number | null
  toleranceMs: number
  keepBetweenSessions: boolean
}


// ─── Constants ───────────────────────────────────────────────────────────────
const OVERLAY_WORK_AREA_SIZE: OverlaySize = { width: 472, height: 768 }
const AUTO_DIM_DELAY_MS = 10_000
const AUTO_DIM_RESTORE_MS = 10_000
const AUTO_DIM_OPACITY = 0.6
const PRIMARY_ACTION_DEBOUNCE_MS = 450
// Le dimensioni delle card vivono solo nello SCSS (fonte unica, PIP-92);
// la finestra Electron si adatta alla superficie misurata via useOverlaySize.
const overlayShortcuts = [
  { label: 'Overlay', value: 'Ctrl+K' },
  { label: 'Bottone azione', value: 'Ctrl+N' },
  { label: 'Mute', value: 'Ctrl+M' },
  { label: 'Stop (2 pressioni)', value: 'Ctrl+Alt+S' },
  { label: 'Indietro (solo focus)', value: 'Ctrl+B' },
]

// ─── Core State ──────────────────────────────────────────────────────────────
const selectedTrainingId = ref<TrainingOverlayId>('tracktitan_input')
const selectedModeId = ref<TrainingOverlayDurationModeId>('short30')
const activeStepIndex = ref(0)
const phase = ref<OverlayPhase>('loading')
const remainingMs = ref(0)
const isElectronRuntime = ref(false)
const {
  selectedVoice: spotterVoice,
  referencesEnabled: trackVoiceReferencesEnabled,
  coachEnabled: spotterEnabled,
  load: loadSpotterVoiceSettings,
  setReferencesEnabled,
  setCoachEnabled,
  targetLapVoiceEnabled,
  setTargetLapVoiceEnabled,
  pressureWarningsEnabled,
  togglePressureWarnings,
} = useSpotterVoiceSettings()
const { canEnterApp, isSecondaryLocalRuntime, isLocalRuntimeAttested } = useFirebaseAuth()
const canUseSpotterControls = computed(() => resolveLocalRuntimeCapability({
  isSecondaryLocalRuntime: isSecondaryLocalRuntime.value,
  isLocalRuntimeAttested: isLocalRuntimeAttested.value,
  canEnterApp: canEnterApp.value,
}))
// La selezione volante usa ID semantici e ricalcola il DOM a ogni comando.
const overlayRoot = ref<HTMLElement | null>(null)
const actionSelection = useOverlayActionSelection(overlayRoot, () =>
  phase.value !== 'loading',
)
const { selectedId: selectedWheelActionId, first: selectFirstWheelAction,
  next: selectNextWheelAction, activate: activateSelectedWheelAction } = actionSelection
const preparingReopen = ref(false)
const isPointerOnOverlaySurface = ref(false)
const isTargetSetupOpen = ref(false)
const isSectorReferenceSetupOpen = ref(false)
const sectorReferenceSetup = ref<InstanceType<typeof SectorReferenceSetup> | null>(null)
function closeSectorReferenceSetup() { isSectorReferenceSetupOpen.value = false }
async function saveSectorReferenceSetup() {
  closeSectorReferenceSetup()
  await getOverlayApi()?.trainingOverlayClose?.()
}
const infoTargetActive = ref(false)
const infoTargetTimeMs = ref(90_000)
const infoTargetToleranceMs = ref(500)
const infoTargetKeepBetweenSessions = ref(false)
const runtimeVoicePointRecorderAllowed = ref(false)
const showDevControls = computed(() => {
  if (import.meta.dev || runtimeVoicePointRecorderAllowed.value) return true
  if (typeof window === 'undefined') return false
  return ['localhost', '127.0.0.1', '::1', ''].includes(window.location.hostname)
})
let savedInfoTargetSettings: InfoTargetSettings | null = null
const isSaving = ref(false)
const voicePointRecorderEnabled = ref(false)

const voicePointNotice = ref<{ text: string; tone: 'ok' | 'error' } | null>(null)
let voicePointNoticeTimer: ReturnType<typeof setTimeout> | null = null

// Test-mode dev (PIP-106): comprime il budget del cronometro senza falsare
// l'identità degli step. Sorgente unica usata da timer, barra e auto-dim.
const { isTestMode, toggle: toggleTestMode, stepBudgetMs, init: initTestMode } = useDevTestMode()

// ─── API bridge ──────────────────────────────────────────────────────────────
const getOverlayApi = useOverlayRegionApi()

// The logger owns recommendation facts; Electron owns Setup input; this page
// only presents the versioned plan and never computes pressure corrections.
const dryPressureState = ref<any>({ state: 'unavailable', reason: 'telemetry_not_fresh' })
const dryPressurePresentation = computed(() => pressureActionPresentation(dryPressureState.value))
const isDryPressurePreviewOpen = ref(false)
const isDryPressureApplying = ref(false)
const dryPressureBridgeStatus = ref('Nessuna raccomandazione TEST attiva.')
const dryPressureActivity = usePresentationInterval(() => { void refreshDryPressureState() }, 500)
const qaBotState = ref<QaBotSnapshot>(normalizeQaBotSnapshot({
  state: 'OFF',
  reason: 'bot_off',
}))
const qaBotView = computed(() => qaBotPresentation(qaBotState.value))
const qaBotActivity = usePresentationInterval(() => { void refreshQaBotState() }, 250)
async function refreshQaBotState() {
  const api = getOverlayApi()
  if (!api?.trainingOverlayGetQaBotState) {
    qaBotState.value = normalizeQaBotSnapshot({
      state: 'BLOCKED',
      reason: 'qa_bot_runtime_missing',
    })
    return
  }
  try {
    qaBotState.value = normalizeQaBotSnapshot(await api.trainingOverlayGetQaBotState())
  } catch (_) {
    qaBotState.value = normalizeQaBotSnapshot({
      state: 'FAULT',
      reason: 'qa_bot_state_unavailable',
    })
  }
}
async function toggleQaBot() {
  const api = getOverlayApi()
  const action = qaBotView.value.action
  if (!api || action === 'none') return
  qaBotState.value = normalizeQaBotSnapshot({
    ...qaBotState.value,
    state: action === 'start' ? 'CHECKING' : 'STOPPING',
    reason: action === 'start' ? 'checking_preconditions' : 'user_stop',
  })
  try {
    const result = action === 'start'
      ? await api.trainingOverlayStartQaBot?.()
      : await api.trainingOverlayStopQaBot?.()
    qaBotState.value = normalizeQaBotSnapshot(result)
  } catch (_) {
    qaBotState.value = normalizeQaBotSnapshot({
      state: 'FAULT',
      reason: 'qa_bot_command_failed',
    })
  }
  await refreshQaBotState()
}
async function refreshDryPressureState() {
  const next = await getOverlayApi()?.trainingOverlayGetSetupPressureState?.()
  if (next) {
    dryPressureState.value = next
    scheduleOverlaySizeSync()
  }
}
async function applyDryPressure() {
  if (isDryPressureApplying.value) return
  isDryPressureApplying.value = true
  isDryPressurePreviewOpen.value = true
  await nextTick()
  try {
    const response = await getOverlayApi()?.trainingOverlayApplySetupPressure?.()
    if (!response?.accepted) {
      dryPressureState.value = {
        ...dryPressureState.value,
        state: response?.retryable ? 'ready' : 'blocked',
        reason: response?.reason || 'command_not_accepted',
        actionReasonCode: response?.reasonCode || null,
      }
    }
  } catch (_) { dryPressureState.value = { state: 'blocked', reason: 'command_not_accepted' } }
  finally { isDryPressureApplying.value = false }
  await refreshDryPressureState()
}
async function testDryPressure() {
  isDryPressurePreviewOpen.value = true
  dryPressureBridgeStatus.value = 'Creo una raccomandazione sintetica monouso…'
  try {
    const result = await getOverlayApi()?.trainingOverlayGeneratePressureQa?.()
    if (!result?.accepted) {
      dryPressureState.value = { ...dryPressureState.value, state: 'blocked', reason: result?.reason || 'Test non avviato: prerequisito tecnico non verificato. Nessun input inviato.' }
      dryPressureBridgeStatus.value = `Bloccato: ${result?.reason || 'controller senza esito verificato.'}`
    } else {
      dryPressureBridgeStatus.value = `Raccomandazione TEST pronta (${result.planId || 'id non disponibile'}). Usa il normale pulsante Regola pressioni.`
    }
  } catch (_) {
    dryPressureState.value = { ...dryPressureState.value, state: 'blocked', reason: 'Bridge Electron/controller interrotto. Nessun retry cieco.' }
    dryPressureBridgeStatus.value = 'Errore bridge: il controller non ha restituito un esito.'
  }
  await refreshDryPressureState()
}
async function restoreTestDryPressure() {
  dryPressureBridgeStatus.value = 'Rimuovo la raccomandazione TEST senza inviare input ACC…'
  try {
    const result = await getOverlayApi()?.trainingOverlayClearPressureQa?.()
    dryPressureBridgeStatus.value = result?.accepted ? 'Raccomandazione TEST rimossa.' : `Rimozione bloccata: ${result?.reason || 'fixture non disponibile.'}`
  } catch (_) {
    dryPressureState.value = { ...dryPressureState.value, state: 'blocked', reason: 'Ripristino non avviato: bridge/controller non disponibile. Nessun input inviato.' }
    dryPressureBridgeStatus.value = 'Errore bridge durante il ripristino.'
  }
  await refreshDryPressureState()
}

// ─── Composables ─────────────────────────────────────────────────────────────
const { liveLap, startLiveStatePolling, stopLiveStatePolling, resetLiveLap } =
  useLiveStatePoller(getOverlayApi, true)
const { fastState, startFastStatePolling, stopFastStatePolling } =
  useFastStatePoller(getOverlayApi, true)

const { trackingStart, trackingComplete, trackingAbandon } = useTrackingRecord(
  getOverlayApi,
  () => liveLap.value,
  () => selectedTrainingId.value,
  () => selectedModeId.value,
  () => totalSteps.value,
)

function setDebugEvent(msg: string) {
  if (import.meta.dev) console.debug('[overlay]', msg)
}

const {
  stopHoldProgress, isShortcutStopConfirmOpen,
  startStopHold, cancelStopHold,
  closeShortcutStopConfirm,
  handleGlobalStop, executeStop,
} = useStopHold(
  () => canUseStopControl.value,
  () => {
    isSaving.value = true
    try { stopSession() } finally { isSaving.value = false }
  },
  setDebugEvent,
)

const voice = useQualifyingVoice(
  getPublicPath,
  () => spotterVoice.value,
  () => true,
  () => selectedTrainingId.value,
)
const { soundEnabled, primeStepAudio, playStepDoneSound, playCountdownBeep, enqueue: enqueueVoice, enqueueStepStart, stopVoice } = voice

const overlaySizeComp = useOverlaySize(getOverlayApi, () => overlaySizePreset.value, overlayRoot)
const { cardSize, scheduleOverlaySizeSync, connectResizeObserver, disconnectResizeObserver, cleanup: cleanupSize } = overlaySizeComp


// ─── Computed ────────────────────────────────────────────────────────────────
const activeStep = computed<TrainingOverlayStep>(() =>
  selectedMode.value.steps[activeStepIndex.value] || selectedMode.value.steps[0]!
)
const totalSteps = computed(() => selectedMode.value.steps.length)
const isActiveSession = computed(() => ['running', 'paused', 'expired'].includes(phase.value))
const canManuallyAdvanceStep = computed(() => activeStep.value.durationMinutes <= 5)
const canUseStopControl = computed(() => ['running', 'paused', 'expired'].includes(phase.value))
const placementActive = ref(false)
const canUseVoicePointRecorder = computed(() => {
  if (!canUseSpotterControls.value || !showDevControls.value || typeof window === 'undefined') return false
  if (runtimeVoicePointRecorderAllowed.value) return true
  return ['localhost', '127.0.0.1', ''].includes(window.location.hostname)
})
const primaryAction = computed<PrimaryOverlayAction>(() => {
  if (isShortcutStopConfirmOpen.value) return 'none'
  if (phase.value === 'launcher') return 'open-selection'
  if (phase.value === 'select') return 'start'
  if (phase.value === 'running') return canManuallyAdvanceStep.value ? 'complete-step' : 'pause'
  if (phase.value === 'paused') return 'resume'
  if (phase.value === 'expired') return 'next'
  if (phase.value === 'completed') return 'reset'
  return 'none'
})
const primaryActionLabel = computed(() => ({
  'open-selection': 'Inizia allenamento',
  start: 'Avvia', pause: 'Pausa', resume: 'Riprendi', 'complete-step': 'Skippa',
  next: 'Avanti', reset: 'Scegli allenamento', none: 'Azione',
}[primaryAction.value]))
const stopHoldProgressPercent = computed(() => `${Math.round(stopHoldProgress.value * 100)}%`)
const progressPercent = computed(() => {
  // Stesso budget del cronometro (PIP-106): in test-mode la barra resta coerente.
  const totalMs = stepBudgetMs(activeStep.value)
  if (!totalMs) return 0
  return Math.max(0, Math.min(100, 100 - (remainingMs.value / totalMs) * 100))
})
const formattedTime = computed(() => {
  const s = Math.max(0, Math.ceil(remainingMs.value / 1000))
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
})
const activeTask = computed(() => {
  if (phase.value === 'select') return ''
  if (phase.value === 'launcher') return 'Apri la scelta allenamento.'
  if (phase.value === 'paused') return `Timer fermo. ${activeStep.value.hud}`
  if (phase.value === 'expired') return 'Step finito. Passa al prossimo.'
  if (phase.value === 'completed') return 'Allenamento completato.'
  return activeStep.value.hud
})
// Only the local development build exposes QA tools, never the installer build.
const showQuickPanelDevTools = import.meta.dev
const sessionOverlayOpacity = computed(() => {
  if (!autoDimDuringRun.value || phase.value !== 'running') return 1
  if (isPointerOnOverlaySurface.value) return 1
  const totalMs = stepBudgetMs(activeStep.value)
  if (!totalMs) return 1
  const elapsedMs = Math.max(0, totalMs - remainingMs.value)
  return elapsedMs >= AUTO_DIM_DELAY_MS && remainingMs.value > AUTO_DIM_RESTORE_MS ? AUTO_DIM_OPACITY : 1
})
const hudTransitionKey = computed(() => `${phase.value}-${activeStepIndex.value}-${activeStep.value.id}`)
// Le fasi di sessione condividono il contenuto: il cross-fade del contenitore
// scatta solo tra macro-schermate; dentro la sessione anima OverlayHud.
const contentKey = computed(() =>
  ['running', 'paused', 'expired'].includes(phase.value) ? 'session' : phase.value
)
const overlaySizePreset = computed<OverlaySizePreset>(() => {
  if (placementActive.value) return 'placement'
  if (phase.value === 'launcher') return 'launcher'
  if (phase.value === 'select') return 'select'
  if (phase.value === 'expired') return 'expired'
  if (phase.value === 'completed') return 'completed'
  return 'session'
})
const liveHudResizeKey = computed(() => [
  liveLap.value.currentLap ?? 'lap-none',
  liveLap.value.lapValid === false ? 'lap-invalid' : 'lap-valid',
].join(';'))
const overlayThemeStyle = computed(() => ({
  '--overlay-accent': phase.value === 'launcher' ? '#e5e5e5' : selectedTraining.value.accent,
  '--overlay-accent-end': phase.value === 'launcher' ? '#a3a3a3' : selectedTraining.value.accentEnd,
  '--overlay-accent-rgb': phase.value === 'launcher' ? '229, 229, 229' : selectedTraining.value.accentRgb,
  '--overlay-accent-contrast': phase.value === 'launcher' ? '#101010' : selectedTraining.value.accentContrast,
  '--overlay-transform-origin': originCorner.value.replace('-', ' '),
  '--overlay-work-area-width': `${OVERLAY_WORK_AREA_SIZE.width}px`,
  '--overlay-work-area-height': `${OVERLAY_WORK_AREA_SIZE.height}px`,
  '--overlay-session-opacity': `${sessionOverlayOpacity.value}`,
  // Resize a due fasi (PIP-94): la card transiziona verso la dimensione target
  // via CSS mentre la finestra (gia' espansa) aspetta il commit.
  ...(cardSize.value && isElectronRuntime.value
    ? {
        '--overlay-card-width': `${cardSize.value.width}px`,
        '--overlay-card-height': `${cardSize.value.height}px`,
      }
    : {}),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────
function trainingOptionStyle(training: TrainingOverlayTraining) {
  return {
    '--training-accent': training.accent, '--training-accent-end': training.accentEnd,
    '--training-accent-rgb': training.accentRgb, '--training-accent-contrast': training.accentContrast,
  }
}

// ─── Settings composable ─────────────────────────────────────────────────────
const {
  autoDimDuringRun, autoAdvanceStep, autoAdvanceSeconds, originMode, originCorner,
  isTrainingPickerOpen, isSettingsOpen, savePreferences,
  toggleTrainingPicker, toggleSettingsPanel, toggleAutoDimDuringRun, toggleAutoAdvanceStep,
  selectAutoAdvanceSeconds, toggleSound,
} = useOverlaySettings(
  getOverlayApi, soundEnabled, spotterEnabled, stopVoice, primeStepAudio,
  scheduleOverlaySizeSync, isActiveSession, closeShortcutStopConfirm,
  selectedTrainingId, selectedModeId,
)


// ─── Training selection composable ───────────────────────────────────────────
const {
  selectedTraining, selectedMode, selectedModeList, selectedPlanChips,
  selectTraining, selectMode,
} = useTrainingSelection(
  selectedTrainingId, selectedModeId,
  isActiveSession, closeShortcutStopConfirm, isTrainingPickerOpen,
  activeStepIndex, remainingMs, savePreferences, scheduleOverlaySizeSync,
)


// ─── Session orchestrator ───────────────────────────────────────────────────
let lastPrimaryActionAt = 0

const {
  clearTimer,
  startStep, startSession, openTrainingSelection,
  pauseSession, resumeSession, completeCurrentStep, skipPausedStep,
  goNextStep, stopSession, resetCompleted,
  autoAdvanceRemainingSec, cancelAutoAdvance,
} = useSessionOrchestrator(
  phase, activeStepIndex, remainingMs, selectedTrainingId, selectedModeId, isSettingsOpen,
  selectedMode, canManuallyAdvanceStep, autoAdvanceStep, autoAdvanceSeconds, closeShortcutStopConfirm, cancelStopHold,
  enqueueVoice, enqueueStepStart, () => {}, primeStepAudio, stopVoice, playStepDoneSound, playCountdownBeep,
  liveLap, startLiveStatePolling, stopLiveStatePolling, resetLiveLap,
  trackingStart, trackingComplete, trackingAbandon, savePreferences,
  stepBudgetMs,
  () => spotterEnabled.value,
)

async function closeOverlay() { await getOverlayApi()?.trainingOverlayClose?.() }
function applyInfoTargetSettings(settings: InfoTargetSettings | null | undefined) {
  if (!settings) return
  savedInfoTargetSettings = { ...settings }
  infoTargetActive.value = settings.active === true
  if (typeof settings.targetTimeMs === 'number' && settings.targetTimeMs >= 1_000) {
    infoTargetTimeMs.value = settings.targetTimeMs
  }
  infoTargetToleranceMs.value = Math.min(Math.max(Math.round(settings.toleranceMs || 500), 100), 1000)
  infoTargetKeepBetweenSessions.value = settings.keepBetweenSessions === true
}

function openInfoTargetSetup() {
  if (!infoTargetActive.value) {
    const contextual = fastState.value.info?.bestLapTimeMs
      || fastState.value.info?.lastLapTimeMs
      || fastState.value.info?.currentLapTimeMs
    if (contextual && contextual >= 1_000) {
      infoTargetTimeMs.value = Math.round(contextual / 100) * 100
    }
  }
  isTargetSetupOpen.value = true
  selectedWheelActionId.value = 'target'
  scheduleOverlaySizeSync()
}

function cancelInfoTargetSetup() {
  applyInfoTargetSettings(savedInfoTargetSettings)
  isTargetSetupOpen.value = false
  scheduleOverlaySizeSync()
}

async function confirmInfoTarget() {
  const saved = await getOverlayApi()?.infoTargetSaveSettings?.({
    targetTimeMs: infoTargetTimeMs.value,
    toleranceMs: infoTargetToleranceMs.value,
    keepBetweenSessions: infoTargetKeepBetweenSessions.value,
  }) as InfoTargetSettings | undefined
  applyInfoTargetSettings(saved)
  isTargetSetupOpen.value = false
  await getOverlayApi()?.trainingOverlayClose?.()
}


function togglePressureAudio() {
  if (!canUseSpotterControls.value) return
  togglePressureWarnings()
}

function toggleCoachAudio() {
  if (!canUseSpotterControls.value) {
    stopVoice()
    showVoicePointNotice('Login richiesto per gli avvisi vocali.', 'error')
    return
  }
  const enabled = !spotterEnabled.value
  setCoachEnabled(enabled)
  if (!enabled) stopVoice()
  void savePreferences()
  setDebugEvent(enabled ? 'avvisi giro attivati' : 'avvisi giro disattivati')
}

function returnToMainMenu() {
  if (phase.value !== 'select') return
  closeShortcutStopConfirm()
  isTrainingPickerOpen.value = false
  isSettingsOpen.value = false
  phase.value = 'launcher'
  void nextTick(() => { selectFirstWheelAction(); scheduleOverlaySizeSync() })
}

async function prepareOverlayReopen(revision?: number) {
  preparingReopen.value = true
  await nextTick()
  actionSelection.resetPointer()
  if (resetsOverlayMenuOnHide(phase.value)) {
    cancelInfoTargetSetup()
    closeSectorReferenceSetup()
    isTrainingPickerOpen.value = false
    isSettingsOpen.value = false
    closeShortcutStopConfirm()
    phase.value = 'launcher'
  }
  await nextTick()
  // A previous out-in leave may still be pending when hide arrives mid-transition.
  // Never acknowledge an empty/old content node, even with CSS animations disabled.
  const deadline = Date.now() + 1000
  while (!overlayRoot.value?.querySelector(`.overlay-content--${overlaySizePreset.value}`)
    && !placementActive.value) {
    if (Date.now() >= deadline) { preparingReopen.value = false; return }
    await new Promise(resolve => setTimeout(resolve, 16))
  }
  selectFirstWheelAction()
  await overlaySizeComp.applyOverlaySize(overlaySizePreset.value, true)
  await nextTick()
  // Settle the hidden card without its normal morph animation before acknowledging.
  void overlayRoot.value?.offsetHeight
  preparingReopen.value = false
  await nextTick()
  await interactionContract.refreshNow()
  await getOverlayApi()?.trainingOverlayPrepared?.(revision)
}

function runBackAction() {
  if (isSectorReferenceSetupOpen.value) { closeSectorReferenceSetup(); return }
  if (isTargetSetupOpen.value) { cancelInfoTargetSetup(); return }
  if (isShortcutStopConfirmOpen.value) { closeShortcutStopConfirm(); return }
  if (phase.value === 'launcher') { closeOverlay(); return }
  if (phase.value === 'select') {
    if (isTrainingPickerOpen.value || isSettingsOpen.value) {
      isTrainingPickerOpen.value = false; isSettingsOpen.value = false; scheduleOverlaySizeSync(); return
    }
    returnToMainMenu(); return
  }
  if (phase.value === 'completed') { resetCompleted(); return }
}

function runMuteAction() {
  toggleSound()
  if (!soundEnabled.value) stopVoice()
  setDebugEvent(soundEnabled.value ? 'audio attivo' : 'audio muto')
}

function executePrimaryAction() {
  const now = Date.now()
  if (now - lastPrimaryActionAt < PRIMARY_ACTION_DEBOUNCE_MS) { setDebugEvent(`debounce ${primaryAction.value}`); return }
  lastPrimaryActionAt = now; setDebugEvent(`azione: ${primaryAction.value}`)
  if (isSectorReferenceSetupOpen.value) { void sectorReferenceSetup.value?.submit(); return }
  if (isTargetSetupOpen.value) { void confirmInfoTarget(); return }
  if (isShortcutStopConfirmOpen.value) { executeStop(); return }
  const actions: Record<PrimaryOverlayAction, () => void> = {
    'open-selection': openTrainingSelection,
    start: () => {
      isSaving.value = true
      try { startSession() } finally { isSaving.value = false }
    },
    pause: pauseSession, resume: resumeSession,
    'complete-step': completeCurrentStep,
    next: () => {
      isSaving.value = true
      try { goNextStep() } finally { isSaving.value = false }
    },
    reset: resetCompleted, none: () => {},
  }
  actions[primaryAction.value]?.()
}

// ─── Contratto interazione overlay (solo Electron) ────────────────────────────
const OVERLAY_SURFACE_SELECTOR = '.overlay-card, .launcher-tools, .placement-work-area, .overlay-dev-toggle, .voice-point-notice'
const OVERLAY_CONTROL_SELECTOR = 'button, input, select, textarea, summary, .overlay-content--launcher, [data-overlay-interactive]'
const interactionContract = useOverlayInteractionContract({
  getApi: getOverlayApi,
  isForcedCapture: () => placementActive.value,
})
const { pointerState } = interactionContract
watch(() => [pointerState.movementRevision, pointerState.surfaceHovered, pointerState.x, pointerState.y], () => { actionSelection.syntheticPointer(pointerState) }, { flush: 'post' })
watch(() => pointerState.surfaceHovered, (hovered) => {
  isPointerOnOverlaySurface.value = hovered
})

// ─── Input handling ───────────────────────────────────────────────────────────
function showVoicePointNotice(text: string, tone: 'ok' | 'error' = 'ok') {
  voicePointNotice.value = { text, tone }
  if (voicePointNoticeTimer) clearTimeout(voicePointNoticeTimer)
  voicePointNoticeTimer = setTimeout(() => {
    voicePointNotice.value = null
    voicePointNoticeTimer = null
    scheduleOverlaySizeSync()
  }, 2800)
  scheduleOverlaySizeSync()
}

function toggleTrackVoiceReferences() {
  if (!canUseSpotterControls.value) {
    showVoicePointNotice('Login richiesto per i riferimenti vocali.', 'error')
    return
  }
  const enabled = !trackVoiceReferencesEnabled.value
  setReferencesEnabled(enabled)
  showVoicePointNotice(enabled ? 'Riferimenti vocali attivi.' : 'Riferimenti vocali disattivi.', 'ok')
}

function toggleVoicePointRecorder() {
  if (!canUseSpotterControls.value) {
    showVoicePointNotice('Login richiesto per registrare riferimenti.', 'error')
    return
  }
  if (!canUseVoicePointRecorder.value) return
  voicePointRecorderEnabled.value = !voicePointRecorderEnabled.value
  showVoicePointNotice(
    voicePointRecorderEnabled.value ? 'Modalita riferimenti attiva. Premi Spazio per salvare.' : 'Modalita riferimenti disattiva.',
    'ok',
  )
}

async function recordVoicePointFromCurrentPosition() {
  if (!voicePointRecorderEnabled.value || !canUseVoicePointRecorder.value) return
  const position = fastState.value.normalizedCarPosition
  if (position === null) {
    showVoicePointNotice('Posizione non disponibile: avvia il logger e torna in pista.', 'error')
    return
  }
  const api = getOverlayApi()
  if (!api?.recordVoicePoint) {
    showVoicePointNotice('Recorder non disponibile in questo runtime.', 'error')
    return
  }
  const track = liveLap.value.track
  const car = liveLap.value.car
  if (!track) {
    showVoicePointNotice('Pista non disponibile: aspetta live_state prima di salvare.', 'error')
    return
  }
  try {
    const result = await api.recordVoicePoint({
      track,
      car,
      type: 'braking_reference',
      normalizedCarPosition: position,
    })
    if (!result?.ok) {
      showVoicePointNotice(result?.error || 'Riferimento non salvato.', 'error')
      return
    }
    showVoicePointNotice(`Riferimento salvato: ${track}${car ? ` - ${car}` : ''} - ${position.toFixed(3)}`, 'ok')
  } catch (error: any) {
    showVoicePointNotice(error?.message || 'Riferimento non salvato.', 'error')
  }
}
function handleOverlayCommand(payload: OverlayCommand | { command?: OverlayCommand | 'origin-corner'; revision?: number; originCorner?: string }) {
  const command = typeof payload === 'string' ? payload : payload?.command
  if (command === 'origin-corner' && typeof payload !== 'string') {
    originCorner.value = resolveOverlayOriginCorner(payload.originCorner)
    return
  }
  if (placementActive.value) return
  setDebugEvent(`comando overlay: ${command || 'vuoto'}`)
  if (command === 'prepare-reopen') { void prepareOverlayReopen(typeof payload === 'string' ? undefined : payload.revision); return }
  if (command === 'main-menu') { returnToMainMenu(); return }
  if (command === 'primary') executePrimaryAction()
  if (command === 'next-action') selectNextWheelAction()
  if (command === 'activate-action') activateSelectedWheelAction()
  if (command === 'reset-action-selection') selectFirstWheelAction()
  if (command === 'back') runBackAction()
  if (command === 'mute') runMuteAction()
  if (command === 'stop') handleGlobalStop()
}

function handleLocalShortcut(event: KeyboardEvent) {
  if (placementActive.value) return
  if (voicePointRecorderEnabled.value && event.code === 'Space' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault()
    if (!event.repeat) void recordVoicePointFromCurrentPosition()
    return
  }
  if (event.key === 'Escape' && isShortcutStopConfirmOpen.value) {
    event.preventDefault(); closeShortcutStopConfirm(); return
  }
  const command = resolveOverlayKeyboardCommand(event)
  if (!command) return
  event.preventDefault()
  if (event.repeat) return
  if (command === 'toggle') return
  if (command === 'primary') { executePrimaryAction(); return }
  if (command === 'back') { runBackAction(); return }
  if (command === 'mute') { runMuteAction(); return }
  if (command === 'stop') { handleGlobalStop() }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
let removeCommandListener: (() => void) | undefined
let removeInfoTargetListener: (() => void) | undefined
let removePlacementListener: (() => void) | undefined

onMounted(async () => {
  document.body.classList.add('training-overlay-runtime')
  initTestMode()
  const api = getOverlayApi()
  isElectronRuntime.value = !!api
  const settings = await api?.trainingOverlayGetSettings?.() as TrainingOverlaySettings | undefined
  const targetSettings = await api?.infoTargetGetSettings?.() as InfoTargetSettings | undefined
  applyInfoTargetSettings(targetSettings)
  selectedTrainingId.value = resolveTrainingOverlayTrainingId(settings?.lastTrainingId)
  selectedModeId.value = resolveTrainingOverlayModeId(settings?.lastDurationId)
  soundEnabled.value = settings?.soundEnabled !== false
  runtimeVoicePointRecorderAllowed.value = settings?.enableVoicePointRecorder === true
  autoDimDuringRun.value = settings?.autoDimDuringRun !== false
  autoAdvanceStep.value = settings?.autoAdvanceStep !== false
  autoAdvanceSeconds.value = resolveAutoAdvanceSeconds(settings?.autoAdvanceSeconds)
  originMode.value = resolveOverlayOriginMode(settings?.originMode)
  originCorner.value = resolveOverlayOriginCorner(settings?.originCorner)
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  phase.value = 'launcher'
  await nextTick()
  selectFirstWheelAction()
  loadSpotterVoiceSettings()
  startLiveStatePolling()
  startFastStatePolling()
  await refreshDryPressureState()
  dryPressureActivity.start()
  await refreshQaBotState()
  qaBotActivity.start()
  removeCommandListener = api?.onTrainingOverlayCommand?.(handleOverlayCommand)
  removePlacementListener = api?.onHudOverlayPlacement?.((active: boolean) => {
    placementActive.value = active === true
  })
  placementActive.value = (await api?.hudOverlayIsPositioning?.()) === true
  removeInfoTargetListener = api?.onInfoTargetSettings?.((next: InfoTargetSettings) => {
    if (!isTargetSetupOpen.value) applyInfoTargetSettings(next)
  })
  window.addEventListener('keydown', handleLocalShortcut, true)
  if (api?.overlayInteractionUpdateContract) {
    interactionContract.start({
      surfaceSelector: OVERLAY_SURFACE_SELECTOR,
      controlSelector: OVERLAY_CONTROL_SELECTOR,
    })
  }
  connectResizeObserver(); scheduleOverlaySizeSync()
  await api?.overlayRegionReady?.()
})
watch(() => spotterEnabled.value, () => {
  void savePreferences()
})

watch(canUseSpotterControls, (canUse) => {
  if (canUse) return
  voicePointRecorderEnabled.value = false
  stopVoice()
})


watch(isShortcutStopConfirmOpen, (open) => {
  if (open) actionSelection.select('confirm-stop', true)
  else actionSelection.refresh()
}, { flush: 'post' })

watch(
  [phase, placementActive, selectedTrainingId, selectedModeId, soundEnabled, originMode, originCorner,
    spotterEnabled, trackVoiceReferencesEnabled, isTrainingPickerOpen, isSettingsOpen, isTargetSetupOpen, isSectorReferenceSetupOpen, liveHudResizeKey],
  () => { scheduleOverlaySizeSync(); actionSelection.refresh() },
  { flush: 'post' }
)

watch(
  phase,
  () => {
    const api = getOverlayApi()
    if (!api?.overlayInteractionUpdateContract) return
    interactionContract.refresh()
  },
  { flush: 'post' }
)

watch(presentationVisible, async (visible) => {
  if (!visible) return
  await nextTick()
  connectResizeObserver()
  scheduleOverlaySizeSync()
  interactionContract.refresh()
}, { flush: 'post' })

onBeforeUnmount(() => {
  dryPressureActivity.stop()
  qaBotActivity.stop()
  clearTimer(); cancelStopHold(); stopLiveStatePolling(); stopFastStatePolling(); stopVoice(); cleanupSize()
  if (voicePointNoticeTimer) clearTimeout(voicePointNoticeTimer)
  removeCommandListener?.()
  removePlacementListener?.()
  removeInfoTargetListener?.()
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleLocalShortcut, true)
    interactionContract.stop()
  }
  document.body.classList.remove('training-overlay-runtime')
})
</script>

<template>
  <main
    v-if="presentationVisible || preparingReopen"
    ref="overlayRoot"
    @pointermove="actionSelection.pointerMove"
    @focusin="actionSelection.focus($event.target)"
    class="training-overlay"
    :style="overlayThemeStyle"
    :class="[
      `training-overlay--${phase}`,
      `training-overlay--tone-${selectedTraining.tone}`,
      `training-overlay--origin-${originCorner}`,
      {
        'training-overlay--drag': placementActive,
        'training-overlay--preparing': preparingReopen,
        'training-overlay--web': !isElectronRuntime,
        'training-overlay--voice-points': voicePointRecorderEnabled,
      }
    ]"
  >
    <OverlaySoftwareCursor :state="pointerState" />
    <!-- Controlli dev (PIP-106): solo in sviluppo. Il badge appare quando ON. -->
    <button
      v-if="showDevControls && phase !== 'launcher'"
      type="button"
      class="overlay-dev-toggle"
      :aria-pressed="isTestMode"
      title="Test-mode: comprime il cronometro degli step (solo sviluppo)"
      @click="toggleTestMode"
    >
      {{ isTestMode ? 'TEST ON' : 'TEST OFF' }}
    </button>

    <button
      v-if="canUseVoicePointRecorder && phase !== 'launcher'"
      type="button"
      class="overlay-dev-toggle overlay-dev-toggle--voice-points"
      :aria-pressed="voicePointRecorderEnabled"
      title="Voice Points: salva un riferimento con Spazio (solo localhost/dev)"
      @click="toggleVoicePointRecorder"
    >
      {{ voicePointRecorderEnabled ? 'REF ON' : 'REF OFF' }}
    </button>
    <TestModeBadge v-if="phase !== 'launcher'" class="overlay-test-badge" />
    <Transition name="chip-pop">
      <div
        v-if="voicePointNotice"
        class="voice-point-notice"
        :class="`voice-point-notice--${voicePointNotice.tone}`"
        role="status"
      >
        {{ voicePointNotice.text }}
      </div>
    </Transition>

    <div class="overlay-work-area">
      <section
        v-if="placementActive"
        key="placement"
        class="placement-work-area overlay-card"
        aria-label="Posiziona pannello Ctrl+K"
      >
        <strong>Pannello Ctrl+K</strong>
        <span>Trascina per spostare</span>
        <small>Salva e blocca dalla scheda HUD</small>
      </section>

      <Transition name="overlay-surface" mode="out-in">
        <!-- Contenitore unico persistente (PIP-93): il morphing e' l'animazione
             di resize della finestra; dentro, il contenuto si avvicenda in cross-fade. -->
        <section v-if="phase !== 'loading'" v-show="!placementActive" key="card" class="overlay-card">
          <Transition name="content-swap" :css="!preparingReopen" :mode="preparingReopen ? undefined : 'out-in'" @after-enter="actionSelection.refresh()">
            <div
              :key="contentKey"
              :class="[
                'overlay-content',
                `overlay-content--${overlaySizePreset}`,
                { 'overlay-content--target': isTargetSetupOpen || isSectorReferenceSetupOpen },
              ]"
            >

              <template v-if="phase === 'launcher'">
                <div v-if="!isTargetSetupOpen && !isSectorReferenceSetupOpen" class="launcher-tools" aria-label="Strumenti live overlay">
                  <header class="launcher-tools__header">
                    <img class="quick-panel-logo" src="/branding/auth/racercore-rc.svg" alt="Racer Core" width="56" height="28">
                  </header>
                  <div class="launcher-tools__actions">
                    <button
                      type="button"
                      class="launcher-tool-button launcher-tool-button--training"
                      :class="{ 'is-selected': selectedWheelActionId === 'training' }"
                      data-overlay-wheel-action="training"
                      :aria-label="primaryActionLabel"
                      :aria-current="selectedWheelActionId === 'training' ? 'true' : undefined"
                      @focus="selectedWheelActionId = 'training'"
                      @click="executePrimaryAction"
                    >
                      Allenamento
                    </button>
                    <QuickPanelVoiceControls
                      :coach="spotterEnabled"
                      :references="trackVoiceReferencesEnabled"
                      :pressure="pressureWarningsEnabled"
                      :target="targetLapVoiceEnabled"
                      :disabled="!canUseSpotterControls"
                      @toggle-coach="toggleCoachAudio"
                      @toggle-references="toggleTrackVoiceReferences"
                      @toggle-pressure="togglePressureAudio"
                      @toggle-target="setTargetLapVoiceEnabled(!targetLapVoiceEnabled)"
                    />
                    <section class="quick-panel-section" aria-label="Riferimenti numerici">
                      <h2 class="quick-panel-heading">Riferimenti</h2>
                      <div class="quick-panel-pair">
                    <button
                      type="button"
                      class="launcher-tool-button launcher-tool-button--target"
                      :class="{ 'is-active': infoTargetActive, 'is-selected': selectedWheelActionId === 'target' }"
                      data-overlay-wheel-action="target"
                      :aria-pressed="infoTargetActive"
                      :aria-current="selectedWheelActionId === 'target' ? 'true' : undefined"
                      aria-label="Configura Target giro HUD Info"
                      @focus="selectedWheelActionId = 'target'"
                      @click="openInfoTargetSetup"
                    >
                      Target giro
                    </button>
                    <button type="button" class="launcher-tool-button" data-overlay-wheel-action="sector-references" @click="isSectorReferenceSetupOpen = true">
                      Settori
                    </button>
                      </div>
                    </section>
                    <section class="quick-panel-section quick-panel-automations" aria-label="Automazioni">
                      <h2 class="quick-panel-heading">Carburante</h2>
                    <SetupFuelPanel :api="getOverlayApi()" />
                    <div class="quick-panel-pair quick-panel-secondary">
                    <PitwallOverlayButton
                      :api="getOverlayApi()"
                      :selected="selectedWheelActionId === 'pitwall'"
                      data-overlay-wheel-action="pitwall"
                      @focus="selectedWheelActionId = 'pitwall'"
                    />
                    <button
                      type="button"
                      class="launcher-tool-button launcher-tool-button--training launcher-tool-button--pressure"
                      :class="{ 'is-ready': dryPressureState.state === 'ready', 'is-selected': selectedWheelActionId === 'pressure' }"
                      data-overlay-wheel-action="pressure"
                      @focus="selectedWheelActionId = 'pressure'"
                      :aria-label="dryPressurePresentation.ariaLabel"
                      :title="dryPressurePresentation.ariaLabel + ': ' + dryPressurePresentation.guidance"
                      :data-state="isDryPressureApplying ? 'pending' : dryPressureState.state === 'ready' ? 'ready' : 'unavailable'"
                      :aria-busy="isDryPressureApplying"
                      :disabled="isDryPressureApplying || dryPressureState.state !== 'ready'"
                      @click="applyDryPressure"
                    >
                      <LoaderCircle v-if="isDryPressureApplying" class="quick-state-icon" :size="16" aria-hidden="true" />
                      <CircleCheck v-else-if="dryPressureState.state === 'ready'" class="quick-state-icon" :size="16" aria-hidden="true" />
                      <CircleMinus v-else class="quick-state-icon" :size="16" aria-hidden="true" />
                      <span>Pressioni</span>
                    </button>
                    </div>
                    <button v-if="dryPressureState.qaAvailable" type="button" class="launcher-tool-button launcher-tool-button--target" @click="testDryPressure">Genera raccomandazione TEST</button>
                    <p v-if="dryPressureState.qaAvailable" class="launcher-hint" role="status">Test pressioni: {{ dryPressureBridgeStatus }}</p>
                    <button v-if="dryPressureState.qaActive" type="button" class="launcher-tool-button launcher-tool-button--target" @click="restoreTestDryPressure">Rimuovi raccomandazione TEST</button>
                    <div
                      v-if="dryPressurePresentation.alert"
                      class="pressure-invalid-lap-alert"
                      role="status"
                      aria-live="polite"
                    >
                      <span class="pressure-invalid-lap-alert__icon" aria-hidden="true">!</span>
                      <span class="pressure-invalid-lap-alert__copy">
                        <strong>{{ dryPressurePresentation.alert.title }}</strong>
                        <span>{{ dryPressurePresentation.alert.guidance }}</span>
                      </span>
                    </div>
                  <p v-if="dryPressureState.actionReasonCode" id="pressure-action-status" class="launcher-hint" role="status" aria-live="polite">
                    Pressioni: {{ dryPressurePresentation.stateLabel }} · {{ dryPressurePresentation.guidance }}
                  </p>
                  <div v-if="dryPressureState.recommendation?.wheels" class="pressure-plan" role="status" aria-label="Anteprima regolazione pressioni Setup">
                    <div class="pressure-plan__meta">
                      <span>{{ dryPressureState.recommendation?.completed_laps || 0 }}/3 giri</span>
                      <span v-if="(dryPressureState.recommendation?.required_valid_laps ?? 1) > 0">{{ dryPressureState.recommendation?.valid_laps || 0 }}/{{ dryPressureState.recommendation?.required_valid_laps ?? 1 }} valido</span>
                      <strong>{{ dryPressureState.recommendation?.compound || '—' }}</strong>
                    </div>
                    <table v-if="dryPressureState.recommendation?.wheels" class="pressure-plan__table">
                      <thead><tr><th>Gomma</th><th>AVG</th><th>Persa</th><th>Comp.</th><th>Target</th><th>± click</th></tr></thead>
                      <tbody>
                        <tr v-for="row in dryPressureState.preview || []" :key="row.wheel">
                          <th>{{ row.wheel }}</th><td>{{ row.averagePsi?.toFixed?.(2) ?? '—' }}</td><td>{{ row.totalLossPsi?.toFixed?.(1) ?? '—' }}</td><td>{{ row.compensatedPsi?.toFixed?.(1) ?? '—' }}</td><td>{{ row.targetPsi?.toFixed?.(1) ?? '—' }}</td><td class="pressure-plan__clicks">{{ row.clicks > 0 ? '+' : '' }}{{ row.clicks ?? '—' }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p v-if="dryPressureState.recommendation?.wheels" class="pressure-plan__note">AVG + persa = compensata · il setup cambia dei click indicati.</p>
                    <p v-else class="pressure-plan__empty">{{ dryPressurePresentation.guidance }}</p>
                  </div>

                    </section>
                    <details v-if="showQuickPanelDevTools" class="quick-panel-dev">
                      <summary>Strumenti sviluppo</summary>
                      <button type="button" class="launcher-tool-button" :aria-pressed="isTestMode" @click="toggleTestMode">Test timer</button>
                      <button v-if="canUseVoicePointRecorder" type="button" class="launcher-tool-button" :aria-pressed="voicePointRecorderEnabled" @click="toggleVoicePointRecorder">Registra riferimenti</button>
                    <button
                      type="button"
                      class="launcher-tool-button launcher-tool-button--training"
                      :class="{ 'is-active': qaBotView.active }"
                      :aria-pressed="qaBotView.active"
                      :disabled="qaBotView.pending"
                      @click="toggleQaBot"
                    >
                      {{ qaBotView.label }}
                    </button>
                    <p class="launcher-hint" role="status" aria-live="polite">
                      Bot: {{ qaBotView.stateLabel }} · {{ qaBotView.reason }}
                      <template v-if="qaBotState.state === 'ACTIVE'">
                        · {{ qaBotState.speedKmh ?? 0 }} km/h · giri validi {{ qaBotState.lapsValid }}/{{ qaBotState.lapsCompleted }}
                      </template>
                    </p>
                    </details>
                  </div>
                </div>
                <InfoTargetSetup
                  v-else-if="isTargetSetupOpen"
                  :target-time-ms="infoTargetTimeMs"
                  :tolerance-ms="infoTargetToleranceMs"
                  :keep-between-sessions="infoTargetKeepBetweenSessions"
                  @set-target-time="infoTargetTimeMs = $event"
                  @select-tolerance="infoTargetToleranceMs = $event"
                  @toggle-keep="infoTargetKeepBetweenSessions = !infoTargetKeepBetweenSessions"
                  @confirm="confirmInfoTarget"
                  @cancel="cancelInfoTargetSetup"
                />
                <SectorReferenceSetup v-else-if="isSectorReferenceSetupOpen" ref="sectorReferenceSetup" keyboard-overlay @cancel="closeSectorReferenceSetup" @saved="saveSectorReferenceSetup" />
              </template>

              <template v-else-if="phase === 'completed'">
                <div v-if="!soundEnabled" class="overlay-topline">
                  <div class="overlay-topline-actions">
                    <em class="mute-chip" role="status" aria-label="Audio disattivato">MUTO</em>
                  </div>
                </div>
                <div class="completed-banner" role="status">
                  <span class="completed-check" aria-hidden="true">&#10003;</span>
                  <strong>Allenamento completato</strong>
                </div>
                <div class="overlay-actions">
                  <button type="button" class="primary" data-overlay-wheel-action="reset-training" :aria-label="primaryActionLabel" @click="executePrimaryAction">
                    {{ primaryActionLabel }}
                    <span class="key-hint" aria-hidden="true">Ctrl+N</span>
                  </button>
                </div>
              </template>

              <template v-else-if="phase === 'select'">
                <button type="button" class="utility-action overlay-menu-back" data-overlay-wheel-action="main-menu" @click="returnToMainMenu">← Menu principale</button>
                <div class="overlay-main">
                  <div v-if="!soundEnabled" class="overlay-topline">
                    <div class="overlay-topline-actions">
                      <em class="mute-chip" role="status" aria-label="Audio disattivato">MUTO</em>
                    </div>
                  </div>
                  <h1>{{ selectedTraining.title }}</h1>
                  <OverlaySelectSetup
            :selected-training="selectedTraining"
            :selected-training-id="selectedTrainingId"
            :training-overlay-training-list="trainingOverlayTrainingList"
            :selected-mode-list="selectedModeList"
            :selected-mode-id="selectedModeId"
            :selected-mode="selectedMode"
            :selected-plan-chips="selectedPlanChips"
            :sound-enabled="soundEnabled"
            :auto-dim-during-run="autoDimDuringRun"
            :overlay-shortcuts="overlayShortcuts"
            :is-training-picker-open="isTrainingPickerOpen"
            :is-settings-open="isSettingsOpen"
            @select-training="selectTraining"
            @select-mode="selectMode"
            @toggle-training-picker="toggleTrainingPicker"
            @toggle-settings="toggleSettingsPanel"
            :auto-advance-step="autoAdvanceStep"
            :auto-advance-seconds="autoAdvanceSeconds"
            @toggle-sound="toggleSound"
                    @toggle-auto-dim="toggleAutoDimDuringRun"
                    @toggle-auto-advance="toggleAutoAdvanceStep"
                    @select-auto-advance-seconds="selectAutoAdvanceSeconds"
                  />
                </div>
                <div class="overlay-actions">
                  <button type="button" class="primary" data-overlay-wheel-action="start-training" :aria-label="primaryActionLabel" @click="executePrimaryAction">
                    {{ primaryActionLabel }}
                    <span class="key-hint" aria-hidden="true">Ctrl+N</span>
                  </button>

                </div>
                <p class="launcher-hint" aria-hidden="true">
                  Ctrl+K chiude &middot; Ctrl+N avvia
                </p>
              </template>

              <template v-else>
                <div class="overlay-main">
                  <OverlayHud
                    :active-step="activeStep"
                    :active-step-index="activeStepIndex"
                    :total-steps="totalSteps"
                    :active-task="activeTask"
                    :formatted-time="formattedTime"
                    :live-lap="liveLap"
                    :phase="phase"
                    :progress-percent="progressPercent"
                    :hud-transition-key="hudTransitionKey"
                    :is-shortcut-stop-confirm-open="isShortcutStopConfirmOpen"
                    :is-saving="isSaving"
                    :muted="!soundEnabled"
                    :auto-advance-remaining-sec="autoAdvanceRemainingSec"
                    :auto-advance-total-sec="autoAdvanceSeconds"
                    @cancel-auto-advance="cancelAutoAdvance"
                  />
                </div>
                <div class="overlay-actions">
                  <button
                    type="button"
                    class="primary"
                    :data-overlay-wheel-action="isShortcutStopConfirmOpen ? 'confirm-stop' : primaryAction"
                    :aria-label="isShortcutStopConfirmOpen ? 'Conferma stop sessione' : primaryActionLabel"
                    @click="executePrimaryAction"
                  >
                    {{ isShortcutStopConfirmOpen ? 'Conferma' : primaryActionLabel }}
                    <span v-if="!isShortcutStopConfirmOpen" class="key-hint" aria-hidden="true">Ctrl+N</span>
                  </button>
                  <Transition name="chip-pop">
                    <button
                      v-if="phase === 'paused' && !isShortcutStopConfirmOpen"
                      type="button"
                      class="utility-action skip-step-action"
                      data-overlay-wheel-action="skip-step"
                      aria-label="Skippa lo step corrente"
                      title="Skippa step"
                      @click="skipPausedStep"
                    >
                      Skippa step
                    </button>
                  </Transition>
                  <button
                    v-if="!isShortcutStopConfirmOpen"
                    type="button"
                    data-overlay-wheel-action="stop-training"
                    class="secondary-action danger-action stop-hold-action"
                    :class="{ 'is-holding': stopHoldProgress > 0 }"
                    :style="{ '--stop-progress': stopHoldProgressPercent }"
                    aria-label="Stop: tieni premuto col mouse oppure attiva e conferma dal volante"
                    @click="$event.detail === 0 && handleGlobalStop()"
                    @pointerdown.prevent="startStopHold('pointer')"
                    @pointerup.prevent="cancelStopHold"
                    @pointerleave="cancelStopHold"
                    @pointercancel="cancelStopHold"
                    @keydown.space.prevent="startStopHold('keyboard')"
                    @keyup.space.prevent="cancelStopHold"
                  >
                    Stop
                  </button>
                  <button v-else type="button" class="secondary-action" data-overlay-wheel-action="cancel-stop" @click="closeShortcutStopConfirm">
                    Annulla stop
                  </button>
                </div>
              </template>

            </div>
          </Transition>
        </section>
      </Transition>
    </div>

  </main>
</template>

<style lang="scss">
@use '~/assets/scss/training-overlay' as *;

.pressure-plan {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 7px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  background: rgba(2, 6, 12, 0.28);
  color: rgba(238, 248, 244, 0.78);
  font-variant-numeric: tabular-nums;
}

.pressure-plan__meta {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 9px;
  font-weight: 800;

  strong { margin-left: auto; color: #f6fff9; }
}

.pressure-plan__table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 8px;
  line-height: 1.15;
  text-align: right;

  th, td { padding: 3px 2px; white-space: nowrap; }
  thead th { color: rgba(226, 238, 247, 0.5); font-size: 7px; font-weight: 850; }
  thead th:first-child, tbody th { text-align: left; }
  tbody tr { border-top: 1px solid rgba(255, 255, 255, 0.06); }
  tbody th { color: #f6fff9; font-weight: 950; }
}

.pressure-plan__clicks { color: #86efac; font-weight: 950; }
.pressure-plan__note, .pressure-plan__empty { margin: 0; color: rgba(226, 238, 247, 0.52); font-size: 8px; line-height: 1.2; text-align: left; }
</style>
