<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
  qualifyingVoiceOptions,
  resolveQualifyingVoiceId,
  type QualifyingVoiceId,
  type QualifyingVoiceScenario
} from '~/config/qualifyingVoiceNotifications'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useTrackingRecord } from '~/composables/useTrackingRecord'
import { useStopHold } from '~/composables/useStopHold'
import { useQualifyingVoice } from '~/composables/useQualifyingVoice'
import { useSpotterController } from '~/composables/useSpotterController'
import { useSpotterVoice } from '~/composables/useSpotterVoice'
import { useOverlaySize } from '~/composables/useOverlaySize'
import { useTrainingSelection, type PlanPreviewChip } from '~/composables/useTrainingSelection'
import { useSessionOrchestrator } from '~/composables/useSessionOrchestrator'
import {
  useOverlaySettings, resolveOverlayOriginCorner, resolveOverlayOriginMode,
  resolveAutoAdvanceSeconds, originCornerOptions,
  type OverlayOriginCorner, type OverlayOriginMode,
} from '~/composables/useOverlaySettings'
import OverlaySelectSetup from '~/components/overlay/OverlaySelectSetup.vue'
import OverlayHud from '~/components/overlay/OverlayHud.vue'
import TyreSlipHud from '~/components/overlay/TyreSlipHud.vue'
import TestModeBadge from '~/components/overlay/TestModeBadge.vue'
import { resolveOverlayKeyboardCommand, type OverlayInputCommand } from '~/services/overlay/overlayInputModel'
import { usePublicPath } from '~/composables/usePublicPath'
import { useDevTestMode } from '~/composables/useDevTestMode'

definePageMeta({ layout: false })

const { getPublicPath } = usePublicPath()

useHead({
  htmlAttrs: { class: 'training-overlay-document' },
  bodyAttrs: { class: 'training-overlay-runtime' },
})

// ─── Types ───────────────────────────────────────────────────────────────────
type OverlayPhase = 'loading' | 'placement' | 'launcher' | 'select' | 'running' | 'paused' | 'expired' | 'completed'
type OverlayCommand = Exclude<OverlayInputCommand, 'toggle'>
type OverlaySizePreset = 'launcher' | 'placement' | 'select' | 'session' | 'expired' | 'completed'
type OverlaySize = { width: number; height: number }
type PrimaryOverlayAction = 'confirm-placement' | 'open-selection' | 'start' | 'pause' | 'resume' | 'complete-step' | 'next' | 'reset' | 'none'

interface TrainingOverlaySettings {
  hasConfiguredPosition?: boolean; lastTrainingId?: string
  lastDurationId?: TrainingOverlayDurationModeId; soundEnabled?: boolean
  spotterEnabled?: boolean
  autoDimDuringRun?: boolean; autoAdvanceStep?: boolean; autoAdvanceSeconds?: number
  originMode?: OverlayOriginMode
  originCorner?: OverlayOriginCorner; qualifyingVoiceId?: QualifyingVoiceId
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
const spotterEnabled = ref(false)
// Solo evidenziazione visiva del focus mouse/tab: nessun effetto sui comandi
// globali (PIP-96), Ctrl+N nel launcher avvia sempre l'allenamento.
const launcherToolIndex = ref(0)
const overlayRoot = ref<HTMLElement | null>(null)
const isPointerOnOverlaySurface = ref(false)
const showDevControls = import.meta.dev
const isSaving = ref(false)

// Test-mode dev (PIP-106): comprime il budget del cronometro senza falsare
// l'identità degli step. Sorgente unica usata da timer, barra e auto-dim.
const { isTestMode, toggle: toggleTestMode, stepBudgetMs, init: initTestMode } = useDevTestMode()

// ─── API bridge ──────────────────────────────────────────────────────────────
function getOverlayApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

// ─── Composables ─────────────────────────────────────────────────────────────
const { liveLap, startLiveStatePolling, stopLiveStatePolling, resetLiveLap } =
  useLiveStatePoller(getOverlayApi)
const { fastState, startFastStatePolling, stopFastStatePolling } =
  useFastStatePoller(getOverlayApi)

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
  () => selectedQualifyingVoiceId.value,
  () => true,
  () => selectedTrainingId.value,
)
const { soundEnabled, primeStepAudio, playStepDoneSound, playCountdownBeep, enqueue: enqueueVoice, enqueueStepStart, announceLap, stopVoice } = voice

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
const showPlacementControl = computed(() => isElectronRuntime.value || showDevControls)
const primaryAction = computed<PrimaryOverlayAction>(() => {
  if (isShortcutStopConfirmOpen.value) return 'none'
  if (phase.value === 'placement') return 'confirm-placement'
  if (phase.value === 'launcher') return 'open-selection'
  if (phase.value === 'select') return 'start'
  if (phase.value === 'running') return canManuallyAdvanceStep.value ? 'complete-step' : 'pause'
  if (phase.value === 'paused') return 'resume'
  if (phase.value === 'expired') return 'next'
  if (phase.value === 'completed') return 'reset'
  return 'none'
})
const primaryActionLabel = computed(() => ({
  'confirm-placement': 'Usa posizione', 'open-selection': 'Inizia allenamento',
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
  if (phase.value === 'placement') return 'Trascina il box, poi conferma.'
  if (phase.value === 'select') return ''
  if (phase.value === 'launcher') return 'Apri la scelta allenamento.'
  if (phase.value === 'paused') return `Timer fermo. ${activeStep.value.hud}`
  if (phase.value === 'expired') return 'Step finito. Passa al prossimo.'
  if (phase.value === 'completed') return 'Allenamento completato.'
  return activeStep.value.hud
})
const spotterToggleLabel = computed(() => spotterEnabled.value ? 'Disattiva spotter' : 'Attiva spotter')
const launcherSpotterStatus = computed(() => {
  if (!spotterEnabled.value) return 'Spotter spento'
  if (isSpotterPolling.value) return lastSpotterEvent.value?.messageText || 'Spotter attivo'
  return spotterStatusLabel.value
})
const sessionOverlayOpacity = computed(() => {
  if (!autoDimDuringRun.value || phase.value !== 'running') return 1
  if (isPointerOnOverlaySurface.value) return 1
  const totalMs = stepBudgetMs(activeStep.value)
  if (!totalMs) return 1
  const elapsedMs = Math.max(0, totalMs - remainingMs.value)
  return elapsedMs >= AUTO_DIM_DELAY_MS && remainingMs.value > AUTO_DIM_RESTORE_MS ? AUTO_DIM_OPACITY : 1
})
const selectedOriginLabel = computed(() =>
  originCornerOptions.find(o => o.id === originCorner.value)?.label || 'Alto sx'
)
const hudTransitionKey = computed(() => `${phase.value}-${activeStepIndex.value}-${activeStep.value.id}`)
// Le fasi di sessione condividono il contenuto: il cross-fade del contenitore
// scatta solo tra macro-schermate; dentro la sessione anima OverlayHud.
const contentKey = computed(() =>
  ['running', 'paused', 'expired'].includes(phase.value) ? 'session' : phase.value
)
const overlaySizePreset = computed<OverlaySizePreset>(() => {
  if (phase.value === 'launcher') return 'launcher'
  if (phase.value === 'placement') return 'placement'
  if (phase.value === 'select') return 'select'
  if (phase.value === 'expired') return 'expired'
  if (phase.value === 'completed') return 'completed'
  return 'session'
})
const overlayThemeStyle = computed(() => ({
  '--overlay-accent': selectedTraining.value.accent,
  '--overlay-accent-end': selectedTraining.value.accentEnd,
  '--overlay-accent-rgb': selectedTraining.value.accentRgb,
  '--overlay-accent-contrast': selectedTraining.value.accentContrast,
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
  autoDimDuringRun, autoAdvanceStep, autoAdvanceSeconds, originMode, originCorner, selectedQualifyingVoiceId,
  isTrainingPickerOpen, isSettingsOpen, savePreferences,
  toggleTrainingPicker, toggleSettingsPanel, toggleAutoDimDuringRun, toggleAutoAdvanceStep,
  selectAutoAdvanceSeconds, selectOriginCorner, selectQualifyingVoice, toggleSound,
} = useOverlaySettings(
  getOverlayApi, soundEnabled, spotterEnabled, stopVoice, primeStepAudio,
  scheduleOverlaySizeSync, isActiveSession, closeShortcutStopConfirm,
  selectedTrainingId, selectedModeId,
)

const spotterVoice = useSpotterVoice(
  getPublicPath,
  () => selectedQualifyingVoiceId.value,
  () => spotterEnabled.value && soundEnabled.value,
)
const {
  lastSpotterEvent,
  isSpotterPolling,
  spotterStatusLabel,
  startSpotter,
  stopSpotter,
} = useSpotterController(
  getOverlayApi,
  () => spotterEnabled.value,
  spotterVoice.enqueueSpotterEvent,
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
  enqueueVoice, enqueueStepStart, announceLap, primeStepAudio, stopVoice, playStepDoneSound, playCountdownBeep,
  liveLap, startLiveStatePolling, stopLiveStatePolling, resetLiveLap,
  trackingStart, trackingComplete, trackingAbandon, savePreferences,
  stepBudgetMs,
)

function enterPlacementMode() {
  if (isActiveSession.value) return
  closeShortcutStopConfirm(); isSettingsOpen.value = false; isTrainingPickerOpen.value = false
  originMode.value = 'manual'; phase.value = 'placement'
}

async function confirmPlacement() {
  closeShortcutStopConfirm()
  const settings = await getOverlayApi()?.trainingOverlayConfirmPlacement?.()
  selectedTrainingId.value = resolveTrainingOverlayTrainingId(settings?.lastTrainingId || selectedTrainingId.value)
  selectedModeId.value = resolveTrainingOverlayModeId(settings?.lastDurationId || selectedModeId.value)
  originMode.value = resolveOverlayOriginMode(settings?.originMode || originMode.value)
  originCorner.value = resolveOverlayOriginCorner(settings?.originCorner || originCorner.value)
  selectedQualifyingVoiceId.value = resolveQualifyingVoiceId(settings?.qualifyingVoiceId || selectedQualifyingVoiceId.value)
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000; phase.value = 'launcher'
}

async function closeOverlay() { await getOverlayApi()?.trainingOverlayClose?.() }

function toggleSpotter() {
  spotterEnabled.value = !spotterEnabled.value
  if (spotterEnabled.value) {
    startSpotter()
  } else {
    stopSpotter()
    spotterVoice.stopSpotterVoice()
  }
  void savePreferences()
  setDebugEvent(spotterEnabled.value ? 'spotter attivato' : 'spotter disattivato')
}

function runBackAction() {
  if (isShortcutStopConfirmOpen.value) { closeShortcutStopConfirm(); return }
  if (phase.value === 'launcher') { closeOverlay(); return }
  if (phase.value === 'placement') { phase.value = 'launcher'; return }
  if (phase.value === 'select') {
    if (isTrainingPickerOpen.value || isSettingsOpen.value) {
      isTrainingPickerOpen.value = false; isSettingsOpen.value = false; scheduleOverlaySizeSync(); return
    }
    phase.value = 'launcher'; scheduleOverlaySizeSync(); return
  }
  if (phase.value === 'completed') { resetCompleted(); return }
}

function runMuteAction() {
  toggleSound()
  if (!soundEnabled.value) spotterVoice.stopSpotterVoice()
  setDebugEvent(soundEnabled.value ? 'audio attivo' : 'audio muto')
}

function executePrimaryAction() {
  const now = Date.now()
  if (now - lastPrimaryActionAt < PRIMARY_ACTION_DEBOUNCE_MS) { setDebugEvent(`debounce ${primaryAction.value}`); return }
  lastPrimaryActionAt = now; setDebugEvent(`azione: ${primaryAction.value}`)
  if (isShortcutStopConfirmOpen.value) { executeStop(); return }
  const actions: Record<PrimaryOverlayAction, () => void> = {
    'confirm-placement': () => void confirmPlacement(),
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

// ─── Click-through (solo Electron) ─────────────────────────────────────────────
// La finestra ignora il mouse (i click passano alle app sotto) tranne quando il
// puntatore e' sulla superficie reale dell'overlay. Con forward attivo arrivano
// solo mousemove: da li' decidiamo quando riattivare la cattura.
const OVERLAY_SURFACE_SELECTOR = '.overlay-card, .launcher-tools, .placement-work-area'
let lastPointerOnSurface: boolean | null = null

function updateMousePassthrough(event: MouseEvent) {
  const api = getOverlayApi()
  if (!api?.trainingOverlaySetMousePassthrough) return
  const target = event.target as Element | null
  const onSurface = !!(target && typeof target.closest === 'function' && target.closest(OVERLAY_SURFACE_SELECTOR))
  isPointerOnOverlaySurface.value = onSurface
  if (onSurface === lastPointerOnSurface) return
  lastPointerOnSurface = onSurface
  void api.trainingOverlaySetMousePassthrough(!onSurface)
}

// ─── Input handling ───────────────────────────────────────────────────────────
function handleOverlayCommand(payload: OverlayCommand | { command?: OverlayCommand }) {
  const command = typeof payload === 'string' ? payload : payload?.command
  setDebugEvent(`comando overlay: ${command || 'vuoto'}`)
  if (command === 'primary') executePrimaryAction()
  if (command === 'back') runBackAction()
  if (command === 'mute') runMuteAction()
  if (command === 'stop') handleGlobalStop()
}

function handleLocalShortcut(event: KeyboardEvent) {
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

onMounted(async () => {
  document.body.classList.add('training-overlay-runtime')
  initTestMode()
  const api = getOverlayApi()
  isElectronRuntime.value = !!api
  const settings = await api?.trainingOverlayGetSettings?.() as TrainingOverlaySettings | undefined
  selectedTrainingId.value = resolveTrainingOverlayTrainingId(settings?.lastTrainingId)
  selectedModeId.value = resolveTrainingOverlayModeId(settings?.lastDurationId)
  soundEnabled.value = settings?.soundEnabled !== false
  spotterEnabled.value = settings?.spotterEnabled === true
  autoDimDuringRun.value = settings?.autoDimDuringRun !== false
  autoAdvanceStep.value = settings?.autoAdvanceStep !== false
  autoAdvanceSeconds.value = resolveAutoAdvanceSeconds(settings?.autoAdvanceSeconds)
  originMode.value = resolveOverlayOriginMode(settings?.originMode)
  originCorner.value = resolveOverlayOriginCorner(settings?.originCorner)
  selectedQualifyingVoiceId.value = resolveQualifyingVoiceId(settings?.qualifyingVoiceId)
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  phase.value = settings?.hasConfiguredPosition || !api ? 'launcher' : 'placement'
  if (spotterEnabled.value) startSpotter()
  startFastStatePolling()
  removeCommandListener = api?.onTrainingOverlayCommand?.(handleOverlayCommand)
  window.addEventListener('keydown', handleLocalShortcut, true)
  if (api?.trainingOverlaySetMousePassthrough) {
    window.addEventListener('mousemove', updateMousePassthrough, true)
  }
  connectResizeObserver(); scheduleOverlaySizeSync()
})

watch(
  [phase, selectedTrainingId, selectedModeId, soundEnabled, originMode, originCorner,
    selectedQualifyingVoiceId, spotterEnabled, isTrainingPickerOpen, isSettingsOpen],
  () => scheduleOverlaySizeSync(),
  { flush: 'post' }
)

onBeforeUnmount(() => {
  clearTimer(); cancelStopHold(); stopLiveStatePolling(); stopFastStatePolling(); stopSpotter(); spotterVoice.stopSpotterVoice(); cleanupSize()
  removeCommandListener?.()
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleLocalShortcut, true)
    window.removeEventListener('mousemove', updateMousePassthrough, true)
  }
  document.body.classList.remove('training-overlay-runtime')
})
</script>

<template>
  <main
    ref="overlayRoot"
    class="training-overlay"
    :style="overlayThemeStyle"
    :class="[
      `training-overlay--${phase}`,
      `training-overlay--tone-${selectedTraining.tone}`,
      `training-overlay--origin-${originCorner}`,
      {
        'training-overlay--drag': phase === 'placement',
        'training-overlay--web': !isElectronRuntime,
      }
    ]"
  >
    <!-- Controlli dev (PIP-106): solo in sviluppo. Il badge appare quando ON. -->
    <button
      v-if="showDevControls"
      type="button"
      class="overlay-dev-toggle"
      :aria-pressed="isTestMode"
      title="Test-mode: comprime il cronometro degli step (solo sviluppo)"
      @click="toggleTestMode"
    >
      {{ isTestMode ? 'TEST ON' : 'TEST OFF' }}
    </button>
    <TestModeBadge class="overlay-test-badge" />

    <div class="overlay-work-area">
      <Transition name="overlay-surface" mode="out-in">
        <section
          v-if="phase === 'placement'"
          key="placement"
          class="placement-work-area overlay-surface--placement"
          aria-label="Posiziona area overlay"
        >
          <div class="placement-drag-layer">
            <span>Allinea l'area dell'overlay</span>
            <p>Questa sara l'area dedicata alle card durante l'allenamento.</p>
          </div>

          <div class="placement-panel">
            <div class="corner-control" aria-label="Origine overlay">
              <span>Angolo di apertura</span>
              <div class="corner-options">
                <button
                  v-for="option in originCornerOptions"
                  :key="option.id"
                  type="button"
                  :class="{ 'is-active': originCorner === option.id }"
                  :aria-label="`Angolo ${option.label}`"
                  :aria-pressed="originCorner === option.id"
                  @click="selectOriginCorner(option.id)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <button type="button" class="primary" :aria-label="primaryActionLabel" @click="executePrimaryAction">
              {{ primaryActionLabel }}
            </button>
          </div>
        </section>

        <!-- Contenitore unico persistente (PIP-93): il morphing e' l'animazione
             di resize della finestra; dentro, il contenuto si avvicenda in cross-fade. -->
        <section v-else-if="phase !== 'loading'" key="card" class="overlay-card">
          <Transition name="content-swap" mode="out-in">
            <div :key="contentKey" :class="['overlay-content', `overlay-content--${overlaySizePreset}`]">

              <template v-if="phase === 'launcher'">
                <div class="launcher-tools" aria-label="Strumenti live overlay">
                  <header class="launcher-tools__header">
                    <span>
                      Strumenti live
                      <Transition name="chip-pop">
                        <em v-if="!soundEnabled" class="mute-chip" role="status" aria-label="Audio disattivato">MUTO</em>
                      </Transition>
                    </span>
                    <strong>{{ launcherSpotterStatus }}</strong>
                  </header>
                  <div class="launcher-tools__actions">
                    <button
                      type="button"
                      class="launcher-tool-button launcher-tool-button--training"
                      :class="{ 'is-selected': launcherToolIndex === 0 }"
                      :aria-label="primaryActionLabel"
                      :aria-current="launcherToolIndex === 0 ? 'true' : undefined"
                      @focus="launcherToolIndex = 0"
                      @click="executePrimaryAction"
                    >
                      Avvia allenamento
                    </button>
                    <button
                      type="button"
                      class="launcher-tool-button launcher-tool-button--spotter"
                      :class="{ 'is-active': spotterEnabled, 'is-selected': launcherToolIndex === 1 }"
                      :aria-pressed="spotterEnabled"
                      :aria-current="launcherToolIndex === 1 ? 'true' : undefined"
                      :aria-label="spotterToggleLabel"
                      @focus="launcherToolIndex = 1"
                      @click="toggleSpotter"
                    >
                      {{ spotterToggleLabel }}
                    </button>
                  </div>
                  <TyreSlipHud :fast-state="fastState" compact />
                  <p class="launcher-hint" aria-hidden="true">Ctrl+N avvia allenamento &middot; Ctrl+K nascondi</p>
                </div>
              </template>

              <template v-else-if="phase === 'completed'">
                <div class="overlay-topline">
                  <div class="overlay-topline-actions">
                    <Transition name="chip-pop">
                      <em v-if="!soundEnabled" class="mute-chip" role="status" aria-label="Audio disattivato">MUTO</em>
                    </Transition>
                    <button
                      type="button"
                      class="overlay-close-btn"
                      aria-label="Nascondi overlay (Ctrl+K per riaprire)"
                      title="Nascondi (Ctrl+K)"
                      @click="closeOverlay"
                    >
                      X
                    </button>
                  </div>
                </div>
                <div class="completed-banner" role="status">
                  <span class="completed-check" aria-hidden="true">&#10003;</span>
                  <strong>Allenamento completato</strong>
                </div>
                <div class="overlay-actions">
                  <button type="button" class="primary" :aria-label="primaryActionLabel" @click="executePrimaryAction">
                    {{ primaryActionLabel }}
                    <span class="key-hint" aria-hidden="true">Ctrl+N</span>
                  </button>
                </div>
              </template>

              <template v-else-if="phase === 'select'">
                <div class="overlay-main">
                  <div class="overlay-topline">
                    <div class="overlay-topline-actions">
                      <Transition name="chip-pop">
                        <em v-if="!soundEnabled" class="mute-chip" role="status" aria-label="Audio disattivato">MUTO</em>
                      </Transition>
                      <button
                        type="button"
                        class="overlay-close-btn"
                        aria-label="Nascondi overlay (Ctrl+K per riaprire)"
                        title="Nascondi (Ctrl+K)"
                        @click="closeOverlay"
                      >
                        X
                      </button>
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
            :qualifying-voice-options="qualifyingVoiceOptions"
            :selected-qualifying-voice-id="selectedQualifyingVoiceId"
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
                    @select-voice="selectQualifyingVoice"
                  />
                </div>
                <div class="overlay-actions">
                  <button type="button" class="primary" :aria-label="primaryActionLabel" @click="executePrimaryAction">
                    {{ primaryActionLabel }}
                    <span class="key-hint" aria-hidden="true">Ctrl+N</span>
                  </button>
                  <button
                    v-if="showPlacementControl"
                    type="button"
                    class="utility-action"
                    aria-label="Sposta l'overlay sullo schermo"
                    @click="enterPlacementMode"
                  >
                    Sposta
                  </button>
                </div>
                <p class="launcher-hint" aria-hidden="true">
                  Ctrl+K nasconde &middot; Ctrl+N avvia
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
                    :fast-state="fastState"
                    :sector-hud="liveLap.sectorHud"
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
                      aria-label="Skippa lo step corrente (solo mouse)"
                      title="Skippa step (solo mouse)"
                      @click="skipPausedStep"
                    >
                      Skippa step
                    </button>
                  </Transition>
                  <button
                    type="button"
                    class="secondary-action danger-action stop-hold-action"
                    :class="{ 'is-holding': stopHoldProgress > 0 }"
                    :style="{ '--stop-progress': stopHoldProgressPercent }"
                    aria-label="Stop: tieni premuto col mouse per interrompere la sessione"
                    @pointerdown.prevent="startStopHold('pointer')"
                    @pointerup.prevent="cancelStopHold"
                    @pointerleave="cancelStopHold"
                    @pointercancel="cancelStopHold"
                    @keydown.space.prevent="startStopHold('keyboard')"
                    @keyup.space.prevent="cancelStopHold"
                  >
                    Stop
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
</style>
