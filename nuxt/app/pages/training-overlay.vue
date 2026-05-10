<script setup lang="ts">
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

definePageMeta({
  layout: false
})

useHead({
  htmlAttrs: {
    class: 'training-overlay-document'
  },
  bodyAttrs: {
    class: 'training-overlay-runtime'
  }
})

type OverlayPhase = 'loading' | 'placement' | 'launcher' | 'select' | 'running' | 'paused' | 'expired' | 'completed'
type OverlayCommand = 'primary'
type OverlaySizePreset = 'launcher' | 'placement' | 'select' | 'session' | 'expired' | 'completed'
type OverlayOriginCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type OverlayOriginMode = 'auto' | 'manual'
type OverlaySize = { width: number; height: number }

interface PlanPreviewChip {
  id: string
  label: string
  durationLabel: string
  type: TrainingOverlayStep['type']
  title: string
  repeat?: string
}

interface TrainingOverlaySettings {
  hasConfiguredPosition?: boolean
  lastTrainingId?: string
  lastDurationId?: TrainingOverlayDurationModeId
  soundEnabled?: boolean
  autoDimDuringRun?: boolean
  originMode?: OverlayOriginMode
  originCorner?: OverlayOriginCorner
}

const selectedTrainingId = ref<TrainingOverlayId>('tracktitan_input')
const selectedModeId = ref<TrainingOverlayDurationModeId>('short30')
const activeStepIndex = ref(0)
const phase = ref<OverlayPhase>('loading')
const remainingMs = ref(0)
const isElectronRuntime = ref(false)
const soundEnabled = ref(true)
const autoDimDuringRun = ref(true)
const originMode = ref<OverlayOriginMode>('manual')
const originCorner = ref<OverlayOriginCorner>('top-left')
const isTrainingPickerOpen = ref(false)
const isSettingsOpen = ref(false)
const overlayRoot = ref<HTMLElement | null>(null)
const showDevControls = import.meta.dev
const overlayShortcuts = [
  { label: 'Overlay', value: 'Ctrl+K' },
  { label: 'Azione', value: 'Ctrl+N' }
]
const originCornerOptions: Array<{ id: OverlayOriginCorner; label: string }> = [
  { id: 'top-left', label: 'Alto sx' },
  { id: 'top-right', label: 'Alto dx' },
  { id: 'bottom-left', label: 'Basso sx' },
  { id: 'bottom-right', label: 'Basso dx' }
]
const OVERLAY_WORK_AREA_SIZE: OverlaySize = { width: 472, height: 768 }
const AUTO_DIM_DELAY_MS = 10_000
const AUTO_DIM_RESTORE_MS = 10_000
const AUTO_DIM_OPACITY = 0.6
const OVERLAY_CARD_SIZES: Record<OverlaySizePreset, OverlaySize> = {
  launcher: { width: 232, height: 66 },
  placement: OVERLAY_WORK_AREA_SIZE,
  select: { width: 424, height: 620 },
  session: { width: 334, height: 162 },
  expired: { width: 334, height: 186 },
  completed: { width: 334, height: 158 }
}

let deadlineAt = 0
let timerHandle: ReturnType<typeof setInterval> | null = null
let removeCommandListener: (() => void) | undefined
let stepAudioContext: AudioContext | null = null
let overlaySizeFrame: number | null = null
let overlaySizeRetry: ReturnType<typeof setTimeout> | null = null
let overlayResizeObserver: ResizeObserver | null = null
let lastOverlaySizeRequest: { preset: OverlaySizePreset; width?: number; height?: number } | null = null

const selectedTraining = computed<TrainingOverlayTraining>(() => {
  return trainingOverlayTrainingList.find((training) => training.id === selectedTrainingId.value)
    || trainingOverlayTrainingList[0]!
})
const selectedMode = computed(() => selectedTraining.value.modes[selectedModeId.value])
const selectedModeList = computed(() => Object.values(selectedTraining.value.modes))
const selectedPlanChips = computed<PlanPreviewChip[]>(() => {
  if (selectedTraining.value.id === 'qualifying' && selectedMode.value.id === 'full60') {
    return [
      { id: 'qualy-warmup', label: 'Warm-up', durationLabel: '10m', type: 'warmup', title: 'Warm-up - 10 min' },
      {
        id: 'qualy-repeat',
        label: 'Qualifica + pausa',
        durationLabel: '10m + 2m',
        type: 'stint',
        repeat: 'x4',
        title: '4 blocchi: Qualifica 10 min + Pausa 2 min'
      },
      { id: 'qualy-recap', label: 'Recap', durationLabel: '2m', type: 'recap', title: 'Recap - 2 min' }
    ] satisfies PlanPreviewChip[]
  }

  if (selectedTraining.value.id === 'tracktitan_input' && selectedMode.value.id === 'full60') {
    return [
      { id: 'track-run', label: 'Run iniziale', durationLabel: '10m', type: 'run', title: 'Run iniziale - 10 min' },
      {
        id: 'track-repeat',
        label: 'Review + focus',
        durationLabel: '5m + 10m',
        type: 'focusRun',
        repeat: 'x3',
        title: '3 blocchi: Review 5 min + Run focus 10 min'
      },
      { id: 'track-recap', label: 'Recap', durationLabel: '5m', type: 'recap', title: 'Recap - 5 min' }
    ] satisfies PlanPreviewChip[]
  }

  return selectedMode.value.steps.map((step) => ({
    id: step.id,
    label: step.title,
    durationLabel: `${step.durationMinutes}m`,
    type: step.type,
    title: `${step.title} - ${step.durationMinutes} min`
  }))
})
const activeStep = computed<TrainingOverlayStep>(() => {
  return selectedMode.value.steps[activeStepIndex.value] || selectedMode.value.steps[0]!
})
const totalSteps = computed(() => selectedMode.value.steps.length)
const isActiveSession = computed(() => ['running', 'paused', 'expired'].includes(phase.value))
const canManuallyAdvanceStep = computed(() => activeStep.value.durationMinutes <= 5)
const showManualNextButton = computed(() => ['running', 'paused'].includes(phase.value) && canManuallyAdvanceStep.value)
const showPlacementControl = computed(() => isElectronRuntime.value || showDevControls)
const progressPercent = computed(() => {
  const totalMs = activeStep.value.durationMinutes * 60_000
  if (!totalMs) return 0
  return Math.max(0, Math.min(100, 100 - (remainingMs.value / totalMs) * 100))
})
const formattedTime = computed(() => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs.value / 1000))
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
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
  if (!autoDimDuringRun.value) return 1
  if (phase.value !== 'running') return 1

  const totalMs = activeStep.value.durationMinutes * 60_000
  if (!totalMs) return 1

  const elapsedMs = Math.max(0, totalMs - remainingMs.value)
  const shouldDim = elapsedMs >= AUTO_DIM_DELAY_MS && remainingMs.value > AUTO_DIM_RESTORE_MS
  return shouldDim ? AUTO_DIM_OPACITY : 1
})

const selectedOriginLabel = computed(() => {
  return originCornerOptions.find((option) => option.id === originCorner.value)?.label || 'Alto sx'
})

const hudTransitionKey = computed(() => {
  return `${phase.value}-${activeStepIndex.value}-${activeStep.value.id}`
})

const overlaySizePreset = computed<OverlaySizePreset>(() => {
  if (phase.value === 'launcher') return 'launcher'
  if (phase.value === 'placement') return 'placement'
  if (phase.value === 'select') return 'select'
  if (phase.value === 'expired') return 'expired'
  if (phase.value === 'completed') return 'completed'
  return 'session'
})
const overlayThemeStyle = computed(() => {
  const cardSize = OVERLAY_CARD_SIZES[overlaySizePreset.value]

  return {
    '--overlay-accent': selectedTraining.value.accent,
    '--overlay-accent-end': selectedTraining.value.accentEnd,
    '--overlay-accent-rgb': selectedTraining.value.accentRgb,
    '--overlay-accent-contrast': selectedTraining.value.accentContrast,
    '--overlay-transform-origin': originCorner.value.replace('-', ' '),
    '--overlay-work-area-width': `${OVERLAY_WORK_AREA_SIZE.width}px`,
    '--overlay-work-area-height': `${OVERLAY_WORK_AREA_SIZE.height}px`,
    '--overlay-width': `${cardSize.width}px`,
    '--overlay-height': `${cardSize.height}px`,
    '--overlay-session-opacity': `${sessionOverlayOpacity.value}`
  }
})

function getOverlayApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

function trainingOptionStyle(training: TrainingOverlayTraining) {
  return {
    '--training-accent': training.accent,
    '--training-accent-end': training.accentEnd,
    '--training-accent-rgb': training.accentRgb,
    '--training-accent-contrast': training.accentContrast
  }
}

function resolveOverlayOriginCorner(value: unknown): OverlayOriginCorner {
  return originCornerOptions.some((option) => option.id === value)
    ? value as OverlayOriginCorner
    : 'top-left'
}

function resolveOverlayOriginMode(value: unknown): OverlayOriginMode {
  return 'manual'
}

function clearTimer() {
  if (timerHandle) {
    clearInterval(timerHandle)
    timerHandle = null
  }
}

function tickTimer() {
  remainingMs.value = Math.max(0, deadlineAt - Date.now())
  if (remainingMs.value <= 0) {
    clearTimer()
    playStepDoneSound()
    phase.value = 'expired'
  }
}

function startTicking() {
  clearTimer()
  timerHandle = setInterval(tickTimer, 250)
  tickTimer()
}

async function savePreferences() {
  await getOverlayApi()?.trainingOverlaySavePreferences?.({
    lastTrainingId: selectedTrainingId.value,
    lastDurationId: selectedModeId.value,
    soundEnabled: soundEnabled.value,
    autoDimDuringRun: autoDimDuringRun.value,
    originMode: originMode.value,
    originCorner: originCorner.value
  })
}

function shouldSkipOverlaySizeRequest(sizeRequest: { preset: OverlaySizePreset; width?: number; height?: number }) {
  if (
    lastOverlaySizeRequest
    && lastOverlaySizeRequest.preset === sizeRequest.preset
    && lastOverlaySizeRequest.width === sizeRequest.width
    && lastOverlaySizeRequest.height === sizeRequest.height
  ) {
    return true
  }

  lastOverlaySizeRequest = sizeRequest
  return false
}

function disconnectOverlayResizeObserver() {
  overlayResizeObserver?.disconnect()
  overlayResizeObserver = null
}

function connectOverlayResizeObserver() {
  if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return

  const element = overlayRoot.value
  if (!element) return

  disconnectOverlayResizeObserver()
  overlayResizeObserver = new ResizeObserver(() => {
    scheduleOverlaySizeSync(1)
  })
  overlayResizeObserver.observe(element)
}

async function applyOverlaySize(preset: OverlaySizePreset = overlaySizePreset.value) {
  await nextTick()
  const sizeRequest = {
    preset,
    width: OVERLAY_WORK_AREA_SIZE.width,
    height: OVERLAY_WORK_AREA_SIZE.height
  }

  if (shouldSkipOverlaySizeRequest(sizeRequest)) {
    return
  }

  await getOverlayApi()?.trainingOverlaySetSize?.(sizeRequest)
}

function scheduleOverlaySizeSync(retries = 4) {
  if (typeof window === 'undefined') return

  if (overlaySizeFrame !== null) {
    window.cancelAnimationFrame(overlaySizeFrame)
  }

  if (overlaySizeRetry) {
    clearTimeout(overlaySizeRetry)
    overlaySizeRetry = null
  }

  overlaySizeFrame = window.requestAnimationFrame(() => {
    overlaySizeFrame = null
    void applyOverlaySize()

    if (retries > 0) {
      overlaySizeRetry = setTimeout(() => {
        overlaySizeRetry = null
        scheduleOverlaySizeSync(retries - 1)
      }, 90)
    }
  })
}

function selectTraining(trainingId: TrainingOverlayId) {
  if (isActiveSession.value) return
  selectedTrainingId.value = trainingId
  isTrainingPickerOpen.value = false
  selectedModeId.value = resolveTrainingOverlayModeId(selectedModeId.value)
  activeStepIndex.value = 0
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  void savePreferences()
  scheduleOverlaySizeSync()
}

function toggleTrainingPicker() {
  if (isActiveSession.value) return
  isTrainingPickerOpen.value = !isTrainingPickerOpen.value
  if (isTrainingPickerOpen.value) {
    isSettingsOpen.value = false
  }
  scheduleOverlaySizeSync()
}

function toggleSettingsPanel() {
  if (isActiveSession.value) return
  isSettingsOpen.value = !isSettingsOpen.value
  if (isSettingsOpen.value) {
    isTrainingPickerOpen.value = false
  }
  scheduleOverlaySizeSync()
}

function selectMode(modeId: TrainingOverlayDurationModeId) {
  if (isActiveSession.value) return
  selectedModeId.value = modeId
  activeStepIndex.value = 0
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  void savePreferences()
}

function getStepAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioContextCtor) return null
  if (!stepAudioContext) {
    stepAudioContext = new AudioContextCtor()
  }
  return stepAudioContext
}

async function primeStepAudio() {
  if (!soundEnabled.value) return
  const context = getStepAudioContext()
  if (!context) return
  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined)
  }
}

function playStepDoneSound() {
  if (!soundEnabled.value) return
  const context = getStepAudioContext()
  if (!context) return

  void context.resume().catch(() => undefined)
  const firstBeepAt = context.currentTime + 0.01
  const burstOffsets = [0, 0.22, 0.44]
  const secondBurstDelay = 0.95 // small pause after first 3 beeps
  const thirdBurstDelay = 1.90 // same pause before third burst
  const beepOffsets = [
    ...burstOffsets,
    ...burstOffsets.map(offset => offset + secondBurstDelay),
    ...burstOffsets.map(offset => offset + thirdBurstDelay)
  ]

  beepOffsets.forEach((offset) => {
    const startAt = firstBeepAt + offset
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(980, startAt)
    oscillator.frequency.exponentialRampToValueAtTime(760, startAt + 0.14)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(0.38, startAt + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startAt)
    oscillator.stop(startAt + 0.18)
  })
}

function toggleSound() {
  soundEnabled.value = !soundEnabled.value
  void savePreferences()
  if (soundEnabled.value) void primeStepAudio()
}

function toggleAutoDimDuringRun() {
  autoDimDuringRun.value = !autoDimDuringRun.value
  void savePreferences()
}

function selectOriginCorner(nextOriginCorner: OverlayOriginCorner) {
  if (isActiveSession.value) return
  originMode.value = 'manual'
  originCorner.value = nextOriginCorner
  void savePreferences()
  scheduleOverlaySizeSync()
}

function startStep(index: number) {
  const step = selectedMode.value.steps[index]
  if (!step) {
    phase.value = 'completed'
    remainingMs.value = 0
    clearTimer()
    return
  }

  activeStepIndex.value = index
  remainingMs.value = step.durationMinutes * 60_000
  deadlineAt = Date.now() + remainingMs.value
  phase.value = 'running'
  startTicking()
}

function startSession() {
  void savePreferences()
  void primeStepAudio()
  startStep(0)
}

function openTrainingSelection() {
  clearTimer()
  isSettingsOpen.value = false
  activeStepIndex.value = 0
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  phase.value = 'select'
}

function pauseSession() {
  if (phase.value !== 'running') return
  tickTimer()
  clearTimer()
  phase.value = 'paused'
}

function resumeSession() {
  if (phase.value !== 'paused') return
  deadlineAt = Date.now() + remainingMs.value
  phase.value = 'running'
  startTicking()
}

function completeCurrentStep() {
  if (phase.value !== 'running') return
  if (!canManuallyAdvanceStep.value) return
  remainingMs.value = 0
  clearTimer()
  phase.value = 'expired'
}

function goNextStep() {
  if (activeStepIndex.value >= selectedMode.value.steps.length - 1) {
    phase.value = 'completed'
    remainingMs.value = 0
    clearTimer()
    return
  }
  startStep(activeStepIndex.value + 1)
}

function skipToNextStepForDev() {
  if (!canManuallyAdvanceStep.value) return
  goNextStep()
}

function stopSession() {
  clearTimer()
  isSettingsOpen.value = false
  activeStepIndex.value = 0
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  phase.value = 'select'
}

function enterPlacementMode() {
  if (isActiveSession.value) return
  isSettingsOpen.value = false
  isTrainingPickerOpen.value = false
  originMode.value = 'manual'
  phase.value = 'placement'
}

async function confirmPlacement() {
  const settings = await getOverlayApi()?.trainingOverlayConfirmPlacement?.()
  selectedTrainingId.value = resolveTrainingOverlayTrainingId(settings?.lastTrainingId || selectedTrainingId.value)
  selectedModeId.value = resolveTrainingOverlayModeId(settings?.lastDurationId || selectedModeId.value)
  originMode.value = resolveOverlayOriginMode(settings?.originMode || originMode.value)
  originCorner.value = resolveOverlayOriginCorner(settings?.originCorner || originCorner.value)
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  phase.value = 'launcher'
}

async function closeOverlay() {
  await getOverlayApi()?.trainingOverlayClose?.()
}

function resetCompleted() {
  activeStepIndex.value = 0
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  phase.value = 'launcher'
}

function handlePrimaryCommand() {
  if (phase.value === 'placement') {
    void confirmPlacement()
    return
  }
  if (phase.value === 'launcher') {
    openTrainingSelection()
    return
  }
  if (phase.value === 'select') {
    startSession()
    return
  }
  if (phase.value === 'running') {
    completeCurrentStep()
    return
  }
  if (phase.value === 'paused') {
    resumeSession()
    return
  }
  if (phase.value === 'expired') {
    goNextStep()
    return
  }
  if (phase.value === 'completed') {
    resetCompleted()
  }
}

function handleOverlayCommand(payload: OverlayCommand | { command?: OverlayCommand }) {
  const command = typeof payload === 'string' ? payload : payload?.command
  if (command === 'primary') handlePrimaryCommand()
}

onMounted(async () => {
  document.body.classList.add('training-overlay-runtime')

  const api = getOverlayApi()
  isElectronRuntime.value = !!api

  const settings = await api?.trainingOverlayGetSettings?.() as TrainingOverlaySettings | undefined
  selectedTrainingId.value = resolveTrainingOverlayTrainingId(settings?.lastTrainingId)
  selectedModeId.value = resolveTrainingOverlayModeId(settings?.lastDurationId)
  soundEnabled.value = settings?.soundEnabled !== false
  autoDimDuringRun.value = settings?.autoDimDuringRun !== false
  originMode.value = resolveOverlayOriginMode(settings?.originMode)
  originCorner.value = resolveOverlayOriginCorner(settings?.originCorner)
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  phase.value = settings?.hasConfiguredPosition || !api ? 'launcher' : 'placement'

  removeCommandListener = api?.onTrainingOverlayCommand?.(handleOverlayCommand)
  connectOverlayResizeObserver()
  scheduleOverlaySizeSync()
})

watch([phase, selectedTrainingId, selectedModeId, soundEnabled, originMode, originCorner, isTrainingPickerOpen, isSettingsOpen], () => {
  scheduleOverlaySizeSync()
}, { flush: 'post' })

onBeforeUnmount(() => {
  clearTimer()
  if (typeof window !== 'undefined' && overlaySizeFrame !== null) {
    window.cancelAnimationFrame(overlaySizeFrame)
  }
  if (overlaySizeRetry) {
    clearTimeout(overlaySizeRetry)
  }
  disconnectOverlayResizeObserver()
  removeCommandListener?.()
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
          @click="openTrainingSelection"
        >
          Inizia allenamento
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
                  @click="selectOriginCorner(option.id)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <button type="button" class="primary" @click="confirmPlacement">
              Usa posizione
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

          <template v-if="phase === 'select'">
            <div class="setup-stack">
              <div
                class="training-picker"
                :class="{ 'is-open': isTrainingPickerOpen }"
                aria-label="Tipo allenamento"
              >
                <span>Allenamento</span>
                <button
                  type="button"
                  class="training-current"
                  :aria-expanded="isTrainingPickerOpen"
                  @click="toggleTrainingPicker"
                >
                  <span>
                    <strong>{{ selectedTraining.label }}</strong>
                  </span>
                  <span class="accordion-chevron" aria-hidden="true" />
                </button>
                <div
                  class="accordion-panel training-options-panel"
                  :class="{ 'is-open': isTrainingPickerOpen }"
                  :aria-hidden="!isTrainingPickerOpen"
                  :inert="!isTrainingPickerOpen"
                >
                  <div class="accordion-content training-options">
                    <button
                      v-for="training in trainingOverlayTrainingList"
                      :key="training.id"
                      type="button"
                      :class="[
                        'training-option',
                        `training-option--${training.tone}`,
                        { 'is-active': selectedTrainingId === training.id }
                      ]"
                      :style="trainingOptionStyle(training)"
                      @click="selectTraining(training.id)"
                    >
                      <strong>{{ training.label }}</strong>
                    </button>
                  </div>
                </div>
              </div>

              <div class="duration-row" aria-label="Durata allenamento">
                <span>Durata</span>
                <div class="duration-options">
                  <button
                    v-for="mode in selectedModeList"
                    :key="mode.id"
                    type="button"
                    :class="{ 'is-active': selectedModeId === mode.id }"
                    @click="selectMode(mode.id)"
                  >
                    {{ mode.title }}
                  </button>
                </div>
              </div>

              <div class="training-plan-preview" aria-label="Piano allenamento">
                <div class="training-plan-head">
                  <span>Piano allenamento</span>
                  <strong>{{ selectedMode.title }}</strong>
                </div>
                <div class="training-plan-chips">
                  <span
                    v-for="segment in selectedPlanChips"
                    :key="segment.id"
                    class="plan-chip"
                    :class="[
                      `plan-chip--${segment.type}`,
                      { 'has-repeat': segment.repeat }
                    ]"
                    :title="segment.title"
                  >
                    <small v-if="segment.repeat">{{ segment.repeat }}</small>
                    <em>{{ segment.label }}</em>
                    <strong>{{ segment.durationLabel }}</strong>
                  </span>
                </div>
              </div>

              <div class="settings-panel" :class="{ 'is-open': isSettingsOpen }" aria-label="Impostazioni overlay">
                <button
                  type="button"
                  class="settings-toggle"
                  :aria-expanded="isSettingsOpen"
                  @click="toggleSettingsPanel"
                >
                  <span>Impostazioni</span>
                  <span class="accordion-chevron" aria-hidden="true" />
                </button>

                <div
                  class="accordion-panel settings-body-panel"
                  :class="{ 'is-open': isSettingsOpen }"
                  :aria-hidden="!isSettingsOpen"
                  :inert="!isSettingsOpen"
                >
                  <div class="accordion-content settings-body">
                    <div class="settings-list">
                      <button
                        type="button"
                        class="setting-row setting-row--button"
                        @click="toggleSound"
                      >
                        <span>Audio</span>
                        <strong :class="{ 'is-active': soundEnabled }">
                          {{ soundEnabled ? 'On' : 'Off' }}
                        </strong>
                      </button>

                      <button
                        type="button"
                        class="setting-row setting-row--button"
                        @click="toggleAutoDimDuringRun"
                      >
                        <span>Opacita auto</span>
                        <strong :class="{ 'is-active': autoDimDuringRun }">
                          {{ autoDimDuringRun ? 'On' : 'Off' }}
                        </strong>
                      </button>

                      <div class="shortcut-list">
                        <div
                          v-for="shortcut in overlayShortcuts"
                          :key="shortcut.label"
                          class="shortcut-row"
                        >
                          <span>{{ shortcut.label }}</span>
                          <strong>{{ shortcut.value }}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </template>

        <template v-else>
          <Transition name="hud-swap" mode="out-in">
            <div :key="hudTransitionKey" class="hud-swap-body">
              <div class="hud-focus-row">
                <div class="hud-copy">
                  <strong>{{ activeStep.title }}</strong>
                  <span>Step {{ activeStepIndex + 1 }}/{{ totalSteps }}</span>
                  <p class="hud-task">{{ activeTask }}</p>
                </div>
                <time class="hud-timer" aria-label="Tempo rimanente">{{ formattedTime }}</time>
              </div>
              <div
                v-if="phase === 'expired'"
                class="expiry-alert"
                role="status"
                aria-live="assertive"
              >
                Pronto per lo step successivo
              </div>
              <div v-if="phase !== 'expired'" class="progress-track" aria-hidden="true">
                <span :style="{ width: `${progressPercent}%` }" />
              </div>
            </div>
          </Transition>
        </template>
      </div>

      <div class="overlay-actions">
        <template v-if="phase === 'select'">
          <button type="button" class="primary" @click="startSession">
            Avvia
          </button>
          <button
            v-if="showPlacementControl"
            type="button"
            class="utility-action"
            @click="enterPlacementMode"
          >
            Sposta
          </button>
        </template>

        <template v-else-if="phase === 'running'">
          <button type="button" class="primary" @click="pauseSession">
            Pausa
          </button>
          <button type="button" class="secondary-action danger-action" @click="stopSession">
            Stop
          </button>
          <button v-if="showManualNextButton" type="button" class="dev-button" @click="skipToNextStepForDev">
            Next
          </button>
        </template>

        <template v-else-if="phase === 'paused'">
          <button type="button" class="primary" @click="resumeSession">
            Riprendi
          </button>
          <button type="button" class="secondary-action danger-action" @click="stopSession">
            Stop
          </button>
          <button v-if="showManualNextButton" type="button" class="dev-button" @click="skipToNextStepForDev">
            Next
          </button>
        </template>

        <template v-else-if="phase === 'expired'">
          <button type="button" class="primary" @click="goNextStep">
            Next
          </button>
          <button type="button" class="secondary-action danger-action" @click="stopSession">
            Stop
          </button>
        </template>

        <template v-else-if="phase === 'completed'">
          <button type="button" class="primary" @click="resetCompleted">
            Nuovo
          </button>
        </template>
      </div>
        </section>
      </Transition>
    </div>
  </main>
</template>

<style scoped lang="scss">
:global(html.training-overlay-document),
:global(body.training-overlay-runtime),
:global(body.training-overlay-runtime #__nuxt),
:global(body.training-overlay-runtime #app) {
  background-color: transparent !important;
  background: transparent !important;
  overflow: hidden !important;
}

.training-overlay {
  --overlay-accent: #22c55e;
  --overlay-accent-end: #14b8a6;
  --overlay-accent-rgb: 34, 197, 94;
  --overlay-accent-contrast: #04110a;
  --overlay-radius: 18px;
  --overlay-work-area-width: 472px;
  --overlay-work-area-height: 768px;
  --overlay-work-area-padding: 10px;
  --overlay-width: 334px;
  --overlay-height: 150px;
  --overlay-transform-origin: top left;
  width: min(100vw, var(--overlay-work-area-width));
  height: min(100vh, var(--overlay-work-area-height));
  display: block;
  padding: 0;
  overflow: visible;
  color: #f7fbff;
  font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
  background: transparent;
  box-sizing: border-box;
  position: fixed;
}

.overlay-work-area {
  position: relative;
  display: grid;
  width: 100%;
  height: 100%;
  overflow: visible;
  padding: var(--overlay-work-area-padding);
  background: transparent;
  box-sizing: border-box;
}

.training-overlay--origin-top-left {
  top: 0;
  right: auto;
  bottom: auto;
  left: 0;
}

.training-overlay--origin-top-left .overlay-work-area {
  place-items: start start;
}

.training-overlay--origin-top-right {
  top: 0;
  right: 0;
  bottom: auto;
  left: auto;
}

.training-overlay--origin-top-right .overlay-work-area {
  place-items: start end;
}

.training-overlay--origin-bottom-left {
  top: auto;
  right: auto;
  bottom: 0;
  left: 0;
}

.training-overlay--origin-bottom-left .overlay-work-area {
  place-items: end start;
}

.training-overlay--origin-bottom-right {
  top: auto;
  right: 0;
  bottom: 0;
  left: auto;
}

.training-overlay--origin-bottom-right .overlay-work-area {
  place-items: end end;
}

.overlay-surface--launcher,
.training-overlay--launcher {
  --overlay-width: 232px;
  --overlay-height: 66px;
}

.overlay-surface--placement,
.training-overlay--placement {
  --overlay-width: 100%;
  --overlay-height: 100%;
}

.overlay-surface--select,
.training-overlay--select {
  --overlay-width: 424px;
  --overlay-height: 620px;
}

.overlay-surface--session,
.training-overlay--running,
.training-overlay--paused {
  --overlay-width: 334px;
  --overlay-height: 162px;
}

.overlay-surface--expired,
.training-overlay--expired {
  --overlay-width: 334px;
  --overlay-height: 186px;
}

.overlay-surface--completed,
.training-overlay--completed {
  --overlay-width: 334px;
  --overlay-height: 158px;
}

.overlay-card {
  position: relative;
  grid-area: 1 / 1;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px;
  width: var(--overlay-width);
  max-width: 100%;
  height: min(var(--overlay-height), 100%);
  min-height: min(var(--overlay-height), 100%);
  max-height: 100%;
  padding: 12px;
  border: 1px solid rgba(var(--overlay-accent-rgb), 0.34);
  border-radius: var(--overlay-radius);
  overflow: hidden;
  background:
    radial-gradient(circle at 0 0, rgba(var(--overlay-accent-rgb), 0.22), transparent 40%),
    linear-gradient(145deg, #151d1f 0%, #0b0f13 54%, #07090d 100%);
  box-shadow:
    0 0 0 1px rgba(var(--overlay-accent-rgb), 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 -28px 60px rgba(var(--overlay-accent-rgb), 0.08);
  box-sizing: border-box;
  transform-origin: var(--overlay-transform-origin);
  opacity: var(--overlay-session-opacity, 1);
  transition:
    opacity 460ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 260ms ease,
    box-shadow 260ms ease,
    background 320ms ease;
  will-change: opacity, transform, filter;
}

.overlay-surface-enter-active {
  grid-area: 1 / 1;
  transition:
    opacity 280ms ease-out,
    transform 320ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 280ms ease-out;
  transition-delay: 70ms;
  transform-origin: var(--overlay-transform-origin);
  will-change: opacity, transform, filter;
}

.overlay-surface-leave-active {
  grid-area: 1 / 1;
  transition:
    opacity 260ms ease-in,
    transform 260ms cubic-bezier(0.4, 0, 1, 1),
    filter 240ms ease-in;
  transform-origin: var(--overlay-transform-origin);
  will-change: opacity, transform;
  pointer-events: none;
}

.overlay-surface-enter-from {
  opacity: 0;
  filter: saturate(1.08) brightness(1.02) blur(0.8px);
  transform: translateY(4px) scale(0.985);
}

.overlay-surface-leave-to {
  opacity: 0;
  filter: saturate(0.9) brightness(0.86) blur(0.8px);
  transform: translateY(-2px) scale(0.97);
}

.overlay-surface-enter-to,
.overlay-surface-leave-from {
  opacity: 1;
  filter: saturate(1) brightness(1);
  transform: translateY(0) scale(1);
}

.training-overlay--select .overlay-card {
  grid-template-rows: auto auto;
  gap: 8px;
  padding: 10px;
  height: auto;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
}

.training-overlay--running .overlay-card,
.training-overlay--paused .overlay-card,
.training-overlay--completed .overlay-card {
  gap: 8px;
  padding: 12px;
}

.training-overlay--running .overlay-card:hover,
.training-overlay--running .overlay-card:focus-within {
  opacity: 1;
}

.training-overlay--expired .overlay-card {
  gap: 8px;
  padding: 12px;
}

.launcher-button {
  position: relative;
  grid-area: 1 / 1;
  width: var(--overlay-width);
  max-width: 100%;
  height: min(var(--overlay-height), 100%);
  max-height: 100%;
  min-height: 0;
  border: 1px solid rgba(var(--overlay-accent-rgb), 0.6);
  border-radius: var(--overlay-radius);
  background:
    radial-gradient(circle at top left, rgba(var(--overlay-accent-rgb), 0.26), transparent 42%),
    linear-gradient(145deg, #14201a, #070a0d);
  color: #f6fff9;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  font-size: 13px;
  font-weight: 950;
  letter-spacing: 0;
  animation: overlayMaterialize 300ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: var(--overlay-transform-origin);
  will-change: opacity, transform, filter;
}

.launcher-button:hover,
.launcher-button:focus-visible {
  border-color: rgba(var(--overlay-accent-rgb), 0.9);
  background:
    radial-gradient(circle at top left, rgba(var(--overlay-accent-rgb), 0.36), transparent 44%),
    linear-gradient(145deg, rgba(23, 38, 30, 0.98), rgba(8, 10, 13, 0.97));
}

.training-overlay--expired .overlay-card {
  animation: expiredPulse 1s ease-in-out infinite;
}

.training-overlay--drag .placement-work-area {
  -webkit-app-region: drag;
  cursor: move;
}

.overlay-main {
  min-width: 0;
}

.hud-swap-body {
  display: grid;
}

.hud-swap-enter-active {
  transition:
    opacity 220ms ease,
    transform 260ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 220ms ease;
  will-change: opacity, transform, filter;
}

.hud-swap-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease,
    filter 140ms ease;
  will-change: opacity, transform, filter;
}

.hud-swap-enter-from {
  opacity: 0;
  transform: translateY(4px) scale(0.99);
  filter: blur(0.5px);
}

.hud-swap-leave-to {
  opacity: 0;
  transform: translateY(-3px) scale(0.99);
  filter: blur(0.5px);
}

.training-overlay--select .overlay-main {
  display: flex;
  min-height: auto;
  flex-direction: column;
  overflow: visible;
}

.overlay-topline {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  color: rgba(215, 232, 244, 0.62);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.overlay-topline-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.overlay-close-btn {
  width: 20px;
  height: 20px;
  min-width: 20px;
  min-height: 20px;
  aspect-ratio: 1 / 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  padding: 0;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(236, 245, 255, 0.92);
  font-size: 13px;
  font-weight: 900;
  line-height: 1;
}

.overlay-close-btn:hover,
.overlay-close-btn:focus-visible {
  border-color: rgba(var(--overlay-accent-rgb), 0.55);
  background: rgba(var(--overlay-accent-rgb), 0.18);
  color: #fff;
}

h1 {
  margin: 6px 0 0;
  color: #fff;
  font-size: 17px;
  line-height: 1.05;
}

.training-overlay--select h1 {
  margin-top: 5px;
  font-size: 16px;
}

p {
  margin: 5px 0 0;
  color: rgba(226, 238, 247, 0.75);
  font-size: 12px;
  line-height: 1.3;
}

.training-overlay--select p {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.2;
}

.setup-stack {
  display: grid;
  gap: 7px;
  margin-top: 8px;
}

.training-overlay--select .setup-stack {
  gap: 6px;
  margin-top: 7px;
  min-height: 0;
  overflow: visible;
  padding-right: 2px;
}

.placement-work-area {
  position: relative;
  grid-area: 1 / 1;
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 14px;
  border: 1px solid rgba(230, 238, 246, 0.34);
  border-radius: 18px;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(145, 158, 171, 0.24), rgba(70, 78, 88, 0.2)),
    rgba(12, 16, 20, 0.62);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.06),
    inset 0 0 80px rgba(var(--overlay-accent-rgb), 0.08);
  box-sizing: border-box;
  color: #f6fbff;
  transform-origin: center;
}

.placement-work-area::before {
  content: '';
  position: absolute;
  inset: 12px;
  border: 1px dashed rgba(238, 245, 252, 0.22);
  border-radius: 14px;
  pointer-events: none;
}

.placement-drag-layer {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  min-height: 0;
  text-align: center;
  pointer-events: none;
}

.placement-drag-layer span {
  color: rgba(248, 252, 255, 0.92);
  font-size: 15px;
  font-weight: 950;
}

.placement-drag-layer p {
  width: min(280px, 100%);
  margin: 0;
  color: rgba(226, 238, 247, 0.66);
  font-size: 11px;
  line-height: 1.3;
}

.placement-panel {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(9, 12, 16, 0.78);
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.22);
  -webkit-app-region: no-drag;
}

.training-overlay--placement .corner-control {
  padding: 0;
  border: 0;
  background: transparent;
}

.accordion-panel {
  display: grid;
  grid-template-rows: 0fr;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition:
    grid-template-rows 280ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 180ms ease,
    transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

.accordion-panel.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.accordion-content {
  min-height: 0;
  overflow: hidden;
}

.training-picker {
  display: grid;
  gap: 7px;
  padding: 8px 10px 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: #1b2025;
}

.training-overlay--select .training-picker {
  gap: 6px;
  padding: 7px 8px;
}

.training-picker > span,
.duration-row > span,
.settings-title {
  color: rgba(215, 232, 244, 0.58);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.training-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.training-overlay--select .training-options {
  gap: 5px;
  overflow: visible;
  padding-right: 0;
}

.training-current {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 38px;
  padding: 6px 16px 6px 10px;
  border-color: rgba(var(--overlay-accent-rgb), 0.32);
  background:
    linear-gradient(135deg, rgba(var(--overlay-accent-rgb), 0.16), rgba(255, 255, 255, 0.04)),
    #20262b;
  text-align: left;
}

.training-current > span {
  display: grid;
  align-content: center;
  gap: 1px;
  min-width: 0;
}

.training-current strong {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.training-current strong {
  color: rgba(248, 252, 255, 0.96);
  font-size: 13px;
  line-height: 1.18;
}

.accordion-chevron {
  display: grid;
  place-items: center;
  align-self: center;
  justify-self: end;
  width: 18px;
  height: 18px;
}

.accordion-chevron::before {
  content: '';
  display: block;
  width: 8px;
  height: 8px;
  border-right: 2px solid rgba(248, 252, 255, 0.78);
  border-bottom: 2px solid rgba(248, 252, 255, 0.78);
  transform: translateY(-2px) rotate(45deg);
  transition:
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 180ms ease;
}

button[aria-expanded='true'] .accordion-chevron::before {
  transform: translateY(2px) rotate(225deg);
}

button:hover .accordion-chevron::before,
button:focus-visible .accordion-chevron::before {
  border-color: rgba(248, 252, 255, 0.96);
}

.training-option {
  --training-accent: var(--overlay-accent);
  --training-accent-end: var(--overlay-accent-end);
  --training-accent-rgb: var(--overlay-accent-rgb);
  --training-accent-contrast: var(--overlay-accent-contrast);
  display: grid;
  place-items: center start;
  min-height: 34px;
  padding: 0 10px;
  text-align: left;
}

.training-overlay--select .training-option {
  min-height: 31px;
  padding: 0 9px;
}

.training-option strong {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.training-option strong {
  color: rgba(248, 252, 255, 0.94);
  font-size: 12px;
  line-height: 1.12;
}

.training-overlay--select .training-option strong {
  font-size: 12px;
}

.training-option.is-active {
  border-color: rgba(var(--training-accent-rgb), 0.72);
  background:
    radial-gradient(circle at top left, rgba(var(--training-accent-rgb), 0.22), transparent 58%),
    linear-gradient(145deg, rgba(var(--training-accent-rgb), 0.2), #20272c);
}

.duration-row {
  display: grid;
  grid-template-columns: 62px 1fr;
  align-items: center;
  gap: 8px;
  padding: 5px 6px 5px 10px;
  border-radius: 10px;
  background: #1b2025;
}

.training-overlay--select .duration-row {
  min-height: 32px;
  padding: 4px 5px 4px 10px;
}

.duration-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.corner-control {
  display: grid;
  gap: 6px;
  margin-top: 10px;
  padding: 8px;
  border: 1px solid rgba(var(--overlay-accent-rgb), 0.18);
  border-radius: 10px;
  background: #171c21;
}

.corner-control > span {
  color: rgba(215, 232, 244, 0.58);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.corner-control--settings {
  width: 100%;
  margin-top: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

.corner-control.is-disabled {
  opacity: 0.58;
}

.origin-mode-control {
  display: grid;
  gap: 6px;
}

.origin-mode-control > span {
  color: rgba(215, 232, 244, 0.58);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.origin-mode-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.origin-mode-options button {
  min-height: 24px;
  padding: 0 8px;
  font-size: 10px;
}

.corner-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.corner-options button {
  min-height: 24px;
  padding: 0 8px;
  font-size: 10px;
}

.corner-options button:disabled {
  cursor: default;
  opacity: 0.5;
}

.training-plan-preview {
  display: grid;
  gap: 6px;
  width: 100%;
  padding: 7px 9px 8px;
  border: 1px solid rgba(var(--overlay-accent-rgb), 0.18);
  border-radius: 10px;
  background:
    radial-gradient(circle at top left, rgba(var(--overlay-accent-rgb), 0.1), transparent 52%),
    #172026;
  box-sizing: border-box;
}

.training-plan-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.training-plan-head span {
  color: rgba(215, 232, 244, 0.58);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.training-plan-head strong {
  color: rgba(248, 252, 255, 0.82);
  font-size: 10px;
  font-weight: 950;
}

.training-plan-chips {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  width: 100%;
  min-width: 0;
  gap: 4px;
}

.plan-chip {
  position: relative;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-content: center;
  align-items: center;
  min-height: 32px;
  gap: 2px 6px;
  padding: 5px 7px;
  border: 1px solid rgba(var(--overlay-accent-rgb), 0.24);
  border-radius: 7px;
  background:
    linear-gradient(135deg, rgba(var(--overlay-accent-rgb), 0.28), rgba(var(--overlay-accent-rgb), 0.12)),
    #20262b;
  box-sizing: border-box;
}

.plan-chip.has-repeat {
  grid-column: span 2;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.plan-chip--pause,
.plan-chip--review,
.plan-chip--recap {
  border-color: rgba(255, 255, 255, 0.14);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.07)),
    #20252a;
}

.plan-chip--race,
.plan-chip--stint,
.plan-chip--work,
.plan-chip--focusRun {
  border-color: rgba(var(--overlay-accent-rgb), 0.42);
}

.plan-chip em,
.plan-chip strong,
.plan-chip small {
  overflow: hidden;
  color: rgba(248, 252, 255, 0.88);
  font-style: normal;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-chip em {
  font-size: 10px;
  font-weight: 950;
}

.plan-chip strong {
  color: rgba(226, 238, 247, 0.62);
  font-size: 9px;
  font-weight: 900;
}

.plan-chip small {
  grid-row: 1 / span 2;
  grid-column: 1;
  min-width: 19px;
  padding: 3px 4px;
  border-radius: 999px;
  background: rgba(var(--overlay-accent-rgb), 0.2);
  color: rgba(248, 252, 255, 0.88);
  font-size: 9px;
  font-weight: 950;
  text-align: center;
}

.settings-panel {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  justify-self: stretch;
  padding: 0;
  border: 1px solid rgba(var(--overlay-accent-rgb), 0.18);
  border-radius: 10px;
  background: #171c21;
  overflow: hidden;
}

.settings-toggle {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 30px;
  padding: 0 16px 0 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: rgba(215, 232, 244, 0.62);
  font-size: 9px;
  font-weight: 950;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
}

.settings-body {
  display: grid;
  grid-template-columns: 1fr;
  align-items: start;
  gap: 8px;
  padding: 0 10px;
  transition: padding-bottom 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-body-panel.is-open .settings-body {
  padding-bottom: 10px;
}

@media (prefers-reduced-motion: reduce) {
  .accordion-panel {
    transition-duration: 1ms;
  }
}

.setting-row,
.shortcut-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  justify-content: start;
  gap: 10px;
}

.setting-row {
  width: 100%;
  min-height: 20px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: rgba(226, 238, 247, 0.7);
  font-size: 11px;
  text-align: left;
}

.settings-list {
  display: grid;
  width: min(100%, 160px);
  min-width: 0;
  gap: 5px;
}

.setting-row:hover,
.setting-row:focus-visible {
  border-color: transparent;
  color: rgba(248, 252, 255, 0.92);
}

.setting-row strong {
  min-width: 38px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  color: rgba(226, 238, 247, 0.7);
  font-size: 10px;
  font-weight: 950;
  line-height: 1;
  text-align: center;
}

.setting-row strong.is-active {
  border-color: rgba(var(--overlay-accent-rgb), 0.7);
  background: linear-gradient(90deg, var(--overlay-accent), var(--overlay-accent-end));
  color: var(--overlay-accent-contrast);
}

.shortcut-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 5px;
}

.shortcut-row {
  display: grid;
  color: rgba(226, 238, 247, 0.7);
  font-size: 11px;
}

.shortcut-row strong {
  color: rgba(248, 252, 255, 0.9);
  font-size: 11px;
  font-weight: 900;
}

.placement-hint {
  grid-column: 1 / -1;
  margin: 0;
  color: rgba(226, 238, 247, 0.68);
  font-size: 10px;
  line-height: 1.25;
}

button {
  min-height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(240, 247, 255, 0.82);
  font-size: 11px;
  font-weight: 900;
  -webkit-app-region: no-drag;
}

button:hover,
button:focus-visible {
  border-color: rgba(var(--overlay-accent-rgb), 0.5);
}

button.primary,
button.is-active {
  border-color: rgba(var(--overlay-accent-rgb), 0.7);
  background: linear-gradient(90deg, var(--overlay-accent), var(--overlay-accent-end));
  color: var(--overlay-accent-contrast);
}

.hud-focus-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
  margin-top: 2px;
}

.hud-copy {
  min-width: 0;
}

.hud-copy strong {
  display: block;
  overflow: hidden;
  color: #fff;
  font-size: 18px;
  font-weight: 950;
  line-height: 1.08;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hud-copy span {
  display: block;
  margin-top: 4px;
  color: rgba(var(--overlay-accent-rgb), 0.88);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.08em;
  line-height: 1.05;
  text-transform: uppercase;
}

.hud-timer {
  flex: 0 0 116px;
  align-self: start;
  margin-top: -1px;
  color: #fff;
  font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 36px;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1, 'zero' 1;
  line-height: 0.88;
  letter-spacing: 0;
  text-align: right;
  white-space: nowrap;
}

.hud-task {
  min-height: 34px;
  margin-top: 6px;
  overflow: hidden;
  color: rgba(236, 245, 255, 0.8);
  display: -webkit-box;
  font-size: 13px;
  line-height: 1.3;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-overflow: ellipsis;
}

.expiry-alert {
  margin-top: 6px;
  padding: 6px 8px;
  border: 1px solid rgba(var(--overlay-accent-rgb), 0.45);
  border-radius: 9px;
  background: rgba(var(--overlay-accent-rgb), 0.16);
  color: #fff7ed;
  font-size: 10px;
  font-weight: 900;
}

.progress-track {
  height: 5px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.progress-track span {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--overlay-accent), var(--overlay-accent-end));
  transition: width 0.2s linear;
}

.overlay-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.training-overlay--select .overlay-actions {
  grid-template-columns: minmax(0, 1fr) 96px;
}

.training-overlay--select .overlay-actions .primary {
  min-height: 30px;
}

.utility-action {
  min-height: 30px;
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.045);
  color: rgba(226, 238, 247, 0.7);
}

.utility-action:hover,
.utility-action:focus-visible {
  border-color: rgba(var(--overlay-accent-rgb), 0.42);
  background: rgba(var(--overlay-accent-rgb), 0.1);
  color: rgba(248, 252, 255, 0.9);
}

.training-overlay--running .overlay-actions,
.training-overlay--paused .overlay-actions,
.training-overlay--completed .overlay-actions {
  gap: 7px;
}

.training-overlay--running .overlay-actions button,
.training-overlay--paused .overlay-actions button,
.training-overlay--completed .overlay-actions button {
  min-height: 30px;
  font-size: 12px;
}

.secondary-action {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.045);
  color: rgba(226, 238, 247, 0.68);
}

.danger-action:hover,
.danger-action:focus-visible {
  border-color: rgba(248, 113, 113, 0.48);
  background: rgba(127, 29, 29, 0.18);
  color: rgba(254, 226, 226, 0.92);
}

.overlay-actions:has(.dev-button) {
  grid-template-columns: 1fr 0.76fr 0.62fr;
}

.overlay-actions:has(> button:only-child) {
  grid-template-columns: 1fr;
}

.dev-button {
  color: #d9ecff;
  border-color: rgba(96, 165, 250, 0.4);
  background: rgba(37, 99, 235, 0.16);
}

@keyframes expiredPulse {
  0%,
  100% {
    border-color: rgba(var(--overlay-accent-rgb), 0.42);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  50% {
    border-color: rgba(var(--overlay-accent-rgb), 0.92);
    box-shadow:
      inset 0 0 0 1px rgba(var(--overlay-accent-rgb), 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
}

@keyframes overlayMaterialize {
  from {
    opacity: 0;
    transform: scale(0.96);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
