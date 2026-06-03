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
import { useTrackingRecord } from '~/composables/useTrackingRecord'
import { useStopHold } from '~/composables/useStopHold'
import { useQualifyingVoice } from '~/composables/useQualifyingVoice'
import { useOverlaySize } from '~/composables/useOverlaySize'
import { useTrainingSelection, type PlanPreviewChip } from '~/composables/useTrainingSelection'
import { useSessionOrchestrator } from '~/composables/useSessionOrchestrator'
import {
  useOverlaySettings, resolveOverlayOriginCorner, resolveOverlayOriginMode,
  originCornerOptions,
  type OverlayOriginCorner, type OverlayOriginMode,
} from '~/composables/useOverlaySettings'
import OverlaySelectSetup from '~/components/overlay/OverlaySelectSetup.vue'
import OverlayHud from '~/components/overlay/OverlayHud.vue'

definePageMeta({ layout: false })

const { getPublicPath } = usePublicPath()

useHead({
  htmlAttrs: { class: 'training-overlay-document' },
  bodyAttrs: { class: 'training-overlay-runtime' },
})

// ─── Types ───────────────────────────────────────────────────────────────────
type OverlayPhase = 'loading' | 'placement' | 'launcher' | 'select' | 'running' | 'paused' | 'expired' | 'completed'
type OverlayCommand = 'primary' | 'stop'
type OverlaySizePreset = 'launcher' | 'placement' | 'select' | 'session' | 'expired' | 'completed'
type OverlaySize = { width: number; height: number }
type PrimaryOverlayAction = 'confirm-placement' | 'open-selection' | 'start' | 'pause' | 'resume' | 'complete-step' | 'next' | 'reset' | 'none'

interface TrainingOverlaySettings {
  hasConfiguredPosition?: boolean; lastTrainingId?: string
  lastDurationId?: TrainingOverlayDurationModeId; soundEnabled?: boolean
  autoDimDuringRun?: boolean; autoAdvanceStep?: boolean; originMode?: OverlayOriginMode
  originCorner?: OverlayOriginCorner; qualifyingVoiceId?: QualifyingVoiceId
}

// ─── Constants ───────────────────────────────────────────────────────────────
const OVERLAY_WORK_AREA_SIZE: OverlaySize = { width: 472, height: 768 }
const AUTO_DIM_DELAY_MS = 10_000
const AUTO_DIM_RESTORE_MS = 10_000
const AUTO_DIM_OPACITY = 0.6
const PRIMARY_ACTION_DEBOUNCE_MS = 450
const OVERLAY_CARD_SIZES: Record<OverlaySizePreset, OverlaySize> = {
  launcher: { width: 232, height: 66 }, placement: OVERLAY_WORK_AREA_SIZE,
  select: { width: 424, height: 620 }, session: { width: 334, height: 196 },
  expired: { width: 334, height: 186 }, completed: { width: 334, height: 158 }
}
const overlayShortcuts = [
  { label: 'Overlay', value: 'Ctrl+K' },
  { label: 'Bottone azione', value: 'Ctrl+N' },
  { label: 'Bottone stop', value: 'Ctrl+Alt+L' },
]

// ─── Core State ──────────────────────────────────────────────────────────────
const selectedTrainingId = ref<TrainingOverlayId>('tracktitan_input')
const selectedModeId = ref<TrainingOverlayDurationModeId>('short30')
const activeStepIndex = ref(0)
const phase = ref<OverlayPhase>('loading')
const remainingMs = ref(0)
const isElectronRuntime = ref(false)
const lastDebugEvent = ref('nessun input')
const debugEvents = ref<string[]>([])
const overlayRoot = ref<HTMLElement | null>(null)
const showDevControls = import.meta.dev
const isSaving = ref(false)

// ─── API bridge ──────────────────────────────────────────────────────────────
function getOverlayApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

// ─── Composables ─────────────────────────────────────────────────────────────
const { liveLap, startLiveStatePolling, stopLiveStatePolling, resetLiveLap } =
  useLiveStatePoller(getOverlayApi)

const { trackingStart, trackingComplete, trackingAbandon } = useTrackingRecord(
  getOverlayApi,
  () => liveLap.value,
  () => selectedTrainingId.value,
  () => selectedModeId.value,
  () => totalSteps.value,
)

function setDebugEvent(msg: string) {
  const e = `${new Date().toLocaleTimeString()} - ${msg}`
  lastDebugEvent.value = e
  debugEvents.value = [e, ...debugEvents.value].slice(0, 5)
}

const {
  stopHoldProgress, isShortcutStopConfirmOpen,
  isKeyboardStopHolding, startStopHold, cancelStopHold,
  closeShortcutStopConfirm, openShortcutStopConfirm,
  handleGlobalStop, handleKeyboardStopHold, handleKeyboardStopRelease, executeStop,
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
const { soundEnabled, primeStepAudio, playStepDoneSound, enqueue: enqueueVoice, enqueueStepStart, announceLap, stopVoice } = voice

const overlaySizeComp = useOverlaySize(getOverlayApi, () => overlaySizePreset.value, overlayRoot)
const { scheduleOverlaySizeSync, connectResizeObserver, disconnectResizeObserver, cleanup: cleanupSize } = overlaySizeComp


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
  if (phase.value === 'paused') return canManuallyAdvanceStep.value ? 'next' : 'resume'
  if (phase.value === 'expired') return 'next'
  if (phase.value === 'completed') return 'reset'
  return 'none'
})
const primaryActionLabel = computed(() => ({
  'confirm-placement': 'Usa posizione', 'open-selection': 'Inizia allenamento',
  start: 'Avvia', pause: 'Pausa', resume: 'Riprendi', 'complete-step': 'Completa',
  next: 'Avanti', reset: 'Nuovo', none: 'Azione',
}[primaryAction.value]))
const stopHoldProgressPercent = computed(() => `${Math.round(stopHoldProgress.value * 100)}%`)
const stopActionLabel = computed(() => stopHoldProgress.value > 0 ? 'Tieni premuto' : 'Stop')
const progressPercent = computed(() => {
  const totalMs = activeStep.value.durationMinutes * 60_000
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
  if (phase.value === 'paused') return 'Timer fermo.'
  if (phase.value === 'expired') return 'Step finito. Passa al prossimo.'
  if (phase.value === 'completed') return 'Allenamento completato.'
  return activeStep.value.hud
})
const sessionOverlayOpacity = computed(() => {
  if (!autoDimDuringRun.value || phase.value !== 'running') return 1
  const totalMs = activeStep.value.durationMinutes * 60_000
  if (!totalMs) return 1
  const elapsedMs = Math.max(0, totalMs - remainingMs.value)
  return elapsedMs >= AUTO_DIM_DELAY_MS && remainingMs.value > AUTO_DIM_RESTORE_MS ? AUTO_DIM_OPACITY : 1
})
const selectedOriginLabel = computed(() =>
  originCornerOptions.find(o => o.id === originCorner.value)?.label || 'Alto sx'
)
const hudTransitionKey = computed(() => `${phase.value}-${activeStepIndex.value}-${activeStep.value.id}`)
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
  '--overlay-width': `${OVERLAY_CARD_SIZES[overlaySizePreset.value].width}px`,
  '--overlay-height': `${OVERLAY_CARD_SIZES[overlaySizePreset.value].height}px`,
  '--overlay-session-opacity': `${sessionOverlayOpacity.value}`,
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
  autoDimDuringRun, autoAdvanceStep, originMode, originCorner, selectedQualifyingVoiceId,
  isTrainingPickerOpen, isSettingsOpen, savePreferences,
  toggleTrainingPicker, toggleSettingsPanel, toggleAutoDimDuringRun, toggleAutoAdvanceStep,
  selectOriginCorner, selectQualifyingVoice, toggleSound,
} = useOverlaySettings(
  getOverlayApi, soundEnabled, stopVoice, primeStepAudio,
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
  pauseSession, resumeSession, completeCurrentStep,
  goNextStep, stopSession, resetCompleted,
} = useSessionOrchestrator(
  phase, activeStepIndex, remainingMs, selectedTrainingId, selectedModeId, isSettingsOpen,
  selectedMode, canManuallyAdvanceStep, autoAdvanceStep, closeShortcutStopConfirm, cancelStopHold,
  enqueueVoice, enqueueStepStart, announceLap, primeStepAudio, stopVoice, playStepDoneSound,
  liveLap, startLiveStatePolling, stopLiveStatePolling, resetLiveLap,
  trackingStart, trackingComplete, trackingAbandon, savePreferences,
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

// ─── Input handling ───────────────────────────────────────────────────────────
function handleOverlayCommand(payload: OverlayCommand | { command?: OverlayCommand }) {
  const command = typeof payload === 'string' ? payload : payload?.command
  setDebugEvent(`comando overlay: ${command || 'vuoto'}`)
  if (command === 'primary') executePrimaryAction()
  if (command === 'stop') handleGlobalStop()
}

function handleLocalShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || key === 'escape') {
    setDebugEvent(`keydown ${event.ctrlKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.key}`)
  }
  if (event.key === 'Escape' && isShortcutStopConfirmOpen.value) {
    event.preventDefault(); closeShortcutStopConfirm(); return
  }
  if (!event.ctrlKey || event.metaKey || event.shiftKey) return
  if (!event.altKey && key === 'n') {
    event.preventDefault(); if (event.repeat) return; executePrimaryAction(); return
  }
  const isStop = (event.altKey && key === 'l') || (!event.altKey && key === 'backspace')
  if (isStop) { event.preventDefault(); handleKeyboardStopHold(event.altKey ? 'Ctrl+Alt+L' : 'Ctrl+Backspace') }
}

function handleLocalShortcutRelease(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  if (isKeyboardStopHolding() && ['control', 'alt'].includes(key)) { cancelStopHold(); return }
  if (!event.ctrlKey || event.metaKey || event.shiftKey) return
  const isStop = (event.altKey && key === 'l') || (!event.altKey && key === 'backspace')
  if (isStop) { event.preventDefault(); handleKeyboardStopRelease() }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
let removeCommandListener: (() => void) | undefined

onMounted(async () => {
  document.body.classList.add('training-overlay-runtime')
  const api = getOverlayApi()
  isElectronRuntime.value = !!api
  const settings = await api?.trainingOverlayGetSettings?.() as TrainingOverlaySettings | undefined
  selectedTrainingId.value = resolveTrainingOverlayTrainingId(settings?.lastTrainingId)
  selectedModeId.value = resolveTrainingOverlayModeId(settings?.lastDurationId)
  soundEnabled.value = settings?.soundEnabled !== false
  autoDimDuringRun.value = settings?.autoDimDuringRun !== false
  autoAdvanceStep.value = settings?.autoAdvanceStep !== false
  originMode.value = resolveOverlayOriginMode(settings?.originMode)
  originCorner.value = resolveOverlayOriginCorner(settings?.originCorner)
  selectedQualifyingVoiceId.value = resolveQualifyingVoiceId(settings?.qualifyingVoiceId)
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  phase.value = settings?.hasConfiguredPosition || !api ? 'launcher' : 'placement'
  removeCommandListener = api?.onTrainingOverlayCommand?.(handleOverlayCommand)
  window.addEventListener('keydown', handleLocalShortcut, true)
  window.addEventListener('keyup', handleLocalShortcutRelease, true)
  connectResizeObserver(); scheduleOverlaySizeSync()
})

watch(
  [phase, selectedTrainingId, selectedModeId, soundEnabled, originMode, originCorner,
    selectedQualifyingVoiceId, isTrainingPickerOpen, isSettingsOpen],
  () => scheduleOverlaySizeSync(),
  { flush: 'post' }
)

onBeforeUnmount(() => {
  clearTimer(); cancelStopHold(); stopLiveStatePolling(); cleanupSize()
  removeCommandListener?.()
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleLocalShortcut, true)
    window.removeEventListener('keyup', handleLocalShortcutRelease, true)
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
      { 'training-overlay--drag': phase === 'placement' }
    ]"
  >
    <div class="overlay-work-area">
      <Transition name="overlay-surface" mode="out-in">
        <button
          v-if="phase === 'launcher'"
          key="launcher"
          type="button"
          :class="['launcher-button', `overlay-surface--${overlaySizePreset}`]"
          :aria-label="primaryActionLabel"
          @click="executePrimaryAction"
        >
          {{ primaryActionLabel }}
        </button>

        <section
          v-else-if="phase === 'placement'"
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

        <section v-else-if="phase !== 'loading'" :key="phase" :class="['overlay-card', `overlay-surface--${overlaySizePreset}`]">
        <div class="overlay-main">
        <div v-if="!isActiveSession" class="overlay-topline">
          <div class="overlay-topline-actions">
            <span v-if="phase === 'completed'">Fine</span>
            <button
              type="button"
              class="overlay-close-btn"
              aria-label="Chiudi overlay"
              title="Chiudi"
              @click="closeOverlay"
            >
              X
            </button>
          </div>
        </div>

        <template v-if="phase === 'select'">
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
            @toggle-sound="toggleSound"
            @toggle-auto-dim="toggleAutoDimDuringRun"
            @toggle-auto-advance="toggleAutoAdvanceStep"
            @select-voice="selectQualifyingVoice"
          />
        </template>

        <template v-else>
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
          />
        </template>
      </div>

      <div class="overlay-actions">
        <template v-if="phase === 'select'">
          <button type="button" class="primary" :aria-label="primaryActionLabel" @click="executePrimaryAction">
            {{ primaryActionLabel }}
          </button>
          <button
            v-if="showPlacementControl"
            type="button"
            class="utility-action"
            aria-label="Sposta overlay"
            @click="enterPlacementMode"
          >
            Sposta
          </button>
        </template>

        <template v-else-if="canUseStopControl">
          <button
            type="button"
            class="primary"
            :aria-label="isShortcutStopConfirmOpen ? 'Conferma stop sessione' : primaryActionLabel"
            @click="executePrimaryAction"
          >
            {{ isShortcutStopConfirmOpen ? 'Conferma' : primaryActionLabel }}
          </button>
          <button
            type="button"
            class="secondary-action danger-action stop-hold-action"
            :class="{ 'is-holding': stopHoldProgress > 0 }"
            :style="{ '--stop-progress': stopHoldProgressPercent }"
            aria-label="Tieni premuto per interrompere la sessione"
            @pointerdown.prevent="startStopHold('pointer')"
            @pointerup.prevent="cancelStopHold"
            @pointerleave="cancelStopHold"
            @pointercancel="cancelStopHold"
            @keydown.space.prevent="startStopHold('keyboard')"
            @keyup.space.prevent="cancelStopHold"
          >
            {{ stopActionLabel }}
          </button>
        </template>

        <template v-else-if="phase === 'completed'">
          <button type="button" class="primary" :aria-label="primaryActionLabel" @click="executePrimaryAction">
            {{ primaryActionLabel }}
          </button>
        </template>
      </div>
        </section>
      </Transition>
    </div>

  </main>
</template>

<style lang="scss">
@use '~/assets/scss/training-overlay' as *;
</style>
