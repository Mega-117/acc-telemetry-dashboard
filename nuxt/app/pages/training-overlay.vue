<script setup lang="ts">
import OverlayPlacementLock from '~/components/overlay/OverlayPlacementLock.vue'
import { trainingAvailability } from '~/services/telemetry/trainingAvailability'
import { availabilityLabel } from '~/services/telemetry/featureAvailability'
import { gameUiSupport } from '~/services/telemetry/gameCatalog'
import { commonContextKey } from '~/services/telemetry/commonLive'
import { completedLapHoldSample } from '~/utils/completedLapHoldSample'
import { usePresentationInterval, usePresentationVisibility } from '~/composables/usePresentationVisibility'
const presentationVisible = usePresentationVisibility()
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
import { withRecoveryDeadline } from '~/services/overlay/telemetryRecovery'
import { computed, shallowRef, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import { useSimulatorPresence } from '~/composables/useSimulatorPresence'
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
import { Bell, CircleCheck, CircleMinus, Dumbbell, Timer, Power, Check, LoaderCircle, Target, Flag, Info, X, Volume2 } from '@lucide/vue'
import QuickCountdown from '~/components/overlay/QuickCountdown.vue'
import { useQuickCountdown } from '~/composables/useQuickCountdown'
import QuickPanelLayoutToggle from '~/components/overlay/QuickPanelLayoutToggle.vue'
import QuickPanelVoiceControls from '~/components/overlay/QuickPanelVoiceControls.vue'
import PressureTestPanel from '~/components/overlay/PressureTestPanel.vue'
import { SPOTTER_SESSION_LABELS, isSpotterFeatureAllowed, resolveSpotterSessionMode, toggleCurrentSessionMode, voiceSessionType, type SpotterSessionMode } from '~/services/spotter/spotterSessionPolicy'
import { quickPanelActionHint } from '~/services/overlay/quickPanelActionHint'
import OverlaySelectSetup from '~/components/overlay/OverlaySelectSetup.vue'
import OverlayHud from '~/components/overlay/OverlayHud.vue'
import SetupFuelPanel from '~/components/overlay/SetupFuelPanel.vue'
import InfoTargetSetup from '~/components/overlay/InfoTargetSetup.vue'
import SectorReferenceSetup from '~/components/overlay/SectorReferenceSetup.vue'
import TestModeBadge from '~/components/overlay/TestModeBadge.vue'
import OverlaySoftwareCursor from '~/components/overlay/OverlaySoftwareCursor.vue'
import PitwallOverlayButton from '~/components/pitwall/PitwallOverlayButton.vue'
import ControlKFriendRequests from '~/components/overlay/ControlKFriendRequests.vue'
import { resolveOverlayKeyboardCommand, type OverlayInputCommand } from '~/services/overlay/overlayInputModel'
import { resetsOverlayMenuOnHide } from '~/services/overlay/overlayActionNavigation'
import { useOverlayActionSelection } from '~/composables/useOverlayActionSelection'
import {
  normalizeQaBotSnapshot,
  qaBotPresentation,
  type QaBotSnapshot,
} from '~/services/overlay/qaBotPresentation'
import { pressureActionPresentation, pressureOriginLine, pressureOutcomeMessage, pressureProgressBadge } from '~/services/overlay/pressureActionPresentation'
import { resolveControlKContext, type ControlKContext } from '~/services/overlay/controlKContext'
import { pickControlKStatus, shouldAutoOpenNotifications, type ControlKStatusMessage } from '~/services/overlay/controlKStatus'
import { useTrackVoiceReferenceAvailability } from '~/composables/useTrackVoiceReferenceAvailability'
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
  quickPanelLayout?: 'vertical' | 'horizontal'
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
// Restored from the existing local Electron preferences before showing the launcher.
const quickPanelLayout = ref<'vertical' | 'horizontal'>('vertical')
const isAccQuickPanel = computed(() => simulatorPresence.gameId.value === 'acc')
async function setQuickPanelLayout(value: 'vertical' | 'horizontal') {
  if (isAccQuickPanel.value) return
  quickPanelLayout.value = value
  if (isFullQuickPanelPreview.value) return
  try {
    await getOverlayApi()?.trainingOverlaySavePreferences?.({ quickPanelLayout: value })
  } catch (error) {
    console.error('[CONTROL_K] Layout preference save failed:', error)
  }
}
// Only the local development build exposes QA tools, never the installer build.
// Declared before any watcher reads the layout (the preview is part of it).
const showQuickPanelDevTools = import.meta.dev
const previewAllQuickPanelButtons = ref(false)
const isFullQuickPanelPreview = computed(() => showQuickPanelDevTools && previewAllQuickPanelButtons.value)
// PIP-556: ACC has its own single layout (Guida/Pausa), neither vertical nor horizontal.
// The development preview shows the same full ACC set.
const usesAccLayout = computed(() => isAccQuickPanel.value || isFullQuickPanelPreview.value)
const isHorizontalQuickPanel = computed(() => phase.value === 'launcher' && !usesAccLayout.value
  && !isTargetSetupOpen.value && !isSectorReferenceSetupOpen.value && !isFuelSetupOpen.value && !isQuickTimerOpen.value
  && quickPanelLayout.value === 'horizontal')
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
  setPressureWarningsEnabled,
  referenceSessionModes,
  lapTimeSessionModes,
  pressureWarningSessionModes,
  targetLapSessionModes,
  setReferenceSessionModes,
  setLapTimeSessionModes,
  setPressureWarningSessionModes,
  setTargetLapSessionModes,
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
  // PIP-518: both layouts reorder sections with CSS, so the wheel follows the screen.
  () => !!overlayRoot.value?.querySelector('.overlay-content--launcher .launcher-tools'),
)
const { selectedId: selectedWheelActionId, first: selectFirstWheelAction,
  next: selectNextWheelAction, activate: activateSelectedWheelAction } = actionSelection
const hoveredQuickPanelAction = ref<string | null>(null)
// PIP-522: one context line. A selected Pressioni that cannot run says why
// instead of what it does; every other action keeps its description.
const quickPanelHint = computed(() => {
  const actionId = hoveredQuickPanelAction.value ?? selectedWheelActionId.value
  if (actionId === 'pressure' && quickPanelPressureState.value.state !== 'ready') return `Pressioni: ${dryPressurePresentation.value.guidance}`
  return quickPanelActionHint(actionId)
})
function updateQuickPanelHint(event: Event) {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null
  hoveredQuickPanelAction.value = button?.dataset.overlayWheelAction ?? button?.getAttribute('aria-label') ?? null
}
watch(selectedWheelActionId, () => { hoveredQuickPanelAction.value = null })
const preparingReopen = ref(false)
const isPointerOnOverlaySurface = ref(false)
const isFuelSetupOpen = ref(false)
const isQuickTimerOpen = ref(false)
// PIP-532: errors, pressure plan, friend requests and fuel status live in one
// "Notifiche" view instead of stretching the panel under the buttons. The
// components stay mounted (running automations keep their state); only the
// view decides what is shown.
const isNotificationsOpen = ref(false)
const notificationsBody = ref<HTMLElement | null>(null)
const notificationCount = ref(0)
let notificationErrorCount = 0
let notificationObserver: MutationObserver | null = null
const NOTIFICATION_ITEMS = '.fuel-status, .pressure-plan, .control-k-request, .quick-panel-pressure-status, .pressure-test__result, .pressure-test__error'
const NOTIFICATION_ERRORS = '.fuel-status--error, .quick-panel-pressure-status--error, .control-k-request__error, .pressure-test__error'
const notificationErrors = ref(0)
let lastNotificationAutoOpenAt: number | null = null
function countNotifications() {
  const body = notificationsBody.value
  const count = body ? body.querySelectorAll(NOTIFICATION_ITEMS).length : 0
  const errors = body ? body.querySelectorAll(NOTIFICATION_ERRORS).length : 0
  notificationCount.value = count
  notificationErrors.value = errors
  // PIP-556: a new error opens the view by itself only in pause, never while
  // driving or over another view, and at most once every 30 s; an empty view closes.
  const now = Date.now()
  if (shouldAutoOpenNotifications({
    errors, previousErrors: notificationErrorCount, otherViewOpen: isOtherQuickViewOpen.value,
    context: usesAccLayout.value ? effectiveControlKContext.value : hideStintWhileDriving.value ? 'drive' : 'pause',
    lastAutoOpenAt: lastNotificationAutoOpenAt, now,
  })) {
    lastNotificationAutoOpenAt = now
    openNotifications()
  }
  notificationErrorCount = errors
  if (!count && isNotificationsOpen.value) closeNotifications()
}
function openNotifications() {
  isVoiceViewOpen.value = false
  isNotificationsOpen.value = true
  void nextTick(() => actionSelection.select('notifications-close'))
}
function closeNotifications() {
  isNotificationsOpen.value = false
  void nextTick(() => actionSelection.select(usesAccLayout.value ? 'notifications' : 'pitwall'))
}
// PIP-556: in Pausa the four voice alerts live behind one "Avvisi" button.
const isVoiceViewOpen = ref(false)
function openVoiceView() {
  isNotificationsOpen.value = false
  isVoiceViewOpen.value = true
  void nextTick(() => actionSelection.select('coach'))
}
function closeVoiceView() {
  if (!isVoiceViewOpen.value) return
  isVoiceViewOpen.value = false
  void nextTick(() => actionSelection.select('voice-alerts'))
}
const isOtherQuickViewOpen = computed(() => isVoiceViewOpen.value || isTargetSetupOpen.value
  || isSectorReferenceSetupOpen.value || isFuelSetupOpen.value || isQuickTimerOpen.value)
watch(notificationsBody, (body) => {
  notificationObserver?.disconnect()
  notificationObserver = null
  if (!body || typeof MutationObserver === 'undefined') { countNotifications(); return }
  notificationObserver = new MutationObserver(countNotifications)
  notificationObserver.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  countNotifications()
}, { flush: 'post' })
onBeforeUnmount(() => notificationObserver?.disconnect())
const fuelStintMinutes = ref(10)
function closeFuelSetup() { isFuelSetupOpen.value = false; void nextTick(() => actionSelection.select('fuel')) }
// PIP-526: the minutes editor opens on "+", never on "Torna al pannello".
function openFuelSetup() { isFuelSetupOpen.value = true; void nextTick(() => actionSelection.select('fuel-plus')) }
const isTargetSetupOpen = ref(false)
const targetSetup = ref<InstanceType<typeof InfoTargetSetup> | null>(null)
const isSectorReferenceSetupOpen = ref(false)
const customSectorsActive = ref(false)
const referenceBusy = ref(false)
async function refreshSectorReferenceState() {
  const settings = await getOverlayApi()?.hudOverlayGetSettings?.('sectors')
  customSectorsActive.value = settings?.deltaReference === 'custom'
}
async function disableReference(kind: 'target' | 'sectors') {
  if (referenceBusy.value) return
  referenceBusy.value = true
  try {
    if (kind === 'target') {
      const saved = await getOverlayApi()?.infoTargetSaveSettings?.({ targetTimeMs: null })
      if (!saved || saved.active) throw new Error('Target non disattivato')
      applyInfoTargetSettings(saved)
    } else {
      const current = await getOverlayApi()?.hudOverlayGetSettings?.('sectors')
      if (current?.deltaReference === 'custom' && !current.normalDeltaReference) {
        isSectorReferenceSetupOpen.value = true
        showVoicePointNotice('Scegli Giro precedente o Miglior settore.', 'ok')
        return
      }
      const saved = await getOverlayApi()?.hudOverlaySaveSettings?.('sectors', { restoreNormalReference: true })
      if (!saved || saved.deltaReference === 'custom') throw new Error('Riferimenti non disattivati')
      customSectorsActive.value = false
    }
  } catch { showVoicePointNotice('Operazione non riuscita. Riprova.', 'error') }
  finally { referenceBusy.value = false }
}
const sectorReferenceSetup = ref<InstanceType<typeof SectorReferenceSetup> | null>(null)
function closeSectorReferenceSetup() {
  if (!isSectorReferenceSetupOpen.value) return
  isSectorReferenceSetupOpen.value = false
  void nextTick(() => actionSelection.select('sector-references'))
}
async function saveSectorReferenceSetup() {
  await refreshSectorReferenceState()
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
const dryPressurePresentation = computed(() => pressureActionPresentation(quickPanelPressureState.value))
const pressureBadge = computed(() => pressureProgressBadge(quickPanelPressureState.value))
// PIP-527: the target is the same for every tyre: shown once in the box header.
// PIP-552: origin of the correction (session, stint, lap, air temperature).
const pressureOrigin = computed(() => pressureOriginLine(quickPanelPressureState.value.origin))
const pressurePlanTargetPsi = computed<number | null>(() => {
  const value = (quickPanelPressureState.value.preview || []).find((row: any) => Number.isFinite(row?.targetPsi))?.targetPsi
  return Number.isFinite(value) ? value : null
})
// PIP-522: a success message leaves after 5 s; errors stay until the next action.
const PRESSURE_SUCCESS_VISIBLE_MS = 5000
const dismissedPressureOutcome = ref<string | null>(null)
const pressureOutcome = computed(() => {
  const outcome = pressureOutcomeMessage(quickPanelPressureState.value)
  return outcome && outcome.text !== dismissedPressureOutcome.value ? outcome : null
})

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
  dismissedPressureOutcome.value = null
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
// PIP-533: Ctrl+K shows and changes each alert for the session being driven;
// the webapp keeps the same per-session choices (one source: the settings store).
const voiceSessionMode = computed<SpotterSessionMode | null>(() => resolveSpotterSessionMode(voiceSessionType(fastState.value)))
const voiceSessionLabel = computed(() => voiceSessionMode.value ? SPOTTER_SESSION_LABELS[voiceSessionMode.value] : null)
const voiceOnForSession = (enabled: boolean, modes: SpotterSessionMode[]) => isSpotterFeatureAllowed(enabled, modes, voiceSessionType(fastState.value))
const coachVoiceOn = computed(() => voiceOnForSession(spotterEnabled.value, lapTimeSessionModes.value))
const referencesVoiceOn = computed(() => voiceOnForSession(trackVoiceReferencesEnabled.value, referenceSessionModes.value))
const pressureVoiceOn = computed(() => voiceOnForSession(pressureWarningsEnabled.value, pressureWarningSessionModes.value))
const targetVoiceOn = computed(() => voiceOnForSession(targetLapVoiceEnabled.value, targetLapSessionModes.value))

// ─── PIP-556: ACC single layout ─────────────────────────────────────────────
// Pausa (full grid) only when stopped in the box, pit lane, setup screen or on
// the grid; everything else, including a car stopped on track, is Guida.
const controlKContext = ref<ControlKContext>('pause')
watch(() => {
  const fast = fastState.value
  return resolveControlKContext({
    isLive: fast.isFresh && fast.isLive, speedKmh: fast.speedKmh, isInPitBox: fast.isInPitBox,
    isInPitLane: fast.isInPitLane, isSetupMenuVisible: fast.isSetupMenuVisible, isEngineRunning: fast.isEngineRunning,
    sessionType: fast.sessionType, lapsCompleted: fast.lapsCompleted,
  }, controlKContext.value)
}, (next) => { controlKContext.value = next }, { immediate: true })
const effectiveControlKContext = computed<ControlKContext>(() => isFullQuickPanelPreview.value ? 'pause' : controlKContext.value)
watch(effectiveControlKContext, (next) => { if (next === 'drive') closeVoiceView() })
const pressureTestStatus = ref<ControlKStatusMessage | null>(null)
// One status line of fixed height: error > in progress > outcome > hint.
// While driving only real messages are shown, never the button hints.
const controlKStatus = computed<ControlKStatusMessage | null>(() => pickControlKStatus([
  voicePointNotice.value && { tone: voicePointNotice.value.tone === 'error' ? 'error' : 'ok', text: voicePointNotice.value.text },
  pressureTestStatus.value,
  pressureOutcome.value && { tone: pressureOutcome.value.tone, text: pressureOutcome.value.text },
  notificationErrors.value > 0 && !isNotificationsOpen.value
    && { tone: 'error', text: notificationErrors.value === 1 ? 'Un problema da leggere: apri le notifiche.' : `${notificationErrors.value} problemi da leggere: apri le notifiche.` },
  effectiveControlKContext.value === 'pause' && { tone: 'hint', text: quickPanelHint.value },
]))
const accLayoutClasses = computed(() => usesAccLayout.value ? [
  'ck', `ck--${effectiveControlKContext.value}`,
  {
    'ck--view': isNotificationsOpen.value || isVoiceViewOpen.value,
    'ck--voice-view': isVoiceViewOpen.value,
    'ck--no-track-references': !isFullQuickPanelPreview.value && trackVoiceReferences.available.value === false,
    'ck--no-target': !isFullQuickPanelPreview.value && !infoTargetActive.value,
    'ck--no-notifications': notificationCount.value === 0,
  },
] : [])
// PIP-510: the game is known from the menus on (not only when driving) and the
// layout never flickers on a silent source; see useSimulatorPresence.
const simulatorPresence = useSimulatorPresence(computed(() => fastState.value.commonLive))
// Riferimenti is offered only on tracks with audio references (today Spa); unknown keeps it visible.
const trackVoiceReferences = useTrackVoiceReferenceAvailability(getOverlayApi, computed(() => ({
  gameId: simulatorPresence.gameId.value,
  track: fastState.value.context?.track ?? null,
  variant: fastState.value.commonLive?.identity?.variant ?? null,
})))
const support = computed(() => gameUiSupport(simulatorPresence.gameId.value))
watch(() => support.value.quickAutomations, allowed => { if (!allowed) isFuelSetupOpen.value = false }, { flush: 'sync' })
watch(() => support.value.quickSectorReferences, allowed => { if (!allowed) isSectorReferenceSetupOpen.value = false }, { flush: 'sync' })

const { trackingStart, trackingComplete, trackingAbandon, recoverySnapshot, restoreCheckpoint } = useTrackingRecord(
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
const quickTimer = useQuickCountdown(
  () => { void getOverlayApi()?.trainingOverlayOpen?.().catch(() => {}) },
  () => { playStepDoneSound(1, true) },
)
function startQuickTimer(seconds: number) {
  void primeStepAudio(true)
  quickTimer.start(seconds)
}
function closeQuickTimer() {
  quickTimer.cancel()
  isQuickTimerOpen.value = false
  void nextTick(() => actionSelection.select('timer'))
}
// PIP-526: opening a sub-panel puts the wheel on its value, never on Back.
function openQuickTimer() {
  isQuickTimerOpen.value = true
  void nextTick(() => actionSelection.select(quickTimer.status.value === 'idle' ? 'timer-start' : 'timer-end'))
}
function leaveQuickTimer() {
  // A running timer hides Ctrl+K as before and brings it back at the end.
  if (quickTimer.status.value !== 'idle') { closeOverlay(); return }
  isQuickTimerOpen.value = false
  void nextTick(() => actionSelection.select('timer'))
}

const overlaySizeComp = useOverlaySize(getOverlayApi, () => overlaySizePreset.value, overlayRoot,
  () => isHorizontalQuickPanel.value ? Number.POSITIVE_INFINITY : OVERLAY_WORK_AREA_SIZE.width)
const { cardSize, scheduleOverlaySizeSync, connectResizeObserver, disconnectResizeObserver, cleanup: cleanupSize } = overlaySizeComp
watch(isHorizontalQuickPanel, () => { scheduleOverlaySizeSync(); nextTick(() => actionSelection.refresh()) })


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
const accMenuStateLogMessage = ref('')
const isCheckingPauseMenu = ref(false)
async function checkPauseMenu() {
  if (isCheckingPauseMenu.value) return
  isCheckingPauseMenu.value = true
  try {
    await getOverlayApi()?.trainingOverlayCheckPauseMenu?.()
  } catch (_) {
    console.error('[PRESSIONI] Comando verifica menu Pausa non disponibile.')
  } finally {
    isCheckingPauseMenu.value = false
    scheduleOverlaySizeSync()
  }
}
async function logAccMenuState() {
  try {
    const response = await getOverlayApi()?.trainingOverlayLogAccMenuState?.()
    accMenuStateLogMessage.value = response?.reason || 'Comando disponibile nel programma desktop.'
  } catch (_) {
    accMenuStateLogMessage.value = 'Impossibile scrivere gli stati ACC nel log.'
  }
  scheduleOverlaySizeSync()
}
let layoutBeforePreview: 'vertical' | 'horizontal' = 'vertical'
const quickPanelPreview = shallowRef<ReturnType<typeof import('~/services/overlay/quickPanelPreview').createQuickPanelPreview> | null>(null)
const quickPanelPressureState = computed(() => isFullQuickPanelPreview.value ? quickPanelPreview.value!.pressure : dryPressureState.value)
// PIP-556: the plan is a notification only while it can still be applied (or is
// being applied); once applied or blocked the outcome message takes over and the
// plan leaves Notifiche, instead of staying until the next flying lap.
const showQuickPanelPressurePreview = computed(() => !quickPanelPressureState.value.consumed
  && !!quickPanelPressureState.value.recommendation?.wheels
  && !['completed', 'blocked'].includes(quickPanelPressureState.value.state)
  && (isFullQuickPanelPreview.value || isCarStoppedWithEngineOff.value
    || (usesAccLayout.value && effectiveControlKContext.value === 'pause')))
let pressureOutcomeTimer: ReturnType<typeof setTimeout> | null = null
watch(() => pressureOutcomeMessage(quickPanelPressureState.value), (outcome) => {
  if (pressureOutcomeTimer) clearTimeout(pressureOutcomeTimer)
  pressureOutcomeTimer = null
  if (outcome?.tone !== 'ok' || outcome.text === dismissedPressureOutcome.value) return
  pressureOutcomeTimer = setTimeout(() => {
    dismissedPressureOutcome.value = outcome.text
    pressureOutcomeTimer = null
    scheduleOverlaySizeSync()
  }, PRESSURE_SUCCESS_VISIBLE_MS)
}, { deep: true })
const quickPanelSupport = computed(() => isFullQuickPanelPreview.value ? gameUiSupport('acc') : support.value)
let blockPreviewAction: ((event: Event, preview: boolean) => void) | undefined
async function toggleQuickPanelPreview() {
  if (!import.meta.dev) return
  if (!quickPanelPreview.value) {
    const module = await import('~/services/overlay/quickPanelPreview')
    quickPanelPreview.value = module.createQuickPanelPreview()
    blockPreviewAction = module.blockQuickPanelPreviewAction
  }
  if (!previewAllQuickPanelButtons.value) layoutBeforePreview = quickPanelLayout.value
  else quickPanelLayout.value = layoutBeforePreview
  previewAllQuickPanelButtons.value = !previewAllQuickPanelButtons.value
  scheduleOverlaySizeSync()
  await nextTick()
  actionSelection.refresh()
}
function guardQuickPanelPreview(event: Event) {
  blockPreviewAction?.(event, isFullQuickPanelPreview.value)
}
function guardQuickPanelDevTools(event: Event) {
  if ((event.target as HTMLElement)?.closest('[data-quick-panel-preview], summary')) return
  guardQuickPanelPreview(event)
}

const isCarStoppedWithEngineOff = computed(() => !fastState.value.isEngineRunning
  && fastState.value.speedKmh !== null && Math.abs(fastState.value.speedKmh) <= 0.5)
const showAllQuickPanelButtons = computed(() => isCarStoppedWithEngineOff.value
  || (showQuickPanelDevTools && previewAllQuickPanelButtons.value))
// PIP-509: no supported simulator detected -> waiting placeholder (dev synthetic source excluded).
const waitingForSimulator = computed(() => !isFullQuickPanelPreview.value
  && simulatorPresence.gameId.value !== 'synthetic'
  && !quickPanelSupport.value.quickVoiceControls && !quickPanelSupport.value.quickAutomations)
const hideStintWhileDriving = computed(() => !showAllQuickPanelButtons.value
  && (fastState.value.isEngineRunning
    || (fastState.value.speedKmh !== null && Math.abs(fastState.value.speedKmh) > 0.5)))
const sessionOverlayOpacity = computed(() => {
  if (isQuickTimerOpen.value) return quickTimer.status.value === 'running'
    && quickTimer.remainingMs.value > 5000 && !isPointerOnOverlaySurface.value ? AUTO_DIM_OPACITY : 1
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
  isQuickTimerOpen.value ? 'quick-timer' : ['running', 'paused', 'expired'].includes(phase.value) ? 'session' : phase.value
)
const overlaySizePreset = computed<OverlaySizePreset>(() => {
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
  '--overlay-work-area-width': isHorizontalQuickPanel.value ? '100vw' : `${OVERLAY_WORK_AREA_SIZE.width}px`,
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
  autoAdvanceRemainingSec, cancelAutoAdvance, restorePausedCheckpoint,
} = useSessionOrchestrator(
  phase, activeStepIndex, remainingMs, selectedTrainingId, selectedModeId, isSettingsOpen,
  selectedMode, canManuallyAdvanceStep, autoAdvanceStep, autoAdvanceSeconds, closeShortcutStopConfirm, cancelStopHold,
  enqueueVoice, enqueueStepStart, () => {}, primeStepAudio, stopVoice, playStepDoneSound, playCountdownBeep,
  liveLap, startLiveStatePolling, stopLiveStatePolling, resetLiveLap,
  trackingStart, trackingComplete, trackingAbandon, savePreferences,
  stepBudgetMs,
  () => coachVoiceOn.value,
)

let trainingSourceKey: string | null = null
function trainingSourceReady(): boolean {
  if (!fastState.value.isFresh || !fastState.value.isLive) return false
  const live = fastState.value.commonLive
  if (trainingSourceKey && commonContextKey(live) !== trainingSourceKey) {
    showVoicePointNotice('La sessione di guida è cambiata. Ferma e riavvia l’allenamento.', 'error')
    return false
  }
  if (!live || live.gameId === 'acc') return true
  const availability = trainingAvailability(live, selectedTrainingId.value)
  if (!availability.available || live.lifecycle !== 'live') {
    showVoicePointNotice(availability.available ? 'Riprendi la guida per avviare l’allenamento.' : availabilityLabel(availability.reason), 'error')
    return false
  }
  return true
}
watch(fastState, () => {
  if (!['running', 'expired'].includes(phase.value) || !trainingSourceKey) return
  const live = fastState.value.commonLive
  const changed = commonContextKey(live) !== trainingSourceKey
  const unavailable = live?.gameId !== 'acc' && (!live || !trainingAvailability(live, selectedTrainingId.value).available || live.lifecycle !== 'live')
  if (changed || unavailable) {
    cancelAutoAdvance()
    pauseSession()
    stopVoice()
  }
})

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
  // PIP-556: seconds are the field a driver changes most often.
  selectedWheelActionId.value = 'target-seconds'
  scheduleOverlaySizeSync()
}

function closeInfoTargetSetup() {
  if (!isTargetSetupOpen.value) return
  isTargetSetupOpen.value = false
  void nextTick(() => actionSelection.select('target'))
}

function cancelInfoTargetSetup() {
  applyInfoTargetSettings(savedInfoTargetSettings)
  closeInfoTargetSetup()
  scheduleOverlaySizeSync()
}

// A draft belongs to the source/session in which the driver opened it.
// The same identity already governs completed laps and their target feedback.
watch(() => completedLapHoldSample(fastState.value).contextKey, (next, previous) => {
  if (next === previous) return
  if (isTargetSetupOpen.value) cancelInfoTargetSetup()
  if (isSectorReferenceSetupOpen.value) closeSectorReferenceSetup()
  if (isFuelSetupOpen.value) closeFuelSetup()
}, { flush: 'sync' })

async function confirmInfoTarget() {
  const saved = await getOverlayApi()?.infoTargetSaveSettings?.({
    targetTimeMs: infoTargetTimeMs.value,
    toleranceMs: infoTargetToleranceMs.value,
    // PIP-556: in ACC Control K the target lap lasts for the session only.
    keepBetweenSessions: usesAccLayout.value ? false : infoTargetKeepBetweenSessions.value,
  }) as InfoTargetSettings | undefined
  applyInfoTargetSettings(saved)
  closeInfoTargetSetup()
  await getOverlayApi()?.trainingOverlayClose?.()
}


/** Adds or removes the current session from one alert; null when the session is unknown. */
function toggleVoiceForSession(on: boolean, enabled: boolean, setEnabled: (value: boolean) => void,
  modes: SpotterSessionMode[], setModes: (value: SpotterSessionMode[]) => void): boolean | null {
  const next = toggleCurrentSessionMode(modes, voiceSessionType(fastState.value), on)
  if (!next) return null
  if (next.on && !enabled) setEnabled(true)
  setModes(next.modes)
  return next.on
}

function togglePressureAudio() {
  if (!canUseSpotterControls.value) return
  toggleVoiceForSession(pressureVoiceOn.value, pressureWarningsEnabled.value, setPressureWarningsEnabled,
    pressureWarningSessionModes.value, setPressureWarningSessionModes)
}

function toggleTargetVoice() {
  toggleVoiceForSession(targetVoiceOn.value, targetLapVoiceEnabled.value, setTargetLapVoiceEnabled,
    targetLapSessionModes.value, setTargetLapSessionModes)
}

function toggleCoachAudio() {
  if (!canUseSpotterControls.value) {
    stopVoice()
    showVoicePointNotice('Login richiesto per gli avvisi vocali.', 'error')
    return
  }
  const enabled = toggleVoiceForSession(coachVoiceOn.value, spotterEnabled.value, setCoachEnabled,
    lapTimeSessionModes.value, setLapTimeSessionModes)
  if (enabled === null) return
  if (!enabled) stopVoice()
  void savePreferences()
  setDebugEvent(enabled ? 'avvisi giro attivati' : 'avvisi giro disattivati')
}

function returnToMainMenu() {
  if (isFuelSetupOpen.value) { closeFuelSetup(); return }
  if (phase.value !== 'select') return
  closeShortcutStopConfirm()
  isTrainingPickerOpen.value = false
  isSettingsOpen.value = false
  phase.value = 'launcher'
  void nextTick(() => { selectFirstWheelAction(); scheduleOverlaySizeSync() })
}

async function prepareOverlayReopen(revision?: number) {
  const rememberedAction = isTargetSetupOpen.value ? 'target'
    : isSectorReferenceSetupOpen.value ? 'sector-references'
      : isFuelSetupOpen.value ? 'fuel' : selectedWheelActionId.value
  await refreshSectorReferenceState().catch(() => {})
  preparingReopen.value = true
  await nextTick()
  actionSelection.resetPointer()
  if (resetsOverlayMenuOnHide(phase.value)) {
    isFuelSetupOpen.value = false
    isVoiceViewOpen.value = false
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
  actionSelection.select(rememberedAction)
  actionSelection.refresh()
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
  if (isNotificationsOpen.value) { closeNotifications(); return }
  if (isVoiceViewOpen.value) { closeVoiceView(); return }
  if (isQuickTimerOpen.value) { leaveQuickTimer(); return }
  if (isFuelSetupOpen.value) { closeFuelSetup(); return }
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
  if (isQuickTimerOpen.value) return
  if (isFuelSetupOpen.value) { activateSelectedWheelAction(); return }
  const now = Date.now()
  if (now - lastPrimaryActionAt < PRIMARY_ACTION_DEBOUNCE_MS) { setDebugEvent(`debounce ${primaryAction.value}`); return }
  lastPrimaryActionAt = now; setDebugEvent(`azione: ${primaryAction.value}`)
  if (isSectorReferenceSetupOpen.value) { void sectorReferenceSetup.value?.submit(); return }
  if (isTargetSetupOpen.value) { void confirmInfoTarget(); return }
  if (isShortcutStopConfirmOpen.value) { executeStop(); return }
  const actions: Record<PrimaryOverlayAction, () => void> = {
    'open-selection': openTrainingSelection,
    start: () => {
      trainingSourceKey = null
      if (!trainingSourceReady()) return
      trainingSourceKey = commonContextKey(fastState.value.commonLive)
      isSaving.value = true
      try { startSession() } finally { isSaving.value = false }
    },
    pause: pauseSession, resume: () => { if (trainingSourceReady()) resumeSession() },
    'complete-step': completeCurrentStep,
    next: () => {
      if (!trainingSourceReady()) return
      isSaving.value = true
      try { goNextStep() } finally { isSaving.value = false }
    },
    reset: resetCompleted, none: () => {},
  }
  actions[primaryAction.value]?.()
}

// ─── Contratto interazione overlay (solo Electron) ────────────────────────────
const OVERLAY_SURFACE_SELECTOR = '.overlay-card, .launcher-tools, .overlay-placement-lock, .overlay-dev-toggle, .voice-point-notice'
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
  const enabled = toggleVoiceForSession(referencesVoiceOn.value, trackVoiceReferencesEnabled.value, setReferencesEnabled,
    referenceSessionModes.value, setReferenceSessionModes)
  if (enabled === null) return
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
      gameId: fastState.value.commonLive?.gameId ?? 'acc',
      trackVariant: fastState.value.commonLive?.identity?.variant ?? null,
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
  if (isFullQuickPanelPreview.value) return
  if (isQuickTimerOpen.value && !['back', 'next-action', 'previous-action', 'activate-action'].includes(command || '')) return
  if (command === 'main-menu') { returnToMainMenu(); return }
  // PIP-526: a value being edited takes Next/Previous/OK/Back first.
  if (isTargetSetupOpen.value && targetSetup.value?.handleWheelCommand(command)) return
  if (isSectorReferenceSetupOpen.value && sectorReferenceSetup.value?.handleWheelCommand?.(command)) return
  if (command === 'primary') executePrimaryAction()
  if (command === 'next-action') selectNextWheelAction()
  if (command === 'previous-action') actionSelection.previous()
  if (command === 'activate-action') activateSelectedWheelAction()
  if (command === 'reset-action-selection') actionSelection.refresh()
  if (command === 'back') runBackAction()
  if (command === 'mute') runMuteAction()
  if (command === 'stop') handleGlobalStop()
}

function handleLocalShortcut(event: KeyboardEvent) {
  if (placementActive.value) return
  if (isFullQuickPanelPreview.value) {
    if (resolveOverlayKeyboardCommand(event) || event.code === 'Space') event.preventDefault()
    return
  }
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
let checkpointReady = false
let checkpointTimer: ReturnType<typeof setInterval> | null = null
let checkpointPending = false
function saveRecoveryCheckpoint() {
  if (!checkpointReady || checkpointPending) return
  const active = ['running', 'paused', 'expired'].includes(phase.value)
  const key = trainingSourceKey || commonContextKey(fastState.value.commonLive)
  checkpointPending = true
  void withRecoveryDeadline(() => Promise.resolve(getOverlayApi()?.trainingCheckpointSave?.(active && key ? {
    version: 1, trainingId: selectedTrainingId.value, modeId: selectedModeId.value,
    step: activeStepIndex.value, remainingMs: remainingMs.value, sourceKey: key, tracking: recoverySnapshot(),
  } : null)), false).finally(() => { checkpointPending = false })
}
watch([phase, activeStepIndex], saveRecoveryCheckpoint, { flush: 'post' })
onBeforeUnmount(() => { if (checkpointTimer) clearInterval(checkpointTimer); checkpointReady = false })

onMounted(async () => {
  document.body.classList.add('training-overlay-runtime')
  initTestMode()
  const api = getOverlayApi()
  isElectronRuntime.value = !!api
  const settings = await api?.trainingOverlayGetSettings?.() as TrainingOverlaySettings | undefined
  quickPanelLayout.value = settings?.quickPanelLayout === 'horizontal' ? 'horizontal' : 'vertical'
  await refreshSectorReferenceState().catch(() => {})
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
  // PIP-526: the first open starts on Pitwall (falls back to the first button).
  actionSelection.select('pitwall'); actionSelection.refresh()
  loadSpotterVoiceSettings()
  startLiveStatePolling()
  startFastStatePolling()
  const checkpoint = await withRecoveryDeadline(() => Promise.resolve(api?.trainingCheckpointGet?.()), null)
  if (checkpoint?.version === 1 && resolveTrainingOverlayTrainingId(checkpoint.trainingId) === checkpoint.trainingId
    && resolveTrainingOverlayModeId(checkpoint.modeId) === checkpoint.modeId) {
    selectedTrainingId.value = checkpoint.trainingId; selectedModeId.value = checkpoint.modeId
    if (Number.isInteger(checkpoint.step) && selectedMode.value.steps[checkpoint.step]) {
      activeStepIndex.value = checkpoint.step; remainingMs.value = checkpoint.remainingMs
      trainingSourceKey = checkpoint.sourceKey; restoreCheckpoint(checkpoint.tracking)
      restorePausedCheckpoint()
    }
  }
  checkpointReady = true
  checkpointTimer = setInterval(saveRecoveryCheckpoint, 1000)
  await refreshDryPressureState()
  dryPressureActivity.start()
  await refreshQaBotState()
  qaBotActivity.start()
  removeCommandListener = api?.onTrainingOverlayCommand?.(handleOverlayCommand)
  let receivedPlacement = false
  removePlacementListener = api?.onHudOverlayPlacement?.((active: boolean) => {
    receivedPlacement = true
    placementActive.value = active === true
  })
  const initialPlacement = (await api?.hudOverlayGetPlacement?.('training')) === true
  if (!receivedPlacement) placementActive.value = initialPlacement
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
  [() => fastState.value.commonLive?.gameId, phase, placementActive, selectedTrainingId, selectedModeId, soundEnabled, originMode, originCorner,
    spotterEnabled, trackVoiceReferencesEnabled, isTrainingPickerOpen, isSettingsOpen, isTargetSetupOpen, isSectorReferenceSetupOpen, isFuelSetupOpen, isQuickTimerOpen, isNotificationsOpen, notificationCount, quickTimer.status, liveHudResizeKey,
    isVoiceViewOpen, effectiveControlKContext, () => trackVoiceReferences.available.value, infoTargetActive],
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
        'training-overlay--acc': usesAccLayout && phase === 'launcher',
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
      <Transition name="overlay-surface" mode="out-in">
        <!-- Contenitore unico persistente (PIP-93): il morphing e' l'animazione
             di resize della finestra; dentro, il contenuto si avvicenda in cross-fade. -->
        <section v-if="phase !== 'loading'" key="card" class="overlay-card">
          <OverlayPlacementLock overlay-id="training" />
          <Transition name="content-swap" :css="!preparingReopen" :mode="preparingReopen ? undefined : 'out-in'" @after-enter="actionSelection.refresh()">
            <div
              :key="contentKey"
              :class="[
                'overlay-content',
                `overlay-content--${overlaySizePreset}`,
                { 'overlay-content--target': isTargetSetupOpen || isSectorReferenceSetupOpen || isFuelSetupOpen || isQuickTimerOpen,
                  'overlay-content--target-lap': isTargetSetupOpen,
                  'overlay-content--horizontal': isHorizontalQuickPanel,
                  'overlay-content--acc': usesAccLayout && phase === 'launcher',
                  'overlay-content--preview': isFullQuickPanelPreview },
              ]"
            >

              <template v-if="phase === 'launcher'">
                <div v-if="!isTargetSetupOpen && !isSectorReferenceSetupOpen && !isFuelSetupOpen && !isQuickTimerOpen" class="launcher-tools" :class="accLayoutClasses" aria-label="Strumenti live overlay"
                  @pointerover="updateQuickPanelHint" @pointerleave="hoveredQuickPanelAction = null"
                  @focusin="updateQuickPanelHint" @focusout="hoveredQuickPanelAction = null">
                  <header class="launcher-tools__header">
                    <img class="quick-panel-logo" src="/branding/auth/racercore-rc.svg" alt="Racer Core" width="56" height="28">
                    <!-- PIP-532: the Notifiche view owns the corner (its X); the switch steps aside. -->
                    <QuickPanelLayoutToggle v-if="!usesAccLayout" v-show="!isNotificationsOpen" :model-value="quickPanelLayout" @update:model-value="setQuickPanelLayout" />
                    <div class="quick-panel-header-actions" :inert="isFullQuickPanelPreview || undefined" @click.capture="guardQuickPanelPreview">
                    <!-- PIP-556: ACC Pausa keeps the four voice alerts behind one button (own view). -->
                    <button v-if="usesAccLayout && !isVoiceViewOpen" type="button" class="launcher-tool-button ck-voice-alerts" title="Avvisi vocali"
                      aria-label="Avvisi vocali" data-overlay-wheel-action="voice-alerts" @click="openVoiceView">
                      <Volume2 :size="20" aria-hidden="true" /><span>Avvisi</span>
                      <small class="quick-action-badge" aria-hidden="true">{{ [coachVoiceOn, referencesVoiceOn, pressureVoiceOn, targetVoiceOn].filter(Boolean).length }}/4</small>
                    </button>
                    <button v-if="usesAccLayout && isVoiceViewOpen" type="button" class="launcher-tool-button ck-view-close" title="Torna ai comandi"
                      aria-label="Chiudi avvisi vocali" data-overlay-wheel-action="voice-close" @click="closeVoiceView">
                      <X :size="16" aria-hidden="true" />
                    </button>
                    <!-- PIP-526: reachable from the wheel, last in the cycle (data-overlay-wheel-last). -->
                    <button type="button" class="launcher-tool-button quick-panel-timer" title="Timer" aria-label="Timer" data-overlay-wheel-action="timer" :data-overlay-wheel-last="usesAccLayout ? undefined : ''" @click="openQuickTimer">
                      <Timer :size="18" aria-hidden="true" /><span v-if="usesAccLayout">Timer</span>
                    </button>
                    <!-- PIP-532: next to the timer only while something is waiting to be read.
                         PIP-556: ACC Pausa keeps its place in the grid, disabled when empty. -->
                    <button v-if="(usesAccLayout || notificationCount > 0) && !isNotificationsOpen" type="button" class="launcher-tool-button quick-panel-notifications-button"
                      :title="`Notifiche (${notificationCount})`" :aria-label="`Apri notifiche (${notificationCount})`" :disabled="notificationCount === 0"
                      data-overlay-wheel-action="notifications" :data-overlay-wheel-last="usesAccLayout ? undefined : ''" @click="openNotifications">
                      <Bell :size="18" aria-hidden="true" /><span v-if="usesAccLayout">Notifiche</span>
                      <small v-if="notificationCount > 0" class="quick-action-badge" :class="{ 'quick-action-badge--error': notificationErrors > 0 }" aria-hidden="true">{{ notificationCount }}</small>
                    </button>
                    <button
                      v-if="!hideStintWhileDriving"
                      type="button"
                      class="launcher-tool-button launcher-tool-button--training quick-panel-training"
                      title="Allenamento"
                      :aria-label="primaryActionLabel"
                      @click="executePrimaryAction"
                    >
                      <Dumbbell :size="18" aria-hidden="true" />
                    </button>
                    </div>
                  </header>
                  <div class="launcher-tools__actions">
                    <!-- PIP-509: no simulator yet -> a small waiting placeholder instead of partial tools. -->
                    <p v-if="waitingForSimulator" class="quick-panel-waiting" role="status">{{ simulatorPresence.choiceRequired.value ? 'Scegli il gioco nella webapp' : 'In attesa del simulatore' }}</p>
                    <div v-else class="quick-panel-main" :class="{ 'quick-panel-main--behind-notifications': isNotificationsOpen }" :inert="isFullQuickPanelPreview || undefined" @click.capture="guardQuickPanelPreview">
                    <div class="quick-panel-categories">
                    <section v-if="usesAccLayout || !quickPanelSupport.quickAutomations || showAllQuickPanelButtons || !fastState.isEngineRunning" class="quick-panel-section" aria-label="Riferimenti numerici">
                      <h2 class="quick-panel-heading">Riferimenti</h2>
                      <div class="quick-panel-pair">
                    <div class="quick-reference" :class="{ 'is-active': (isFullQuickPanelPreview || infoTargetActive) }">
                    <button
                      type="button"
                      class="launcher-tool-button launcher-tool-button--target"
                      :class="{ 'is-active': (isFullQuickPanelPreview || infoTargetActive), 'is-selected': selectedWheelActionId === 'target' }"
                      data-overlay-wheel-action="target"
                      :aria-pressed="(isFullQuickPanelPreview || infoTargetActive)"
                      :aria-current="selectedWheelActionId === 'target' ? 'true' : undefined"
                      aria-label="Configura Giro obiettivo HUD Info"
                      @focus="selectedWheelActionId = 'target'"
                      @click="openInfoTargetSetup"
                    >
                      <Check v-if="(isFullQuickPanelPreview || infoTargetActive)" class="quick-reference-check" :size="12" aria-hidden="true" /><Target :size="22" aria-hidden="true" /><span>Giro obiettivo</span>
                    </button>
                    <button v-if="(isFullQuickPanelPreview || infoTargetActive)" class="quick-reference-off" data-overlay-wheel-action="target-disable" title="Disattiva tempo giro" aria-label="Disattiva tempo giro" :disabled="referenceBusy" @click="disableReference('target')"><Power :size="14" /></button>
                    </div>
                    <div v-if="quickPanelSupport.quickSectorReferences" class="quick-reference" :class="{ 'is-active': (isFullQuickPanelPreview || customSectorsActive) }">
                    <button type="button" class="launcher-tool-button" :aria-pressed="(isFullQuickPanelPreview || customSectorsActive)" title="Configura riferimenti settori" data-overlay-wheel-action="sector-references" @click="isSectorReferenceSetupOpen = true">
                      <Check v-if="(isFullQuickPanelPreview || customSectorsActive)" class="quick-reference-check" :size="12" aria-hidden="true" /><Flag :size="22" aria-hidden="true" /><span>Settori obiettivo</span>
                    </button>
                    <button v-if="(isFullQuickPanelPreview || customSectorsActive)" class="quick-reference-off" data-overlay-wheel-action="sector-disable" title="Disattiva personalizzati e ripristina il confronto abituale" aria-label="Disattiva riferimenti personalizzati" :disabled="referenceBusy" @click="disableReference('sectors')"><Power :size="14" /></button>
                    </div>
                      </div>
                    </section>
                    <section v-if="quickPanelSupport.quickAutomations" class="quick-panel-section quick-panel-automations" :class="{ 'quick-panel-show-all': showAllQuickPanelButtons, 'quick-panel-driving': hideStintWhileDriving && !usesAccLayout }" aria-label="Automazioni">
                    <SetupFuelPanel :key="isFullQuickPanelPreview ? 'preview' : 'live'" :preview-expanded="isFullQuickPanelPreview" :body-target="isFullQuickPanelPreview ? '#control-k-fuel-preview' : undefined" show-heading :minutes="isFullQuickPanelPreview ? 30 : fuelStintMinutes" @update:minutes="!isFullQuickPanelPreview && (fuelStintMinutes = $event)" :api="isFullQuickPanelPreview ? quickPanelPreview!.api : getOverlayApi()" status-target="#quick-panel-notification-fuel" separate-view @open="openFuelSetup" />
                    <div class="quick-panel-pair quick-panel-secondary">
                    <h2 class="quick-panel-heading">Pit</h2>
                    <PitwallOverlayButton
                      :key="isFullQuickPanelPreview ? 'preview' : 'live'"
                      :api="isFullQuickPanelPreview ? quickPanelPreview!.api : getOverlayApi()"
                      :selected="selectedWheelActionId === 'pitwall'"
                      data-overlay-wheel-action="pitwall"
                      @focus="selectedWheelActionId = 'pitwall'"
                    />

                    </div>
                    <div class="quick-panel-pressure-pair" aria-label="Pressioni pneumatici">
                    <PressureTestPanel :api="getOverlayApi()" :disabled="isFullQuickPanelPreview" :horizontal="isHorizontalQuickPanel"
                      :feedback-target="usesAccLayout ? '#quick-panel-notification-estimate' : '#quick-panel-pressure-test-feedback'"
                      :status-line="usesAccLayout" @status="pressureTestStatus = $event" />
                    <button
                      type="button"
                      class="launcher-tool-button launcher-tool-button--training launcher-tool-button--pressure"
                      :class="{ 'is-ready': quickPanelPressureState.state === 'ready', 'is-awaiting-pit': quickPanelPressureState.reason === 'pit_pause_required', 'is-selected': selectedWheelActionId === 'pressure' }"
                      data-overlay-wheel-action="pressure"
                      @focus="selectedWheelActionId = 'pressure'"
                      :aria-label="dryPressurePresentation.ariaLabel"
                      aria-describedby="pressure-action-status"
                      :title="dryPressurePresentation.ariaLabel + ': ' + dryPressurePresentation.guidance"
                      :data-state="isDryPressureApplying ? 'pending' : quickPanelPressureState.state === 'ready' ? 'ready' : 'unavailable'"
                      :aria-busy="isDryPressureApplying"
                      :disabled="isDryPressureApplying || quickPanelPressureState.state !== 'ready'"
                      @click="applyDryPressure"
                    >
                      <LoaderCircle v-if="isDryPressureApplying" class="quick-state-icon" :size="16" aria-hidden="true" />
                      <CircleCheck v-else-if="quickPanelPressureState.state === 'ready'" class="quick-state-icon" :size="16" aria-hidden="true" />
                      <CircleMinus v-else class="quick-state-icon" :size="16" aria-hidden="true" />
                      <span>Correggi<br>pressioni</span>
                      <small v-if="pressureBadge" class="quick-action-badge" aria-hidden="true">{{ pressureBadge }}</small>
                    </button>
                    </div>
                    <div v-if="isFullQuickPanelPreview" id="control-k-fuel-preview" class="control-k-fuel-preview" />
                    <Teleport defer to="#quick-panel-notification-requests">
                    <ControlKFriendRequests :key="isFullQuickPanelPreview ? 'preview' : 'live'" :api="isFullQuickPanelPreview ? quickPanelPreview!.api : getOverlayApi()" />
                    </Teleport>
                    <div class="control-k-pressure-info" :class="{ 'control-k-pressure-info--preview': showQuickPanelPressurePreview }">
                  <Teleport defer to="#quick-panel-horizontal-feedback" :disabled="!isHorizontalQuickPanel">
                  <div class="quick-panel-feedback">
                  <!-- PIP-522: the permanent pressure line became the button badge and
                       the context line; only command outcomes are shown as messages. -->
                  <p id="pressure-action-status" class="quick-panel-visually-hidden">
                    Pressioni: {{ dryPressurePresentation.stateLabel }} · {{ dryPressurePresentation.guidance }}
                  </p>
                  <p class="quick-panel-action-hint" role="status" aria-live="polite" :title="quickPanelHint">
                    <Info :size="12" aria-hidden="true" />
                    <span>{{ quickPanelHint }}</span>
                  </p>
                  </div>
                  </Teleport>
                  <Teleport defer to="#quick-panel-notification-pressure">
                  <p v-if="pressureOutcome" class="launcher-hint quick-panel-pressure-status" :class="`quick-panel-pressure-status--${pressureOutcome.tone}`"
                    role="status" aria-live="polite" :title="pressureOutcome.text">
                    {{ pressureOutcome.text }}
                  </p>
                  <div v-if="showQuickPanelPressurePreview" class="pressure-plan" role="status" aria-label="Anteprima regolazione pressioni Setup">
                    <!-- PIP-527: one target for all tyres in the header; per tyre only the
                         measured (compensated) pressure and the clicks to apply. -->
                    <div class="pressure-plan__meta">
                      <strong v-if="pressurePlanTargetPsi !== null">Obiettivo {{ pressurePlanTargetPsi.toFixed(1).replace('.', ',') }} psi</strong>
                      <span>{{ quickPanelPressureState.recommendation?.completed_laps || 0 }}/3 giri · {{ quickPanelPressureState.recommendation?.compound || '—' }}</span>
                    </div>
                    <p v-if="pressureOrigin" class="pressure-plan__origin" :title="pressureOrigin">{{ pressureOrigin }}</p>
                    <table v-if="quickPanelPressureState.recommendation?.wheels" class="pressure-plan__table">
                      <thead><tr><th>Gomma</th><th>Misurata</th><th>Click</th></tr></thead>
                      <tbody>
                        <tr v-for="row in quickPanelPressureState.preview || []" :key="row.wheel">
                          <th>{{ row.wheel }}</th><td>{{ row.compensatedPsi?.toFixed?.(1)?.replace('.', ',') ?? '—' }}</td><td class="pressure-plan__clicks">{{ row.clicks > 0 ? '+' : '' }}{{ row.clicks ?? '—' }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p v-else class="pressure-plan__empty">{{ dryPressurePresentation.guidance }}</p>
                  </div>
                  </Teleport>

                    </div>
                    </section>
                    </div>
                    <!-- PIP-509: audio alerts are always the last row (vertical) or last column (horizontal). -->
                    <QuickPanelVoiceControls v-if="quickPanelSupport.quickVoiceControls"
                      :extended-controls="quickPanelSupport.extendedVoiceControls"
                      :coach="isFullQuickPanelPreview || coachVoiceOn"
                      :references="isFullQuickPanelPreview || referencesVoiceOn"
                      :pressure="isFullQuickPanelPreview || pressureVoiceOn"
                      :target="isFullQuickPanelPreview || targetVoiceOn"
                      :session-label="isFullQuickPanelPreview ? 'Gara' : voiceSessionLabel"
                      :disabled="!isFullQuickPanelPreview && (!canUseSpotterControls || !voiceSessionMode)"
                      @toggle-coach="toggleCoachAudio"
                      @toggle-references="toggleTrackVoiceReferences"
                      @toggle-pressure="togglePressureAudio"
                      @toggle-target="toggleTargetVoice"
                    />
                    </div>
                    <div id="quick-panel-pressure-test-feedback" class="quick-panel-pressure-test-feedback" />
                    <!-- PIP-518: horizontal layout keeps every message in one column, last on the right. -->
                    <div v-show="isHorizontalQuickPanel && !waitingForSimulator && !isNotificationsOpen" class="quick-panel-horizontal-side" :inert="isFullQuickPanelPreview || undefined" @click.capture="guardQuickPanelPreview">
                      <div id="quick-panel-horizontal-feedback" class="quick-panel-horizontal-feedback" />
                    </div>
                    <!-- PIP-532: one view for everything worth reading; the buttons give way to it. -->
                    <section v-show="isNotificationsOpen && !waitingForSimulator" class="quick-panel-notifications" aria-label="Notifiche"
                      :inert="isFullQuickPanelPreview || undefined" @click.capture="guardQuickPanelPreview">
                      <header class="quick-panel-notifications__header">
                        <h2 class="quick-panel-heading">Notifiche</h2>
                        <button type="button" class="launcher-tool-button quick-panel-notifications__close" title="Chiudi notifiche" aria-label="Chiudi notifiche"
                          data-overlay-wheel-action="notifications-close" @click="closeNotifications">
                          <X :size="16" aria-hidden="true" />
                        </button>
                      </header>
                      <div ref="notificationsBody" class="quick-panel-notifications__body">
                        <div id="quick-panel-notification-estimate" class="quick-panel-notification-estimate" />
                        <div id="quick-panel-notification-fuel" class="control-k-fuel-status" />
                        <div id="quick-panel-notification-pressure" class="quick-panel-notification-pressure" />
                        <div id="quick-panel-notification-requests" class="quick-panel-notification-requests" />
                      </div>
                    </section>
                    <details v-if="showQuickPanelDevTools" class="quick-panel-dev" @click.capture="guardQuickPanelDevTools">
                      <summary>Strumenti sviluppo</summary>
                      <button type="button" class="launcher-tool-button" :aria-pressed="previewAllQuickPanelButtons" data-quick-panel-preview @click="toggleQuickPanelPreview">
                        {{ previewAllQuickPanelButtons ? 'Ripristina visibilità' : 'Anteprima completa Ctrl+K' }}
                      </button>
                      <p v-if="isFullQuickPanelPreview" class="launcher-hint" role="status">Anteprima visiva · dati dimostrativi, comandi disattivati.</p>
                    <template v-if="quickPanelSupport.quickAutomations">
                    <button v-if="quickPanelPressureState.qaAvailable" type="button" class="launcher-tool-button launcher-tool-button--target" @click="testDryPressure">Genera raccomandazione TEST</button>
                    <p v-if="quickPanelPressureState.qaAvailable" class="launcher-hint" role="status">Test pressioni: {{ dryPressureBridgeStatus }}</p>
                    <button v-if="quickPanelPressureState.qaActive" type="button" class="launcher-tool-button launcher-tool-button--target" @click="restoreTestDryPressure">Rimuovi raccomandazione TEST</button>
                    </template>
                      <button type="button" class="launcher-tool-button" :disabled="isCheckingPauseMenu" :aria-busy="isCheckingPauseMenu" @click="checkPauseMenu">{{ isCheckingPauseMenu ? 'Verifica in corso…' : 'Verifica menu Pausa' }}</button>
                      <button type="button" class="launcher-tool-button" @click="logAccMenuState">Scrivi stati menu ACC nel log</button>
                      <p v-if="accMenuStateLogMessage" class="launcher-hint" role="status">{{ accMenuStateLogMessage }}</p>

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
                  <!-- PIP-556: one status line of fixed height for every message (ACC). -->
                  <p v-if="usesAccLayout && !waitingForSimulator" class="ck-status" :class="controlKStatus ? `ck-status--${controlKStatus.tone}` : 'ck-status--empty'"
                    role="status" aria-live="polite" :title="controlKStatus?.text">
                    <Info v-if="controlKStatus" :size="12" aria-hidden="true" /><span>{{ controlKStatus?.text }}</span>
                  </p>
                </div>
                <QuickCountdown v-else-if="isQuickTimerOpen" :status="quickTimer.status.value" :display="quickTimer.display.value" @start="startQuickTimer" @cancel="closeQuickTimer" />
                <InfoTargetSetup
                  v-else-if="isTargetSetupOpen"
                  ref="targetSetup"
                  appearance="quick-panel"
                  :target-time-ms="infoTargetTimeMs"
                  :tolerance-ms="infoTargetToleranceMs"
                  :keep-between-sessions="infoTargetKeepBetweenSessions"
                  :best-lap-ms="fastState.info?.bestLapTimeMs ?? null"
                  :last-lap-ms="fastState.info?.lastLapTimeMs ?? null"
                  @set-target-time="infoTargetTimeMs = $event"
                  @select-tolerance="infoTargetToleranceMs = $event"
                  @toggle-keep="infoTargetKeepBetweenSessions = !infoTargetKeepBetweenSessions"
                  @confirm="confirmInfoTarget"
                  @cancel="cancelInfoTargetSetup"
                />
                <SetupFuelPanel v-else-if="isFuelSetupOpen && support.quickAutomations" v-model:minutes="fuelStintMinutes" :api="getOverlayApi()" editor-only @cancel="closeFuelSetup" />
                <SectorReferenceSetup v-else-if="isSectorReferenceSetupOpen && support.quickSectorReferences" ref="sectorReferenceSetup" keyboard-overlay @cancel="closeSectorReferenceSetup" @saved="saveSectorReferenceSetup" />
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

  strong { color: #f6fff9; font-size: 10px; }
  span { margin-left: auto; }
}

/* PIP-552: where a retained correction was computed; same tone as the meta row. */
.pressure-plan__origin {
  margin: 0;
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pressure-plan__table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 10px;
  line-height: 1.15;
  text-align: right;

  th, td { padding: 3px 2px; white-space: nowrap; }
  thead th { color: rgba(226, 238, 247, 0.5); font-size: 8px; font-weight: 850; }
  thead th:first-child, tbody th { text-align: left; }
  tbody tr { border-top: 1px solid rgba(255, 255, 255, 0.06); }
  tbody th { color: #f6fff9; font-weight: 950; }
}

.pressure-plan__clicks { color: #86efac; font-weight: 950; }
.pressure-plan__note, .pressure-plan__empty { margin: 0; color: rgba(226, 238, 247, 0.52); font-size: 8px; line-height: 1.2; text-align: left; }
</style>
