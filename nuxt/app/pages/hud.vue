<script setup lang="ts">
// HUD (PIP-209): pagina overlay protetta da capability centralizzata.
// - Interruttore GLOBALE di posizionamento: sblocca/blocca TUTTI gli overlay.
// - Per ogni overlay: on/off + formato fisso (Piccolo/Medio/Grande).
// Self-contained (come dev.vue): fuori dal contratto useTelemetryGateway.
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
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

definePageMeta({
  layout: 'dashboard',
  middleware: 'hud-access'
})

type HudOverlayId = 'tyres' | 'sectors' | 'dashboard' | 'info'

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
  { id: 'tyres', title: 'Gomme', description: 'Temperature, pressioni e scivolamento per pneumatico (fast_state).' },
  { id: 'sectors', title: 'Settori', description: 'Tempi e delta per settore con codifica colore (live_state).' },
  { id: 'dashboard', title: 'Dashboard', description: 'Replica ACC Drive 665×225 con marcia, carburante, elettronica e shift flash.' },
  { id: 'info', title: 'Info', description: 'Replica ACC Drive con delta, stint, fuel, grip, best, danni e cronometro.' },
]

const SCALE_MIN = 0.6
const SCALE_MAX = 1.6

function getApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const isElectron = ref(false)
const apiReady = ref(false)
const open = reactive<Record<HudOverlayId, boolean>>({ tyres: false, sectors: false, dashboard: false, info: false })
const scale = reactive<Record<HudOverlayId, number>>({ tyres: 1, sectors: 1, dashboard: 1, info: 1 })
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
const backgroundTransparency = reactive<Record<HudOverlayBackgroundId, number>>({
  info: 20,
  tyres: 20,
})
type InfoSettingKey = keyof typeof infoSettings
const infoOptionDefinitions: Array<{ key: InfoSettingKey, label: string, description: string }> = [
  { key: 'showYellowFlag', label: 'Yellow Flag', description: 'Mostra il bordo giallo dell overlay quando ACC espone la bandiera.' },
  { key: 'showStint', label: 'Stint Time', description: 'Tempo stint pilota o compagno quando disponibile.' },
  { key: 'showQFuel', label: 'Q-Fuel / Stint-Fuel', description: 'Carburante contestuale necessario o in avanzo.' },
  { key: 'showFuelLeft', label: 'Fuel Left', description: 'Tempo di guida stimato con il carburante rimasto.' },
  { key: 'showIncidents', label: 'Incidents', description: 'Invalid Lap 1x, danno 4x.' },
  { key: 'showDelta', label: 'Delta', description: 'Delta live con barra e colori ACC Drive.' },
  { key: 'showGrip', label: 'Grip', description: 'Stato grip pista ACC.' },
  { key: 'showPitExitTraffic', label: 'Pit Exit Traffic', description: 'Traffico previsto all uscita box quando disponibile.' },
  { key: 'showOptimal', label: 'Optimal', description: 'Giro potenziale dai migliori settori.' },
  { key: 'showBest', label: 'Best', description: 'Miglior giro della sessione.' },
  { key: 'showDamage', label: 'Damage', description: 'Danno totale espresso come tempo riparazione.' },
  { key: 'showTime', label: 'Local Time', description: 'Orologio locale HH:mm:ss, come nell Info ACC Drive.' },
]
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
      if (supportsHudOverlayBackground(overlay.id)) {
        backgroundTransparency[overlay.id] = backgroundOpacityToTransparency(settings?.backgroundOpacity)
      }
      if (overlay.id === 'info') {
        for (const definition of infoOptionDefinitions) {
          infoSettings[definition.key] = settings?.[definition.key] !== false
        }
      }
    } catch {
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
    unsubscribeDriving = api.onHudOverlayDrivingState((value: boolean) => { driving.value = !!value })
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
  positionSaved.value = true
  setTimeout(() => { positionSaved.value = false }, 1600)
}

async function startPositioning() {
  const api = getApi()
  if (!apiReady.value || !api?.hudOverlaySetAllPlacement) return
  await api.hudOverlaySetAllPlacement(true)
  await refreshPlacementStatus()
  positionSaved.value = false
}

async function toggleHud(id: HudOverlayId) {
  const api = getApi()
  if (!apiReady.value || !api) return
  if (open[id]) await api.hudOverlayClose(id)
  else await api.hudOverlayOpen(id, { scale: scale[id] })
  open[id] = await api.hudOverlayIsOpen(id)
  await refreshPlacementStatus()
}

function onScaleInput(id: HudOverlayId, raw: string) {
  const value = Math.min(Math.max(parseFloat(raw), SCALE_MIN), SCALE_MAX)
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
        <span class="test-hud__kicker">Overlay</span>
        <h1>HUD</h1>
        <p>
          Accendi gli overlay, scegli il formato e posizionali.
        </p>
        <p v-if="!isElectron" class="test-hud__warning">
          Sei nel browser: i comandi overlay funzionano solo nell'app desktop (Electron).
        </p>
        <p v-else-if="!apiReady" class="test-hud__warning">
          App desktop avviata con una versione precedente: <strong>riavvia l'app</strong> per
          caricare gli overlay aggiornati.
        </p>
        <p v-if="apiReady" class="test-hud__driving" :class="{ 'is-on': driving }">
          <span class="test-hud__driving-dot"></span>
          In guida: <strong>{{ driving ? 'sì' : 'no' }}</strong>
          <em>{{ alwaysVisible ? 'override “Sempre visibili” attivo' : (driving ? 'gli overlay abilitati sono visibili' : 'gli overlay abilitati appariranno quando inizi a guidare') }}</em>
        </p>
      </header>

      <!-- Interruttore globale di posizionamento -->
      <div class="test-hud__placement" :class="{ 'is-on': positioning }">
        <div class="test-hud__placement-text">
          <strong>Posizionamento overlay</strong>
          <span v-if="positioning">
            Modifica attiva: sposta o ridimensiona gli overlay. Salvataggio automatico tra
            <b>{{ placementRemainingSeconds ?? Math.round(placementAutoSaveMs / 1000) }}s</b> di inattivita'.
          </span>
          <span v-else>Bloccato: le posizioni sono fisse.</span>
        </div>
        <div class="test-hud__placement-actions">
          <button type="button" class="btn btn--primary" :disabled="!apiReady || positioning" @click="startPositioning">
            {{ positioning ? 'Modifica attiva' : 'Modifica posizione overlay' }}
          </button>
          <button type="button" class="btn" :disabled="!apiReady || !positioning" @click="saveAndLock">
            {{ positionSaved ? 'Salvato' : 'Salva e blocca' }}
          </button>
        </div>
      </div>

      <!-- Override globale: forza la visualizzazione costante (come ACC Drive) -->
      <label class="test-hud__always" :class="{ 'is-on': alwaysVisible }">
        <span class="test-hud__always-text">
          <strong>Sempre visibili</strong>
          <em>Forza gli overlay abilitati a restare visibili sempre, anche nei menu / ai box (ignora il rilevamento guida).</em>
        </span>
        <input
          type="checkbox"
          role="switch"
          :checked="alwaysVisible"
          :disabled="!apiReady"
          @change="toggleAlwaysVisible"
        >
      </label>

      <section
        v-if="replayStatus.available"
        class="test-hud__replay"
        :class="{ 'is-running': replayStatus.running }"
      >
        <div class="test-hud__replay-copy">
          <span class="test-hud__kicker">Strumento QA · solo sviluppo</span>
          <div class="test-hud__replay-title">
            <strong>Replay telemetria HUD</strong>
            <span>{{ replayStatus.running ? `ATTIVO · frame ${replayStatus.frame}` : 'FERMO' }}</span>
          </div>
          <p>
            Alimenta il vero <code>fast_state.json</code>. L'avvio viene rifiutato se il logger ACC
            sta scrivendo; allo stop il file precedente viene ripristinato.
          </p>
        </div>

        <div class="test-hud__replay-controls">
          <label>
            <span>Scenario</span>
            <select
              v-model="replayScenarioId"
              class="hud-card__select"
              :disabled="replayBusy || replayStatus.running"
            >
              <option v-for="scenario in replayScenarios" :key="scenario.id" :value="scenario.id">
                {{ scenario.label }}
              </option>
            </select>
          </label>
          <p v-if="selectedReplayScenario">{{ selectedReplayScenario.description }}</p>
          <div>
            <button
              type="button"
              class="btn btn--primary"
              :disabled="replayBusy || replayStatus.running"
              @click="startHudReplay"
            >Avvia replay</button>
            <button
              type="button"
              class="btn"
              :disabled="replayBusy || !replayStatus.running"
              @click="stopHudReplay"
            >Arresta e ripristina</button>
          </div>
          <em v-if="replayMessage || replayStatus.error" :class="{ 'is-error': !!replayStatus.error && !replayStatus.running }">
            {{ replayMessage || replayStatus.error }}
          </em>
        </div>
      </section>

      <div class="test-hud__grid">
        <!-- Overlay allenamento: solo mostra/nascondi (come Ctrl+K) -->
        <article class="hud-card hud-card--training">
          <div class="hud-card__head">
            <strong>Allenamento</strong>
            <span class="hud-card__state" :class="{ 'is-on': trainingOpen }">{{ trainingOpen ? 'ON' : 'OFF' }}</span>
          </div>
          <p>Overlay coaching completo (fasi, voce, step). Qui solo mostra/nascondi.</p>
          <div class="hud-card__actions">
            <button type="button" class="btn btn--primary" :disabled="!isElectron" @click="toggleTraining">
              {{ trainingOpen ? 'Nascondi' : 'Mostra' }}
            </button>
          </div>
        </article>

        <!-- Overlay HUD: on/off + formato -->
        <article v-for="overlay in hudOverlays" :key="overlay.id" class="hud-card">
          <div class="hud-card__head">
            <strong>{{ overlay.title }}</strong>
            <span class="hud-card__state" :class="{ 'is-on': open[overlay.id] }">{{ open[overlay.id] ? 'ON' : 'OFF' }}</span>
          </div>
          <p>{{ overlay.description }}</p>

          <div class="hud-card__actions">
            <button type="button" class="btn btn--primary" :disabled="!apiReady" @click="toggleHud(overlay.id)">
              {{ open[overlay.id] ? 'Spegni' : 'Accendi' }}
            </button>
          </div>

          <div class="hud-card__size">
            <div class="hud-card__size-row">
              <span class="hud-card__formats-label">Dimensione</span>
              <span class="hud-card__size-val">{{ Math.round(scale[overlay.id] * 100) }}%</span>
            </div>
            <input
              type="range"
              class="hud-slider"
              :min="SCALE_MIN"
              :max="SCALE_MAX"
              step="0.05"
              :value="scale[overlay.id]"
              :disabled="!apiReady"
              @input="onScaleInput(overlay.id, ($event.target as HTMLInputElement).value)"
            >
          </div>

          <label v-if="overlay.id === 'tyres'" class="hud-card__option">
            <span>
              <strong>Visualizzazione</strong>
              <em>Classico mantiene l'HUD attuale; Avanzato mostra il pannello stile ACC Drive.</em>
            </span>
            <select
              class="hud-card__select"
              :value="tyreVariant"
              :disabled="!apiReady"
              @change="setTyreVariant(($event.target as HTMLSelectElement).value)"
            >
              <option value="classic">Classico</option>
              <option value="advanced">Avanzato</option>
            </select>
          </label>

          <div
            v-if="supportsHudOverlayBackground(overlay.id) && (overlay.id !== 'tyres' || tyreVariant === 'advanced')"
            class="hud-card__size hud-card__background-transparency"
          >
            <div class="hud-card__size-row">
              <span class="hud-card__formats-label">Trasparenza sfondo</span>
              <span class="hud-card__size-val">{{ backgroundTransparency[overlay.id] }}%</span>
            </div>
            <input
              type="range"
              class="hud-slider"
              min="0"
              max="100"
              step="5"
              :value="backgroundTransparency[overlay.id]"
              :disabled="!apiReady"
              :aria-label="`Trasparenza sfondo HUD ${overlay.title}`"
              @input="onBackgroundTransparencyInput(overlay.id, ($event.target as HTMLInputElement).value)"
            >
            <em class="hud-card__slider-help">
              Rende trasparente soltanto lo sfondo nero; testi e valori restano pienamente visibili.
            </em>
          </div>

          <template v-if="overlay.id === 'sectors'">
            <label class="hud-card__option">
              <span>
                <strong>Layout</strong>
                <em>Classico mantiene l'HUD attuale; Compatto mostra cronometro e tre righe essenziali.</em>
              </span>
              <select
                class="hud-card__select"
                :value="sectorVariant"
                :disabled="!apiReady"
                @change="setSectorVariant(($event.target as HTMLSelectElement).value)"
              >
                <option value="classic">Classico</option>
                <option value="compact">Compatto</option>
              </select>
            </label>
            <label class="hud-card__option">
              <span>
                <strong>Confronta con</strong>
                <em>Sceglie il riferimento del delta; se manca, il valore resta “Wait”.</em>
              </span>
              <select
                class="hud-card__select"
                :value="sectorDeltaReference"
                :disabled="!apiReady"
                @change="setSectorDeltaReference(($event.target as HTMLSelectElement).value)"
              >
                <option value="previousLap">Giro precedente</option>
                <option value="bestSector">Miglior settore</option>
              </select>
            </label>
            <label v-if="sectorSupports('sectorCurrentLap')" class="hud-card__option">
              <span>
                <strong>Mostra tempo giro</strong>
                <em>Mostra o nasconde il current lap nel layout Compatto.</em>
              </span>
              <input
                type="checkbox"
                role="switch"
                :checked="showSectorCurrentLap"
                :disabled="!apiReady"
                @change="toggleSectorCurrentLap"
              >
            </label>
            <label v-if="sectorSupports('sectorPrevious')" class="hud-card__option">
              <span>
                <strong>Tempo settore precedente</strong>
                <em>Mostra/nasconde la riga “prec” nel HUD settori.</em>
              </span>
              <input
                type="checkbox"
                role="switch"
                :checked="showSectorReference"
                :disabled="!apiReady"
                @change="toggleSectorReference"
              >
            </label>
            <label v-if="sectorSupports('sectorBest')" class="hud-card__option">
              <span>
                <strong>Best settore</strong>
                <em>Mostra/nasconde il riferimento best usato per il fucsia.</em>
              </span>
              <input
                type="checkbox"
                role="switch"
                :checked="showSectorBest"
                :disabled="!apiReady"
                @change="toggleSectorBest"
              >
            </label>
          </template>
          <template v-if="overlay.id === 'dashboard'">
            <label class="hud-card__option">
              <span><strong>Riferimento elettronica</strong><em>Replica l'opzione originale ACC Drive.</em></span>
              <input type="checkbox" role="switch" :checked="dashboardSettings.electronicsReference" :disabled="!apiReady" @change="toggleDashboardSetting('electronicsReference')">
            </label>
            <label class="hud-card__option">
              <span><strong>Riferimento RPM</strong><em>Mostra il riferimento di cambiata sulla barra giri.</em></span>
              <input type="checkbox" role="switch" :checked="dashboardSettings.rpmReference" :disabled="!apiReady" @change="toggleDashboardSetting('rpmReference')">
            </label>
            <label class="hud-card__option">
              <span><strong>Riferimento marcia</strong><em>Mantiene l'opzione originale pronta per i riferimenti auto.</em></span>
              <input type="checkbox" role="switch" :checked="dashboardSettings.gearReference" :disabled="!apiReady" @change="toggleDashboardSetting('gearReference')">
            </label>
            <label class="hud-card__option">
              <span><strong>Delta velocità</strong><em>Usa il delta quando la fonte centrale lo rende disponibile.</em></span>
              <input type="checkbox" role="switch" :checked="dashboardSettings.speedDelta" :disabled="!apiReady" @change="toggleDashboardSetting('speedDelta')">
            </label>
            <label class="hud-card__option">
              <span><strong>Lampeggio carburante critico</strong><em>Sotto la soglia critica pulsa solo il bordo; testo e valori restano sempre leggibili.</em></span>
              <input type="checkbox" role="switch" :checked="dashboardSettings.fuelCriticalFlashEnabled" :disabled="!apiReady" @change="toggleDashboardSetting('fuelCriticalFlashEnabled')">
            </label>
            <label class="hud-card__option">
              <span><strong>Soglia carburante critica</strong><em>L'avviso ACC Drive diventa ambra da 1,0 giro; qui scegli quando inizia il pulse opzionale.</em></span>
              <span class="hud-card__rpm">
                <input
                  type="number"
                  min="0.1"
                  max="1"
                  step="0.1"
                  :value="dashboardSettings.fuelCriticalLapsThreshold"
                  :disabled="!apiReady || !dashboardSettings.fuelCriticalFlashEnabled"
                  @change="saveDashboardSetting('fuelCriticalLapsThreshold', Number(($event.target as HTMLInputElement).value))"
                >
                <b>GIRI</b>
              </span>
            </label>
          </template>
          <template v-if="overlay.id === 'info'">
            <label v-for="option in infoOptionDefinitions" :key="option.key" class="hud-card__option">
              <span>
                <strong>{{ option.label }}</strong>
                <em>{{ option.description }}</em>
              </span>
              <input type="checkbox" role="switch" :checked="infoSettings[option.key]" :disabled="!apiReady" @change="toggleInfoSetting(option.key)">
            </label>
          </template>
        </article>
      </div>
    </section>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
.test-hud {
  display: grid;
  gap: 22px;
}

.test-hud__hero {
  padding: 34px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at 16% 20%, rgba(251, 146, 60, 0.16), transparent 36%),
    linear-gradient(135deg, rgba(22, 27, 40, 0.96), rgba(11, 11, 16, 0.96));

  h1 { margin: 8px 0 10px; color: #fff; font-size: clamp(34px, 5vw, 58px); letter-spacing: -0.04em; }
  p { max-width: 760px; margin: 0 0 6px; color: rgba(255, 255, 255, 0.68); font-size: 16px; line-height: 1.6; }
}

.test-hud__kicker {
  color: rgba(255, 255, 255, 0.52);
  font-size: 12px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase;
}

.test-hud__warning { color: #fbbf24; font-weight: 700; }

.test-hud__driving {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;

  strong { color: rgba(255, 255, 255, 0.85); }
  em { color: rgba(255, 255, 255, 0.45); font-style: normal; font-size: 13px; }
  &.is-on strong { color: #22c55e; }
}

.test-hud__driving-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.28);
  .test-hud__driving.is-on & { background: #22c55e; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.16); }
}

.test-hud__placement {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.035);

  &.is-on {
    border-color: rgba(34, 197, 94, 0.5);
    background: rgba(34, 197, 94, 0.08);
  }

  strong { display: block; color: #fff; font-size: 18px; }
  span { color: rgba(255, 255, 255, 0.62); font-size: 14px; }
  b { color: #fff; font-weight: 900; }
}

.test-hud__placement-actions { display: flex; gap: 10px; flex-shrink: 0; }

.test-hud__always {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 22px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.035);
  cursor: pointer;

  &.is-on { border-color: rgba(251, 146, 60, 0.5); background: rgba(251, 146, 60, 0.08); }

  input { width: 18px; height: 18px; accent-color: #fb923c; flex-shrink: 0; }
}

.test-hud__always-text {
  display: grid;
  gap: 3px;
  strong { color: #fff; font-size: 18px; }
  em { color: rgba(255, 255, 255, 0.62); font-size: 14px; font-style: normal; line-height: 1.4; }
}

.test-hud__replay {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.72fr);
  gap: 24px;
  padding: 20px 22px;
  border: 1px solid rgba(96, 165, 250, 0.35);
  border-radius: 18px;
  background:
    radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.12), transparent 42%),
    rgba(255, 255, 255, 0.035);

  &.is-running {
    border-color: rgba(34, 197, 94, 0.55);
    box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.08);
  }
}

.test-hud__replay-copy {
  display: grid;
  align-content: start;
  gap: 7px;

  p {
    max-width: 680px;
    margin: 0;
    color: rgba(255, 255, 255, 0.64);
    font-size: 13px;
    line-height: 1.5;
  }

  code { color: #bfdbfe; }
}

.test-hud__replay-title {
  display: flex;
  align-items: center;
  gap: 12px;

  strong { color: #fff; font-size: 20px; }
  span {
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.62);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.08em;
  }
}

.test-hud__replay.is-running .test-hud__replay-title span { color: #86efac; background: rgba(34, 197, 94, 0.12); }

.test-hud__replay-controls {
  display: grid;
  gap: 8px;
  label { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: rgba(255, 255, 255, 0.58); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }
  p { min-height: 34px; margin: 0; color: rgba(255, 255, 255, 0.52); font-size: 12px; line-height: 1.4; }
  > div { display: flex; gap: 8px; }
  > em { color: #86efac; font-size: 12px; font-style: normal; }
  > em.is-error { color: #fca5a5; }
}

.test-hud__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}

.hud-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
  color: #fff;

  > p { margin: 0; color: rgba(255, 255, 255, 0.66); line-height: 1.5; }
}

.hud-card--training { border-color: rgba(34, 197, 94, 0.28); }

.hud-card__head {
  display: flex; align-items: center; justify-content: space-between;
  strong { font-size: 22px; letter-spacing: -0.02em; }
}

.hud-card__state {
  padding: 3px 12px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 12px; font-weight: 900; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.55);
  &.is-on { color: #22c55e; border-color: rgba(34, 197, 94, 0.5); }
}

.hud-card__actions { display: flex; gap: 10px; }

.hud-card__size { display: flex; flex-direction: column; gap: 8px; }
.hud-card__size-row { display: flex; align-items: center; justify-content: space-between; }
.hud-card__formats-label { color: rgba(255, 255, 255, 0.5); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }
.hud-card__size-val { color: #fb923c; font-size: 13px; font-weight: 900; }
.hud-card__slider-help {
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  font-style: normal;
  line-height: 1.35;
}

.hud-card__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);

  span { display: grid; gap: 3px; }
  strong { color: #fff; font-size: 14px; }
  em { color: rgba(255, 255, 255, 0.55); font-size: 12px; font-style: normal; line-height: 1.35; }
  input { width: 18px; height: 18px; accent-color: #22c55e; }
}

.hud-card__select {
  flex: 0 0 172px;
  min-width: 172px;
  padding: 8px 30px 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 9px;
  background-color: #171b25;
  color: #fff;
  color-scheme: dark;
  font: inherit;
  font-weight: 800;
  cursor: pointer;

  option {
    background-color: #171b25;
    color: #fff;
  }

  option:checked {
    background-color: #2563eb;
    color: #fff;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.hud-card__rpm {
  display: flex !important;
  align-items: center;
  gap: 7px !important;
  input {
    width: 94px;
    padding: 8px;
    border: 1px solid rgba(255,255,255,.2);
    border-radius: 9px;
    background: #171b25;
    color: #fff;
    font-weight: 900;
  }
  b { color: rgba(255,255,255,.5); font-size: 11px; }
}

.hud-slider {
  width: 100%;
  height: 6px;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: linear-gradient(90deg, #f97316, #fb923c);
    border: 2px solid #1a0d04;
    cursor: pointer;
  }

  &::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border: 2px solid #1a0d04;
    border-radius: 50%;
    background: #fb923c;
    cursor: pointer;
  }

  &:disabled { opacity: 0.45; cursor: not-allowed; }
}

.btn {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;

  &:hover:not(:disabled) { border-color: rgba(255, 255, 255, 0.32); background: rgba(255, 255, 255, 0.07); }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
}

.btn--primary { border-color: transparent; background: linear-gradient(90deg, #f97316, #fb923c); color: #1a0d04; }

@media (max-width: 760px) {
  .test-hud__replay { grid-template-columns: 1fr; }
  .test-hud__replay-controls label { align-items: stretch; flex-direction: column; }
}
</style>
