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

interface TrainingOverlaySettings {
  hasConfiguredPosition?: boolean
  lastTrainingId?: string
  lastDurationId?: TrainingOverlayDurationModeId
  soundEnabled?: boolean
}

const selectedTrainingId = ref<TrainingOverlayId>('tracktitan_input')
const selectedModeId = ref<TrainingOverlayDurationModeId>('short30')
const activeStepIndex = ref(0)
const phase = ref<OverlayPhase>('loading')
const remainingMs = ref(0)
const isElectronRuntime = ref(false)
const soundEnabled = ref(true)
const overlayRoot = ref<HTMLElement | null>(null)
const showDevControls = import.meta.dev
const overlayShortcuts = [
  { label: 'Overlay', value: 'Ctrl+K' },
  { label: 'Azione', value: 'Ctrl+N' }
]

let deadlineAt = 0
let timerHandle: ReturnType<typeof setInterval> | null = null
let removeCommandListener: (() => void) | undefined
let stepAudioContext: AudioContext | null = null

const selectedTraining = computed<TrainingOverlayTraining>(() => {
  return trainingOverlayTrainingList.find((training) => training.id === selectedTrainingId.value)
    || trainingOverlayTrainingList[0]!
})
const selectedMode = computed(() => selectedTraining.value.modes[selectedModeId.value])
const selectedModeList = computed(() => Object.values(selectedTraining.value.modes))
const overlayThemeStyle = computed(() => ({
  '--overlay-accent': selectedTraining.value.accent,
  '--overlay-accent-rgb': selectedTraining.value.accentRgb,
  '--overlay-accent-contrast': selectedTraining.value.accentContrast
}))
const activeStep = computed<TrainingOverlayStep>(() => {
  return selectedMode.value.steps[activeStepIndex.value] || selectedMode.value.steps[0]!
})
const totalSteps = computed(() => selectedMode.value.steps.length)
const isActiveSession = computed(() => ['running', 'paused', 'expired'].includes(phase.value))
const showDevStepButton = computed(() => showDevControls && ['running', 'paused'].includes(phase.value))
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

const overlaySizePreset = computed<OverlaySizePreset>(() => {
  if (phase.value === 'launcher') return 'launcher'
  if (phase.value === 'placement') return 'placement'
  if (phase.value === 'select') return 'select'
  if (phase.value === 'expired') return 'expired'
  if (phase.value === 'completed') return 'completed'
  return 'session'
})

function getOverlayApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
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
    soundEnabled: soundEnabled.value
  })
}

function getMeasuredOverlaySize(preset: OverlaySizePreset) {
  if (preset !== 'select' || typeof window === 'undefined') return null

  const element = overlayRoot.value
  if (!element) return null

  const rect = element.getBoundingClientRect()
  const width = Math.ceil(rect.width)
  const height = Math.ceil(Math.max(rect.height, element.scrollHeight))

  if (!width || !height) return null

  return { preset, width, height }
}

async function applyOverlaySize(preset: OverlaySizePreset = overlaySizePreset.value) {
  await nextTick()
  const measuredSize = getMeasuredOverlaySize(preset)
  await getOverlayApi()?.trainingOverlaySetSize?.(measuredSize || preset)
}

function selectTraining(trainingId: TrainingOverlayId) {
  if (isActiveSession.value) return
  selectedTrainingId.value = trainingId
  selectedModeId.value = resolveTrainingOverlayModeId(selectedModeId.value)
  activeStepIndex.value = 0
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  void savePreferences()
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
  activeStepIndex.value = 0
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  phase.value = 'select'
}

function enterPlacementMode() {
  if (isActiveSession.value) return
  phase.value = 'placement'
}

async function confirmPlacement() {
  const settings = await getOverlayApi()?.trainingOverlayConfirmPlacement?.()
  selectedTrainingId.value = resolveTrainingOverlayTrainingId(settings?.lastTrainingId || selectedTrainingId.value)
  selectedModeId.value = resolveTrainingOverlayModeId(settings?.lastDurationId || selectedModeId.value)
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
  remainingMs.value = selectedMode.value.steps[0]!.durationMinutes * 60_000
  phase.value = settings?.hasConfiguredPosition || !api ? 'launcher' : 'placement'

  removeCommandListener = api?.onTrainingOverlayCommand?.(handleOverlayCommand)
  void applyOverlaySize()
})

watch([phase, selectedTrainingId, selectedModeId, soundEnabled], () => {
  void applyOverlaySize()
}, { flush: 'post' })

onBeforeUnmount(() => {
  clearTimer()
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
      { 'training-overlay--drag': phase === 'placement' }
    ]"
  >
    <Transition name="overlay-surface">
      <button
        v-if="phase === 'launcher'"
        key="launcher"
        type="button"
        class="launcher-button"
        @click="openTrainingSelection"
      >
        Inizia allenamento
      </button>

      <section v-else :key="phase" class="overlay-card">
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

          <template v-if="phase === 'select'">
            <div class="setup-stack">
              <div class="training-picker" aria-label="Tipo allenamento">
                <span>Allenamento</span>
                <div class="training-options">
                  <button
                    v-for="training in trainingOverlayTrainingList"
                    :key="training.id"
                    type="button"
                    :class="[
                      'training-option',
                      `training-option--${training.tone}`,
                      { 'is-active': selectedTrainingId === training.id }
                    ]"
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

              <div class="settings-panel" aria-label="Impostazioni overlay">
                <span class="settings-title">Impostazioni</span>

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
          <button v-if="isElectronRuntime" type="button" @click="enterPlacementMode">
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
  --overlay-accent-rgb: 34, 197, 94;
  --overlay-accent-contrast: #04110a;
  --overlay-safe-frame: 6px;
  --overlay-radius: 18px;
  --overlay-width: 340px;
  --overlay-height: 156px;
  width: min(100vw, var(--overlay-width));
  height: min(100vh, var(--overlay-height));
  display: grid;
  place-items: stretch;
  padding: var(--overlay-safe-frame);
  overflow: hidden;
  color: #f7fbff;
  font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
  background: transparent;
  box-sizing: border-box;
  position: relative;
}

.training-overlay--launcher {
  --overlay-width: 232px;
  --overlay-height: 66px;
}

.training-overlay--placement {
  --overlay-width: 392px;
  --overlay-height: 170px;
}

.training-overlay--select {
  --overlay-width: 424px;
  --overlay-height: 370px;
  height: auto;
  min-height: 0;
}

.training-overlay--running,
.training-overlay--paused {
  --overlay-width: 340px;
  --overlay-height: 160px;
}

.training-overlay--expired {
  --overlay-width: 340px;
  --overlay-height: 184px;
}

.training-overlay--completed {
  --overlay-width: 340px;
  --overlay-height: 160px;
}

.overlay-card {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 12px;
  border: 1px solid rgba(var(--overlay-accent-rgb), 0.34);
  border-radius: var(--overlay-radius);
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(var(--overlay-accent-rgb), 0.2), transparent 38%),
    linear-gradient(145deg, rgba(17, 22, 25, 0.96), rgba(9, 10, 15, 0.95));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  box-sizing: border-box;
  animation: overlayMaterialize 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.overlay-surface-enter-active {
  transition:
    opacity 150ms ease-out,
    transform 190ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 190ms ease-out;
}

.overlay-surface-leave-active {
  position: absolute;
  inset: var(--overlay-safe-frame);
  width: calc(100% - (var(--overlay-safe-frame) * 2));
  transition:
    opacity 90ms ease-in,
    transform 90ms ease-in;
  pointer-events: none;
}

.overlay-surface-enter-from {
  opacity: 0;
  filter: saturate(1.35) brightness(1.12);
  transform: translateY(4px) scale(0.965);
}

.overlay-surface-leave-to {
  opacity: 0;
  transform: translateY(-3px) scale(0.985);
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
}

.launcher-button {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid rgba(var(--overlay-accent-rgb), 0.6);
  border-radius: var(--overlay-radius);
  background:
    radial-gradient(circle at top left, rgba(var(--overlay-accent-rgb), 0.28), transparent 42%),
    linear-gradient(145deg, rgba(19, 28, 24, 0.98), rgba(8, 10, 13, 0.97));
  color: #f6fff9;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  font-size: 13px;
  font-weight: 950;
  letter-spacing: 0;
  animation: overlayMaterialize 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.launcher-button:hover,
.launcher-button:focus-visible {
  border-color: rgba(var(--overlay-accent-rgb), 0.9);
  background:
    radial-gradient(circle at top left, rgba(var(--overlay-accent-rgb), 0.36), transparent 44%),
    linear-gradient(145deg, rgba(23, 38, 30, 0.98), rgba(8, 10, 13, 0.97));
}

.training-overlay--expired {
  --overlay-accent: #f59e0b;
  --overlay-accent-rgb: 245, 158, 11;
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
}

.training-picker {
  display: grid;
  gap: 6px;
  padding: 8px 10px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.055);
}

.training-overlay--select .training-picker {
  gap: 5px;
  padding: 7px;
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
}

.training-option {
  display: grid;
  gap: 2px;
  min-height: 43px;
  padding: 7px 9px;
  text-align: left;
}

.training-overlay--select .training-option {
  gap: 1px;
  min-height: 32px;
  padding: 5px 8px;
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
  line-height: 1.1;
}

.training-overlay--select .training-option strong {
  font-size: 11px;
}

.training-option small {
  color: rgba(226, 238, 247, 0.62);
  font-size: 10px;
  font-weight: 750;
  line-height: 1.1;
}

.training-overlay--select .training-option small {
  font-size: 9px;
}

.training-option.is-active {
  border-color: rgba(var(--overlay-accent-rgb), 0.68);
  background: rgba(var(--overlay-accent-rgb), 0.18);
}

.training-option--tracktitan.is-active {
  border-color: rgba(34, 197, 94, 0.75);
  background: rgba(34, 197, 94, 0.18);
}

.training-option--pace.is-active {
  border-color: rgba(40, 183, 255, 0.78);
  background: rgba(40, 183, 255, 0.18);
}

.training-option--race.is-active {
  border-color: rgba(255, 59, 34, 0.78);
  background: rgba(255, 59, 34, 0.18);
}

.duration-row {
  display: grid;
  grid-template-columns: 62px 1fr;
  align-items: center;
  gap: 8px;
  padding: 5px 6px 5px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
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

.settings-panel {
  width: fit-content;
  min-width: 174px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 5px;
  justify-self: start;
  padding: 8px 10px;
  border: 1px solid rgba(var(--overlay-accent-rgb), 0.18);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.045);
}

.settings-title {
  margin-bottom: 1px;
}

.setting-row,
.shortcut-row {
  display: grid;
  grid-template-columns: 58px auto;
  align-items: center;
  justify-content: start;
  gap: 14px;
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
  background: var(--overlay-accent);
  color: var(--overlay-accent-contrast);
}

.shortcut-list {
  display: grid;
  grid-column: auto;
  grid-template-columns: 1fr;
  gap: 5px;
}

.shortcut-row {
  display: grid;
  grid-template-columns: 58px auto;
  gap: 14px;
  color: rgba(226, 238, 247, 0.7);
  font-size: 11px;
}

.shortcut-row strong {
  color: rgba(248, 252, 255, 0.9);
  font-size: 11px;
  font-weight: 900;
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
  background: var(--overlay-accent);
  color: var(--overlay-accent-contrast);
}

.hud-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 7px;
}

.hud-status-row strong {
  flex: 0 0 104px;
  color: #fff;
  font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 34px;
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
  min-height: 15px;
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
  margin-top: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.progress-track span {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--overlay-accent), #16d1a5);
  transition: width 0.2s linear;
}

.overlay-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
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
