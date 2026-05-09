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
type OverlaySize = { width: number; height: number }

interface TrainingOverlaySettings {
  hasConfiguredPosition?: boolean
  lastTrainingId?: string
  lastDurationId?: TrainingOverlayDurationModeId
  soundEnabled?: boolean
  originCorner?: OverlayOriginCorner
}

const selectedTrainingId = ref<TrainingOverlayId>('tracktitan_input')
const selectedModeId = ref<TrainingOverlayDurationModeId>('short30')
const activeStepIndex = ref(0)
const phase = ref<OverlayPhase>('loading')
const remainingMs = ref(0)
const isElectronRuntime = ref(false)
const soundEnabled = ref(true)
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
const OVERLAY_WORK_AREA_SIZE: OverlaySize = { width: 432, height: 728 }
const OVERLAY_CARD_SIZES: Record<OverlaySizePreset, OverlaySize> = {
  launcher: { width: 232, height: 66 },
  placement: { width: 392, height: 260 },
  select: { width: 424, height: 620 },
  session: { width: 334, height: 150 },
  expired: { width: 334, height: 178 },
  completed: { width: 334, height: 150 }
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
const activeStep = computed<TrainingOverlayStep>(() => {
  return selectedMode.value.steps[activeStepIndex.value] || selectedMode.value.steps[0]!
})
const totalSteps = computed(() => selectedMode.value.steps.length)
const isActiveSession = computed(() => ['running', 'paused', 'expired'].includes(phase.value))
const showDevStepButton = computed(() => showDevControls && ['running', 'paused'].includes(phase.value))
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
const phaseLabel = computed(() => {
  if (phase.value === 'placement') return 'Posiziona'
  if (phase.value === 'launcher') return 'Pronto'
  if (phase.value === 'select') return 'Pronto'
  if (phase.value === 'paused') return 'Pausa'
  if (phase.value === 'expired') return 'Tempo finito'
  if (phase.value === 'completed') return 'Completato'
  if (phase.value === 'running') return 'Step attivo'
  return 'Caricamento'
})
const activeTask = computed(() => {
  if (phase.value === 'placement') return 'Trascina il box, poi conferma.'
  if (phase.value === 'select') return 'Scegli durata, audio e avvia.'
  if (phase.value === 'launcher') return 'Apri la scelta allenamento.'
  if (phase.value === 'paused') return 'Timer fermo.'
  if (phase.value === 'expired') return 'Step finito. Passa al prossimo.'
  if (phase.value === 'completed') return 'Allenamento completato.'

  return activeStep.value.hud
})

const selectedOriginLabel = computed(() => {
  return originCornerOptions.find((option) => option.id === originCorner.value)?.label || 'Alto sx'
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
    '--overlay-height': `${cardSize.height}px`
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

function scheduleOverlaySizeSync(retries = 2) {
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
  const beepOffsets = [0, 0.22, 0.44]

  beepOffsets.forEach((offset) => {
    const startAt = firstBeepAt + offset
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(980, startAt)
    oscillator.frequency.exponentialRampToValueAtTime(760, startAt + 0.14)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.015)
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

function selectOriginCorner(nextOriginCorner: OverlayOriginCorner) {
  if (isActiveSession.value) return
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
  phase.value = 'placement'
}

async function confirmPlacement() {
  const settings = await getOverlayApi()?.trainingOverlayConfirmPlacement?.()
  selectedTrainingId.value = resolveTrainingOverlayTrainingId(settings?.lastTrainingId || selectedTrainingId.value)
  selectedModeId.value = resolveTrainingOverlayModeId(settings?.lastDurationId || selectedModeId.value)
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
  originCorner.value = resolveOverlayOriginCorner(settings?.originCorner)
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  phase.value = settings?.hasConfiguredPosition || !api ? 'launcher' : 'placement'

  removeCommandListener = api?.onTrainingOverlayCommand?.(handleOverlayCommand)
  connectOverlayResizeObserver()
  scheduleOverlaySizeSync()
})

watch([phase, selectedTrainingId, selectedModeId, soundEnabled, originCorner, isTrainingPickerOpen, isSettingsOpen], () => {
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
      <Transition name="overlay-surface">
        <button
          v-if="phase === 'launcher'"
          key="launcher"
          type="button"
          :class="['launcher-button', `overlay-surface--${overlaySizePreset}`]"
          @click="openTrainingSelection"
        >
          Inizia allenamento
        </button>

        <section v-else-if="phase !== 'loading'" :key="phase" :class="['overlay-card', `overlay-surface--${overlaySizePreset}`]">
        <div class="overlay-main">
        <div class="overlay-topline">
          <span>{{ phaseLabel }}</span>
          <span v-if="isActiveSession || phase === 'completed'">
            {{ activeStepIndex + 1 }}/{{ totalSteps }}
          </span>
          <span v-else>Ctrl+K</span>
        </div>

        <template v-if="phase === 'select' || phase === 'placement'">
          <h1>{{ selectedTraining.title }}</h1>
          <p>{{ activeTask }}</p>

          <div v-if="phase === 'placement'" class="corner-control" aria-label="Origine overlay">
            <span>Origine</span>
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
                  @click="toggleTrainingPicker"
                >
                  <span>
                    <strong>{{ selectedTraining.label }}</strong>
                    <small>{{ selectedTraining.summary }}</small>
                  </span>
                  <em>{{ isTrainingPickerOpen ? 'Chiudi' : 'Cambia' }}</em>
                </button>
                <div v-if="isTrainingPickerOpen" class="training-options">
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
                    <small>{{ training.summary }}</small>
                  </button>
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
                <div class="training-plan-list">
                  <div
                    v-for="(step, index) in selectedMode.steps"
                    :key="step.id"
                    class="training-plan-row"
                  >
                    <span class="plan-index">{{ index + 1 }}</span>
                    <div class="plan-copy">
                      <span>{{ step.title }}</span>
                    </div>
                    <strong>{{ step.durationMinutes }} min</strong>
                  </div>
                </div>
              </div>

              <div class="settings-panel" :class="{ 'is-open': isSettingsOpen }" aria-label="Impostazioni overlay">
                <button
                  type="button"
                  class="settings-toggle"
                  @click="toggleSettingsPanel"
                >
                  <span>Impostazioni</span>
                  <strong>{{ selectedOriginLabel }}</strong>
                </button>

                <div v-if="isSettingsOpen" class="settings-body">
                  <div class="corner-control corner-control--settings" aria-label="Origine overlay">
                    <span>Posizione</span>
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
          </template>
        </template>

        <template v-else>
          <div class="hud-status-row">
            <span class="hud-step-type">{{ trainingOverlayStepTypeLabels[activeStep.type] }}</span>
            <strong>{{ formattedTime }}</strong>
          </div>
          <p class="hud-task">{{ activeTask }}</p>
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
        </template>
      </div>

      <div class="overlay-actions">
        <template v-if="phase === 'placement'">
          <p class="placement-hint">Scegli un angolo libero: il pannello si aprira verso lo spazio interno.</p>
          <button type="button" class="primary" @click="confirmPlacement">
            Usa posizione
          </button>
          <button type="button" @click="closeOverlay">
            Chiudi
          </button>
        </template>

        <template v-else-if="phase === 'select'">
          <button type="button" class="primary" @click="startSession">
            Avvia
          </button>
          <button v-if="showPlacementControl" type="button" @click="enterPlacementMode">
            Sposta
          </button>
        </template>

        <template v-else-if="phase === 'running'">
          <button type="button" class="primary" @click="pauseSession">
            Pausa
          </button>
          <button type="button" @click="stopSession">
            Stop
          </button>
          <button v-if="showDevStepButton" type="button" class="dev-button" @click="skipToNextStepForDev">
            Next
          </button>
        </template>

        <template v-else-if="phase === 'paused'">
          <button type="button" class="primary" @click="resumeSession">
            Riprendi
          </button>
          <button type="button" @click="stopSession">
            Stop
          </button>
          <button v-if="showDevStepButton" type="button" class="dev-button" @click="skipToNextStepForDev">
            Next
          </button>
        </template>

        <template v-else-if="phase === 'expired'">
          <button type="button" class="primary" @click="goNextStep">
            Next
          </button>
          <button type="button" @click="stopSession">
            Stop
          </button>
        </template>

        <template v-else-if="phase === 'completed'">
          <button type="button" class="primary" @click="resetCompleted">
            Nuovo
          </button>
          <button v-if="isElectronRuntime" type="button" @click="closeOverlay">
            Chiudi
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
  --overlay-work-area-width: 432px;
  --overlay-work-area-height: 728px;
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
  background: #000;
  box-sizing: border-box;
  position: fixed;
}

.overlay-work-area {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: visible;
  background: #000;
  box-sizing: border-box;
}

.training-overlay--origin-top-left {
  top: 0;
  right: auto;
  bottom: auto;
  left: 0;
}

.training-overlay--origin-top-right {
  top: 0;
  right: 0;
  bottom: auto;
  left: auto;
}

.training-overlay--origin-bottom-left {
  top: auto;
  right: auto;
  bottom: 0;
  left: 0;
}

.training-overlay--origin-bottom-right {
  top: auto;
  right: 0;
  bottom: 0;
  left: auto;
}

.training-overlay--origin-top-left .overlay-card,
.training-overlay--origin-top-left .launcher-button {
  top: 0;
  right: auto;
  bottom: auto;
  left: 0;
}

.training-overlay--origin-top-right .overlay-card,
.training-overlay--origin-top-right .launcher-button {
  top: 0;
  right: 0;
  bottom: auto;
  left: auto;
}

.training-overlay--origin-bottom-left .overlay-card,
.training-overlay--origin-bottom-left .launcher-button {
  top: auto;
  right: auto;
  bottom: 0;
  left: 0;
}

.training-overlay--origin-bottom-right .overlay-card,
.training-overlay--origin-bottom-right .launcher-button {
  top: auto;
  right: 0;
  bottom: 0;
  left: auto;
}

.overlay-surface--launcher,
.training-overlay--launcher {
  --overlay-width: 232px;
  --overlay-height: 66px;
}

.overlay-surface--placement,
.training-overlay--placement {
  --overlay-width: 392px;
  --overlay-height: 260px;
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
  --overlay-height: 150px;
}

.overlay-surface--expired,
.training-overlay--expired {
  --overlay-width: 334px;
  --overlay-height: 178px;
}

.overlay-surface--completed,
.training-overlay--completed {
  --overlay-width: 334px;
  --overlay-height: 150px;
}

.overlay-card {
  position: absolute;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px;
  width: var(--overlay-width);
  max-width: 100%;
  height: min(var(--overlay-height), 100%);
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
  animation: overlayMaterialize 300ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: var(--overlay-transform-origin);
  will-change: opacity, transform, filter;
}

.overlay-surface-enter-active {
  transition:
    opacity 220ms ease-out,
    transform 340ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 340ms ease-out;
  transform-origin: var(--overlay-transform-origin);
  will-change: opacity, transform, filter;
}

.overlay-surface-leave-active {
  position: absolute;
  transition:
    opacity 120ms ease-in,
    transform 120ms cubic-bezier(0.4, 0, 1, 1);
  transform-origin: var(--overlay-transform-origin);
  will-change: opacity, transform;
  pointer-events: none;
}

.overlay-surface-enter-from {
  opacity: 0;
  filter: saturate(1.18) brightness(1.08);
  transform: translateY(3px) scale(0.985);
}

.overlay-surface-leave-to {
  opacity: 0;
  transform: translateY(-2px) scale(0.992);
}

.overlay-surface-enter-to,
.overlay-surface-leave-from {
  opacity: 1;
  filter: saturate(1) brightness(1);
  transform: translateY(0) scale(1);
}

.training-overlay--select .overlay-card {
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 10px;
  min-height: 0;
  overflow: hidden;
}

.training-overlay--running .overlay-card,
.training-overlay--paused .overlay-card,
.training-overlay--completed .overlay-card {
  gap: 6px;
  padding: 10px;
}

.training-overlay--expired .overlay-card {
  gap: 6px;
  padding: 10px;
}

.launcher-button {
  position: absolute;
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

.training-overlay--drag .overlay-card {
  -webkit-app-region: drag;
  cursor: move;
}

.overlay-main {
  min-width: 0;
}

.training-overlay--select .overlay-main {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--overlay-accent-rgb), 0.48) rgba(255, 255, 255, 0.05);
}

.overlay-topline {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: rgba(215, 232, 244, 0.62);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
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

.training-overlay--placement .overlay-card {
  grid-template-rows: auto auto;
  height: var(--overlay-height);
  min-height: 0;
  overflow: hidden;
}

.training-overlay--placement .corner-control {
  margin-top: 8px;
  padding: 7px;
}

.training-overlay--placement .overlay-actions {
  align-self: end;
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
  gap: 10px;
  min-height: 42px;
  padding: 7px 8px;
  border-color: rgba(var(--overlay-accent-rgb), 0.32);
  background:
    linear-gradient(135deg, rgba(var(--overlay-accent-rgb), 0.16), rgba(255, 255, 255, 0.04)),
    #20262b;
  text-align: left;
}

.training-current > span {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.training-current strong,
.training-current small {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.training-current strong {
  color: rgba(248, 252, 255, 0.96);
  font-size: 12px;
  line-height: 1.18;
}

.training-current small {
  color: rgba(226, 238, 247, 0.66);
  font-size: 10px;
  line-height: 1.28;
}

.training-current em {
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(var(--overlay-accent-rgb), 0.18);
  color: rgba(248, 252, 255, 0.86);
  font-size: 9px;
  font-style: normal;
  font-weight: 950;
  text-transform: uppercase;
}

.training-option {
  --training-accent: var(--overlay-accent);
  --training-accent-end: var(--overlay-accent-end);
  --training-accent-rgb: var(--overlay-accent-rgb);
  --training-accent-contrast: var(--overlay-accent-contrast);
  display: grid;
  gap: 2px;
  align-content: center;
  min-height: 43px;
  padding: 7px 9px;
  text-align: left;
}

.training-overlay--select .training-option {
  gap: 2px;
  min-height: 36px;
  padding: 5px 8px 6px;
}

.training-option strong,
.training-option small {
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
  font-size: 11px;
}

.training-option small {
  display: block;
  color: rgba(226, 238, 247, 0.62);
  font-size: 10px;
  font-weight: 750;
  line-height: 1.28;
}

.training-overlay--select .training-option small {
  font-size: 9px;
  line-height: 1.28;
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

.training-plan-preview {
  display: grid;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
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

.training-plan-list {
  display: grid;
  gap: 4px;
  max-height: 124px;
  overflow: auto;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--overlay-accent-rgb), 0.48) rgba(255, 255, 255, 0.05);
}

.training-plan-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  height: 24px;
  min-height: 24px;
  padding: 0 7px 0 5px;
  border-radius: 7px;
  background: #20262b;
  border-left: 2px solid rgba(var(--overlay-accent-rgb), 0.58);
}

.plan-index {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border-radius: 999px;
  background: rgba(var(--overlay-accent-rgb), 0.18);
  color: rgba(248, 252, 255, 0.72);
  font-size: 9px;
  font-weight: 950;
}

.training-plan-row .plan-copy {
  display: grid;
  min-width: 0;
}

.training-plan-row .plan-copy span {
  overflow: hidden;
  color: rgba(248, 252, 255, 0.9);
  font-size: 10px;
  font-weight: 850;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.training-plan-row strong {
  flex: 0 0 auto;
  justify-self: end;
  color: rgba(248, 252, 255, 0.78);
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
}

.settings-panel {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 5px;
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
  padding: 0 10px;
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

.settings-toggle strong {
  color: rgba(248, 252, 255, 0.86);
  font-size: 10px;
  letter-spacing: 0;
  text-transform: none;
}

.settings-body {
  display: grid;
  grid-template-columns: 1fr;
  align-items: start;
  gap: 8px;
  padding: 0 10px 10px;
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

.hud-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 5px;
}

.hud-status-row strong {
  flex: 0 0 100px;
  color: #fff;
  font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 32px;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1, 'zero' 1;
  line-height: 0.95;
  letter-spacing: 0;
  text-align: right;
  white-space: nowrap;
}

.hud-step-type {
  flex: 0 0 auto;
  color: rgba(236, 245, 255, 0.7);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hud-task {
  min-height: 14px;
  overflow: hidden;
  white-space: nowrap;
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
  height: 4px;
  margin-top: 6px;
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
  gap: 6px;
}

.training-overlay--running .overlay-actions,
.training-overlay--paused .overlay-actions,
.training-overlay--completed .overlay-actions {
  gap: 5px;
}

.training-overlay--running .overlay-actions button,
.training-overlay--paused .overlay-actions button,
.training-overlay--completed .overlay-actions button {
  min-height: 26px;
}

.overlay-actions:has(.dev-button) {
  grid-template-columns: 1fr 1fr 0.72fr;
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
