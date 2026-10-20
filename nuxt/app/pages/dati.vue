<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { useSessionLoader } from '~/composables/useSessionLoader'
import { mergeSessionsDeterministic } from '~/services/telemetry/telemetryMergeService'
import { sessionGame } from '~/services/telemetry/gameIdentity'
import { sessionDataReferences, stintDataFacts, lapStatus } from '~/services/session-detail/sessionDataPresentation'
import { formatLapTime, formatDriveTime, formatTrackName, formatCarName, getSessionTypeLabel } from '~/utils/telemetryFormat'
import type { FullSession, SessionDocument } from '~/types/telemetry'

definePageMeta({ layout: 'dashboard' })
const gateway = useTelemetryGateway('acc')
const loader = useSessionLoader()
const { profileUser, cloudSessionReady } = useFirebaseAuth()
const sessions = ref<SessionDocument[]>([])
const sessionId = ref(''), stintNumber = ref(0), lapNumber = ref(0)
const full = ref<FullSession | null>(null)
const busy = ref(false), error = ref(''), updatedAt = ref('')
let revision = 0, timer: ReturnType<typeof setInterval> | undefined
let refreshing = false
type Selection = { sessionId?: string; latestId?: string; stint?: number; lap?: number }
const storageKey = () => `rc:dati:${profileUser.value?.uid ?? ''}`
function remembered(): Selection {
  try { return JSON.parse(localStorage.getItem(storageKey()) || '{}') } catch { return {} }
}
const latest = computed(() => sessions.value[0])
const selected = computed(() => sessions.value.find(s => s.sessionId === sessionId.value))
const stints = computed(() => full.value?.stints ?? [])
const stint = computed(() => stints.value.find(s => s.stint_number === stintNumber.value))
const laps = computed(() => stint.value?.laps ?? [])
const lap = computed(() => laps.value.find(l => l.lap_number === lapNumber.value))
const references = computed(() => sessionDataReferences(full.value))
const facts = computed(() => stintDataFacts(stint.value))
const bestLap = computed(() => references.value.best)
const isLatest = computed(() => sessionId.value === latest.value?.sessionId)
const wheels = ['ANT SX', 'ANT DX', 'POST SX', 'POST DX']
const columns = [
  { title: 'PRESSIONI', unit: 'PSI', note: 'Misure registrate nel giro', blocks: ['MASSIME', 'MEDIE', 'PERDITA PRESSIONE'] },
  { title: 'TEMPERATURE GOMME', unit: '°C', note: 'Temperatura del nucleo', blocks: ['MASSIME', 'MEDIE', 'MINIME'] },
  { title: 'TEMPERATURE FRENI', unit: '°C', note: 'Per singola ruota', blocks: ['MASSIME', 'MEDIE', 'MINIME'] },
]
function saveSelection() {
  if (!profileUser.value || !sessionId.value) return
  try { localStorage.setItem(storageKey(), JSON.stringify({ sessionId: sessionId.value, latestId: latest.value?.sessionId, stint: stintNumber.value, lap: lapNumber.value })) } catch { /* Storage can be disabled. */ }
}
function reconcileSelection(saved?: Selection) {
  if (!stints.value.some(s => s.stint_number === stintNumber.value)) stintNumber.value = saved?.stint && stints.value.some(s => s.stint_number === saved.stint) ? saved.stint : stints.value.at(-1)?.stint_number ?? 0
  if (!laps.value.some(l => l.lap_number === lapNumber.value)) lapNumber.value = saved?.lap && laps.value.some(l => l.lap_number === saved.lap) ? saved.lap : laps.value.at(-1)?.lap_number ?? 0
}
async function selectSession(id: string, restore = false) {
  const request = ++revision, uid = profileUser.value?.uid
  sessionId.value = id; full.value = null; stintNumber.value = 0; lapNumber.value = 0
  error.value = ''; busy.value = true
  try {
    const result = await gateway.getSessionDetail(id, uid, { warmupSessions: false })
    if (request !== revision || uid !== profileUser.value?.uid) return
    full.value = result
    if (!result) error.value = 'Dettaglio non disponibile. Riprova quando la sessione è salvata su questo computer o il cloud è connesso.'
    reconcileSelection(restore ? remembered() : undefined); saveSelection()
    updatedAt.value = new Date().toLocaleTimeString('it-IT')
  } catch { if (request === revision) error.value = 'Impossibile caricare la sessione. Riprova.' }
  finally { if (request === revision) busy.value = false }
}
function sorted(values: SessionDocument[]) {
  return values.filter(s => sessionGame(s) === 'acc').sort((a, b) => b.meta.date_start.localeCompare(a.meta.date_start))
}
async function load() {
  const request = ++revision, uid = profileUser.value?.uid
  full.value = null; sessions.value = []; sessionId.value = ''; error.value = ''
  if (!uid) { busy.value = false; return }
  busy.value = true
  try {
    const values = await gateway.loadSessions(uid, true, { sourceMode: 'local_first', context: 'dati' })
    if (request !== revision || uid !== profileUser.value?.uid) return
    sessions.value = sorted(values)
    const saved = remembered()
    // A newly driven session wins over an old historical selection.
    const id = saved.latestId === latest.value?.sessionId && sessions.value.some(s => s.sessionId === saved.sessionId) ? saved.sessionId! : latest.value?.sessionId
    if (id) await selectSession(id, id === saved.sessionId)
    else busy.value = false
    if (gateway.error.value) error.value = gateway.error.value
  } catch { if (request === revision) { error.value = 'Impossibile caricare le sessioni.'; busy.value = false } }
}
async function refreshLocal() {
  if (refreshing || busy.value || !profileUser.value) return
  refreshing = true
  const request = revision, uid = profileUser.value.uid
  try {
    const local = await loader.loadFromLocalFiles(uid)
    if (request !== revision || uid !== profileUser.value?.uid) return
    const previousLatest = latest.value?.sessionId
    sessions.value = sorted(mergeSessionsDeterministic(local, sessions.value, { localWins: true, includeSyncedLocal: true }))
    if (latest.value && previousLatest !== latest.value.sessionId) { await selectSession(latest.value.sessionId); return }
    // Poll only the selected local file; historical cloud data is immutable here.
    if (local.some(s => s.sessionId === sessionId.value)) {
      const result = await gateway.getSessionDetail(sessionId.value, uid, { warmupSessions: false })
      if (request !== revision || uid !== profileUser.value?.uid) return
      full.value = result; reconcileSelection(); saveSelection()
      updatedAt.value = new Date().toLocaleTimeString('it-IT')
    }
  } catch { if (request === revision) error.value = 'Aggiornamento locale non riuscito. Premi Aggiorna per riprovare.' }
  finally { refreshing = false }
}
watch(stintNumber, () => { reconcileSelection(); saveSelection() })
watch(lapNumber, saveSelection)
watch(() => profileUser.value?.uid, () => { void load() })
watch(cloudSessionReady, () => { void load() })
onMounted(() => { void load(); timer = setInterval(() => { void refreshLocal() }, 10000) })
onBeforeUnmount(() => { revision++; clearInterval(timer) })
const time = (value: number | null | undefined) => value && value > 0 ? formatLapTime(value) : '--'
const number = (value: number | null | undefined, digits = 1) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--'
function conditions(key: 'air_temp' | 'road_temp') {
  const a = facts.value.first?.[key], b = facts.value.last?.[key]
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return '--'
  return `${number(a)} → ${number(b)} °C (${b - a >= 0 ? '+' : ''}${number(b - a)} °C)`
}
</script>

<template>
  <LayoutPageContainer class="data-page">
    <header class="data-heading"><div><h1>DATI DELLA SESSIONE</h1><p>Giri, vettura e condizioni della tua sessione</p></div><button @click="load" :disabled="busy">Aggiorna</button></header>
    <div class="data-selectors">
      <label class="session-select">SESSIONE<select :value="sessionId" :disabled="busy || !sessions.length" @change="selectSession(($event.target as HTMLSelectElement).value)"><option v-if="!sessions.length" value="">Nessuna sessione</option><option v-for="s in sessions" :key="s.sessionId" :value="s.sessionId">{{ new Date(s.meta.date_start).toLocaleString('it-IT') }} · {{ formatTrackName(s.meta.track) }} · {{ formatCarName(s.meta.car) }}</option></select></label>
      <button :disabled="!latest || busy" @click="latest && selectSession(latest.sessionId)">Sessione corrente / ultima</button>
      <label>STINT<select v-model.number="stintNumber" :disabled="busy || !stints.length"><option v-for="s in stints" :key="s.stint_number" :value="s.stint_number">Stint {{ s.stint_number }} · {{ s.laps.length }} giri</option></select></label>
    </div>
    <div class="data-context"><span>{{ selected ? formatTrackName(selected.meta.track) : '--' }} · {{ selected ? formatCarName(selected.meta.car) : '--' }} · {{ selected ? getSessionTypeLabel(selected.meta.session_type) : '--' }}</span><span>{{ isLatest ? 'ULTIMA SESSIONE REGISTRATA' : 'SESSIONE STORICA' }}<template v-if="updatedAt"> · aggiornato {{ updatedAt }}</template></span></div>
    <p v-if="error" class="data-error" role="alert">{{ error }}</p>
    <p v-if="busy" role="status">Caricamento dati…</p>
    <p v-else-if="!sessions.length" class="empty">Nessuna sessione ACC registrata. Completa un giro con Racer Core attivo, poi premi Aggiorna.</p>
    <div v-else class="data-body" :aria-busy="busy">
      <aside class="laps-panel"><h2>GIRI DELLO STINT</h2><div class="lap-list"><button v-for="l in laps" :key="l.lap_number" class="lap-row" :class="{ selected: l.lap_number === lapNumber, invalid: l.is_valid === false, best: l.lap_time_ms === bestLap && l.is_valid && !l.has_pit_stop && !l.pit_out_lap }" :aria-pressed="l.lap_number === lapNumber" @click="lapNumber = l.lap_number"><span class="lap-index">{{ l.lap_number }}</span><span><strong>{{ time(l.lap_time_ms) }}</strong><small>{{ lapStatus(l) }}</small></span><span v-if="l.lap_time_ms === bestLap && l.is_valid && !l.has_pit_stop && !l.pit_out_lap" class="best-tag">BEST</span></button></div><p v-if="!laps.length">Nessun giro concluso in questo stint.</p></aside>
      <main class="lap-content">
        <div class="lap-heading"><h2>GIRO {{ lap?.lap_number ?? '--' }}</h2><strong>{{ time(lap?.lap_time_ms) }}</strong><span :class="{ 'data-error': lap?.is_valid === false }">{{ lap ? lapStatus(lap) : 'Seleziona un giro' }}</span></div>
        <div class="wheel-columns"><section v-for="column in columns" :key="column.title" class="wheel-column"><h2>{{ column.title }} <small>({{ column.unit }})</small></h2><p>{{ column.note }}</p><div v-for="block in column.blocks" :key="block" class="wheel-block"><h3>{{ block }}</h3><div class="wheel-grid"><div v-for="wheel in wheels" :key="wheel"><span>{{ wheel }}</span><strong>--</strong></div></div></div></section></div>
        <p class="missing-note">-- = misura non registrata per questo giro. Lo storico attuale non conserva pressioni e temperature gomme/freni per giro; nessun dato live viene attribuito ai giri passati. Perdita pressione indica cali di PSI, non usura.</p>
        <div class="time-row"><div><span>TEMPO GIRO</span><strong>{{ time(lap?.lap_time_ms) }}</strong></div><div v-for="n in 3" :key="n"><span>SETTORE {{ n }}</span><strong>{{ time(lap?.sector_times_ms?.[n - 1]) }}</strong><small v-if="lap?.sector_times_ms?.[n - 1] && !lap.sectors_reliable">Non affidabile</small></div></div>
        <section class="facts-panel"><h2>RIFERIMENTI DELLA SESSIONE</h2><div class="facts-grid"><div><span>MIGLIORE GIRO VALIDO</span><strong>{{ time(references.best) }}</strong><small>Giri validi, esclusi ingresso e uscita box</small></div><div><span>OTTIMALE TEORICO</span><strong>{{ time(references.optimal) }}</strong><small>Somma dei migliori settori affidabili dei giri validi</small></div><div><span>PASSO MEDIO</span><strong>{{ time(references.average) }}</strong><small>Media pulita registrata dal logger: validi, senza box/outlap, entro il 115% del best</small></div></div></section>
        <section class="facts-panel"><h2>STINT {{ stintNumber || '--' }}</h2><div class="facts-grid"><div><span>DURATA REGISTRATA</span><strong>{{ facts.duration ? formatDriveTime(facts.duration) : '--' }}</strong></div><div><span>CONSUMO MEDIO</span><strong>{{ number(facts.perLap, 2) }} <small>L/giro</small></strong></div><div><span>CARBURANTE CONSUMATO</span><strong>{{ number(facts.consumed, 2) }} <small>L</small></strong></div></div><p>Carburante: somma inizio − fine dei {{ facts.lapCount }} giri registrati nello stint, inclusi box e invalidi. Non include soste o tratti non registrati.</p></section>
        <section class="facts-panel"><h2>CONDIZIONI STINT</h2><div class="conditions"><div><span>ARIA</span><strong>{{ conditions('air_temp') }}</strong></div><div><span>PISTA</span><strong>{{ conditions('road_temp') }}</strong></div></div><p>Dal primo all’ultimo fine giro registrato dello stint; non sono misure dell’uscita iniziale dai box.</p></section>
        <section class="vehicle-context"><span>MESCOLA / SET <strong>-- / --</strong></span><span>FRENI <strong>--</strong></span><span>TC / TC2 / ABS <strong>-- / -- / --</strong></span><span>DANNI <strong>Non registrati nel giro</strong></span><details><summary>Usura pastiglie e dischi</summary><p>Non registrata nello storico del giro selezionato.</p></details></section>
      </main>
    </div>
    <p class="data-footer">La sessione locale si aggiorna ogni 10 secondi, dopo il salvataggio del logger al termine del giro. Una nuova sessione ha precedenza sulla selezione storica ricordata.</p>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.data-page { @include controls.tokens; }
h1, h2, h3 { font-family: 'Racer Display', 'Arial Narrow', sans-serif; font-style: italic; font-weight: 700; margin: 0; }
h1 { font-size: 34px; } h2 { font-size: 20px; } h3 { font-size: 15px; }
p { color: #aaa; font-size: 12px; line-height: 1.5; }
button { @include controls.action; } select { @include controls.select; width: 100%; margin-top: 7px; }
.data-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 22px; p { margin: 6px 0 0; } }
.data-selectors { display: flex; gap: 16px; align-items: end; label { font-size: 11px; color: #bbb; min-width: 145px; } .session-select { flex: 1; min-width: 0; } }
.data-context { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; padding: 15px 0 18px; font-size: 12px; color: #bbb; }
.data-body { display: grid; grid-template-columns: 225px minmax(0, 1fr); gap: 22px; }
.laps-panel { border-right: 1px solid #ffffff40; padding-right: 20px; h2 { margin-bottom: 18px; } }
.lap-list { max-height: 760px; overflow: auto; }
.lap-row { clip-path: none; width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 8px; border-bottom: 1px solid #ffffff20; background: transparent; text-align: left; &::after { display: none; } strong { font: italic 700 20px 'Racer Display', sans-serif; } small { display: block; font-size: 10px; margin-top: 4px; color: #aaa; } &.selected { background: #ffffff13; box-shadow: inset 3px 0 #ff0024; } &.invalid strong { color: #ff899a; } &.best strong { color: #c7a0ff; } }
.lap-index { width: 23px; color: #aaa; font-size: 12px; }.best-tag { margin-left: auto; font-size: 9px; color: #c7a0ff; }
.lap-content { min-width: 0; }.lap-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 18px; margin-bottom: 18px; > strong { font: italic 700 29px 'Racer Display', sans-serif; } > span { font-size: 12px; color: #bbb; } }
.wheel-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid #ffffff40; }.wheel-column { padding: 15px; min-width: 0; + .wheel-column { border-left: 1px solid #ffffff40; } h2 { font-size: clamp(14px, 1.4vw, 19px); line-height: 1.25; } > p { font-size: 10px; margin: 5px 0 16px; } small { font-size: 11px; font-weight: 400; } }
.wheel-block { padding: 13px 0; border-top: 1px solid #ffffff26; h3 { color: #bbb; } }.wheel-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; margin-top: 12px; span { display: block; font-size: 9px; color: #999; } strong { display: block; font: italic 700 24px 'Racer Display', sans-serif; margin-top: 4px; font-variant-numeric: tabular-nums; } }
.missing-note { margin: 10px 0 18px; font-size: 11px; }.time-row { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); border-block: 1px solid #ffffff45; padding: 16px 0; gap: 14px; }
.time-row, .facts-grid, .conditions { span { display: block; font-size: 10px; color: #bbb; margin-bottom: 7px; } strong { display: block; font: italic 700 24px 'Racer Display', sans-serif; font-variant-numeric: tabular-nums; } small { display: block; font: 11px/1.5 'Inter', sans-serif; color: #999; margin-top: 7px; } }
.facts-panel { border-bottom: 1px solid #ffffff30; padding: 22px 0 18px; h2 { margin-bottom: 17px; } p { margin-bottom: 0; font-size: 11px; } }.facts-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 22px; }.conditions { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 22px; strong { font-size: 20px; } }
.vehicle-context { display: flex; flex-wrap: wrap; gap: 16px 24px; padding: 20px 0; font-size: 10px; text-transform: uppercase; color: #aaa; strong { color: #ddd; margin-left: 6px; } details { flex-basis: 100%; text-transform: none; summary { cursor: pointer; } } }
.data-error { color: #ff899a !important; }.data-footer { border-top: 1px solid #ffffff20; padding-top: 14px; font-size: 11px; }.empty { padding: 40px 0; }
@media(max-width: 1050px) { .data-body { grid-template-columns: 175px minmax(0,1fr); gap: 16px; }.laps-panel { padding-right: 12px; }.wheel-column { padding: 12px 9px; }.best-tag { display: none; } }
@media(max-width: 800px) { .data-body { grid-template-columns: minmax(0,1fr); }.laps-panel { border-right: 0; padding-right: 0; }.lap-list { display: flex; max-height: none; gap: 8px; padding-bottom: 8px; }.lap-row { flex: 0 0 160px; }.data-selectors { flex-wrap: wrap; .session-select { flex-basis: 100%; } }.facts-grid { gap: 12px; }.conditions strong { font-size: 16px; } }
@media(max-width: 480px) { h1 { font-size: 27px; }.wheel-column h2 { font-size: 13px; }.wheel-column { padding: 10px 6px; }.wheel-grid { gap: 12px 6px; }.wheel-grid span { font-size: 8px; }.facts-grid, .conditions { grid-template-columns: 1fr; }.time-row strong { font-size: 18px; }.data-selectors > button { flex: 1; } }
</style>
