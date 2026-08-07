<script setup lang="ts">
/* eslint-disable max-lines -- Legacy self-contained Electron bridge; split tracked separately from PIP-281 layout scope. */
// HUD (PIP-209): pagina overlay protetta da capability centralizzata.
// - Interruttore GLOBALE di posizionamento: sblocca/blocca TUTTI gli overlay.
// - Per ogni overlay: on/off + formato fisso (Piccolo/Medio/Grande).
// Self-contained (come dev.vue): fuori dal contratto useTelemetryGateway.
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ChartNoAxesCombined, CircleDot, Clock3, Flag, Info, LayoutDashboard, ListOrdered, Trophy } from '@lucide/vue'
import {
  supportsHudOverlayPresentationControl,
  type HudOverlayPresentationControl,
} from '~/utils/hudOverlayPresentationCapabilities'
import {
  backgroundOpacityToTransparency,
  backgroundTransparencyToOpacity,
  supportsHudOverlayBackground,
  type HudOverlayBackgroundId,
} from '~/utils/hudOverlayBackground'
import { getHudOverlayScaleMax, getHudOverlayScaleMin } from '~/composables/useHudOverlay'

definePageMeta({
  layout: 'dashboard',
  middleware: 'hud-access'
})

type HudOverlayId = 'tyres' | 'sectors' | 'dashboard' | 'info' | 'standings'
type HudSettingsLayout = 'columns' | 'matrix'

interface HudReplayScenario {
  id: string
  label: string
  description: string
  durationMs: number
}

interface HudReplayStatus {
  available: boolean
  running: boolean
  scenarioId: string | null
  scenarioLabel: string | null
  frame: number
  intervalMs: number
  error: string | null
  scenarios?: HudReplayScenario[]
}


const hudOverlays: Array<{ id: HudOverlayId; title: string; description: string }> = [
  { id: 'tyres', title: 'Gomme', description: 'Temperature e pressioni per ogni pneumatico.' },
  { id: 'sectors', title: 'Settori', description: 'Tempi e delta dei tre settori.' },
  { id: 'dashboard', title: 'Dashboard', description: 'Marcia, carburante ed elettronica in stile ACC Drive.' },
  { id: 'info', title: 'Info', description: 'Delta, stint, carburante, grip, tempi e danni.' },
  { id: 'standings', title: 'Standings', description: 'Classifica di classe con top e auto intorno al pilota.' },
]

const hudOverlayIcons = {
  tyres: CircleDot,
  sectors: Flag,
  dashboard: LayoutDashboard,
  info: Info,
  standings: ListOrdered,
}

const hudSettingsLayouts: Array<{ id: HudSettingsLayout, label: string, description: string }> = [
  { id: 'columns', label: 'Colonne', description: 'Attivazione ampia, gruppi leggibili su due colonne' },
  { id: 'matrix', label: 'Matrice', description: 'Griglia compatta con righe e colonne continue' },
]

const scaleMinFor = (id: HudOverlayId) => getHudOverlayScaleMin(id)
const scaleMaxFor = (id: HudOverlayId) => getHudOverlayScaleMax(id)

function getApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const isElectron = ref(false)
const apiReady = ref(false)
const enabled = reactive<Record<HudOverlayId, boolean>>({ tyres: false, sectors: false, dashboard: false, info: false, standings: false })
const open = reactive<Record<HudOverlayId, boolean>>({ tyres: false, sectors: false, dashboard: false, info: false, standings: false })
const scale = reactive<Record<HudOverlayId, number>>({ tyres: 1, sectors: 1, dashboard: 1, info: 1, standings: 0.8 })
const tyreVariant = ref<'classic' | 'advanced'>('classic')
const sectorVariant = ref<'classic' | 'compact'>('classic')
const showSectorReference = ref(true)
const showSectorBest = ref(true)
const showSectorCurrentLap = ref(true)
const sectorDeltaReference = ref<'previousLap' | 'bestSector'>('previousLap')
function sectorSupports(control: HudOverlayPresentationControl): boolean {
  return supportsHudOverlayPresentationControl('sectors', sectorVariant.value, control)
}
const dashboardSettings = reactive({
  electronicsReference: false,
  rpmReference: false,
  gearReference: false,
  speedDelta: false,
  fuelCriticalFlashEnabled: false,
  fuelCriticalLapsThreshold: 0.5,
})
const infoSettings = reactive({
  showYellowFlag: true,
  showDelta: true,
  showStint: true,
  showQFuel: false,
  showFuelLeft: false,
  showIncidents: false,
  showGrip: true,
  showPitExitTraffic: true,
  showOptimal: false,
  showBest: true,
  showDamage: true,
  showTime: false,
})
const standingsSettings = reactive({
  topCars: 3,
  carsAhead: 3,
  carsBehind: 3,
  showStintTimer: true,
  showCarNumber: true,
  showIncidents: false,
  showFastestLap: true,
  showLastLap: true,
  showLapProgressBar: true,
  showTurnNumber: false,
})
const backgroundTransparency = reactive<Record<HudOverlayBackgroundId, number>>({
  info: 20,
  tyres: 20,
  standings: 50,
})
type InfoSettingKey = keyof typeof infoSettings
const infoOptionDefinitions: Array<{ key: InfoSettingKey, label: string }> = [
  { key: 'showYellowFlag', label: 'Yellow Flag' },
  { key: 'showStint', label: 'Stint Time' },
  { key: 'showQFuel', label: 'Q-Fuel / Stint-Fuel' },
  { key: 'showFuelLeft', label: 'Fuel Left' },
  { key: 'showIncidents', label: 'Incidents' },
  { key: 'showDelta', label: 'Delta' },
  { key: 'showGrip', label: 'Grip' },
  { key: 'showPitExitTraffic', label: 'Pit Exit Traffic' },
  { key: 'showOptimal', label: 'Optimal' },
  { key: 'showBest', label: 'Best' },
  { key: 'showDamage', label: 'Damage' },
  { key: 'showTime', label: 'Local Time' },
]
const infoSettingGroups: Array<{ id: string, label: string, icon: typeof Trophy, keys: InfoSettingKey[] }> = [
  { id: 'race', label: 'Gara', icon: Trophy, keys: ['showYellowFlag', 'showIncidents', 'showPitExitTraffic'] },
  { id: 'performance', label: 'Prestazioni', icon: ChartNoAxesCombined, keys: ['showGrip', 'showOptimal', 'showDelta', 'showBest', 'showDamage'] },
  { id: 'strategy', label: 'Strategia e tempo', icon: Clock3, keys: ['showQFuel', 'showStint', 'showFuelLeft', 'showTime'] },
]

type StandingsBooleanSettingKey = Exclude<keyof typeof standingsSettings, 'topCars' | 'carsAhead' | 'carsBehind'>
const standingsBooleanOptions: Array<{
  key: StandingsBooleanSettingKey
  label: string
  supported: boolean
  dependency?: string
}> = [
  { key: 'showCarNumber', label: 'Car Number', supported: true },
  { key: 'showFastestLap', label: 'Fastest Lap', supported: true },
  { key: 'showLastLap', label: 'Last Lap', supported: true },
  { key: 'showStintTimer', label: 'Stint Time', supported: false, dependency: 'Richiede telemetria stint avversari.' },
  { key: 'showLapProgressBar', label: 'Lap Progress', supported: true },
  { key: 'showIncidents', label: 'Incidents', supported: false, dependency: 'Richiede provider incidenti.' },
  { key: 'showTurnNumber', label: 'Turn Number', supported: false, dependency: 'Richiede mappa curve autorevole.' },
]

function getInfoOptions(keys: InfoSettingKey[]) {
  return infoOptionDefinitions.filter(option => keys.includes(option.key))
}
const positioning = ref(false)
const trainingOpen = ref(false)
// Stato "in guida" (PIP-177): quando attivo, gli overlay abilitati appaiono da
// soli nella posizione salvata; tornando ai menu spariscono.
const driving = ref(false)
const positionSaved = ref(false)
const placementDeadlineMs = ref<number | null>(null)
const placementAutoSaveMs = ref(60000)
const nowMs = ref(Date.now())
// Override "Sempre visibili" (PIP-177): forza la comparsa ignorando il rilevamento.
const alwaysVisible = ref(false)
const replayStatus = ref<HudReplayStatus>({
  available: false,
  running: false,
  scenarioId: null,
  scenarioLabel: null,
  frame: 0,
  intervalMs: 50,
  error: null,
})
const replayScenarios = ref<HudReplayScenario[]>([])
const replayScenarioId = ref('full-hud')
const replayBusy = ref(false)
const replayMessage = ref('')
const selectedOverlayId = ref<HudOverlayId>('tyres')
const hudSettingsLayout = ref<HudSettingsLayout>('columns')
let unsubscribeDriving: (() => void) | null = null
let placementPollTimer: ReturnType<typeof setInterval> | null = null
let replayPollTimer: ReturnType<typeof setInterval> | null = null


const placementRemainingSeconds = computed(() => {
  if (!positioning.value || placementDeadlineMs.value === null) return null
  return Math.max(0, Math.ceil((placementDeadlineMs.value - nowMs.value) / 1000))
})

const selectedReplayScenario = computed(() =>
  replayScenarios.value.find(scenario => scenario.id === replayScenarioId.value) || null
)
const selectedOverlay = computed(() =>
  hudOverlays.find(overlay => overlay.id === selectedOverlayId.value)!
)
const selectedHasSpecificControls = computed(() => selectedOverlayId.value !== 'tyres')
const selectedSettingsDisabled = computed(() => !apiReady.value || !enabled[selectedOverlayId.value])

async function refreshOverlayVisibility() {
  const api = getApi()
  if (!apiReady.value || typeof api?.hudOverlayIsOpen !== 'function') return
  await Promise.all(hudOverlays.map(async (overlay) => {
    try { open[overlay.id] = await api.hudOverlayIsOpen(overlay.id) } catch { open[overlay.id] = false }
  }))
}

function applyPlacementStatus(status: any) {
  if (!status || typeof status !== 'object') return
  nowMs.value = Date.now()
  positioning.value = status.active === true
  placementDeadlineMs.value = Number.isFinite(Number(status.deadlineMs)) ? Number(status.deadlineMs) : null
  placementAutoSaveMs.value = Number.isFinite(Number(status.autoSaveMs)) ? Number(status.autoSaveMs) : 60000
}

async function refreshPlacementStatus() {
  const api = getApi()
  if (!apiReady.value || typeof api?.hudOverlayGetPlacementStatus !== 'function') return
  try { applyPlacementStatus(await api.hudOverlayGetPlacementStatus()) } catch { /* bridge non aggiornato */ }
}

async function refreshState() {
  const api = getApi()
  isElectron.value = !!api
  apiReady.value = !!(api && typeof api.hudOverlayOpen === 'function')
  if (!apiReady.value) return
  for (const overlay of hudOverlays) {
    try {
      open[overlay.id] = await api.hudOverlayIsOpen(overlay.id)
      const settings = await api.hudOverlayGetSettings(overlay.id)
      enabled[overlay.id] = settings?.enabled === true
      if (settings?.scale !== undefined) scale[overlay.id] = settings.scale
      if (overlay.id === 'tyres') tyreVariant.value = settings?.variant === 'advanced' ? 'advanced' : 'classic'
      if (overlay.id === 'sectors') sectorVariant.value = settings?.variant === 'compact' ? 'compact' : 'classic'
      if (overlay.id === 'sectors' && typeof settings?.showReference === 'boolean') showSectorReference.value = settings.showReference
      if (overlay.id === 'sectors' && typeof settings?.showBest === 'boolean') showSectorBest.value = settings.showBest
      if (overlay.id === 'sectors' && typeof settings?.showCurrentLap === 'boolean') showSectorCurrentLap.value = settings.showCurrentLap
      if (overlay.id === 'sectors') sectorDeltaReference.value = settings?.deltaReference === 'bestSector' ? 'bestSector' : 'previousLap'
      if (overlay.id === 'dashboard') {
        dashboardSettings.electronicsReference = settings?.electronicsReference === true
        dashboardSettings.rpmReference = settings?.rpmReference === true
        dashboardSettings.gearReference = settings?.gearReference === true
        dashboardSettings.speedDelta = settings?.speedDelta === true
        dashboardSettings.fuelCriticalFlashEnabled = settings?.fuelCriticalFlashEnabled === true
        dashboardSettings.fuelCriticalLapsThreshold = Number.isFinite(Number(settings?.fuelCriticalLapsThreshold))
          ? Number(settings.fuelCriticalLapsThreshold) : 0.5
      }
      if (overlay.id === 'standings') {
        for (const key of ['topCars', 'carsAhead', 'carsBehind'] as const) {
          const numeric = Number(settings?.[key])
          if (Number.isFinite(numeric)) standingsSettings[key] = Math.round(Math.min(Math.max(numeric, 0), 5))
        }
        for (const definition of standingsBooleanOptions) {
          if (typeof settings?.[definition.key] === 'boolean') {
            standingsSettings[definition.key] = settings[definition.key]
          }
        }
      }
      if (supportsHudOverlayBackground(overlay.id)) {
        backgroundTransparency[overlay.id] = backgroundOpacityToTransparency(settings?.backgroundOpacity, overlay.id)
      }
      if (overlay.id === 'info') {
        for (const definition of infoOptionDefinitions) {
          infoSettings[definition.key] = settings?.[definition.key] !== false
        }
      }
    } catch {
      enabled[overlay.id] = false
      open[overlay.id] = false
    }
  }
  if (typeof api.hudOverlayGetPlacementStatus === 'function') {
    await refreshPlacementStatus()
  } else if (typeof api.hudOverlayIsPositioning === 'function') {
    try { positioning.value = await api.hudOverlayIsPositioning() } catch { positioning.value = false }
  }
  if (typeof api.trainingOverlayIsOpen === 'function') {
    try { trainingOpen.value = await api.trainingOverlayIsOpen() } catch { trainingOpen.value = false }
  }
  if (typeof api.hudOverlayGetDrivingState === 'function') {
    try { driving.value = await api.hudOverlayGetDrivingState() } catch { driving.value = false }
  }
  if (typeof api.hudOverlayGetAlwaysVisible === 'function') {
    try { alwaysVisible.value = await api.hudOverlayGetAlwaysVisible() } catch { alwaysVisible.value = false }
  }
}

function applyReplayStatus(status: any) {
  if (!status || typeof status !== 'object') return
  replayStatus.value = {
    available: status.available === true,
    running: status.running === true,
    scenarioId: typeof status.scenarioId === 'string' ? status.scenarioId : null,
    scenarioLabel: typeof status.scenarioLabel === 'string' ? status.scenarioLabel : null,
    frame: Number.isFinite(Number(status.frame)) ? Number(status.frame) : 0,
    intervalMs: Number.isFinite(Number(status.intervalMs)) ? Number(status.intervalMs) : 50,
    error: typeof status.error === 'string' ? status.error : null,
    scenarios: Array.isArray(status.scenarios) ? status.scenarios : undefined,
  }
  if (Array.isArray(status.scenarios)) {
    replayScenarios.value = status.scenarios
    if (!status.scenarios.some((scenario: HudReplayScenario) => scenario.id === replayScenarioId.value)) {
      replayScenarioId.value = status.scenarios[0]?.id || 'full-hud'
    }
  }
}

async function refreshReplayStatus() {
  const api = getApi()
  if (typeof api?.hudReplayGetStatus !== 'function') return
  try {
    applyReplayStatus(await api.hudReplayGetStatus())
  } catch {
    replayStatus.value.available = false
  }
}

async function startHudReplay() {
  const api = getApi()
  if (replayBusy.value || typeof api?.hudReplayStart !== 'function') return
  replayBusy.value = true
  replayMessage.value = ''
  try {
    const result = await api.hudReplayStart({ scenarioId: replayScenarioId.value, intervalMs: 50 })
    applyReplayStatus(result)
    replayMessage.value = result?.running
      ? 'Replay attivo: gli overlay ricevono gli stessi aggiornamenti del logger reale.'
      : (result?.error || 'Impossibile avviare il replay.')
  } finally {
    replayBusy.value = false
  }
}

async function stopHudReplay() {
  const api = getApi()
  if (replayBusy.value || typeof api?.hudReplayStop !== 'function') return
  replayBusy.value = true
  try {
    const result = await api.hudReplayStop()
    applyReplayStatus(result)
    replayMessage.value = result?.restored
      ? 'Replay arrestato: fast_state originale ripristinato.'
      : 'Replay arrestato senza sovrascrivere lo stato corrente.'
  } finally {
    replayBusy.value = false
  }
}

async function toggleAlwaysVisible() {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySetAlwaysVisible) return
  const next = !alwaysVisible.value
  alwaysVisible.value = next
  const saved = await api.hudOverlaySetAlwaysVisible(next)
  if (typeof saved === 'boolean') alwaysVisible.value = saved
  await refreshOverlayVisibility()
}

onMounted(() => {
  refreshState()
  placementPollTimer = setInterval(() => {
    nowMs.value = Date.now()
    if (positioning.value) refreshPlacementStatus()
  }, 1000)
  void refreshReplayStatus()
  replayPollTimer = setInterval(() => {
    if (replayStatus.value.running) void refreshReplayStatus()
  }, 500)
  const api = getApi()
  if (api && typeof api.onHudOverlayDrivingState === 'function') {
    unsubscribeDriving = api.onHudOverlayDrivingState((value: boolean) => {
      driving.value = !!value
      void refreshOverlayVisibility()
    })
  }
})

onUnmounted(() => {
  if (unsubscribeDriving) { unsubscribeDriving(); unsubscribeDriving = null }
  if (placementPollTimer) { clearInterval(placementPollTimer); placementPollTimer = null }
  if (replayPollTimer) { clearInterval(replayPollTimer); replayPollTimer = null }
})

async function saveAndLock() {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySetAllPlacement) return
  await api.hudOverlaySetAllPlacement(false)
  await refreshPlacementStatus()
  await refreshOverlayVisibility()
  positionSaved.value = true
  setTimeout(() => { positionSaved.value = false }, 1600)
}

async function startPositioning() {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySetAllPlacement) return
  await api.hudOverlaySetAllPlacement(true)
  await refreshPlacementStatus()
  await refreshOverlayVisibility()
  positionSaved.value = false
}

async function toggleHud(id: HudOverlayId) {
  const api = getApi()
  if (!apiReady.value || !api) return
  if (enabled[id]) await api.hudOverlayClose(id)
  else await api.hudOverlayOpen(id, { scale: scale[id] })
  const settings = await api.hudOverlayGetSettings(id)
  enabled[id] = settings?.enabled === true
  open[id] = await api.hudOverlayIsOpen(id)
  await refreshPlacementStatus()
}

function onScaleInput(id: HudOverlayId, raw: string) {
  const value = Math.min(Math.max(parseFloat(raw), scaleMinFor(id)), scaleMaxFor(id))
  scale[id] = value
  const api = getApi()
  if (!apiReady.value || !api) return
  api.hudOverlaySetScale(id, value).then(() => refreshPlacementStatus()).catch(() => {})
}

async function setTyreVariant(value: string) {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  const next = value === 'advanced' ? 'advanced' : 'classic'
  tyreVariant.value = next
  const settings = await api.hudOverlaySaveSettings('tyres', { variant: next })
  tyreVariant.value = settings?.variant === 'advanced' ? 'advanced' : 'classic'
}

async function setSectorDeltaReference(value: string) {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  const next = value === 'bestSector' ? 'bestSector' : 'previousLap'
  sectorDeltaReference.value = next
  const settings = await api.hudOverlaySaveSettings('sectors', { deltaReference: next })
  sectorDeltaReference.value = settings?.deltaReference === 'bestSector' ? 'bestSector' : 'previousLap'
}

async function setSectorVariant(value: string) {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  const next = value === 'compact' ? 'compact' : 'classic'
  sectorVariant.value = next
  const settings = await api.hudOverlaySaveSettings('sectors', { variant: next })
  sectorVariant.value = settings?.variant === 'compact' ? 'compact' : 'classic'
}

async function toggleSectorCurrentLap() {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  const next = !showSectorCurrentLap.value
  showSectorCurrentLap.value = next
  const settings = await api.hudOverlaySaveSettings('sectors', { showCurrentLap: next })
  if (typeof settings?.showCurrentLap === 'boolean') showSectorCurrentLap.value = settings.showCurrentLap
}

async function toggleSectorReference() {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  const next = !showSectorReference.value
  showSectorReference.value = next
  const settings = await api.hudOverlaySaveSettings('sectors', { showReference: next })
  if (typeof settings?.showReference === 'boolean') showSectorReference.value = settings.showReference
}

async function toggleSectorBest() {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  const next = !showSectorBest.value
  showSectorBest.value = next
  const settings = await api.hudOverlaySaveSettings('sectors', { showBest: next })
  if (typeof settings?.showBest === 'boolean') showSectorBest.value = settings.showBest
}

async function saveDashboardSetting(
  key: keyof typeof dashboardSettings,
  value: boolean | number,
) {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  const normalized = key === 'fuelCriticalLapsThreshold'
    ? Math.round(Math.min(Math.max(Number(value) || 0.5, 0.1), 1) * 10) / 10
    : value
  ;(dashboardSettings as any)[key] = normalized
  const settings = await api.hudOverlaySaveSettings('dashboard', { [key]: normalized })
  if (settings && key in settings) (dashboardSettings as any)[key] = settings[key]
}

function toggleDashboardSetting(key: keyof typeof dashboardSettings) {
  void saveDashboardSetting(key, !(dashboardSettings as any)[key])
}



async function saveInfoSetting(key: InfoSettingKey, value: boolean) {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  infoSettings[key] = value
  const settings = await api.hudOverlaySaveSettings('info', { [key]: value })
  if (settings && typeof settings[key] === 'boolean') infoSettings[key] = settings[key]
}

function toggleInfoSetting(key: InfoSettingKey) {
  void saveInfoSetting(key, !infoSettings[key])
}

async function saveStandingsSetting(
  key: keyof typeof standingsSettings,
  value: boolean | number,
) {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  const normalized = typeof standingsSettings[key] === 'number'
    ? Math.round(Math.min(Math.max(Number(value) || 0, 0), 5))
    : value === true
  ;(standingsSettings as Record<string, boolean | number>)[key] = normalized
  const settings = await api.hudOverlaySaveSettings('standings', { [key]: normalized })
  if (settings && key in settings) {
    ;(standingsSettings as Record<string, boolean | number>)[key] = settings[key]
  }
}

function toggleStandingsSetting(option: typeof standingsBooleanOptions[number]) {
  if (!option.supported) return
  void saveStandingsSetting(option.key, !standingsSettings[option.key])
}

async function onBackgroundTransparencyInput(id: HudOverlayBackgroundId, value: string) {
  const percentage = Math.min(Math.max(Math.round(Number(value) || 0), 0), 100)
  backgroundTransparency[id] = percentage
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  const settings = await api.hudOverlaySaveSettings(id, {
    backgroundOpacity: backgroundTransparencyToOpacity(percentage),
  })
  if (Number.isFinite(Number(settings?.backgroundOpacity))) {
    backgroundTransparency[id] = backgroundOpacityToTransparency(settings.backgroundOpacity)
  }
}
async function toggleTraining() {
  const api = getApi()
  if (!api || typeof api.trainingOverlayToggle !== 'function') return
  await api.trainingOverlayToggle()
  if (typeof api.trainingOverlayIsOpen === 'function') trainingOpen.value = await api.trainingOverlayIsOpen()
  else trainingOpen.value = !trainingOpen.value
}
</script>

<template>
  <LayoutPageContainer>
    <section class="test-hud">
      <header class="test-hud__hero">
        <div>
          <span class="test-hud__kicker">Overlay</span>
          <h1>HUD</h1>
          <p>Scegli un overlay e regola le opzioni disponibili.</p>
        </div>
        <p
          v-if="apiReady"
          class="test-hud__driving"
          :class="{ 'is-on': driving }"
        >
          <span
            class="test-hud__driving-dot"
            aria-hidden="true"
          ></span>
          <span>
            <strong>{{ driving ? 'In guida' : 'Nei menu' }}</strong>
            <em>{{ alwaysVisible ? 'Sempre visibili attivo' : (driving ? 'Gli overlay abilitati possono apparire' : 'Gli overlay abilitati appariranno quando inizi a guidare') }}</em>
          </span>
        </p>
        <p
          v-if="!isElectron"
          class="test-hud__warning"
        >
          Sei nel browser: i comandi overlay funzionano solo nell'app desktop (Electron).
        </p>
        <p
          v-else-if="!apiReady"
          class="test-hud__warning"
        >
          App desktop avviata con una versione precedente: <strong>riavvia l'app</strong> per caricare gli overlay aggiornati.
        </p>
      </header>

      <div class="test-hud__global">
        <section
          class="test-hud__placement"
          :class="{ 'is-on': positioning }"
          aria-labelledby="hud-placement-title"
        >
          <div class="test-hud__placement-text">
            <strong id="hud-placement-title">Posizione di tutti gli overlay</strong>
            <span v-if="positioning">
              Modifica attiva. Salvataggio automatico tra
              <b>{{ placementRemainingSeconds ?? Math.round(placementAutoSaveMs / 1000) }}s</b> di inattività.
            </span>
            <span v-else>Posizioni salvate e bloccate.</span>
          </div>
          <div class="test-hud__placement-actions">
            <button
              type="button"
              class="btn btn--primary"
              :disabled="!apiReady || positioning"
              @click="startPositioning"
            >
              {{ positioning ? 'Modifica attiva' : 'Modifica posizioni' }}
            </button>
            <button
              type="button"
              class="btn"
              :disabled="!apiReady || !positioning"
              @click="saveAndLock"
            >
              {{ positionSaved ? 'Salvato' : 'Salva e blocca' }}
            </button>
          </div>
        </section>

        <label
          class="test-hud__always"
          :class="{ 'is-on': alwaysVisible }"
        >
          <span class="test-hud__always-text">
            <strong>Sempre visibili</strong>
            <em>Mantiene visibili gli overlay abilitati anche fuori dalla guida.</em>
          </span>
          <input
            type="checkbox"
            role="switch"
            :checked="alwaysVisible"
            :disabled="!apiReady"
            @change="toggleAlwaysVisible"
          />
        </label>
      </div>

      <details
        v-if="replayStatus.available"
        class="test-hud__replay"
        :class="{ 'is-running': replayStatus.running }"
        :open="replayStatus.running"
      >
        <summary>
          <span>
            <strong>Replay telemetria HUD</strong>
            <em>Strumento QA · solo sviluppo</em>
          </span>
          <b>{{ replayStatus.running ? 'ATTIVO · frame ' + replayStatus.frame : 'FERMO' }}</b>
        </summary>
        <div class="test-hud__replay-body">
          <p>
            Alimenta il vero <code>fast_state.json</code>. L'avvio viene rifiutato se il logger ACC
            sta scrivendo; allo stop il file precedente viene ripristinato.
          </p>
          <div class="test-hud__replay-controls">
            <label>
              <span>Scenario</span>
              <select
                v-model="replayScenarioId"
                class="hud-select"
                :disabled="replayBusy || replayStatus.running"
              >
                <option
                  v-for="scenario in replayScenarios"
                  :key="scenario.id"
                  :value="scenario.id"
                >
                  {{ scenario.label }}
                </option>
              </select>
            </label>
            <p v-if="selectedReplayScenario">
              {{ selectedReplayScenario.description }}
            </p>
            <div>
              <button
                type="button"
                class="btn btn--primary"
                :disabled="replayBusy || replayStatus.running"
                @click="startHudReplay"
              >
                Avvia replay
              </button>
              <button
                type="button"
                class="btn"
                :disabled="replayBusy || !replayStatus.running"
                @click="stopHudReplay"
              >
                Arresta e ripristina
              </button>
            </div>
            <em
              v-if="replayMessage || replayStatus.error"
              :class="{ 'is-error': !!replayStatus.error && !replayStatus.running }"
            >
              {{ replayMessage || replayStatus.error }}
            </em>
          </div>
        </div>
      </details>

      <div class="hud-workspace">
        <aside class="hud-overlay-list">
          <div class="hud-overlay-list__head">
            <div>
              <span class="test-hud__kicker">Overlay HUD</span>
            </div>
            <span>{{ hudOverlays.filter(overlay => enabled[overlay.id]).length }}/{{ hudOverlays.length }} abilitati</span>
          </div>

          <nav aria-label="Overlay HUD configurabili">
            <button
              v-for="overlay in hudOverlays"
              :key="overlay.id"
              type="button"
              class="hud-overlay-list__item"
              :class="{ 'is-selected': selectedOverlayId === overlay.id }"
              :aria-current="selectedOverlayId === overlay.id ? 'true' : undefined"
              @click="selectedOverlayId = overlay.id"
            >
              <span class="hud-overlay-list__label">
                <component
                  :is="hudOverlayIcons[overlay.id]"
                  class="hud-overlay-list__icon"
                  :size="24"
                  stroke-width="1.8"
                  aria-hidden="true"
                />
                <span class="hud-overlay-list__title">
                  <strong>{{ overlay.title }}</strong>
                  <em :class="{ 'is-on': enabled[overlay.id] }">{{ enabled[overlay.id] ? 'Abilitato' : 'Disabilitato' }}</em>
                </span>
              </span>
              <span
                class="hud-overlay-list__visibility"
                :class="{ 'is-visible': open[overlay.id] }"
              >
                <i aria-hidden="true"></i>
                {{ open[overlay.id] ? 'Visibile ora' : (enabled[overlay.id] ? 'In attesa della guida' : 'Non visibile') }}
              </span>
            </button>
          </nav>

          <section
            class="hud-training"
            aria-labelledby="hud-training-title"
          >
            <div>
              <strong id="hud-training-title">Allenamento</strong>
              <span>{{ trainingOpen ? 'Visibile' : 'Nascosto' }}</span>
            </div>
            <button
              type="button"
              class="btn"
              :disabled="!isElectron"
              @click="toggleTraining"
            >
              {{ trainingOpen ? 'Nascondi allenamento' : 'Mostra allenamento' }}
            </button>
          </section>
        </aside>

        <article
          class="hud-settings"
          :class="[
            `hud-settings--${hudSettingsLayout}`,
            { 'is-overlay-disabled': !enabled[selectedOverlayId] },
          ]"
          :aria-labelledby="'hud-settings-' + selectedOverlay.id"
        >
          <header class="hud-settings__head">
            <div>
              <span class="test-hud__kicker">Configurazione</span>
              <h2 :id="'hud-settings-' + selectedOverlay.id">
                {{ selectedOverlay.title }}
              </h2>
              <p>{{ selectedOverlay.description }}</p>
            </div>
            <div class="hud-layout-preview">
              <span
                id="hud-layout-preview-label"
                class="hud-sr-only"
              >Confronta layout</span>
              <div
                class="hud-layout-preview__options"
                role="group"
                aria-labelledby="hud-layout-preview-label"
              >
                <button
                  v-for="layout in hudSettingsLayouts"
                  :key="layout.id"
                  type="button"
                  :title="layout.description"
                  :aria-pressed="hudSettingsLayout === layout.id"
                  :class="{ 'is-active': hudSettingsLayout === layout.id }"
                  @click="hudSettingsLayout = layout.id"
                >
                  {{ layout.label }}
                </button>
              </div>
            </div>
          </header>

          <section
            class="hud-settings__common"
            aria-labelledby="hud-common-title"
          >
            <div class="hud-settings__section-head">
              <h3 id="hud-common-title">
                Impostazioni comuni
              </h3>
            </div>

            <div class="hud-settings__common-panel hud-settings__control-grid">
              <div class="hud-control hud-control--state">
                <label class="hud-control__state-toggle">
                  <input
                    type="checkbox"
                    role="switch"
                    :checked="enabled[selectedOverlayId]"
                    :disabled="!apiReady"
                    @change="toggleHud(selectedOverlayId)"
                  />
                  <span
                    class="hud-control__switch"
                    aria-hidden="true"
                  ></span>
                  <strong>Overlay abilitato</strong>
                </label>
              </div>
              <label class="hud-control hud-control--slider">
                <span>
                  <strong>Dimensione</strong>
                </span>
                <span class="hud-control__range">
                  <b>{{ Math.round(scale[selectedOverlayId] * 100) }}%</b>
                  <input
                    type="range"
                    class="hud-slider"
                    :min="scaleMinFor(selectedOverlayId)"
                    :max="scaleMaxFor(selectedOverlayId)"
                    :step="selectedOverlayId === 'standings' ? 0.1 : 0.05"
                    :value="scale[selectedOverlayId]"
                    :disabled="selectedSettingsDisabled"
                    :aria-label="'Dimensione HUD ' + selectedOverlay.title"
                    @input="onScaleInput(selectedOverlayId, ($event.target as HTMLInputElement).value)"
                  />
                </span>
              </label>

              <label
                v-if="selectedOverlayId === 'tyres'"
                class="hud-control"
              >
                <span>
                  <strong>Visualizzazione</strong>
                </span>
                <select
                  class="hud-select"
                  :value="tyreVariant"
                  :disabled="selectedSettingsDisabled"
                  @change="setTyreVariant(($event.target as HTMLSelectElement).value)"
                >
                  <option value="classic">Classico</option>
                  <option value="advanced">Avanzato</option>
                </select>
              </label>

              <label
                v-if="selectedOverlayId === 'sectors'"
                class="hud-control"
              >
                <span>
                  <strong>Layout</strong>
                </span>
                <select
                  class="hud-select"
                  :value="sectorVariant"
                  :disabled="selectedSettingsDisabled"
                  @change="setSectorVariant(($event.target as HTMLSelectElement).value)"
                >
                  <option value="classic">Classico</option>
                  <option value="compact">Compatto</option>
                </select>
              </label>

              <label
                v-if="supportsHudOverlayBackground(selectedOverlayId) && (selectedOverlayId !== 'tyres' || tyreVariant === 'advanced')"
                class="hud-control hud-control--slider"
              >
                <span>
                  <strong>Trasparenza sfondo</strong>
                </span>
                <span class="hud-control__range">
                  <b>{{ backgroundTransparency[selectedOverlayId as HudOverlayBackgroundId] }}%</b>
                  <input
                    type="range"
                    class="hud-slider"
                    min="0"
                    max="100"
                    step="5"
                    :value="backgroundTransparency[selectedOverlayId as HudOverlayBackgroundId]"
                    :disabled="selectedSettingsDisabled"
                    :aria-label="'Trasparenza sfondo HUD ' + selectedOverlay.title"
                    @input="onBackgroundTransparencyInput(selectedOverlayId as HudOverlayBackgroundId, ($event.target as HTMLInputElement).value)"
                  />
                </span>
              </label>
            </div>
          </section>

          <template v-if="selectedHasSpecificControls">
            <hr
              class="hud-settings__divider"
              aria-hidden="true"
            />
            <section
              class="hud-settings__specific"
              :aria-label="'Opzioni ' + selectedOverlay.title"
            >
              <div class="hud-settings__specific-panel hud-settings__control-grid">
                <template v-if="selectedOverlayId === 'sectors'">
                  <label class="hud-control">
                    <span>
                      <strong>Confronta con</strong>
                    </span>
                    <select
                      class="hud-select"
                      :value="sectorDeltaReference"
                      :disabled="selectedSettingsDisabled"
                      @change="setSectorDeltaReference(($event.target as HTMLSelectElement).value)"
                    >
                      <option value="previousLap">Giro precedente</option>
                      <option value="bestSector">Miglior settore</option>
                    </select>
                  </label>
                  <label
                    v-if="sectorSupports('sectorCurrentLap')"
                    class="hud-control"
                  >
                    <span><strong>Mostra tempo giro</strong></span>
                    <input
                      type="checkbox"
                      role="switch"
                      :checked="showSectorCurrentLap"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleSectorCurrentLap"
                    />
                  </label>
                  <label
                    v-if="sectorSupports('sectorPrevious')"
                    class="hud-control"
                  >
                    <span><strong>Tempo settore precedente</strong></span>
                    <input
                      type="checkbox"
                      role="switch"
                      :checked="showSectorReference"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleSectorReference"
                    />
                  </label>
                  <label
                    v-if="sectorSupports('sectorBest')"
                    class="hud-control"
                  >
                    <span><strong>Best settore</strong></span>
                    <input
                      type="checkbox"
                      role="switch"
                      :checked="showSectorBest"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleSectorBest"
                    />
                  </label>
                </template>

                <template v-else-if="selectedOverlayId === 'dashboard'">
                  <label class="hud-control">
                    <span><strong>Riferimento elettronica</strong></span>
                    <input
                      type="checkbox"
                      role="switch"
                      :checked="dashboardSettings.electronicsReference"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleDashboardSetting('electronicsReference')"
                    />
                  </label>
                  <label class="hud-control">
                    <span><strong>Riferimento RPM</strong></span>
                    <input
                      type="checkbox"
                      role="switch"
                      :checked="dashboardSettings.rpmReference"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleDashboardSetting('rpmReference')"
                    />
                  </label>
                  <label class="hud-control">
                    <span><strong>Riferimento marcia</strong></span>
                    <input
                      type="checkbox"
                      role="switch"
                      :checked="dashboardSettings.gearReference"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleDashboardSetting('gearReference')"
                    />
                  </label>
                  <label class="hud-control">
                    <span><strong>Delta velocità</strong></span>
                    <input
                      type="checkbox"
                      role="switch"
                      :checked="dashboardSettings.speedDelta"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleDashboardSetting('speedDelta')"
                    />
                  </label>
                  <label class="hud-control">
                    <span><strong>Lampeggio carburante critico</strong></span>
                    <input
                      type="checkbox"
                      role="switch"
                      :checked="dashboardSettings.fuelCriticalFlashEnabled"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleDashboardSetting('fuelCriticalFlashEnabled')"
                    />
                  </label>
                  <label class="hud-control">
                    <span><strong>Soglia carburante critica</strong></span>
                    <span class="hud-number">
                      <input
                        type="number"
                        min="0.1"
                        max="1"
                        step="0.1"
                        :value="dashboardSettings.fuelCriticalLapsThreshold"
                        :disabled="selectedSettingsDisabled || !dashboardSettings.fuelCriticalFlashEnabled"
                        aria-label="Soglia carburante critica in giri"
                        @change="saveDashboardSetting('fuelCriticalLapsThreshold', Number(($event.target as HTMLInputElement).value))"
                      />
                      <b>giri</b>
                    </span>
                  </label>
                </template>

                <template v-else-if="selectedOverlayId === 'standings'">
                  <label class="hud-control hud-control--slider">
                    <span><strong>Top Cars</strong></span>
                    <span class="hud-control__range">
                      <b>{{ standingsSettings.topCars }}</b>
                      <input
                        type="range"
                        class="hud-slider"
                        min="0"
                        max="5"
                        step="1"
                        :value="standingsSettings.topCars"
                        :disabled="selectedSettingsDisabled"
                        aria-label="Top Cars"
                        @input="saveStandingsSetting('topCars', Number(($event.target as HTMLInputElement).value))"
                      />
                    </span>
                  </label>
                  <label class="hud-control hud-control--slider">
                    <span><strong>Cars Ahead</strong></span>
                    <span class="hud-control__range">
                      <b>{{ standingsSettings.carsAhead }}</b>
                      <input
                        type="range"
                        class="hud-slider"
                        min="0"
                        max="5"
                        step="1"
                        :value="standingsSettings.carsAhead"
                        :disabled="selectedSettingsDisabled"
                        aria-label="Cars Ahead"
                        @input="saveStandingsSetting('carsAhead', Number(($event.target as HTMLInputElement).value))"
                      />
                    </span>
                  </label>
                  <label class="hud-control hud-control--slider">
                    <span><strong>Cars Behind</strong></span>
                    <span class="hud-control__range">
                      <b>{{ standingsSettings.carsBehind }}</b>
                      <input
                        type="range"
                        class="hud-slider"
                        min="0"
                        max="5"
                        step="1"
                        :value="standingsSettings.carsBehind"
                        :disabled="selectedSettingsDisabled"
                        aria-label="Cars Behind"
                        @input="saveStandingsSetting('carsBehind', Number(($event.target as HTMLInputElement).value))"
                      />
                    </span>
                  </label>
                  <label
                    v-for="option in standingsBooleanOptions"
                    :key="option.key"
                    class="hud-control hud-control--standings"
                    :class="{ 'is-unavailable': !option.supported }"
                    :title="option.dependency"
                  >
                    <span>
                      <strong>{{ option.label }}</strong>
                      <small v-if="!option.supported">{{ option.dependency }}</small>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      :checked="standingsSettings[option.key]"
                      :disabled="selectedSettingsDisabled || !option.supported"
                      @change="toggleStandingsSetting(option)"
                    />
                  </label>
                </template>

                <template v-else-if="selectedOverlayId === 'info'">
                  <section
                    v-for="group in infoSettingGroups"
                    :key="group.id"
                    class="hud-info-group"
                    :class="'hud-info-group--' + group.id"
                  >
                    <div class="hud-info-group__head">
                      <component
                        :is="group.icon"
                        :size="20"
                        stroke-width="1.9"
                        aria-hidden="true"
                      />
                      <strong>{{ group.label }}</strong>
                    </div>
                    <div class="hud-info-group__options">
                      <label
                        v-for="option in getInfoOptions(group.keys)"
                        :key="option.key"
                        class="hud-control"
                      >
                        <span><strong>{{ option.label }}</strong></span>
                        <input
                          type="checkbox"
                          role="switch"
                          :checked="infoSettings[option.key]"
                          :disabled="selectedSettingsDisabled"
                          @change="toggleInfoSetting(option.key)"
                        />
                      </label>
                    </div>
                  </section>
                </template>
              </div>
            </section>
          </template>
        </article>
      </div>
    </section>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
.test-hud {
  --hud-accent: #fb923c;
  --hud-accent-strong: #f97316;
  --hud-surface: rgba(255, 255, 255, 0.035);
  --hud-surface-raised: rgba(255, 255, 255, 0.055);
  --hud-border: rgba(255, 255, 255, 0.1);
  --hud-text-secondary: rgba(255, 255, 255, 0.66);
  --hud-text-muted: rgba(255, 255, 255, 0.5);
  display: grid;
  gap: 24px;
  color: rgba(255, 255, 255, 0.94);
}

.test-hud__hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  padding: 30px 32px;
  border: 1px solid var(--hud-border);
  border-radius: 18px;
  background: #11131b;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);

  h1 {
    margin: 5px 0 8px;
    color: rgba(255, 255, 255, 0.96);
    font-size: clamp(32px, 4vw, 48px);
    letter-spacing: -0.04em;
  }

  > div > p {
    max-width: 720px;
    margin: 0;
    color: var(--hud-text-secondary);
    line-height: 1.55;
  }
}

.test-hud__kicker {
  color: var(--hud-accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.test-hud__warning {
  max-width: 520px;
  margin: 0;
  color: #fbbf24;
  font-weight: 700;
}

.test-hud__driving {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 270px;
  margin: 0;
  padding: 11px 13px;
  border: 1px solid var(--hud-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);

  > span:last-child { display: grid; gap: 2px; }
  strong { color: rgba(255, 255, 255, 0.88); font-size: 13px; }
  em { color: var(--hud-text-muted); font-size: 11px; font-style: normal; }
}

.test-hud__driving-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.28);
}

.test-hud__driving.is-on .test-hud__driving-dot {
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.14);
}

.test-hud__global {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.8fr);
  gap: 16px;
}

.test-hud__placement,
.test-hud__always {
  border: 1px solid var(--hud-border);
  border-radius: 14px;
  background: var(--hud-surface);
}

.test-hud__placement {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 17px 19px;

  &.is-on {
    border-color: rgba(34, 197, 94, 0.5);
    background: rgba(34, 197, 94, 0.07);
  }
}

.test-hud__placement-text,
.test-hud__always-text {
  display: grid;
  gap: 3px;

  strong { color: rgba(255, 255, 255, 0.94); font-size: 15px; }
  span,
  em { color: var(--hud-text-secondary); font-size: 12px; font-style: normal; line-height: 1.4; }
  b { color: rgba(255, 255, 255, 0.92); }
}

.test-hud__placement-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.test-hud__always {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 17px 19px;
  cursor: pointer;

  &.is-on {
    border-color: rgba(251, 146, 60, 0.45);
    background: rgba(251, 146, 60, 0.07);
  }
}

.test-hud__always input,
.hud-control > input[type='checkbox'],
.hud-control__state-toggle > input[type='checkbox'] {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  accent-color: var(--hud-accent);
}

.test-hud__replay {
  border: 1px solid rgba(96, 165, 250, 0.28);
  border-radius: 14px;
  background: var(--hud-surface);

  &.is-running { border-color: rgba(34, 197, 94, 0.5); }

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 15px 18px;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker { display: none; }
  summary > span { display: grid; gap: 2px; }
  summary strong { font-size: 15px; }
  summary em { color: var(--hud-text-muted); font-size: 11px; font-style: normal; }
  summary b { color: #93c5fd; font-size: 11px; letter-spacing: 0.06em; }
}

.test-hud__replay-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.75fr);
  gap: 24px;
  padding: 0 18px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);

  > p {
    margin: 16px 0 0;
    color: var(--hud-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  code { color: #bfdbfe; }
}

.test-hud__replay-controls {
  display: grid;
  gap: 8px;
  padding-top: 16px;

  label { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--hud-text-muted); font-size: 12px; font-weight: 700; }
  p { min-height: 34px; margin: 0; color: var(--hud-text-muted); font-size: 12px; line-height: 1.4; }
  > div { display: flex; gap: 8px; }
  > em { color: #86efac; font-size: 12px; font-style: normal; }
  > em.is-error { color: #fca5a5; }
}

.hud-workspace {
  display: grid;
  grid-template-columns: minmax(248px, 0.72fr) minmax(0, 2fr);
  align-items: start;
  gap: 18px;
}

.hud-overlay-list,
.hud-settings {
  border: 1px solid var(--hud-border);
  background: var(--hud-surface);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
}

.hud-overlay-list {
  position: sticky;
  top: 18px;
  padding: 18px;
  border-radius: 14px;

  nav { display: grid; gap: 7px; margin-top: 16px; }
}

.hud-overlay-list__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  h2 { margin: 4px 0 0; font-size: 19px; letter-spacing: -0.02em; }
  > span { color: var(--hud-text-muted); font-size: 11px; white-space: nowrap; }
}

.hud-overlay-list__item {
  position: relative;
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 11px 12px 11px 15px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  text-align: left;
  transition: background-color 120ms ease, border-color 120ms ease;

  &::before {
    position: absolute;
    inset: 8px auto 8px 0;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: transparent;
    content: '';
  }

  &:hover { background: rgba(255, 255, 255, 0.04); }
  &.is-selected {
    border-color: rgba(251, 146, 60, 0.26);
    background: rgba(251, 146, 60, 0.075);
  }
  &.is-selected::before { background: var(--hud-accent); }
}

.hud-overlay-list__title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;

  strong { font-size: 14px; }
  em { color: var(--hud-text-muted); font-size: 10px; font-style: normal; font-weight: 700; }
  em.is-on { color: #86efac; }
}

.hud-overlay-list__visibility {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 10px;

  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.25);
  }

  &.is-visible { color: rgba(255, 255, 255, 0.72); }
  &.is-visible i { background: #22c55e; }
}

.hud-training {
  display: grid;
  gap: 9px;
  margin-top: 18px;
  padding-top: 17px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);

  > div { display: flex; justify-content: space-between; gap: 12px; }
  strong { font-size: 13px; }
  span { color: var(--hud-text-muted); font-size: 10px; }
  .btn { justify-self: start; }
}

.hud-settings {
  min-width: 0;
  overflow: hidden;
  border-radius: 16px;
}

.hud-settings__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 26px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.018);

  h2 { margin: 4px 0 6px; font-size: 28px; letter-spacing: -0.035em; }
  p { max-width: 680px; margin: 0; color: var(--hud-text-secondary); font-size: 13px; line-height: 1.5; }
}

.hud-layout-preview {
  display: grid;
  flex: 0 0 auto;
  gap: 6px;

  > span {
    color: var(--hud-text-muted);
    font-size: 10px;
    font-weight: 700;
    text-align: right;
  }
}

.hud-layout-preview__options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.16);

  button {
    min-height: 44px;
    padding: 7px 11px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--hud-text-muted);
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;

    &:hover { color: rgba(255, 255, 255, 0.9); }
    &.is-active {
      background: rgba(251, 146, 60, 0.14);
      color: #fdba74;
    }
  }
}

.hud-settings__common,
.hud-settings__specific {
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 20px 22px;
}

.hud-settings__common {
  gap: 10px;
}

.hud-settings__section-head {
  margin-bottom: 2px;

  h3 { margin: 0; font-size: 16px; }
}

.hud-settings__common-panel,
.hud-settings__specific-panel {
  overflow: hidden;
  gap: 1px;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.09);
}

.hud-control--state {
  display: flex;
  align-items: center;
  justify-content: start;
}

.hud-control__state-toggle {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  width: max-content;
  cursor: pointer;

  strong { color: rgba(255, 255, 255, 0.92); font-size: 13px; }
}

.hud-settings__control-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));

  > .hud-control {
    min-width: 0;
    min-height: 54px;
    border: 0;
    border-radius: 0;
    background: var(--hud-surface);
  }

  &:has(> .hud-control:first-child:last-child) {
    grid-template-columns: 1fr;
  }

  &:has(> .hud-control:nth-child(2):last-child) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  &:has(> .hud-control:nth-child(4):last-child) > .hud-control:last-child {
    grid-column: 1 / -1;
  }
}

.hud-settings__common-panel > .hud-control:not(.hud-control--state) {
  justify-content: flex-start;
  gap: 14px;

  > span:first-child { flex: 0 1 110px; }
}

.hud-settings__common-panel .hud-control__range {
  grid-template-columns: 42px minmax(88px, 1fr);
  flex: 1 1 150px;
  min-width: 140px;
}

.hud-settings__divider {
  height: 1px;
  margin: 0 26px;
  border: 0;
  background: rgba(255, 255, 255, 0.1);
}

.hud-settings__specific {
  padding-top: 18px;

  .hud-select { flex-basis: 146px; min-width: 146px; }
}

.hud-settings__specific-panel > .hud-control:has(> input[type='checkbox']) {
  justify-content: flex-start;
  gap: 10px;
  cursor: pointer;

  > input[type='checkbox'] {
    flex: 0 0 auto;
    order: -1;
    margin: 0;
  }
}

.hud-settings__specific-panel > .hud-control:not(:has(> input[type='checkbox'])) {
  justify-content: flex-start;
  gap: 16px;

  > span:first-child { flex: 0 1 150px; }
}

.hud-settings--band .hud-settings__common-panel {
  grid-template-columns: repeat(6, minmax(0, 1fr));

  > .hud-control--state { grid-column: 1 / -1; }
  > .hud-control:not(.hud-control--state) { grid-column: span 2; }

  &:has(> .hud-control:nth-child(2):last-child) > .hud-control:not(.hud-control--state) {
    grid-column: 1 / -1;
  }

  &:has(> .hud-control:nth-child(3):last-child) > .hud-control:not(.hud-control--state) {
    grid-column: span 3;
  }
}

.hud-settings--flow {
  .hud-settings__common-panel,
  .hud-settings__specific-panel {
    display: flex;
    flex-wrap: wrap;
    column-gap: 22px;
    row-gap: 8px;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .hud-settings__control-grid > .hud-control {
    flex: 1 1 240px;
    padding-inline: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.09);
    background: transparent;
  }

  .hud-settings__control-grid > .hud-control--state {
    flex: 0 1 210px;
  }

  .hud-settings__control-grid > .hud-control--slider {
    flex-basis: 360px;
  }

  .hud-settings__specific-panel > .hud-control:has(> input[type='checkbox']) {
    flex-basis: 190px;
  }

  .hud-settings__specific-panel > .hud-control:not(:has(> input[type='checkbox'])) {
    flex-basis: 320px;
  }
}

.hud-settings.is-overlay-disabled {
  .hud-settings__common-panel > .hud-control:not(.hud-control--state),
  .hud-settings__specific-panel > .hud-control {
    opacity: 0.4;
  }
}

.hud-settings__common-panel > .hud-control:not(.hud-control--state),
.hud-settings__specific-panel > .hud-control {
  transition: opacity 140ms ease;
}

.hud-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 58px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);

  > span:first-child { display: grid; gap: 3px; min-width: 0; }
  strong { color: rgba(255, 255, 255, 0.92); font-size: 13px; }
  em { color: var(--hud-text-muted); font-size: 11px; font-style: normal; line-height: 1.35; }
}

.hud-control--standings small {
  color: var(--hud-text-muted);
  font-size: 10px;
  line-height: 1.3;
}

.hud-control--standings.is-unavailable {
  opacity: 0.52;
}

.hud-control__range {
  display: grid !important;
  grid-template-columns: 48px minmax(150px, 240px);
  align-items: center;
  gap: 12px !important;
  min-width: 250px;

  b {
    color: var(--hud-accent);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
}

.hud-select,
.hud-number input {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 7px;
  background-color: #171b25;
  color: rgba(255, 255, 255, 0.94);
  color-scheme: dark;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.hud-select {
  flex: 0 0 172px;
  min-width: 172px;
  padding: 9px 30px 9px 10px;
  cursor: pointer;

  option { background-color: #171b25; color: rgba(255, 255, 255, 0.94); }
}

.hud-number {
  display: flex !important;
  align-items: center;
  gap: 7px !important;

  input { width: 86px; padding: 9px; font-variant-numeric: tabular-nums; }
  b { color: var(--hud-text-muted); font-size: 10px; text-transform: uppercase; }
}

.hud-slider {
  width: 100%;
  height: 6px;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;

  &::-webkit-slider-thumb {
    width: 18px;
    height: 18px;
    appearance: none;
    -webkit-appearance: none;
    border: 2px solid #1a0d04;
    border-radius: 50%;
    background: var(--hud-accent);
    cursor: pointer;
  }

  &::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border: 2px solid #1a0d04;
    border-radius: 50%;
    background: var(--hud-accent);
    cursor: pointer;
  }
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-weight: 800;
  transition: background-color 120ms ease, border-color 120ms ease;

  &:hover:not(:disabled) { border-color: rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.075); }
}

.btn--primary {
  border-color: transparent;
  background: var(--hud-accent);
  color: #1a0d04;

  &:hover:not(:disabled) { border-color: transparent; background: #fdba74; }
}

.btn:disabled,
.hud-select:disabled,
.hud-slider:disabled,
.hud-number input:disabled,
.hud-control > input:disabled,
.hud-control__state-toggle > input:disabled,
.test-hud__always input:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.hud-overlay-list__item:focus-visible,
.hud-layout-preview__options button:focus-visible,
.test-hud__replay summary:focus-visible,
.hud-select:focus-visible,
.hud-slider:focus-visible,
.hud-number input:focus-visible,
.hud-control > input:focus-visible,
.hud-control__state-toggle > input:focus-visible,
.test-hud__always input:focus-visible {
  outline: 2px solid var(--hud-accent);
  outline-offset: 2px;
}

@media (max-width: 980px) {
  .test-hud__hero { align-items: flex-start; flex-direction: column; }
  .test-hud__driving { width: 100%; }
  .test-hud__global,
  .hud-workspace { grid-template-columns: 1fr; }
  .hud-overlay-list { position: static; }
  .hud-layout-preview { width: 100%; }
  .hud-layout-preview > span { text-align: left; }

  .hud-settings__control-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    &:has(> .hud-control:first-child:last-child) {
      grid-template-columns: 1fr;
    }

    > .hud-control:last-child:nth-child(odd) {
      grid-column: 1 / -1;
    }

    &:has(> .hud-control:nth-child(4):last-child) > .hud-control:last-child {
      grid-column: auto;
    }
  }

  .hud-settings--band .hud-settings__common-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > .hud-control:not(.hud-control--state) { grid-column: auto; }
    > .hud-control--state,
    &:has(> .hud-control:nth-child(2):last-child) > .hud-control:not(.hud-control--state),
    &:has(> .hud-control:nth-child(4):last-child) > .hud-control:last-child {
      grid-column: 1 / -1;
    }
  }

  .hud-overlay-list nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 680px) {
  .test-hud { gap: 16px; }
  .test-hud__hero { padding: 24px 20px; }
  .test-hud__placement { align-items: stretch; flex-direction: column; }
  .test-hud__placement-actions { flex-wrap: wrap; }
  .test-hud__replay-body { grid-template-columns: 1fr; }
  .hud-overlay-list nav { grid-template-columns: 1fr; }
  .hud-settings__head { flex-direction: column; padding: 22px 18px 18px; }
  .hud-settings__common,
  .hud-settings__specific { padding: 20px 18px; }
  .hud-settings__divider { margin: 0 18px; }
  .hud-layout-preview__options { width: 100%; }

  .hud-settings__control-grid,
  .hud-settings--band .hud-settings__common-panel {
    grid-template-columns: 1fr;

    > .hud-control { grid-column: auto !important; }
  }

  .hud-control:not(:has(> input[type='checkbox'])) { align-items: stretch; flex-direction: column; gap: 12px; }
  .hud-control > input[type='checkbox'] { align-self: auto; }
  .hud-control__range { grid-template-columns: 42px minmax(0, 1fr); width: 100%; min-width: 0; }
  .hud-select { width: 100%; min-width: 0; }
  .hud-settings__common-panel > .hud-control:not(.hud-control--state) > span:first-child,
  .hud-settings__specific-panel > .hud-control:not(:has(> input[type='checkbox'])) > span:first-child {
    flex-basis: auto;
  }
  .hud-settings__specific-panel > .hud-control:has(> input[type='checkbox']) {
    align-items: center;
    flex-direction: row;
  }
}

/* PIP-281 — tre composizioni di confronto: stessi controlli, gerarchie diverse. */
.hud-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Gli strumenti di guida e QA restano disponibili, ma non interrompono il workspace di configurazione. */
.test-hud__hero { order: 1; }
.test-hud__global { order: 2; }
.test-hud__replay { order: 3; }
.hud-workspace { order: 4; }

.hud-overlay-list__label {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.hud-overlay-list__icon {
  flex: 0 0 auto;
  color: rgba(255, 255, 255, 0.72);
}

.hud-overlay-list__title {
  flex: 1;
  align-items: center;
}

.hud-overlay-list__item.is-selected .hud-overlay-list__icon { color: var(--hud-accent); }

.hud-control__state-toggle {
  position: relative;
  gap: 10px;
}

.hud-control__state-toggle > input[type='checkbox'] {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.hud-control__switch {
  position: relative;
  width: 48px;
  height: 28px;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  transition: background-color 140ms ease, border-color 140ms ease;
}

.hud-control__switch::after {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.76);
  content: '';
  transition: transform 140ms ease, background-color 140ms ease;
}

.hud-control__state-toggle > input:checked + .hud-control__switch {
  border-color: transparent;
  background: var(--hud-accent);
}

.hud-control__state-toggle > input:checked + .hud-control__switch::after {
  transform: translateX(20px);
  background: #1a0d04;
}

.hud-control__state-toggle > input:focus-visible + .hud-control__switch {
  outline: 2px solid var(--hud-accent);
  outline-offset: 3px;
}

.hud-info-group { min-width: 0; }

.hud-info-group__head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  color: rgba(255, 255, 255, 0.95);
}

.hud-info-group__head svg { color: var(--hud-accent); }
.hud-info-group__head strong { font-size: 14px; }

.hud-info-group__options {
  display: grid;
  gap: 0;
}

.hud-info-group__options > .hud-control {
  min-height: 54px;
  padding-inline: 6px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0;
  background: transparent;
}

.hud-info-group__options > .hud-control:last-child { border-bottom: 0; }

/* Variante 2 — Colonne: interruttore a tutta riga, due colonne editoriali. */
.hud-settings--columns .hud-settings__common { padding: 20px 26px 12px; }
.hud-settings--columns .hud-settings__common-panel {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: visible;
  column-gap: 42px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.hud-settings--columns .hud-settings__common-panel > .hud-control {
  min-height: 76px;
  padding-inline: 0;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0;
  background: transparent;
}

.hud-settings--columns .hud-settings__common-panel > .hud-control--state {
  grid-column: 1 / -1;
  min-height: 72px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(251, 146, 60, 0.04);
}

.hud-settings--columns .hud-settings__common-panel > .hud-control:nth-child(odd):not(.hud-control--state) { padding-right: 32px; }
.hud-settings--columns .hud-settings__common-panel > .hud-control:nth-child(even) { padding-left: 32px; border-left: 1px solid rgba(255, 255, 255, 0.1); }
.hud-settings--columns .hud-settings__specific { padding: 18px 26px 26px; }
.hud-settings--columns .hud-settings__specific-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 44px;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.hud-settings--columns .hud-info-group--strategy { grid-column: 2; grid-row: 1 / span 2; }
.hud-settings--columns .hud-info-group--performance { margin-top: 18px; }


/* Gli overlay con opzioni specifiche usano le stesse righe compatte di Info. */
.hud-settings--columns .hud-settings__specific-panel > .hud-control {
  min-height: 58px;
  padding-inline: 0;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0;
  background: transparent;
}

.hud-settings--columns .hud-settings__specific-panel > .hud-control:has(> input[type='checkbox']) {
  gap: 10px;
}

.hud-settings--matrix .hud-settings__specific-panel > .hud-control {
  min-height: 76px;
  padding: 10px 26px;
  border: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0;
  background: transparent;
}

.hud-settings--matrix .hud-settings__specific-panel > .hud-control:nth-child(3n) { border-right: 0; }
/* Variante 3 — Matrice: massimo utilizzo dello spazio, griglia continua e leggibile. */
.hud-settings--matrix .hud-settings__common { padding: 22px 0 0; }
.hud-settings--matrix .hud-settings__section-head { padding: 0 26px 12px; }
.hud-settings--matrix .hud-settings__common-panel {
  grid-template-columns: 1fr;
  overflow: visible;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0;
  background: transparent;
}

.hud-settings--matrix .hud-settings__common-panel > .hud-control {
  min-height: 72px;
  padding-inline: 26px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0;
  background: transparent;
}

.hud-settings--matrix .hud-settings__common-panel > .hud-control:last-child { border-bottom: 0; }
.hud-settings--matrix .hud-settings__common-panel > .hud-control--state { min-height: 74px; background: rgba(251, 146, 60, 0.035); }
.hud-settings--matrix .hud-settings__common-panel > .hud-control:not(.hud-control--state) { justify-content: flex-start; gap: 34px; }
.hud-settings--matrix .hud-settings__common-panel > .hud-control:not(.hud-control--state) > span:first-child { flex: 0 0 min(32%, 300px); }
.hud-settings--matrix .hud-settings__specific { padding: 24px 0 0; }
.hud-settings--matrix .hud-settings__specific-panel {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  overflow: visible;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0;
  background: transparent;
}

.hud-settings--matrix .hud-info-group,
.hud-settings--matrix .hud-info-group__options { display: contents; }
.hud-settings--matrix .hud-info-group__head { display: none; }
.hud-settings--matrix .hud-info-group__options > .hud-control {
  min-height: 76px;
  padding: 10px 26px;
  border: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
}

.hud-settings--matrix .hud-info-group__options > .hud-control:nth-child(3n) { border-right: 0; }
.hud-settings--matrix .hud-info-group__options > .hud-control:last-child { border-bottom: 1px solid rgba(255, 255, 255, 0.1); }

@media (max-width: 980px) {
  .hud-settings--columns .hud-settings__specific-panel { gap: 22px; }
  .hud-settings--matrix .hud-settings__specific-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hud-settings--matrix .hud-info-group__options > .hud-control:nth-child(3n) { border-right: 1px solid rgba(255, 255, 255, 0.1); }
  .hud-settings--matrix .hud-info-group__options > .hud-control:nth-child(2n) { border-right: 0; }
}

@media (max-width: 680px) {
  .hud-overlay-list__item { padding-left: 12px; }
  .hud-settings--columns .hud-settings__common { padding-inline: 18px; }
  .hud-settings--columns .hud-settings__common-panel,
  .hud-settings--columns .hud-settings__specific-panel,
  .hud-settings--matrix .hud-settings__specific-panel { grid-template-columns: 1fr; }
  .hud-settings--columns .hud-settings__common-panel > .hud-control { padding-inline: 0; border-left: 0; }
  .hud-settings--columns .hud-info-group--strategy { grid-column: auto; grid-row: auto; }
  .hud-settings--columns .hud-info-group--performance { margin-top: 0; }
  .hud-settings--matrix .hud-settings__common-panel > .hud-control { padding-inline: 18px; }
  .hud-settings--matrix .hud-settings__common-panel > .hud-control:not(.hud-control--state) { gap: 16px; }
  .hud-settings--matrix .hud-settings__common-panel > .hud-control:not(.hud-control--state) > span:first-child { flex-basis: auto; }
  .hud-settings--matrix .hud-info-group__options > .hud-control { padding-inline: 18px; border-right: 0; }
}

/* Rifiniture Colonne: attivazione centrata e slider indipendenti. */
.hud-settings--columns .hud-control--state,
.hud-settings--columns .hud-control--state .hud-control__state-toggle {
  align-items: center;
}

.hud-settings--columns .hud-control--state .hud-control__state-toggle { min-height: 0; }
.hud-settings--columns .hud-settings__common-panel > .hud-control:nth-child(odd):not(.hud-control--state) { padding-right: 0; }
.hud-settings--columns .hud-settings__common-panel > .hud-control:nth-child(even) { padding-left: 0; border-left: 0; }
.hud-settings--columns .hud-settings__common-panel > .hud-control--slider > span:first-child strong { white-space: nowrap; }

/* Fascia comune Colonne: padding uniforme, un solo divider prima delle opzioni specifiche. */
.hud-settings--columns .hud-settings__common { padding-bottom: 0; }
.hud-settings--columns .hud-settings__common-panel > .hud-control {
  padding-inline: 18px;
  border-bottom: 0;
}

.hud-settings--columns .hud-settings__common-panel > .hud-control:nth-child(odd):not(.hud-control--state),
.hud-settings--columns .hud-settings__common-panel > .hud-control:nth-child(even) {
  padding-inline: 18px;
  border-left: 0;
}

@media (max-width: 680px) {
  .hud-settings--columns .hud-settings__common-panel > .hud-control,
  .hud-settings--columns .hud-settings__common-panel > .hud-control:nth-child(odd):not(.hud-control--state),
  .hud-settings--columns .hud-settings__common-panel > .hud-control:nth-child(even) { padding-inline: 14px; }
}
</style>
