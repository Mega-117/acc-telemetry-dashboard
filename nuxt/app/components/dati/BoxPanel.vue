<script setup lang="ts">
// PIP-616 Box: our version of the ACC Drive ENGINEER tab, live while driving.
// It reads the same live stream as the HUDs (useFastStatePoller), so fuel, pressure
// correction and references are the numbers of Ctrl+K and the Info HUD, not a second model.
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { formatLapTime, formatTrackName } from '~/utils/telemetryFormat'
import { brakeColor, pressureColor, tyreColor, type BrakePad } from '~/utils/temperatureColor'
import { correctionNote, fuelPerMinute, lapsLeft, wheelCorrection, type CorrectionTone } from '~/utils/boxEngineer'
import type { FastStateTyre } from '~/types/liveTelemetry'

const live = useFastStatePoller(() => typeof window === 'undefined' ? null : (window as Window & { electronAPI?: unknown }).electronAPI)
onMounted(() => { void live.startFastStatePolling() })
onBeforeUnmount(() => live.stopFastStatePolling())

const fs = computed(() => live.fastState.value)
const active = computed(() => fs.value.isLive && fs.value.tyres.length === 4)
// Back in the garage ACC zeroes the car pages (pressures, temperatures, fuel): show --, not 0.
const carActive = computed(() => active.value && fs.value.tyres.some(t => typeof t.pressurePsi === 'number' && t.pressurePsi > 0))
const wet = computed(() => fs.value.tyreCompound === 'WET')
const WHEELS: FastStateTyre['id'][] = ['FL', 'FR', 'RL', 'RR']
const tyre = (id: FastStateTyre['id']) => carActive.value ? fs.value.tyres.find(t => t.id === id) : undefined
const PADS: BrakePad[] = ['standard', 'endurance', 'wet', 'qualy']
const PAD_NAMES = ['Standard', 'Endurance', 'Bagnato', 'Qualifica']
const GRIP: Record<string, string> = { GREEN: 'Verde', FAST: 'Veloce', OPTIMUM: 'Ottimale', GREASY: 'Unta', DAMP: 'Umida', WET: 'Bagnata', FLOODED: 'Allagata' }

const n = (v: number | null | undefined, digits = 1) => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '--'
const unit = (v: number | null | undefined, digits: number, suffix: string) => typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(digits)}${suffix}` : '--'
const lapTime = (v: number | null | undefined) => typeof v === 'number' && v > 0 ? formatLapTime(v) : '--'
function clock(ms: number | null | undefined) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '--'
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

const info = computed(() => fs.value.info)
const reference = computed(() => info.value?.fuelLeftReferenceLapMs ?? null)
const fuelPerMin = computed(() => fuelPerMinute(fs.value.fuelPerLapL, reference.value))
const lapsLeftValue = computed(() => lapsLeft(fs.value.sessionTimeLeftMs, reference.value, fs.value.sessionLapsRemaining))
const recommendation = computed(() => fs.value.tyreSetup?.pressureRecommendation ?? null)
// The live counter: the plan's own count can be the one retained from the previous stint.
const stintLaps = computed(() => recommendation.value?.liveCompletedLaps ?? recommendation.value?.completedLaps ?? null)
const note = computed(() => correctionNote(recommendation.value))
// 0 grey, + yellow (add air), - red (remove air), as ACC Drive.
const TONE: Record<CorrectionTone, string | undefined> = { none: undefined, ok: '#8a8a90', add: '#ffd43b', remove: '#ff5a6e' }
function correction(id: FastStateTyre['id']) {
  const value = wheelCorrection(recommendation.value, id)
  return { text: value.text, color: TONE[value.tone] }
}
function pad(id: FastStateTyre['id']) {
  const index = tyre(id)?.brakeCompound
  return typeof index === 'number' ? PADS[index] : undefined
}
const padNames = computed(() => {
  const front = tyre('FL')?.brakeCompound, rear = tyre('RL')?.brakeCompound
  const name = (i?: number | null) => typeof i === 'number' ? PAD_NAMES[i] ?? '--' : '--'
  return front === rear ? name(front) : `${name(front)} / ${name(rear)}`
})
const damage = computed(() => fs.value.damage)
const repair = (ms: number | null | undefined) => typeof ms !== 'number' ? '--' : ms > 0 ? formatLapTime(ms) : 'Nessuno'
const pit = computed(() => fs.value.pitPrediction)
</script>

<template>
  <div class="box">
    <!-- Session strip: where, how long, what the track gives. -->
    <div class="box-strip">
      <div><span>Pista</span><strong>{{ fs.context?.track ? formatTrackName(fs.context.track) : '--' }}</strong></div>
      <div><span>Grip</span><strong>{{ info?.grip ? (GRIP[info.grip.toUpperCase()] ?? info.grip) : '--' }}</strong></div>
      <div title="Tempo che manca alla fine della sessione"><span>Tempo rimasto</span><strong>{{ clock(fs.sessionTimeLeftMs) }}</strong></div>
      <div title="Giri interi che puoi ancora iniziare, al passo del giro di riferimento"><span>Giri rimasti</span><strong>{{ lapsLeftValue ?? '--' }}</strong></div>
      <div><span>Giri stint</span><strong>{{ stintLaps ?? '--' }}</strong></div>
    </div>
    <p v-if="!active" class="box-wait" role="status">In attesa del simulatore: i dati arrivano quando sei in pista.</p>
    <p v-else-if="!carActive" class="box-wait" role="status">Auto ai box: i dati dell'auto tornano quando sei in macchina.</p>

    <p class="box-section">Benzina</p>
    <div class="box-grid">
      <div class="box-cell"><span class="box-label">Serbatoio</span><strong class="box-value">{{ carActive ? `${n(fs.fuelL)} L` : '--' }}</strong></div>
      <div class="box-cell" title="Consumo al giro stimato da ACC"><span class="box-label">Al giro</span><strong class="box-value">{{ n(fs.fuelPerLapL, 2) }} L</strong></div>
      <div class="box-cell" title="Consumo al giro diviso il giro di riferimento"><span class="box-label">Al minuto</span><strong class="box-value">{{ n(fuelPerMin, 2) }} L</strong></div>
      <div class="box-cell" title="Per quanto basta la benzina che hai"><span class="box-label">Autonomia</span><strong class="box-value">{{ clock(info?.fuelLeftTimeMs ?? fs.fuelLeftTimeMs) }} · {{ n(fs.fuelLapsRemaining) }} giri</strong></div>
      <div class="box-cell" title="Benzina per lo stint o da aggiungere ai box, come l'Info HUD"><span class="box-label">{{ info?.fuelLabel || 'Benzina stint' }}</span><strong class="box-value">{{ n(info?.fuelNeededL) }} L</strong></div>
    </div>

    <p class="box-section">Gomme e freni <small>· per ruota: ant. sx ant. dx / post. sx post. dx</small></p>
    <div class="box-grid">
      <div class="box-cell" title="Pressione adesso. Verde: nella finestra di Correggi pressioni">
        <span class="box-label">Pressione <small>psi</small></span>
        <div class="box-wheels"><b v-for="id in WHEELS" :key="id" :style="{ color: pressureColor(tyre(id)?.pressurePsi, wet) ?? undefined }">{{ n(tyre(id)?.pressurePsi) }}</b></div>
      </div>
      <div class="box-cell" title="Quanto è scesa la pressione nello stint (foratura lenta, urti)">
        <span class="box-label">Calo <small>psi</small></span>
        <div class="box-wheels"><b v-for="id in WHEELS" :key="id" class="loss">{{ n(tyre(id)?.pressureLossPsi, 2) }}</b></div>
      </div>
      <div class="box-cell" :title="note">
        <span class="box-label">Correzione <small>psi</small></span>
        <div class="box-wheels"><b v-for="id in WHEELS" :key="id" :style="{ color: correction(id).color ?? undefined }">{{ correction(id).text }}</b></div>
        <small class="box-note">{{ note }}</small>
      </div>
      <div class="box-cell" title="Temperatura delle gomme. Blu fredda, verde giusta, giallo/arancio calda, rosso troppo calda">
        <span class="box-label">Temp. gomme <small>°C</small></span>
        <div class="box-wheels"><b v-for="id in WHEELS" :key="id" :style="{ color: tyreColor(tyre(id)?.coreTempC, wet) ?? undefined }">{{ unit(tyre(id)?.coreTempC, 0, "°") }}</b></div>
      </div>
      <div class="box-cell" title="Temperatura dei dischi. Le fasce cambiano con le pastiglie">
        <span class="box-label">Temp. freni <small>°C</small></span>
        <div class="box-wheels"><b v-for="(id, i) in WHEELS" :key="id" :style="{ color: brakeColor(tyre(id)?.brakeTempC, i < 2 ? 'front' : 'rear', pad(id)) ?? undefined }">{{ unit(tyre(id)?.brakeTempC, 0, "°") }}</b></div>
      </div>
    </div>

    <p class="box-section">Auto</p>
    <div class="box-grid">
      <div class="box-cell"><span class="box-label">Gomme</span><strong class="box-value">{{ fs.tyreCompound === 'WET' ? 'Bagnato' : fs.tyreCompound === 'DRY' ? 'Asciutto' : '--' }} · set {{ fs.currentTyreSet ?? '--' }}</strong></div>
      <div class="box-cell"><span class="box-label">Pastiglie</span><strong class="box-value">{{ padNames }}</strong></div>
      <div class="box-cell" title="Vita rimasta delle pastiglie">
        <span class="box-label">Vita pastiglie</span>
        <div class="box-wheels"><b v-for="id in WHEELS" :key="id">{{ unit(tyre(id)?.padLifePct, 0, "%") }}</b></div>
      </div>
      <div class="box-cell" title="Vita rimasta dei dischi">
        <span class="box-label">Vita dischi</span>
        <div class="box-wheels"><b v-for="id in WHEELS" :key="id">{{ unit(tyre(id)?.discLifePct, 1, "%") }}</b></div>
      </div>
      <div class="box-cell" title="Tempo di riparazione ai box">
        <span class="box-label">Danni</span>
        <dl class="box-list">
          <div><dt>Carrozzeria</dt><dd>{{ repair(damage?.body.repairTimeMs) }}</dd></div>
          <div><dt>Sospensioni</dt><dd>{{ repair(damage?.suspension.repairTimeMs) }}</dd></div>
          <div><dt>Totale</dt><dd>{{ repair(damage?.totalRepairTimeMs) }}</dd></div>
        </dl>
      </div>
    </div>

    <p class="box-section">Tempi</p>
    <div class="box-grid">
      <div class="box-cell"><span class="box-label">Ultimo</span><strong class="box-value" :class="{ invalid: info?.lastLapValid === false }">{{ lapTime(info?.lastLapTimeMs ?? fs.lastLapTimeMs) }}</strong></div>
      <div class="box-cell" title="Il tuo migliore della sessione"><span class="box-label">Migliore</span><strong class="box-value best">{{ lapTime(info?.bestLapTimeMs ?? fs.bestLapTimeMs) }}</strong></div>
      <div class="box-cell" title="Somma dei tuoi migliori settori"><span class="box-label">Ottimale</span><strong class="box-value">{{ lapTime(info?.optimalLapTimeMs) }}</strong></div>
      <div class="box-cell" title="Il giro usato per i calcoli della benzina"><span class="box-label">Riferimento</span><strong class="box-value">{{ lapTime(reference) }}</strong></div>
      <div class="box-cell" title="Tempo perso per una sosta ai box (corsia + fermata)"><span class="box-label">Sosta ai box</span><strong class="box-value">{{ pit?.available && typeof pit.pitTimeS === 'number' ? `${pit.pitTimeS.toFixed(1)} s` : '--' }}</strong></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
// Same language as the Giro tab: dark cells, thin borders, small titles, tabular numbers.
$line: #ffffff24;
$cell: #ffffff08;
.box { display: grid; gap: 8px; }
.box-strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid $line; background: $cell;
  > div { display: grid; justify-items: center; gap: 3px; padding: 8px 6px; border-left: 1px solid $line; &:first-child { border-left: 0; } }
  span { color: #b3b3b8; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  strong { font: 600 16px/1.2 'Inter', sans-serif; color: #fff; font-variant-numeric: tabular-nums; } }
.box-wait { margin: 0; padding: 8px 12px; border: 1px solid #ffffff1f; background: #ffd43b0f; color: #d9c98a; font-size: 12px; }
.box-section { display: flex; align-items: center; gap: 10px; margin: 4px 0 -2px; color: #b3b3b8; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  small { color: #77777d; font-weight: 500; letter-spacing: 0; text-transform: none; }
  &::after { content: ''; flex: 1; height: 1px; background: #ffffff1f; } }
.box-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.box-cell { display: grid; justify-items: center; align-content: center; gap: 4px; min-height: 64px; padding: 6px; border: 1px solid $line; background: $cell; text-align: center; }
.box-label { color: #b3b3b8; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  small { color: #77777d; font-weight: 500; text-transform: none; } }
.box-value { font: 600 15px/1.25 'Inter', sans-serif; color: #e6e6ea; font-variant-numeric: tabular-nums;
  &.best { color: #e14bff; }
  &.invalid { color: #ff5a6e; } }
.box-wheels { display: grid; grid-template-columns: repeat(2, minmax(0, auto)); gap: 2px 14px; font: 600 15px/1.25 'Inter', sans-serif; color: #e6e6ea; font-variant-numeric: tabular-nums;
  b { font-weight: 600; }
  .loss { color: #ffa94d; } }
.box-note { color: #8a8a90; font-size: 10px; line-height: 1.2; }
.box-list { display: grid; gap: 2px; margin: 0; font-size: 12px;
  > div { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  dt { color: #b3b3b8; font-weight: 700; text-align: right; &::after { content: ':'; } }
  dd { margin: 0; color: #e6e6ea; font-weight: 600; text-align: left; font-variant-numeric: tabular-nums; } }
[title] { cursor: help; }
@media (max-width: 1100px) { .box-grid, .box-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 720px) { .box-grid, .box-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
