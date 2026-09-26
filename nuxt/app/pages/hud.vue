<script lang="ts">
import { markHudRoutePhase as markHudRouteModulePhase } from '~/utils/hudRoutePerformance'

if (import.meta.client) markHudRouteModulePhase('route-module-evaluated')
</script>

<script setup lang="ts">
import { usePresentationInterval } from '~/composables/usePresentationVisibility'
/* eslint-disable max-lines -- Legacy self-contained Electron bridge; split tracked separately from PIP-281 layout scope. */
// HUD (PIP-209): pagina overlay protetta da capability centralizzata.
// - Interruttore GLOBALE di posizionamento: sblocca/blocca TUTTI gli overlay.
// - Per ogni overlay: on/off + formato fisso (Piccolo/Medio/Grande).
// Self-contained (come dev.vue): fuori dal contratto useTelemetryGateway.
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import SectorReferenceSetup from '~/components/overlay/SectorReferenceSetup.vue'
import { normalizeSectorDeltaReference, type SectorDeltaReference } from '~/utils/sectorDeltaPresentation'
import type { HudOverlaySettings } from '~/composables/useHudOverlay'
import { ChartNoAxesCombined, CircleDot, Clock3, Eye, Flag, Info, LayoutDashboard, ListOrdered, LockKeyhole, Map as MapIcon, Trophy } from '@lucide/vue'
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
import {
  afterHudNextPaint,
  finishHudRouteTiming,
  formatHudRouteTimingSummary,
  markHudRoutePhase,
} from '~/utils/hudRoutePerformance'

if (import.meta.client) markHudRoutePhase('setup-start')

definePageMeta({
  layout: 'dashboard',
  middleware: 'hud-access'
})

type HudOverlayId = 'tyres' | 'sectors' | 'dashboard' | 'info' | 'standings' | 'trackmap'

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
  { id: 'dashboard', title: 'Dashboard', description: 'Marcia, carburante ed elettronica.' },
  { id: 'info', title: 'Info', description: 'Delta, stint, carburante, grip, tempi e danni.' },
  { id: 'standings', title: 'Standings', description: 'Classifica di classe con top e auto intorno al pilota.' },
  { id: 'trackmap', title: 'Minimappa', description: 'Tracciato con la tua auto, le altre in pista e il punto di uscita dai box.' },
]

const hudOverlayIcons = {
  tyres: CircleDot,
  sectors: Flag,
  dashboard: LayoutDashboard,
  info: Info,
  standings: ListOrdered,
  trackmap: MapIcon,
}


const scaleMinFor = (id: HudOverlayId) => getHudOverlayScaleMin(id)
const scaleMaxFor = (id: HudOverlayId) => getHudOverlayScaleMax(id)

function getApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const isElectron = ref(false)
const apiReady = ref(false)
const enabled = reactive<Record<HudOverlayId, boolean>>({ tyres: false, sectors: false, dashboard: false, info: false, standings: false, trackmap: false })
const open = reactive<Record<HudOverlayId, boolean>>({ tyres: false, sectors: false, dashboard: false, info: false, standings: false, trackmap: false })
const scale = reactive<Record<HudOverlayId, number>>({ tyres: 1, sectors: 1, dashboard: 1, info: 1, standings: 0.8, trackmap: 1 })
const tyreVariant = ref<'classic' | 'race'>('classic')
const sectorVariant = ref<'classic' | 'compact'>('classic')
const showSectorReference = ref(true)
const showSectorBest = ref(true)
const showSectorCurrentLap = ref(true)
const sectorDeltaReference = ref<SectorDeltaReference>('previousLap')
const sectorReferenceEditorOpen = ref(false)
function sectorReferencesSaved(settings: HudOverlaySettings) {
  sectorDeltaReference.value = normalizeSectorDeltaReference(settings.deltaReference)
  sectorReferenceEditorOpen.value = false
}
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
const trackmapSettings = reactive<{
  showPitPrediction: boolean, showCarNumbers: boolean, circleView: boolean
}>({
  showPitPrediction: true,
  showCarNumbers: true,
  circleView: false,
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
  { key: 'showYellowFlag', label: 'Bandiera gialla' },
  { key: 'showStint', label: 'Tempo stint' },
  { key: 'showQFuel', label: 'Carburante qualifica / stint' },
  { key: 'showFuelLeft', label: 'Carburante residuo' },
  { key: 'showIncidents', label: 'Incidenti' },
  { key: 'showDelta', label: 'Delta' },
  { key: 'showGrip', label: 'Grip' },
  { key: 'showPitExitTraffic', label: 'Traffico uscita box' },
  { key: 'showOptimal', label: 'Tempo ideale' },
  { key: 'showBest', label: 'Miglior tempo' },
  { key: 'showDamage', label: 'Danni' },
  { key: 'showTime', label: 'Ora locale' },
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
  { key: 'showCarNumber', label: 'Numero auto', supported: true },
  { key: 'showFastestLap', label: 'Giro migliore', supported: true },
  { key: 'showLastLap', label: 'Ultimo giro', supported: true },
  { key: 'showStintTimer', label: 'Tempo stint', supported: false, dependency: 'Richiede telemetria stint avversari.' },
  { key: 'showLapProgressBar', label: 'Avanzamento giro', supported: true },
  { key: 'showIncidents', label: 'Incidenti', supported: false, dependency: 'Richiede provider incidenti.' },
  { key: 'showTurnNumber', label: 'Numero curva', supported: false, dependency: 'Richiede mappa curve autorevole.' },
]

function getInfoOptions(keys: InfoSettingKey[]) {
  return infoOptionDefinitions.filter(option => keys.includes(option.key))
}
const positioning = ref(false)
const placementBusy = ref(false)
const placementError = ref('')
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
const hudPerformanceSummary = ref('')
let unsubscribeDriving: (() => void) | null = null
const placementActivity = usePresentationInterval(() => {
  nowMs.value = Date.now()
  if (positioning.value) refreshPlacementStatus()
}, 1000)
const replayActivity = usePresentationInterval(() => {
  if (replayStatus.value.running) void refreshReplayStatus()
}, 500)


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
  if (typeof api.trainingOverlayIsOpen === 'function') {
    try { trainingOpen.value = await api.trainingOverlayIsOpen() } catch { trainingOpen.value = false }
  }
}

function applyPlacementStatus(status: any) {
  if (!status || typeof status !== 'object') return
  nowMs.value = Date.now()
  positioning.value = status.active === true
  placementDeadlineMs.value = Number.isFinite(Number(status.deadlineMs)) ? Number(status.deadlineMs) : null
  placementAutoSaveMs.value = Number.isFinite(Number(status.autoSaveMs)) ? Number(status.autoSaveMs) : 60000
}

async function refreshPlacementStatus(strict = false) {
  const api = getApi()
  if (!apiReady.value || typeof api?.hudOverlayGetPlacementStatus !== 'function') return
  try { applyPlacementStatus(await api.hudOverlayGetPlacementStatus()) } catch (error) {
    if (strict) throw error
  }
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
      if (overlay.id === 'tyres') tyreVariant.value = settings?.variant === 'advanced' || settings?.variant === 'race' ? 'race' : 'classic'
      if (overlay.id === 'sectors') sectorVariant.value = settings?.variant === 'compact' ? 'compact' : 'classic'
      if (overlay.id === 'sectors' && typeof settings?.showReference === 'boolean') showSectorReference.value = settings.showReference
      if (overlay.id === 'sectors' && typeof settings?.showBest === 'boolean') showSectorBest.value = settings.showBest
      if (overlay.id === 'sectors' && typeof settings?.showCurrentLap === 'boolean') showSectorCurrentLap.value = settings.showCurrentLap
      if (overlay.id === 'sectors') sectorDeltaReference.value = normalizeSectorDeltaReference(settings?.deltaReference)
      if (overlay.id === 'dashboard') {
        dashboardSettings.electronicsReference = settings?.electronicsReference === true
        dashboardSettings.rpmReference = settings?.rpmReference === true
        dashboardSettings.gearReference = settings?.gearReference === true
        dashboardSettings.speedDelta = settings?.speedDelta === true
        dashboardSettings.fuelCriticalFlashEnabled = settings?.fuelCriticalFlashEnabled === true
        dashboardSettings.fuelCriticalLapsThreshold = Number.isFinite(Number(settings?.fuelCriticalLapsThreshold))
          ? Number(settings.fuelCriticalLapsThreshold) : 0.5
      }
      if (overlay.id === 'trackmap') {
        trackmapSettings.showPitPrediction = settings?.showPitPrediction !== false
        trackmapSettings.showCarNumbers = settings?.showCarNumbers !== false
        trackmapSettings.circleView = settings?.circleView === true
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

async function observeHudInitialReady() {
  markHudRoutePhase('mounted')
  const nextPaint = afterHudNextPaint().then(() => markHudRoutePhase('next-paint'))
  let refreshSucceeded = true
  try {
    await refreshState()
  } catch {
    refreshSucceeded = false
    console.error('[HUD_PERF] refreshState failed')
  } finally {
    markHudRoutePhase('refresh-complete')
  }
  await nextPaint
  hudPerformanceSummary.value = formatHudRouteTimingSummary(finishHudRouteTiming({
    apiReady: apiReady.value,
    refreshSucceeded,
  }))
}

onMounted(() => {
  void observeHudInitialReady()
  placementActivity.start()
  void refreshReplayStatus()
  replayActivity.start()
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
  placementActivity.stop()
  replayActivity.stop()
})

async function saveAndLock() {
  await changePlacement(false)
}

async function startPositioning() {
  await changePlacement(true)
}

async function changePlacement(active: boolean) {
  if (placementBusy.value) return
  placementError.value = ''
  positionSaved.value = false
  const api = getApi()
  if (!apiReady.value || typeof api?.hudOverlaySetAllPlacement !== 'function') {
    placementError.value = 'Comando non disponibile. Riapri la pagina HUD e riprova.'
    return
  }
  placementBusy.value = true
  try {
    const confirmed = await api.hudOverlaySetAllPlacement(active)
    if (typeof confirmed !== 'boolean') throw new Error('Invalid placement response')
    positioning.value = confirmed
    await refreshPlacementStatus(true)
    if (positioning.value !== active) throw new Error('Placement not confirmed')
    await refreshOverlayVisibility()
    positionSaved.value = !active
  } catch {
    // A command may have reached Electron even if its response was lost.
    // Read back the actual state so the next action is still available.
    await refreshPlacementStatus()
    placementError.value = active
      ? 'Impossibile confermare la modifica delle posizioni. Riprova.'
      : 'Impossibile confermare il salvataggio e il blocco. Riprova.'
  } finally {
    placementBusy.value = false
  }
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
  const next = value === 'advanced' || value === 'race' ? 'race' : 'classic'
  tyreVariant.value = next
  const settings = await api.hudOverlaySaveSettings('tyres', { variant: next })
  tyreVariant.value = settings?.variant === 'advanced' || settings?.variant === 'race' ? 'race' : 'classic'
}

function onSectorReferenceChange(event: Event) {
  const select = event.target as HTMLSelectElement
  const value = select.value
  // Keep the select on the saved mode until the editor confirms successfully.
  select.value = sectorDeltaReference.value
  void setSectorDeltaReference(value)
}

async function setSectorDeltaReference(value: string) {
  if (value === 'custom') { sectorReferenceEditorOpen.value = true; return }
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  const next = value === 'bestSector' ? 'bestSector' : 'previousLap'
  sectorDeltaReference.value = next
  const settings = await api.hudOverlaySaveSettings('sectors', { deltaReference: next })
  sectorDeltaReference.value = normalizeSectorDeltaReference(settings?.deltaReference)
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

// Il main normalizza (1-600 s, altrimenti null) e rispecchia il valore al logger:
// qui si mostra sempre cio' che il main ha davvero salvato.
async function saveTrackmapSetting(
  key: keyof typeof trackmapSettings,
  value: boolean | number | null,
) {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySaveSettings) return
  ;(trackmapSettings as any)[key] = value
  const settings = await api.hudOverlaySaveSettings('trackmap', { [key]: value })
  if (settings && key in settings) (trackmapSettings as any)[key] = settings[key]
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
      <output
        class="hud-sr-only"
        aria-live="polite"
        data-testid="hud-performance-summary"
      >{{ hudPerformanceSummary }}</output>
      <header class="test-hud__hero">
        <div>
          <h1>HUD</h1>
          <p>Impostazioni overlay</p>
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
        <div class="hud-global-control">
          <span class="hud-global-label"><Eye :size="22" aria-hidden="true" />Sempre visibili</span><UiRacingSwitch
            label="Sempre visibili"
            :model-value="alwaysVisible"
            :disabled="!apiReady"
            @update:model-value="toggleAlwaysVisible"
          />
        </div>
        <div class="hud-global-control">
          <span class="hud-global-label"><LockKeyhole :size="22" aria-hidden="true" />Blocca posizioni</span><UiRacingSwitch
            label="Blocca posizioni"
            :model-value="!positioning"
            :disabled="!apiReady || placementBusy"
            @update:model-value="$event ? saveAndLock() : startPositioning()"
          />
        </div>
        <p
          v-if="positioning && !placementError"
          class="hud-placement-status"
          role="status"
        >
          Blocco automatico tra {{ placementRemainingSeconds ?? Math.round(placementAutoSaveMs / 1000) }}s di inattività · include Ctrl+K
        </p>
        <p
          v-if="placementError"
          class="hud-placement-status"
          role="alert"
        >
          {{ placementError }}
        </p>
      </div>

      <details
        v-if="replayStatus.available"
        class="test-hud__replay"
        :class="{ 'is-running': replayStatus.running }"
        :open="replayStatus.running"
      >
        <summary>
          <span>
            <strong>Replay HUD</strong>
            <em>Solo sviluppo</em>
          </span>
          <b>{{ replayStatus.running ? 'ATTIVO' : 'FERMO' }}</b>
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
              <strong id="hud-training-title">Pannello rapido · Ctrl+K</strong>
              <span>{{ trainingOpen ? 'Visibile' : 'Nascosto' }}</span>
            </div>
            <button
              type="button"
              class="btn"
              :disabled="!isElectron || positioning || placementBusy"
              @click="toggleTraining"
            >
              {{ trainingOpen ? 'Nascondi' : 'Mostra' }}
            </button>
          </section>
        </aside>

        <article
          class="hud-settings"
          :class="{ 'is-overlay-disabled': !enabled[selectedOverlayId] }"
          :aria-labelledby="'hud-settings-' + selectedOverlay.id"
        >
          <header class="hud-settings__head">
            <div>
              <h2
                :id="'hud-settings-' + selectedOverlay.id"
                class="hud-sr-only"
              >
                {{ selectedOverlay.title }}
              </h2>
              <p>{{ selectedOverlay.description }}</p>
            </div>
          </header>

          <section
            class="hud-settings__common"
            aria-labelledby="hud-common-title"
          >
            <div class="hud-settings__section-head hud-sr-only">
              <h3 id="hud-common-title">
                Impostazioni comuni
              </h3>
            </div>

            <div class="hud-settings__common-panel hud-settings__control-grid">
              <div class="hud-control hud-control--state">
                <span class="hud-control__state-label">Attivo</span>
                <UiRacingSwitch
                  :label="`Abilita ${selectedOverlay.title}`"
                  :model-value="enabled[selectedOverlayId]"
                  :disabled="!apiReady"
                  @update:model-value="toggleHud(selectedOverlayId)"
                />
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
                  <strong>Layout</strong>
                </span>
                <select
                  class="hud-select"
                  :value="tyreVariant"
                  :disabled="selectedSettingsDisabled"
                  @change="setTyreVariant(($event.target as HTMLSelectElement).value)"
                >
                  <option value="classic">Classico</option>
                  <option value="race">Race</option>
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
                v-if="supportsHudOverlayBackground(selectedOverlayId) && selectedOverlayId !== 'tyres'"
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
                      @change="onSectorReferenceChange"
                    >
                      <option value="previousLap">Giro precedente</option>
                      <option value="bestSector">Miglior settore</option>
                      <option value="custom">Personalizzati</option>
                    </select>
                  </label>
                  <button
                    v-if="sectorDeltaReference === 'custom'"
                    type="button"
                    class="hud-select"
                    :disabled="selectedSettingsDisabled"
                    @click="sectorReferenceEditorOpen = true"
                  >
                    Modifica tempi personalizzati
                  </button>
                  <label
                    v-if="sectorSupports('sectorCurrentLap')"
                    class="hud-control"
                  >
                    <span><strong>Mostra tempo giro</strong></span>
                    <input
                      type="checkbox"
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
                      :checked="showSectorBest"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleSectorBest"
                    />
                  </label>
                </template>

                <template v-else-if="selectedOverlayId === 'dashboard'">
                  <div class="hud-checkbox-grid hud-checkbox-grid--dashboard">
                  <label class="hud-control">
                    <span><strong>Riferimento elettronica</strong></span>
                    <input
                      type="checkbox"
                      :checked="dashboardSettings.electronicsReference"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleDashboardSetting('electronicsReference')"
                    />
                  </label>
                  <label class="hud-control">
                    <span><strong>Riferimento RPM</strong></span>
                    <input
                      type="checkbox"
                      :checked="dashboardSettings.rpmReference"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleDashboardSetting('rpmReference')"
                    />
                  </label>
                  <label class="hud-control">
                    <span><strong>Riferimento marcia</strong></span>
                    <input
                      type="checkbox"
                      :checked="dashboardSettings.gearReference"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleDashboardSetting('gearReference')"
                    />
                  </label>
                  <label class="hud-control">
                    <span><strong>Delta velocità</strong></span>
                    <input
                      type="checkbox"
                      :checked="dashboardSettings.speedDelta"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleDashboardSetting('speedDelta')"
                    />
                  </label>
                  <label class="hud-control">
                    <span><strong>Lampeggio carburante critico</strong></span>
                    <input
                      type="checkbox"
                      :checked="dashboardSettings.fuelCriticalFlashEnabled"
                      :disabled="selectedSettingsDisabled"
                      @change="toggleDashboardSetting('fuelCriticalFlashEnabled')"
                    />
                  </label>
                  </div>
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

                <template v-else-if="selectedOverlayId === 'trackmap'">
                  <label class="hud-control">
                    <span><strong>Pit prediction</strong></span>
                    <input
                      type="checkbox"
                      :checked="trackmapSettings.showPitPrediction"
                      :disabled="selectedSettingsDisabled"
                      @change="saveTrackmapSetting('showPitPrediction', !trackmapSettings.showPitPrediction)"
                    />
                  </label>
                  <label class="hud-control">
                    <span><strong>Numeri auto (spento: posizione in gara)</strong></span>
                    <input
                      type="checkbox"
                      :checked="trackmapSettings.showCarNumbers"
                      :disabled="selectedSettingsDisabled"
                      @change="saveTrackmapSetting('showCarNumbers', !trackmapSettings.showCarNumbers)"
                    />
                  </label>
                  <label class="hud-control">
                    <span><strong>Vista a cerchio</strong></span>
                    <input
                      type="checkbox"
                      :checked="trackmapSettings.circleView"
                      :disabled="selectedSettingsDisabled"
                      @change="saveTrackmapSetting('circleView', !trackmapSettings.circleView)"
                    />
                  </label>

                </template>

                <template v-else-if="selectedOverlayId === 'standings'">
                  <div class="hud-slider-grid">
                  <label class="hud-control hud-control--slider">
                    <span><strong>Auto in testa</strong></span>
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
                        aria-label="Auto in testa"
                        @input="saveStandingsSetting('topCars', Number(($event.target as HTMLInputElement).value))"
                      />
                    </span>
                  </label>
                  <label class="hud-control hud-control--slider">
                    <span><strong>Auto davanti</strong></span>
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
                        aria-label="Auto davanti"
                        @input="saveStandingsSetting('carsAhead', Number(($event.target as HTMLInputElement).value))"
                      />
                    </span>
                  </label>
                  <label class="hud-control hud-control--slider">
                    <span><strong>Auto dietro</strong></span>
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
                        aria-label="Auto dietro"
                        @input="saveStandingsSetting('carsBehind', Number(($event.target as HTMLInputElement).value))"
                      />
                    </span>
                  </label>
                  </div>
                  <div class="hud-checkbox-grid">
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
                      :checked="standingsSettings[option.key]"
                      :disabled="selectedSettingsDisabled || !option.supported"
                      @change="toggleStandingsSetting(option)"
                    />
                  </label>
                  </div>
                </template>

                <template v-else-if="selectedOverlayId === 'info'">
                  <div class="hud-info-columns">
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
                          :checked="infoSettings[option.key]"
                          :disabled="selectedSettingsDisabled"
                          @change="toggleInfoSetting(option.key)"
                        />
                      </label>
                    </div>
                  </section>
                  </div>
                </template>
              </div>
            </section>
          </template>
        </article>
      </div>
    </section>
    <!-- Keep the dialog inside the page root so Nuxt can finish route transitions. -->
    <div
      v-if="sectorReferenceEditorOpen"
      class="sector-reference-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Riferimenti settori"
    >
      <SectorReferenceSetup
        @saved="sectorReferencesSaved"
        @cancel="sectorReferenceEditorOpen = false"
      />
    </div>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.sector-reference-dialog { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 24px; background: #000b; }
.sector-reference-dialog > * { width: min(100%,460px); }
.hud-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.test-hud { --hud-accent: var(--racing-race); --hud-border: #ffffff35; --hud-text-muted: #a2a2a8; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 24px; color: #eee; }
.test-hud__hero { align-self: center; }.test-hud__hero h1 { margin: 0 0 4px; font-size: 34px; font-weight: 650; }.test-hud__hero p { margin: 0; font-size: 14px; color: #bcbcc3; }
.test-hud__hero .test-hud__driving { margin-top: 8px; font-size: 10px; }.test-hud__driving em,.test-hud__driving-dot { display: none; }.test-hud__hero .test-hud__warning { color: var(--racing-qualify); margin-top: 10px; font-size: 12px; }
.test-hud__global { display: flex; align-self: center; align-items: center; flex-wrap: wrap; max-width: 580px; gap: 12px 24px; padding: 12px 20px; border: 1px solid var(--hud-border); }
.hud-global-control { display: flex; align-items: center; gap: 18px; font-size: 13px; }.hud-global-label { display: inline-flex; align-items: center; gap: 12px; }.hud-global-label svg { flex-shrink: 0; }.hud-global-control + .hud-global-control { padding-left: 24px; border-left: 1px solid var(--hud-border); }.hud-placement-status { flex-basis: 100%; margin: 0; color: var(--racing-qualify); font-size: 11px; }
.test-hud__replay { grid-column: 1 / -1; order: 5; border: 1px solid var(--hud-border); padding: 14px; font-size: 12px; }.test-hud__replay summary { display: flex; justify-content: space-between; gap: 14px; cursor: pointer; }.test-hud__replay em { display: block; color: var(--hud-text-muted); font-size: 10px; font-style: normal; }.test-hud__replay-body { padding-top: 14px; }.test-hud__replay-controls { display: grid; gap: 12px; }.test-hud__replay-controls > div { display: flex; gap: 12px; }
.hud-workspace { grid-column: 1 / -1; display: grid; grid-template-columns: 270px minmax(0,1fr); gap: 0; padding: 26px; border: 1px solid #ffffff55; min-height: 470px; }
.hud-overlay-list { padding-right: 24px; border-right: 1px solid var(--hud-border); }.hud-overlay-list nav { display: grid; gap: 4px; }.hud-overlay-list__head { display: none; }
.hud-overlay-list__item { position: relative; width: 100%; min-height: 56px; text-align: left; border: 1px solid transparent; border-bottom-color: #ffffff16; padding: 12px; background: none; color: #ddd; cursor: pointer; clip-path: polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px)); }
.hud-overlay-list__item:hover { background: #ffffff0b; }.hud-overlay-list__item.is-selected { border-color: #ffffff70; background: linear-gradient(90deg,#ffffff20,#ffffff05); color: #fff; }.hud-overlay-list__item.is-selected::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: #fff; }.hud-overlay-list__label { display: flex; align-items: center; gap: 18px; }.hud-overlay-list__icon { flex: 0 0 auto; }.hud-overlay-list__title strong { font-size: 14px; font-weight: 500; }.hud-overlay-list__title em,.hud-overlay-list__visibility { display: none; }
.hud-training { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--hud-border); font-size: 12px; }.hud-training > div { display: flex; justify-content: space-between; gap: 8px; }.hud-training span { color: #aaa; }.hud-training button { margin-top: 16px; }
.hud-settings { min-width: 0; padding-left: 30px; }.hud-settings__head { padding-bottom: 22px; border-bottom: 1px solid var(--hud-border); }.hud-settings__head p { margin: 0; font-size: 14px; color: #bfc0c5; }
.hud-settings__common,.hud-settings__specific { padding-top: 24px; }.hud-settings__control-grid { display: flex; flex-direction: column; gap: 18px; }
.hud-control { display: flex; align-items: center; justify-content: flex-start; gap: 16px; min-width: 0; min-height: 36px; max-width: 640px; font-size: 13px; }.hud-control > span:first-child { flex: 0 0 150px; }.hud-control strong,.hud-control__state-label { font-weight: 500; }.hud-control--state { justify-content: flex-start; }.hud-control--standings small { display: block; color: var(--hud-text-muted); font-size: 11px; }.hud-control.is-unavailable { opacity: .5; }
.hud-settings__specific-panel > .hud-control:has(> input[type='checkbox']) { gap: 12px; }.hud-settings__specific-panel > .hud-control:has(> input[type='checkbox']) > span:first-child { flex: 0 1 auto; }.hud-settings__specific-panel > .hud-control > input[type='checkbox'] { order: -1; }
.hud-control__range { display: grid; grid-template-columns: 42px minmax(90px,190px); align-items: center; gap: 14px; width: 246px; max-width: 100%; }.hud-control__range b { font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; color: #ddd; }
.hud-select,.hud-number input { min-width: 0; width: 230px; max-width: 100%; min-height: 38px; padding: 8px 28px 8px 12px; border: 1px solid #ffffff55; border-radius: 0; color: #eee; background: #08090b; color-scheme: dark; font: inherit; font-size: 12px; }.hud-number { display: flex; gap: 8px; align-items: center; }.hud-number input { width: 80px; padding-right: 8px; }.hud-number b { font-size: 11px; color: #aaa; }
.hud-slider { width: 100%; height: 3px; appearance: none; background: #ffffff45; cursor: pointer; accent-color: var(--racing-race); }.hud-slider::-webkit-slider-thumb { appearance: none; width: 4px; height: 20px; border: 0; border-radius: 0; background: #fff; }.hud-slider::-moz-range-thumb { width: 4px; height: 20px; border: 0; border-radius: 0; background: #fff; }.hud-slider::-moz-range-progress { background: var(--racing-race); }
.hud-settings input[type='checkbox'] { appearance: auto; width: 16px; height: 16px; flex: 0 0 auto; accent-color: var(--racing-race); }
.hud-settings__divider { height: 1px; margin: 24px 0 0; border: 0; background: var(--hud-border); }.hud-info-group { min-width: 0; }.hud-info-group h3 { margin: 0 0 14px; color: #aaa; font-size: 12px; text-transform: uppercase; }.hud-info-group + .hud-info-group { border-top: 1px solid var(--hud-border); padding-top: 20px; }.hud-info-group__head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; color: #ccc; font-size: 13px; }.hud-info-group__options { display: grid; gap: 12px; }.hud-info-group__options .hud-control > span:first-child { flex: 0 1 auto; }.hud-info-group__options input { order: -1; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 8px 16px; border: 1px solid #ffffff55; background: #ffffff08; color: #eee; cursor: pointer; font-size: 12px; clip-path: polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px)); }.btn:hover:not(:disabled) { background: #ffffff18; }.btn--primary { background: var(--racing-race); }
.test-hud :disabled { cursor: not-allowed; opacity: .45; }.hud-settings.is-overlay-disabled .hud-settings__specific { color: #999; }
.hud-overlay-list__item:focus-visible,.test-hud button:focus-visible,.test-hud input:focus-visible,.test-hud select:focus-visible,.test-hud summary:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
@media(max-width: 980px) { .test-hud { grid-template-columns: 1fr; }.test-hud__global { justify-self: start; }.hud-workspace { grid-template-columns: 210px minmax(0,1fr); padding: 18px; }.hud-settings { padding-left: 20px; }.hud-control > span:first-child { flex-basis: 120px; } }
@media(max-width: 680px) { .hud-workspace { grid-template-columns: 1fr; }.hud-overlay-list { border-right: 0; padding-right: 0; padding-bottom: 20px; border-bottom: 1px solid var(--hud-border); }.hud-overlay-list nav { grid-template-columns: repeat(2,minmax(0,1fr)); }.hud-settings { padding: 22px 0 0; }.hud-global-control + .hud-global-control { border: 0; padding-left: 0; }.hud-control { flex-wrap: wrap; }.hud-control__range { width: 220px; }.hud-control > span:first-child { flex-basis: 110px; } }

.test-hud { @include controls.tokens; }
.test-hud__hero h1 { @include controls.title; }.test-hud .hud-select { @include controls.select; }.test-hud .btn { @include controls.action; }.test-hud .btn--primary { @include controls.primary; }.test-hud .hud-overlay-list__item { @include controls.navigation; }.test-hud .hud-slider { @include controls.slider; }.hud-workspace { border-color: var(--rc-border); }

/* Compact workspace: long checkbox lists use the available horizontal space. */
.test-hud { grid-template-columns: minmax(150px,1fr) auto auto; gap: 20px 16px; }
.test-hud__hero { grid-column: 1; grid-row: 1; }
.test-hud__global { position: relative; grid-column: 3; grid-row: 1; padding: 8px 14px; gap: 10px 16px; }
.hud-placement-status { position: absolute; top: calc(100% + 8px); left: 0; right: 0; line-height: 16px; }
.test-hud__replay { grid-column: 2; grid-row: 1; order: 0; align-self: center; position: relative; padding: 10px 12px; }
.test-hud__replay summary { align-items: center; gap: 16px; list-style: none; }
.test-hud__replay summary b { font-size: 10px; color: #b3b3b8; }
.test-hud__replay.is-running summary b { color: #21ff83; }
.test-hud__replay-body { position: absolute; z-index: 110; top: calc(100% + 8px); right: 0; width: min(460px,80vw); padding: 18px; background: #0b0c0f; border: 1px solid var(--rc-border); box-shadow: 0 12px 40px #000b; }
.test-hud__replay-body > p { margin-bottom: 12px; }
.hud-workspace { box-sizing: border-box; height: 514px; padding: 20px; min-height: 0; grid-template-columns: 240px minmax(0,1fr); grid-template-rows: minmax(0,1fr); }
.hud-workspace > .hud-overlay-list,.hud-workspace > .hud-settings { min-height: 0; overflow-y: auto; }
.hud-overlay-list { padding-right: 20px; }
.test-hud .hud-overlay-list__item { min-height: 46px; padding-block: 8px; }
.hud-training { margin-top: 16px; padding-top: 14px; }
.hud-training > div { flex-wrap: wrap; }
.hud-training button { margin-top: 10px; }
.hud-settings { padding-left: 24px; }
.hud-settings__head { padding-bottom: 14px; }
.hud-settings__common,.hud-settings__specific { padding-top: 16px; }
.hud-settings__control-grid { gap: 12px; }
.hud-settings__divider { margin-top: 16px; }
.hud-control { min-height: 36px; }
.hud-control:has(> input[type='checkbox']) { min-height: 32px; }
.hud-checkbox-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px 24px; max-width: 960px; }
.hud-checkbox-grid--dashboard { grid-template-columns: repeat(2,minmax(0,1fr)); max-width: 720px; }
.hud-slider-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 24px; max-width: 960px; margin-bottom: 12px; }
.hud-slider-grid .hud-control { flex-direction: column; align-items: flex-start; gap: 12px; }
.hud-slider-grid .hud-control > span:first-child { flex: none; }
.hud-slider-grid .hud-control__range { width: 100%; grid-template-columns: 24px minmax(0,190px); }
.hud-info-columns { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 20px; }
.hud-info-group + .hud-info-group { border-top: 0; padding-top: 0; padding-left: 20px; border-left: 1px solid var(--hud-border); }
.hud-info-group__head { margin-bottom: 12px; }
.hud-info-group__options { gap: 12px; }
.hud-checkbox-grid .hud-control { gap: 10px; align-items: flex-start; }
.hud-checkbox-grid .hud-control > span:first-child { flex: 1; }
.hud-checkbox-grid input { order: -1; margin-top: 3px; }
.hud-control.is-unavailable { opacity: 1; color: #aaa; }
.test-hud :disabled { opacity: .65; }
.hud-settings.is-overlay-disabled .hud-settings__specific { color: #b3b3b8; }
@media(max-width:1100px) {
  .test-hud { grid-template-columns: 1fr auto; }
  .test-hud__global { grid-column: 2; }
  .test-hud__replay { grid-row: 2; grid-column: 2; justify-self: end; }
  .hud-info-columns { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .hud-checkbox-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
}
@media(max-width:780px) {
  .test-hud { grid-template-columns: 1fr; }
  .test-hud__global,.test-hud__replay { grid-column: 1; grid-row: auto; justify-self: start; }
  .test-hud__replay-body { left: 0; right: auto; }
  .hud-info-columns,.hud-checkbox-grid,.hud-slider-grid { grid-template-columns: 1fr; }
  .hud-info-group + .hud-info-group { padding: 16px 0 0; border-left: 0; border-top: 1px solid var(--hud-border); }
}
@media(max-width:680px) {
  .hud-workspace { height: 760px; grid-template-rows: auto minmax(0,1fr); }
  .test-hud__global { margin-bottom: 24px; }
}
</style>
