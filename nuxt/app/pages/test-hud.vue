<script setup lang="ts">
// Test HUD (PIP-187): pagina QA overlay protetta da dev-tools (localhost/admin).
// - Interruttore GLOBALE di posizionamento: sblocca/blocca TUTTI gli overlay.
// - Per ogni overlay: on/off + formato fisso (Piccolo/Medio/Grande).
// Self-contained (come dev.vue): fuori dal contratto useTelemetryGateway.
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'

definePageMeta({
  layout: 'dashboard',
  middleware: 'dev-tools'
})

type HudOverlayId = 'tyres' | 'sectors'

const hudOverlays: Array<{ id: HudOverlayId; title: string; description: string }> = [
  { id: 'tyres', title: 'Gomme', description: 'Temperature, pressioni e scivolamento per pneumatico (fast_state).' },
  { id: 'sectors', title: 'Settori', description: 'Tempi e delta per settore con codifica colore (live_state).' },
]

const SCALE_MIN = 0.6
const SCALE_MAX = 1.6

function getApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const isElectron = ref(false)
const apiReady = ref(false)
const open = reactive<Record<HudOverlayId, boolean>>({ tyres: false, sectors: false })
const scale = reactive<Record<HudOverlayId, number>>({ tyres: 1, sectors: 1 })
const showSectorReference = ref(true)
const showSectorBest = ref(true)
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
let unsubscribeDriving: (() => void) | null = null
let placementPollTimer: ReturnType<typeof setInterval> | null = null


const placementRemainingSeconds = computed(() => {
  if (!positioning.value || placementDeadlineMs.value === null) return null
  return Math.max(0, Math.ceil((placementDeadlineMs.value - nowMs.value) / 1000))
})

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
      if (overlay.id === 'sectors' && typeof settings?.showReference === 'boolean') showSectorReference.value = settings.showReference
      if (overlay.id === 'sectors' && typeof settings?.showBest === 'boolean') showSectorBest.value = settings.showBest
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
  const api = getApi()
  if (api && typeof api.onHudOverlayDrivingState === 'function') {
    unsubscribeDriving = api.onHudOverlayDrivingState((value: boolean) => { driving.value = !!value })
  }
})

onUnmounted(() => {
  if (unsubscribeDriving) { unsubscribeDriving(); unsubscribeDriving = null }
  if (placementPollTimer) { clearInterval(placementPollTimer); placementPollTimer = null }
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
        <span class="test-hud__kicker">Strumenti dev · overlay</span>
        <h1>Test HUD</h1>
        <p>
          Accendi gli overlay, scegli il formato e posizionali. Disponibile solo da
          <strong>localhost</strong> con ruolo <strong>admin</strong>.
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

          <template v-if="overlay.id === 'sectors'">
            <label class="hud-card__option">
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
            <label class="hud-card__option">
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
</style>
