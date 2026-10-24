<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { useSessionLoader } from '~/composables/useSessionLoader'
import { mergeSessionsDeterministic } from '~/services/telemetry/telemetryMergeService'
import { sessionGame } from '~/services/telemetry/gameIdentity'
import { sessionDataReferences, stintDataFacts, lapStatus } from '~/services/session-detail/sessionDataPresentation'
import { formatLapTime, formatTrackName, formatCarName, getSessionTypeLabel } from '~/utils/telemetryFormat'
import { brakeColor, pressureColor, tyreColor, type BrakePad } from '~/utils/temperatureColor'
import type { FullSession, SectorTelemetry, SessionDocument } from '~/types/telemetry'

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
const stints = computed(() => full.value?.stints ?? [])
const stint = computed(() => stints.value.find(s => s.stint_number === stintNumber.value))
const laps = computed(() => stint.value?.laps ?? [])
const lap = computed(() => laps.value.find(l => l.lap_number === lapNumber.value))
const references = computed(() => sessionDataReferences(full.value))
const facts = computed(() => stintDataFacts(stint.value))
const bestLap = computed(() => references.value.best)
// Sim racing colours: fuchsia = best of the session, green = best of this stint, white = valid.
type LapLike = { lap_time_ms?: number, is_valid?: boolean, has_pit_stop?: boolean, pit_out_lap?: boolean }
const clean = (l?: LapLike): l is LapLike => !!l && !!l.is_valid && !l.has_pit_stop && !l.pit_out_lap && Number(l.lap_time_ms) > 0
const stintBest = computed(() => {
  const times = laps.value.filter(clean).map(l => l.lap_time_ms)
  return times.length ? Math.min(...times) : null
})
function isBestLap(l?: LapLike) { return clean(l) && !!bestLap.value && l.lap_time_ms === bestLap.value }
function isStintBest(l?: LapLike) { return clean(l) && !isBestLap(l) && l.lap_time_ms === stintBest.value }
const isLatest = computed(() => sessionId.value === latest.value?.sessionId)
// PIP-613: the ACC Drive telemetry panel, compact. Laps recorded before the per-lap summary
// (`lap.telemetry`) show "--" in the same places the values will fill.
const tel = computed(() => lap.value?.telemetry)
type WheelKind = 'pressure' | 'tyre' | 'brake'
type WheelKey = 'high' | 'avg' | 'low' | 'loss'
// Label, key and the one-line explanation shown on hover.
const wheelColumns: { title: string, unit: string, kind: WheelKind, hint: string, rows: [string, WheelKey, string][] }[] = [
  { title: 'Pressioni', unit: 'psi', kind: 'pressure', hint: 'Pressione delle gomme a caldo nel giro. Verde: nella finestra di Correggi pressioni.',
    rows: [['Massima', 'high', 'La pressione più alta raggiunta nel giro'], ['Media', 'avg', 'La pressione media del giro: è quella da guardare'], ['Calo', 'loss', 'Quanto è scesa la pressione dall’inizio dello stint (foratura lenta, urti)']] },
  { title: 'Temp. gomme', unit: '°C', kind: 'tyre', hint: 'Temperatura del nucleo delle gomme. Colori come ACC Drive: blu fredda, verde giusta, giallo/arancio calda, rosso troppo calda.',
    rows: [['Massima', 'high', 'La temperatura più alta nel giro'], ['Media', 'avg', 'La temperatura media del giro'], ['Minima', 'low', 'La temperatura più bassa nel giro']] },
  { title: 'Temp. freni', unit: '°C', kind: 'brake', hint: 'Temperatura dei dischi. Le fasce di colore cambiano con le pastiglie e tra anteriore e posteriore.',
    rows: [['Massima', 'high', 'La temperatura più alta nel giro, in frenata'], ['Media', 'avg', 'La temperatura media del giro'], ['Minima', 'low', 'La temperatura più bassa, sui rettilinei']] },
]
// The lap and its sectors as one small table: read across to compare the sectors.
const lapColumns = computed(() => [
  { title: `Giro ${lap.value?.lap_number ?? ''}`, time: lap.value?.lap_time_ms ?? null, data: tel.value?.lap, lap: true, best: isBestLap(lap.value), stintBest: isStintBest(lap.value), unreliable: false },
  // A sector counts as best only on a valid lap with reliable sectors (not the pit-out lap).
  ...sectors.value.map((time, i) => ({ title: `Settore ${i + 1}`, time, data: tel.value?.sectors?.[i], lap: false,
    best: time !== null && !!lap.value?.is_valid && sectorsReliable.value && time === bestSectors.value[i], stintBest: false, unreliable: time !== null && !sectorsReliable.value })),
])
const sectorsReliable = computed(() => lap.value?.sectors_reliable !== false)
const lapRows: { label: string, hint: string, value: (data?: SectorTelemetry) => string }[] = [
  { label: 'Vel. max', hint: 'Velocità più alta raggiunta', value: d => kmh(d?.top_kmh) },
  { label: 'Vel. media', hint: 'Velocità media', value: d => kmh(d?.avg_kmh) },
  { label: 'Interventi TC', hint: 'Quante volte il traction control è entrato', value: d => count(d?.tc) },
  { label: 'Interventi ABS', hint: 'Quante volte l’ABS è entrato', value: d => count(d?.abs) },
]
const assists = computed(() => {
  const a = tel.value?.assists
  return a ? `TC ${count(a.tc)} · TC2 ${count(a.tc2)} · ABS ${count(a.abs)}` : '--'
})
const PAD: Record<string, BrakePad> = { standard: 'standard', endurance: 'endurance', wet: 'wet', qualy: 'qualy' }
/** The four values of a cell (FL FR / RL RR), with the ACC Drive colour where it has one. */
function wheelCells(kind: WheelKind, key: WheelKey) {
  const t = tel.value
  const source = kind === 'pressure' ? t?.pressure : kind === 'tyre' ? t?.tyre_temp : t?.brake_temp
  const values = (source as Record<string, (number | null)[]> | undefined)?.[key] ?? [null, null, null, null]
  return values.map((value, wheel) => {
    if (kind === 'pressure') {
      // The pressure drop in orange (as ACC Drive); max and average against the target window.
      const color = key === 'loss' ? (value !== null ? '#ffa94d' : null) : pressureColor(value, !!t?.tyre?.wet)
      return { text: number(value, key === 'loss' ? 2 : 1), color }
    }
    const axle = wheel < 2 ? 'front' : 'rear'
    const color = kind === 'tyre'
      ? tyreColor(value, !!t?.tyre?.wet)
      : brakeColor(value, axle, PAD[String((axle === 'front' ? t?.brakes?.front_pad : t?.brakes?.rear_pad) ?? '').toLowerCase()])
    return { text: typeof value === 'number' ? `${Math.round(value)}°` : '--', color }
  })
}
const percent = (values?: (number | null)[]) => (values ?? [null, null, null, null]).map(v => typeof v === 'number' ? `${v.toFixed(1)}%` : '--')
const tyreType = computed(() => tel.value?.tyre?.compound ?? (tel.value?.tyre ? (tel.value.tyre.wet ? 'Bagnato' : 'Asciutto') : '--'))
const brakeType = computed(() => {
  const b = tel.value?.brakes
  if (!b?.front_pad) return '--'
  return b.rear_pad && b.rear_pad !== b.front_pad ? `${b.front_pad} / ${b.rear_pad}` : b.front_pad
})
const sectors = computed(() => [0, 1, 2].map(i => lap.value?.sector_times_ms?.[i] ?? null))
// Best sectors of the session (valid laps with reliable sectors): shown in purple, as in ACC Drive.
const bestSectors = computed(() => [0, 1, 2].map(i => {
  const values = stints.value.flatMap(s => s.laps).filter(l => l.is_valid && l.sectors_reliable).map(l => l.sector_times_ms?.[i]).filter((v): v is number => typeof v === 'number' && v > 0)
  return values.length ? Math.min(...values) : null
}))
const kmh = (value?: number | null) => typeof value === 'number' ? `${value.toFixed(1)} km/h` : '--'
const count = (value?: number | null) => typeof value === 'number' ? String(value) : '--'
// ↑ ↓ (buttons or keys) move to the previous or next lap of the stint, as in ACC Drive.
function stepLap(direction: -1 | 1) {
  const index = laps.value.findIndex(l => l.lap_number === lapNumber.value)
  const next = laps.value[index + direction]
  if (next) lapNumber.value = next.lap_number
}
function onKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  if ((event.target as HTMLElement | null)?.closest?.('select, input, textarea')) return
  event.preventDefault()
  stepLap(event.key === 'ArrowUp' ? -1 : 1)
}
const startAir = computed(() => recordedTemp(full.value?.session_info?.start_air_temp))
const startTrack = computed(() => recordedTemp(full.value?.session_info?.start_road_temp))
function recordedTemp(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null }
/** Change from the start of the session to the selected lap. */
function delta(start: number | null, now: unknown) {
  const value = recordedTemp(now)
  return start === null || value === null ? null : value - start
}
const signed = (value: number | null) => value === null ? '--' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}°`
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
      // Watching the last lap: a new lap takes over, like the live ACC Drive panel.
      const onLast = lapNumber.value === laps.value.at(-1)?.lap_number && stintNumber.value === stints.value.at(-1)?.stint_number
      const watched = { stint: stintNumber.value, lap: lapNumber.value }
      const result = await gateway.getSessionDetail(sessionId.value, uid, { warmupSessions: false })
      if (request !== revision || uid !== profileUser.value?.uid) return
      full.value = result
      // Only if the pilot did not pick another lap while the file was loading.
      if (onLast && stintNumber.value === watched.stint && lapNumber.value === watched.lap) { stintNumber.value = stints.value.at(-1)?.stint_number ?? 0; lapNumber.value = stints.value.at(-1)?.laps.at(-1)?.lap_number ?? 0 }
      reconcileSelection(); saveSelection()
      updatedAt.value = new Date().toLocaleTimeString('it-IT')
    }
  } catch { if (request === revision) error.value = 'Aggiornamento locale non riuscito. Premi Aggiorna per riprovare.' }
  finally { refreshing = false }
}
watch(stintNumber, () => { reconcileSelection(); saveSelection() })
watch(lapNumber, saveSelection)
watch(() => profileUser.value?.uid, () => { void load() })
watch(cloudSessionReady, () => { void load() })
onMounted(() => { void load(); timer = setInterval(() => { void refreshLocal() }, 10000); window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { revision++; clearInterval(timer); window.removeEventListener('keydown', onKey) })
const time = (value: number | null | undefined) => value && value > 0 ? formatLapTime(value) : '--'
const number = (value: number | null | undefined, digits = 1) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--'
</script>


<template>
  <LayoutPageContainer class="data-page">
    <!-- One bar: session, latest, stint, refresh; the context line under it. -->
    <div class="data-bar">
      <select class="data-session" :value="sessionId" :disabled="busy || !sessions.length" aria-label="Sessione" @change="selectSession(($event.target as HTMLSelectElement).value)">
        <option v-if="!sessions.length" value="">Nessuna sessione</option>
        <option v-for="s in sessions" :key="s.sessionId" :value="s.sessionId">{{ new Date(s.meta.date_start).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) }} · {{ formatTrackName(s.meta.track) }} · {{ formatCarName(s.meta.car) }} · {{ getSessionTypeLabel(s.meta.session_type) }}</option>
      </select>
      <select v-model.number="stintNumber" class="data-stint" :disabled="busy || !stints.length" aria-label="Stint">
        <option v-for="s in stints" :key="s.stint_number" :value="s.stint_number">Stint {{ s.stint_number }} · {{ s.laps.length }} giri</option>
      </select>
      <button type="button" :disabled="!latest || busy || isLatest" @click="latest && selectSession(latest.sessionId)">Ultima sessione</button>
      <button type="button" class="data-refresh" :disabled="busy" aria-label="Aggiorna" title="Aggiorna" @click="load">↻</button>
    </div>
    <p class="data-meta">{{ isLatest ? 'Ultima sessione registrata' : 'Sessione storica' }}<template v-if="updatedAt"> · aggiornato {{ updatedAt }}</template></p>
    <p v-if="error" class="data-error" role="alert">{{ error }}</p>
    <p v-if="busy && !full" role="status" class="data-empty">Caricamento dati…</p>
    <p v-else-if="!sessions.length" class="data-empty">Nessuna sessione registrata. Completa un giro con Racer Core attivo, poi premi Aggiorna.</p>

    <div v-else class="tele" :aria-busy="busy">
      <!-- Laps of the stint -->
      <aside class="tele-laps">
        <div class="tele-laps-head">
          <h2>Giri</h2>
          <span class="tele-steps">
            <button type="button" aria-label="Giro precedente" title="Giro precedente (↑)" :disabled="!laps.length || lapNumber === laps[0]?.lap_number" @click="stepLap(-1)">↑</button>
            <button type="button" aria-label="Giro successivo" title="Giro successivo (↓)" :disabled="!laps.length || lapNumber === laps.at(-1)?.lap_number" @click="stepLap(1)">↓</button>
          </span>
        </div>
        <div class="tele-lap-list">
          <button v-for="l in laps" :key="l.lap_number" type="button" class="tele-lap"
            :class="{ selected: l.lap_number === lapNumber, invalid: l.is_valid === false, best: isBestLap(l), 'stint-best': isStintBest(l) }"
            :aria-pressed="l.lap_number === lapNumber" :title="lapStatus(l)" @click="lapNumber = l.lap_number">
            <span>{{ l.lap_number }}</span><strong>{{ time(l.lap_time_ms) }}</strong>
          </button>
        </div>
        <p v-if="!laps.length" class="tele-note">Nessun giro in questo stint.</p>
      </aside>

      <div class="tele-main">
        <!-- Per wheel (FL FR / RL RR) and car -->
        <p class="tele-section">Gomme e freni <small>· per ruota: ant. sx ant. dx / post. sx post. dx</small>
          <span class="tele-legend" aria-label="Colori delle temperature"><i style="background: rgb(0, 0, 200)" />fredda<i style="background: rgb(0, 200, 0)" />giusta<i style="background: rgb(230, 230, 0)" />calda<i style="background: rgb(255, 0, 0)" />troppo calda</span></p>
        <div class="tele-grid">
          <section v-for="column in wheelColumns" :key="column.title" class="tele-col">
            <h3 :title="column.hint">{{ column.title }} <small>{{ column.unit }}</small></h3>
            <div v-for="[label, key, hint] in column.rows" :key="key" class="tele-cell" :title="hint">
              <span class="tele-label">{{ label }}</span>
              <div class="tele-wheels"><b v-for="(cell, i) in wheelCells(column.kind, key)" :key="i" :style="cell.color ? { color: cell.color } : undefined">{{ cell.text }}</b></div>
            </div>
          </section>
          <section class="tele-col">
            <h3>Gomme</h3>
            <div class="tele-cell"><span class="tele-label">Tipo</span><strong class="tele-value">{{ tyreType }}</strong></div>
            <div class="tele-cell"><span class="tele-label">Set</span><strong class="tele-value">{{ count(tel?.tyre?.set) }}</strong></div>
            <!-- Car settings next to compound and pads (ACC gives no tyre wear). -->
            <div class="tele-cell" title="Livelli impostati di traction control (TC, TC2) e ABS"><span class="tele-label">Assist</span><strong class="tele-value">{{ assists }}</strong></div>
          </section>
          <section class="tele-col">
            <h3>Freni</h3>
            <div class="tele-cell"><span class="tele-label">Tipo</span><strong class="tele-value">{{ brakeType }}</strong></div>
            <div class="tele-cell"><span class="tele-label">Pastiglie</span><div class="tele-wheels"><b v-for="(v, i) in percent(tel?.brakes?.pad_life)" :key="i">{{ v }}</b></div></div>
            <div class="tele-cell"><span class="tele-label">Dischi</span><div class="tele-wheels"><b v-for="(v, i) in percent(tel?.brakes?.disc_life)" :key="i">{{ v }}</b></div></div>
          </section>
        </div>

        <!-- Lap and sectors -->
        <p class="tele-section">Giro e settori</p>
        <!-- One table on the same five columns: labels, then lap and sectors to read across. -->
        <div class="tele-table" role="table" aria-label="Giro e settori">
          <span class="tele-th" role="columnheader" />
          <span v-for="col in lapColumns" :key="col.title" class="tele-th" role="columnheader">{{ col.title }}</span>
          <span class="tele-rh" role="rowheader" title="Tempo del giro e dei settori; in viola i migliori settori della sessione">Tempo</span>
          <span v-for="col in lapColumns" :key="`t-${col.title}`" class="tele-td tele-td--time" role="cell"
            :class="{ 'lap-time': col.lap, invalid: col.lap && lap?.is_valid === false, best: col.best, 'stint-best': col.stintBest, unreliable: col.unreliable }"
            :title="col.unreliable ? 'Settore non affidabile (giro di uscita dai box)' : undefined">{{ time(col.time) }}<small v-if="col.unreliable"> *</small></span>
          <template v-for="row in lapRows" :key="row.label">
            <span class="tele-rh" role="rowheader" :title="row.hint">{{ row.label }}</span>
            <span v-for="col in lapColumns" :key="`${row.label}-${col.title}`" class="tele-td" role="cell">{{ row.value(col.data) }}</span>
          </template>
        </div>

        <!-- Session, stint, damage, conditions -->
        <p class="tele-section">Sessione e condizioni</p>
        <div class="tele-row tele-row--facts">
          <!-- Same five columns as the rows above, each card with its title. -->
          <section class="tele-card">
            <h3>Sessione</h3>
            <dl>
              <div><dt>Migliore</dt><dd class="best-lap">{{ time(references.best) }}</dd></div>
              <div><dt>Ottimale</dt><dd>{{ time(references.optimal) }}</dd></div>
              <div><dt>Media</dt><dd>{{ time(references.average) }}</dd></div>
            </dl>
          </section>
          <section class="tele-card">
            <h3>Stint</h3>
            <dl>
              <div><dt>Tempo</dt><dd>{{ time(facts.duration) }}</dd></div>
              <div><dt>Benzina</dt><dd>{{ number(facts.consumed, 2) }} L</dd></div>
              <div><dt>Al giro</dt><dd>{{ number(facts.perLap, 2) }} L</dd></div>
            </dl>
          </section>
          <section class="tele-card">
            <h3>Danni</h3>
            <dl><div><dt>Carrozzeria</dt><dd>{{ number(tel?.damage?.body, 1) }}</dd></div><div><dt>Sospensioni</dt><dd>{{ number(tel?.damage?.suspension, 1) }}</dd></div></dl>
          </section>
          <section class="tele-card">
            <h3>Aria</h3>
            <dl>
              <div><dt>Avvio</dt><dd>{{ number(startAir, 1) }}°</dd></div>
              <div><dt>Delta</dt><dd :class="{ warm: (delta(startAir, lap?.air_temp) ?? 0) > 0 }">{{ signed(delta(startAir, lap?.air_temp)) }}</dd></div>
            </dl>
          </section>
          <section class="tele-card">
            <h3>Pista</h3>
            <dl>
              <div><dt>Avvio</dt><dd>{{ number(startTrack, 1) }}°</dd></div>
              <div><dt>Delta</dt><dd :class="{ warm: (delta(startTrack, lap?.road_temp) ?? 0) > 0 }">{{ signed(delta(startTrack, lap?.road_temp)) }}</dd></div>
            </dl>
          </section>
        </div>
        <p v-if="lapColumns.some(c => c.unreliable)" class="tele-note">* Settori non affidabili in questo giro (uscita dai box): non contano per i migliori.</p>
        <p v-if="lap && !tel" class="tele-note">-- = non registrato per questo giro (gomme, freni, velocità, TC/ABS, danni): arriva con il prossimo aggiornamento del logger.</p>
      </div>
    </div>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
// PIP-613: the ACC Drive telemetry panel in the Racer Core language: dark cells, thin borders,
// small titles, tabular numbers; everything visible without scrolling on a desktop window.
@use '@/assets/scss/racing-settings' as controls;
$line: #ffffff24;
$cell: #ffffff08;
.data-page { @include controls.tokens; }
h2, h3 { margin: 0; font-family: 'Racer Display', 'Arial Narrow', sans-serif; font-style: italic; font-weight: 700; text-transform: uppercase; }
button { @include controls.action; }
select { @include controls.select; }

.data-bar { display: flex; gap: 10px; align-items: center; }
.data-session { flex: 1; min-width: 0; }
.data-stint { flex: 0 0 170px; }
.data-refresh { min-width: 44px; font-size: 18px; }
.data-meta { margin: 8px 0 14px; color: #8a8a90; font-size: 11px; }
.data-error { color: #ff899a; font-size: 12px; }
.data-empty { padding: 40px 0; color: #aaa; }

.tele { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px; }
.tele-laps { display: flex; flex-direction: column; min-height: 0; border: 1px solid $line; background: $cell; padding: 10px 0;
  h2 { padding: 0 12px 8px; font-size: 14px; } }
.tele-lap-list { flex: 1; overflow: auto; max-height: 560px; }
.tele-lap { display: flex; align-items: baseline; gap: 10px; width: 100%; padding: 5px 12px; border: 0; background: none; clip-path: none; color: #e6e6ea; text-align: left; font-variant-numeric: tabular-nums; cursor: pointer;
  &::after { display: none; }
  span { width: 18px; color: #8a8a90; font-size: 12px; text-align: right; }
  strong { font: 600 14px/1.3 'Inter', sans-serif; }
  &:hover { background: #ffffff0d; }
  &.invalid strong { color: #ff5a6e; }
  // The best lap of the session in fuchsia, as everywhere in sim racing; valid laps stay white.
  &.best strong { color: #e14bff; }
  &.stint-best strong { color: #3ddc5a; }
  &.selected { box-shadow: inset 3px 0 #ff0024; background: #ff002426; strong { color: #fff; } }
  &.best.selected strong { color: #e14bff; }
  &.stint-best.selected strong { color: #3ddc5a; }
  &.invalid.selected strong { color: #ff5a6e; } }
.tele-laps-head { display: flex; align-items: center; justify-content: space-between; padding: 0 8px 8px 12px; h2 { padding: 0; } }
.tele-steps { display: flex; gap: 4px;
  button { min-width: 26px; min-height: 26px; padding: 0; clip-path: none; font-size: 13px; } }
.tele-note { margin: 8px 0 0; padding: 0 12px; color: #77777d; font-size: 11px; }
.tele-main .tele-note { padding: 0; }

.tele-main { display: grid; gap: 8px; min-width: 0; align-content: start; }
// Small group label with a thin line: what to look at, without boxing the panel again.
.tele-section { display: flex; align-items: center; gap: 10px; margin: 4px 0 -2px; color: #b3b3b8; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  small { color: #77777d; font-weight: 500; letter-spacing: 0; text-transform: none; }
  &::after { content: ''; flex: 1; height: 1px; background: #ffffff1f; }
  &:first-child { margin-top: 0; } }
.tele-legend { display: inline-flex; align-items: center; gap: 5px; order: 2; color: #8a8a90; font-size: 10px; font-weight: 500; letter-spacing: 0; text-transform: none;
  i { width: 8px; height: 8px; margin-left: 6px; } }
.tele-section::after { order: 1; }
[title] { cursor: help; }
// Lap and sectors: label column + four value columns, aligned to the five-column grid.
.tele-table { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); column-gap: 10px; border: 1px solid $line; background: $cell; padding: 6px 0; font-variant-numeric: tabular-nums;
  > span { padding: 2px 12px; font-size: 13px; }
  .tele-th { color: #fff; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; text-align: center; padding-bottom: 6px; border-bottom: 1px solid $line; margin-bottom: 3px; }
  .tele-rh { color: #b3b3b8; font-weight: 700; text-align: right; }
  .tele-td { color: #e6e6ea; font-weight: 600; text-align: center; }
  .tele-td--time { font-size: 14px; }
  .lap-time { color: #fff; }
  .invalid { color: #ff5a6e; }
  .best { color: #e14bff; }
  .stint-best { color: #3ddc5a; }
  .unreliable { color: #8a8a90; font-style: italic; } }
.tele-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
// Same rows in every column (title + three cells), so all cell edges line up.
.tele-col { display: grid; grid-template-rows: auto repeat(3, 1fr); gap: 6px;
  h3 { font-size: 13px; text-align: center; small { color: #8a8a90; font: 500 10px 'Inter', sans-serif; text-transform: none; } } }
.tele-cell { display: grid; justify-items: center; gap: 4px; min-height: 56px; padding: 5px 6px; border: 1px solid $line; background: $cell; align-content: center; }
.tele-label { color: #b3b3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.tele-wheels { display: grid; grid-template-columns: repeat(2, minmax(0, auto)); gap: 2px 14px; font: 600 14px/1.25 'Inter', sans-serif; font-variant-numeric: tabular-nums; color: #e6e6ea; b { font-weight: 600; } }
.tele-value { font: 600 14px/1.25 'Inter', sans-serif; color: #e6e6ea; &.muted { color: #8a8a90; font-size: 11px; font-weight: 500; text-align: center; } }

.tele-row { display: grid; gap: 10px; }
.tele-row--lap { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.tele-row--facts { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.tele-card { padding: 8px 12px; border: 1px solid $line; background: $cell;
  h3 { margin-bottom: 6px; font-size: 13px; text-align: center; }
  dl { display: grid; gap: 3px; margin: 0; }
  // Label right, value left: the colons line up in every card.
  dl > div { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 13px; }
  dt { text-align: right; }
  dt { color: #b3b3b8; font-weight: 700; &::after { content: ':'; } }
  dd { margin: 0; color: #e6e6ea; font-weight: 600; font-variant-numeric: tabular-nums; }
  .lap-time { color: #fff; &.invalid { color: #ff5a6e; } }
  .sector-time { color: #e6e6ea; }
  .best, .best-lap { color: #e14bff; }
  .warm { color: #ff5a6e; } }

@media (max-width: 1100px) {
  .tele-grid, .tele-row--lap, .tele-row--facts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .tele { grid-template-columns: 1fr; }
  .tele-lap-list { display: flex; max-height: none; overflow-x: auto; }
  .tele-lap { flex: 0 0 auto; }
  .tele-grid, .tele-row--lap, .tele-row--facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .data-bar { flex-wrap: wrap; .data-session { flex-basis: 100%; } }
}
</style>
