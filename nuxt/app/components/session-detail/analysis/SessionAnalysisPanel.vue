<script setup lang="ts">
// PIP-618: the session "Avanzata" tab, our Track Titan. One lap ("Tu") against a
// reference from the logger's lap files (laps of this session only, read through
// Electron), in three layouts: Pilota (VRS, default), Curve (Track Titan), Tracce
// (MoTeC / Garage 61). Shared: legend, cursor, time/point sync, corner zoom.
import { computed, onMounted, ref, watch } from 'vue'
import AnalysisMap from './AnalysisMap.vue'
import AnalysisCar from './AnalysisCar.vue'
import AnalysisCharts, { type ChartRow } from './AnalysisCharts.vue'
import { compareCorners, cornerAdvice, detectCorners, formatDelta, timeSyncedFraction } from '~/services/telemetry/lapAnalysis'
import { normalizeLapTrace, type LapTraceView } from '~/services/telemetry/lapTraceChart'
import { formatLapTime } from '~/utils/telemetryFormat'

const props = defineProps<{
  sessionToken: string | null
  laps: { lap_number: number, lap_time_ms: number | null, is_valid: boolean | null }[]
}>()

type Layout = 'pilota' | 'curve' | 'tracce'
const LAYOUTS: { id: Layout, label: string, hint: string }[] = [
  { id: 'pilota', label: 'Pilota', hint: 'La mappa colorata e le tre curve dove migliorare, in parole semplici' },
  { id: 'curve', label: 'Curve', hint: 'Il giro diviso per curve: dove perdi tempo, la traiettoria e la telemetria della curva scelta' },
  { id: 'tracce', label: 'Tracce', hint: 'Tutti i canali sul giro intero, un cursore condiviso' },
]
// Per-viewer preferences: remembered, never required.
function remembered<T extends string>(key: string, values: readonly T[], fallback: T) {
  const value = ref<T>(fallback)
  onMounted(() => { try { const saved = localStorage.getItem(key) as T | null; if (saved && values.includes(saved)) value.value = saved } catch { /* default */ } })
  watch(value, v => { try { localStorage.setItem(key, v) } catch { /* Storage can be disabled. */ } })
  return value
}
const layout = remembered<Layout>('rc:analysis:layout', ['pilota', 'curve', 'tracce'], 'pilota')
/** Reference dot: at the same point of the track, or where it was at the same time (Track Titan time-sync). */
const sync = remembered<'punto' | 'tempo'>('rc:analysis:sync', ['punto', 'tempo'], 'punto')
const mapMode = remembered<'intera' | 'zoom'>('rc:analysis:map', ['intera', 'zoom'], 'intera')
const pedals = remembered<'separati' | 'sovrapposti'>('rc:analysis:pedals', ['separati', 'sovrapposti'], 'separati')
const allChannels = ref(false)

interface Entry { id: string, lapNumber: number, lapTimeMs: number, valid: boolean, complete: boolean }
const entries = ref<Entry[]>([])
const traces = ref<Record<string, LapTraceView>>({})
const lapId = ref(''), refId = ref('')
const loading = ref(false), error = ref('')
const cursor = ref<number | null>(null)
const selectedCorner = ref<number | null>(null)
const skipped = ref(0)

interface LapTraceApi {
  listLapTraces?: (filter?: { sessionToken: string }) => Promise<{ id: string }[] | null>
  readLapTrace?: (id: string) => Promise<unknown>
}
function api(): LapTraceApi | null {
  return typeof window === 'undefined' ? null : (window as Window & { electronAPI?: LapTraceApi }).electronAPI ?? null
}
async function load() {
  const token = props.sessionToken
  error.value = ''
  entries.value = []
  traces.value = {}
  skipped.value = 0
  if (!token) { error.value = 'Questa sessione non ha giri registrati sul computer.'; return }
  const bridge = api()
  if (typeof bridge?.listLapTraces !== 'function' || typeof bridge.readLapTrace !== 'function') { error.value = 'L’analisi dei giri è disponibile nel programma Racer Core.'; return }
  loading.value = true
  try {
    const list = (await bridge.listLapTraces({ sessionToken: token })) ?? []
    const valid = new Map(props.laps.map(l => [l.lap_number, l.is_valid === true]))
    // All laps of the session at once (about 120 KB each): a lap that cannot be read
    // (pruned meanwhile, damaged) is left out here, never on a later click.
    const read = await Promise.all(list.map(async item => {
      const match = /_L(\d{3})_(\d+)ms\.json\.gz$/.exec(item.id)
      if (!match) return null
      try {
        const trace = normalizeLapTrace(await bridge.readLapTrace!(item.id))
        return trace ? { trace, entry: { id: item.id, lapNumber: Number(match[1]), lapTimeMs: Number(match[2]), valid: valid.get(Number(match[1])) ?? false, complete: trace.complete } } : null
      } catch { return null }
    }))
    if (token !== props.sessionToken) return
    const ok = read.filter((r): r is { trace: LapTraceView, entry: Entry } => r !== null)
    skipped.value = list.length - ok.length
    traces.value = Object.fromEntries(ok.map(r => [r.entry.id, r.trace]))
    entries.value = ok.map(r => r.entry).sort((a, b) => a.lapNumber - b.lapNumber)
    // A partial lap (logger started mid-lap, out-lap) covers only part of the track:
    // stretched on the whole lap it would compare different places. Listed, not usable.
    const usable = entries.value.filter(e => e.complete)
    if (!usable.length) { error.value = entries.value.length ? 'Ci sono solo giri parziali in questa sessione: servono giri completi, partiti dal traguardo.' : 'Nessun giro registrato per questa sessione: le analisi arrivano dai giri guidati con Racer Core attivo.'; return }
    // Default as Track Titan: your best valid lap is the reference, the last lap the one to study.
    const best = [...usable].filter(e => e.valid).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? usable[0]!
    const other = [...usable].reverse().find(e => e.id !== best.id) ?? best
    refId.value = best.id
    lapId.value = other.id
  } catch {
    error.value = 'Impossibile leggere i giri di questa sessione.'
  } finally {
    loading.value = false
  }
}
watch(() => props.sessionToken, () => { void load() })
onMounted(() => { void load() })

const lap = computed(() => traces.value[lapId.value] ?? null)
const reference = computed(() => refId.value && refId.value !== lapId.value ? traces.value[refId.value] ?? null : null)
const lapEntry = computed(() => entries.value.find(e => e.id === lapId.value) ?? null)
const refEntry = computed(() => reference.value ? entries.value.find(e => e.id === refId.value) ?? null : null)
const corners = computed(() => detectCorners(reference.value ?? lap.value ?? emptyTrace()))
const comparison = computed(() => lap.value && reference.value ? compareCorners(lap.value, reference.value, corners.value) : [])
const worst = computed(() => [...comparison.value].sort((a, b) => b.timeLostS - a.timeLostS).filter(c => c.timeLostS >= 0.03).slice(0, 3))
const totalDelta = computed(() => lap.value && reference.value ? lap.value.lapTimeS - reference.value.lapTimeS : null)
const refCursor = computed(() => cursor.value === null || !lap.value || !reference.value ? null
  : sync.value === 'tempo' ? timeSyncedFraction(lap.value, reference.value, cursor.value) : cursor.value)
const range = computed<[number, number]>(() => {
  const corner = selectedCorner.value !== null ? corners.value[selectedCorner.value - 1] : null
  return corner ? [corner.start, corner.end] : [0, 1]
})
function selectFirst() {
  if (!corners.value.length) { selectedCorner.value = null; return }
  if (selectedCorner.value === null || selectedCorner.value > corners.value.length) selectedCorner.value = worst.value[0]?.corner.number ?? 1
}
watch(corners, () => { if (layout.value !== 'tracce') selectFirst() })
watch(layout, value => { if (value === 'tracce') selectedCorner.value = null; else selectFirst() })

function emptyTrace(): LapTraceView {
  return { gameId: 'acc', variant: null, sessionId: null, track: '', car: '', lapTimeS: 0, source: '', complete: false, valid: null, fuelL: null, gridStepM: 2, lengthM: 0, channels: {} }
}
const has = (name: string) => !!lap.value?.channels[name]
const deltaRow = computed<ChartRow[]>(() => reference.value ? [{ key: 'delta', title: 'Delta', unit: 's', channels: [], delta: true, height: 70 }] : [])
const speedRow: ChartRow = { key: 'speed', title: 'Velocità', unit: 'km/h', channels: [{ name: 'speed_kmh' }], height: 100 }
const pedalRows = computed<ChartRow[]>(() => pedals.value === 'sovrapposti'
  ? [{ key: 'pedals', title: 'Gas e freno', unit: '%', channels: [{ name: 'throttle_pct', color: '#3ddc5a', label: 'Gas' }, { name: 'brake_pct', color: '#ff5a6e', label: 'Freno' }], height: 80, min: 0, max: 100 }]
  : [{ key: 'gas', title: 'Gas', unit: '%', channels: [{ name: 'throttle_pct', color: '#3ddc5a' }], height: 60, min: 0, max: 100 },
     { key: 'brake', title: 'Freno', unit: '%', channels: [{ name: 'brake_pct', color: '#ff5a6e' }], height: 60, min: 0, max: 100 }])
const steerRow: ChartRow = { key: 'steer', title: 'Sterzo', channels: [{ name: 'steer_deg', color: '#ffd43b' }], height: 60, digits: 2 }
const gearRow: ChartRow = { key: 'gear', title: 'Marcia', channels: [{ name: 'gear', color: '#74c0fc' }], height: 46 }
const extraRows = computed<ChartRow[]>(() => [
  ...(has('acc_lat_g') ? [{ key: 'latg', title: 'G laterale', unit: 'G', channels: [{ name: 'acc_lat_g', color: '#b197fc' }], height: 60, digits: 2 } as ChartRow] : []),
  ...(has('slip_angle_fl') ? [{ key: 'slip', title: 'Deriva gomme anteriori', unit: '°', channels: [{ name: 'slip_angle_fl', color: '#ffa94d', label: 'Sx', scale: 57.2958 }, { name: 'slip_angle_fr', color: '#ff8787', label: 'Dx', scale: 57.2958 }], height: 60, digits: 1 } as ChartRow] : []),
  ...(has('susp_travel_mm_fl') ? [{ key: 'susp', title: 'Sospensioni anteriori', unit: 'mm', channels: [{ name: 'susp_travel_mm_fl', color: '#63e6be', label: 'Sx' }, { name: 'susp_travel_mm_fr', color: '#4dabf7', label: 'Dx' }], height: 60 } as ChartRow] : []),
  { key: 'rpm', title: 'Giri motore', channels: [{ name: 'rpm', color: '#ced4da' }], height: 50 },
])
const pilotRows = computed(() => [...deltaRow.value, speedRow, ...pedalRows.value])
const cornerRows = computed(() => [...deltaRow.value, speedRow, ...pedalRows.value, steerRow, gearRow])
const traceRows = computed(() => [...deltaRow.value, speedRow, ...pedalRows.value, gearRow, ...(allChannels.value ? [steerRow, ...extraRows.value.filter(r => r.key !== 'rpm' || has('rpm'))] : [])])

const lapLabel = (e: Entry) => `Giro ${e.lapNumber} · ${formatLapTime(e.lapTimeMs)}${e.complete ? '' : ' · parziale'}${e.valid ? '' : ' · invalido'}`
const short = (e: Entry | null) => e ? `Giro ${e.lapNumber} · ${formatLapTime(e.lapTimeMs)}` : '--'
const ms = (s: number | null | undefined) => typeof s === 'number' ? formatLapTime(s * 1000) : '--'
</script>

<template>
  <section class="analysis">
    <div class="analysis-bar">
      <div class="seg" role="tablist" aria-label="Layout dell’analisi">
        <button v-for="l in LAYOUTS" :key="l.id" type="button" role="tab" :aria-selected="layout === l.id" :class="{ active: layout === l.id }" :title="l.hint" @click="layout = l.id">{{ l.label }}</button>
      </div>
      <label class="analysis-pick"><span class="key key--lap" />Tu
        <select v-model="lapId" :disabled="!entries.length"><option v-for="e in entries" :key="e.id" :value="e.id" :disabled="!e.complete">{{ lapLabel(e) }}</option></select>
      </label>
      <label class="analysis-pick"><span class="key key--ref" />Riferimento
        <select v-model="refId" :disabled="!entries.length"><option v-for="e in entries" :key="e.id" :value="e.id" :disabled="!e.complete">{{ lapLabel(e) }}</option></select>
      </label>
      <p v-if="totalDelta !== null" class="analysis-total" :class="{ gain: totalDelta < 0, loss: totalDelta > 0 }" title="Il tuo giro contro il riferimento">{{ formatDelta(totalDelta) }} s</p>
    </div>

    <!-- Who is who, in words: the first thing a new driver asks. -->
    <div v-if="lap" class="analysis-legend">
      <span><i class="line line--lap" /><b>Tu</b> · {{ short(lapEntry) }} · linea continua, pallino pieno</span>
      <span v-if="reference"><i class="line line--ref" /><b>Riferimento</b> · {{ short(refEntry) }} · linea tratteggiata, pallino vuoto</span>
      <span class="analysis-switches">
        <span class="seg seg--small" role="radiogroup" aria-label="Pallino del riferimento" title="Stesso punto: confronti velocità e pedali. Stesso tempo: vedi il distacco come distanza in pista.">
          <button type="button" :class="{ active: sync === 'punto' }" @click="sync = 'punto'">Stesso punto</button>
          <button type="button" :class="{ active: sync === 'tempo' }" @click="sync = 'tempo'">Stesso tempo</button>
        </span>
        <span v-if="layout !== 'tracce'" class="seg seg--small" role="radiogroup" aria-label="Gas e freno">
          <button type="button" :class="{ active: pedals === 'separati' }" @click="pedals = 'separati'">Pedali separati</button>
          <button type="button" :class="{ active: pedals === 'sovrapposti' }" @click="pedals = 'sovrapposti'">Sovrapposti</button>
        </span>
      </span>
    </div>
    <p class="analysis-hint">{{ LAYOUTS.find(l => l.id === layout)?.hint }}<template v-if="skipped"> · {{ skipped }} giri non leggibili esclusi</template></p>
    <p v-if="loading" class="analysis-empty" role="status">Caricamento dei giri…</p>
    <p v-else-if="error" class="analysis-empty">{{ error }}</p>
    <p v-else-if="lapId === refId && entries.length > 1" class="analysis-empty">Scegli un riferimento diverso dal tuo giro per vedere il confronto.</p>

    <!-- PILOTA (VRS): the coloured map and the three corners to work on, in plain words. -->
    <div v-if="lap && layout === 'pilota'" class="layout-pilota">
      <div class="panel">
        <div class="panel-head">
          <span v-if="reference" class="map-legend"><i class="g" />il {{ short(lapEntry).split(' · ')[0] }} guadagna <i class="r" />perde <i class="n" />uguale, sul {{ short(refEntry).split(' · ')[0] }}</span>
          <span class="seg seg--small"><button type="button" :class="{ active: mapMode === 'intera' }" @click="mapMode = 'intera'">Pista intera</button><button type="button" :class="{ active: mapMode === 'zoom' }" :disabled="selectedCorner === null" @click="mapMode = 'zoom'">Zoom curva</button></span>
        </div>
        <AnalysisMap :lap="lap" :reference="reference" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" :zoom="mapMode === 'zoom'" :size="460" @hover="cursor = $event" @select="selectedCorner = $event" />
        <AnalysisCar :lap="lap" :reference="reference" :cursor="cursor" :ref-cursor="refCursor" />
      </div>
      <div class="pilota-side">
        <h3>Dove migliorare</h3>
        <p v-if="!reference" class="analysis-note">Scegli un riferimento per vedere dove migliorare.</p>
        <p v-else-if="!worst.length" class="analysis-note">Nessuna curva sotto il riferimento di oltre 3 centesimi.</p>
        <button v-for="(c, i) in worst" :key="c.corner.number" type="button" class="pilota-card" :class="{ active: selectedCorner === c.corner.number }" @click="selectedCorner = c.corner.number">
          <span class="pilota-rank">{{ i + 1 }}</span>
          <span class="pilota-body"><strong>Curva {{ c.corner.number }} <em class="loss">{{ formatDelta(c.timeLostS) }} s</em></strong>{{ cornerAdvice(c) }}</span>
        </button>
        <AnalysisCharts v-if="selectedCorner !== null" :lap="lap" :reference="reference" :rows="pilotRows" :range="range" :cursor="cursor" :ref-cursor="refCursor" @hover="cursor = $event" />
      </div>
    </div>

    <!-- CURVE (Track Titan): corner list with the time lost, the corner's lines and telemetry. -->
    <div v-else-if="lap && layout === 'curve'" class="layout-curve">
      <aside class="panel curve-side">
        <div class="panel-head">
          <span class="seg seg--small"><button type="button" :class="{ active: mapMode === 'intera' }" @click="mapMode = 'intera'">Pista intera</button><button type="button" :class="{ active: mapMode === 'zoom' }" @click="mapMode = 'zoom'">Zoom curva</button></span>
        </div>
        <AnalysisMap :lap="lap" :reference="reference" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" :zoom="mapMode === 'zoom'" :size="300" @hover="cursor = $event" @select="selectedCorner = $event" />
        <table class="curve-table">
          <thead><tr><th>Curva</th><th>Tempo</th><th title="Tu / riferimento">V. min</th></tr></thead>
          <tbody>
            <tr v-for="c in comparison" :key="c.corner.number" :class="{ active: selectedCorner === c.corner.number }" @click="selectedCorner = c.corner.number">
              <td>{{ c.corner.number }}</td>
              <td :class="{ gain: c.timeLostS <= -0.01, loss: c.timeLostS >= 0.01 }">{{ formatDelta(c.timeLostS) }}</td>
              <td>{{ c.lapMinKmh?.toFixed(0) ?? '--' }} <small>/ {{ c.refMinKmh?.toFixed(0) ?? '--' }}</small></td>
            </tr>
          </tbody>
        </table>
        <p v-if="!reference" class="analysis-note">Senza un riferimento diverso vedi solo le curve del giro.</p>
      </aside>
      <div class="curve-main">
        <p v-if="selectedCorner !== null && comparison[selectedCorner - 1]" class="curve-advice">Curva {{ selectedCorner }} · {{ cornerAdvice(comparison[selectedCorner - 1]!) }}</p>
        <div class="curve-grid">
          <AnalysisCharts :lap="lap" :reference="reference" :rows="cornerRows" :range="range" :cursor="cursor" :ref-cursor="refCursor" @hover="cursor = $event" />
          <AnalysisCar :lap="lap" :reference="reference" :cursor="cursor" :ref-cursor="refCursor" />
        </div>
      </div>
    </div>

    <!-- TRACCE (MoTeC / Garage 61): the essential channels over the lap, more on request. -->
    <div v-else-if="lap && layout === 'tracce'" class="layout-tracce">
      <aside class="panel tracce-side">
        <AnalysisMap :lap="lap" :reference="reference" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" :size="240" @hover="cursor = $event" @select="selectedCorner = selectedCorner === $event ? null : $event" />
        <button type="button" class="tracce-btn" :disabled="selectedCorner === null" @click="selectedCorner = null">Giro intero</button>
        <button type="button" class="tracce-btn" :class="{ active: allChannels }" @click="allChannels = !allChannels">{{ allChannels ? 'Solo l’essenziale' : 'Altri canali' }}</button>
        <p class="analysis-note">Clic su una curva (mappa o fascia sopra i grafici) per ingrandirla.</p>
        <dl class="tracce-facts">
          <div><dt>Tu</dt><dd>{{ ms(lap.lapTimeS) }}</dd></div>
          <div v-if="reference"><dt>Riferimento</dt><dd>{{ ms(reference.lapTimeS) }}</dd></div>
          <div><dt>Lunghezza</dt><dd>{{ (lap.lengthM / 1000).toFixed(2) }} km</dd></div>
        </dl>
      </aside>
      <AnalysisCharts :lap="lap" :reference="reference" :rows="traceRows" :range="range" :cursor="cursor" :ref-cursor="refCursor" :corners="selectedCorner === null ? corners : []" @hover="cursor = $event" @select="selectedCorner = $event" />
    </div>
  </section>
</template>

<style scoped lang="scss">
// Racer Core language: dark cells, thin borders, red accent, italic display titles.
.analysis { display: grid; gap: 10px; }
.analysis-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.seg { display: inline-flex; gap: 3px; padding: 3px; border: 1px solid #ffffff1f; background: #0a0a0feb;
  button { height: 30px; padding: 0 16px; border: 0; background: transparent; color: #b3b3b8; font: italic 700 14px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; cursor: pointer;
    &.active { background: #ffffff14; color: #fff; box-shadow: inset 0 -2px #ff0024; }
    &:disabled { opacity: .4; cursor: default; } }
  &--small button { height: 24px; padding: 0 10px; font: 600 11px 'Inter', sans-serif; text-transform: none; } }
.analysis-pick { display: flex; align-items: center; gap: 6px; color: #b3b3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  select { min-width: 210px; height: 32px; padding: 0 8px; border: 1px solid #ffffff2e; background: #0d0d12; color: #e6e6ea; font: 500 13px 'Inter', sans-serif; text-transform: none; } }
.key { width: 12px; height: 12px; border-radius: 50%; &--lap { background: #ff3b4f; border: 1.5px solid #fff; } &--ref { background: #0a0a0f; border: 2px solid #fff; } }
.analysis-total { margin: 0 0 0 auto; font: 700 20px 'Inter', sans-serif; font-variant-numeric: tabular-nums; color: #e6e6ea; &.gain { color: #3ddc5a; } &.loss { color: #ff5a6e; } }
.analysis-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; padding: 6px 10px; border: 1px solid #ffffff1f; background: #ffffff06; color: #b3b3b8; font-size: 12px;
  b { color: #fff; }
  .line { display: inline-block; width: 22px; height: 0; margin-right: 6px; vertical-align: middle; border-top: 2px solid #ff3b4f; &--ref { border-top: 2px dashed #c9c9cf; } } }
.analysis-switches { display: flex; gap: 8px; margin-left: auto; }
.analysis-hint { margin: -4px 0 0; color: #77777d; font-size: 11px; }
.analysis-empty { padding: 30px 0; color: #aaa; }
.analysis-note { margin: 4px 0 0; color: #77777d; font-size: 11px; }
.gain { color: #3ddc5a; }
.loss { color: #ff5a6e; }
.panel { display: grid; gap: 8px; border: 1px solid #ffffff1f; background: #ffffff06; padding: 8px; align-content: start; }
.panel-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
.map-legend { display: flex; gap: 5px; align-items: center; color: #8a8a90; font-size: 11px;
  i { width: 14px; height: 3px; margin-left: 6px; &.g { background: #3ddc5a; } &.r { background: #ff5a6e; } &.n { background: #8a8a90; } } }

.layout-pilota { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.pilota-side { display: grid; gap: 8px;
  h3 { margin: 0; font: italic 700 15px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; color: #fff; } }
.pilota-card { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid #ffffff1f; background: #ffffff08; color: #e6e6ea; font-size: 13px; text-align: left; cursor: pointer;
  &.active { border-color: #ff0024; background: #ff002414; }
  strong { display: block; margin-bottom: 2px; font-size: 14px; em { font-style: normal; margin-left: 6px; } } }
.pilota-rank { display: grid; place-items: center; width: 26px; height: 26px; flex: 0 0 26px; background: #ff0024; color: #fff; font: italic 700 14px 'Racer Display', sans-serif; }
.pilota-body { display: block; }

.layout-curve { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 12px; align-items: start; }
.curve-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums;
  th { color: #8a8a90; font-weight: 700; font-size: 10px; text-transform: uppercase; text-align: left; padding: 3px 6px; border-bottom: 1px solid #ffffff1f; }
  td { padding: 4px 6px; color: #e6e6ea; small { color: #77777d; } }
  tr { cursor: pointer; &:hover td { background: #ffffff0a; } &.active td { background: #ff002426; } &.active td:first-child { box-shadow: inset 3px 0 #ff0024; } } }
.curve-main { display: grid; gap: 8px; min-width: 0; }
.curve-grid { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 8px; align-items: start; }
.curve-advice { margin: 0; padding: 8px 12px; border: 1px solid #ffffff1f; background: #ffffff08; color: #e6e6ea; font-size: 13px; font-weight: 600; }

.layout-tracce { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 12px; align-items: start; }
.tracce-side { position: sticky; top: 8px; }
.tracce-btn { height: 28px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; font-size: 12px; cursor: pointer; &:disabled { opacity: .4; cursor: default; } &.active { border-color: #ff0024; } }
.tracce-facts { display: grid; gap: 2px; margin: 4px 0 0; font-size: 12px;
  > div { display: flex; justify-content: space-between; }
  dt { color: #8a8a90; } dd { margin: 0; color: #e6e6ea; font-variant-numeric: tabular-nums; } }

@media (max-width: 1100px) {
  .layout-curve, .layout-tracce, .layout-pilota, .curve-grid { grid-template-columns: 1fr; }
  .tracce-side { position: static; }
}
</style>
