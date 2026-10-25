<script setup lang="ts">
// PIP-618: the session "Avanzata" tab, our Track Titan. One lap against a reference
// from the logger's lap files (laps of this session only, read through Electron), in
// three layouts to compare: Curve (Track Titan), Tracce (MoTeC / Garage 61), Pilota (VRS).
import { computed, onMounted, ref, watch } from 'vue'
import AnalysisMap from './AnalysisMap.vue'
import AnalysisCharts, { type ChartRow } from './AnalysisCharts.vue'
import { compareCorners, cornerAdvice, detectCorners, formatDelta } from '~/services/telemetry/lapAnalysis'
import { normalizeLapTrace, type LapTraceView } from '~/services/telemetry/lapTraceChart'
import { formatLapTime } from '~/utils/telemetryFormat'

const props = defineProps<{
  sessionToken: string | null
  laps: { lap_number: number, lap_time_ms: number | null, is_valid: boolean | null }[]
}>()

type Layout = 'curve' | 'tracce' | 'pilota'
const LAYOUTS: { id: Layout, label: string, hint: string }[] = [
  { id: 'curve', label: 'Curve', hint: 'Come Track Titan: il giro diviso per curve, dove perdi tempo e la traiettoria della curva scelta' },
  { id: 'tracce', label: 'Tracce', hint: 'Come MoTeC e Garage 61: tutti i canali impilati sul giro, un cursore condiviso' },
  { id: 'pilota', label: 'Pilota', hint: 'Come VRS: la mappa colorata e le tre curve dove migliorare, in parole semplici' },
]
const LAYOUT_KEY = 'rc:analysis:layout'
const layout = ref<Layout>('curve')
function setLayout(value: Layout) {
  layout.value = value
  try { localStorage.setItem(LAYOUT_KEY, value) } catch { /* Storage can be disabled. */ }
}

interface Entry { id: string, lapNumber: number, lapTimeMs: number, valid: boolean }
const entries = ref<Entry[]>([])
const traces = ref<Record<string, LapTraceView>>({})
const lapId = ref(''), refId = ref('')
const loading = ref(false), error = ref('')
const cursor = ref<number | null>(null)
const selectedCorner = ref<number | null>(null)

interface LapTraceApi {
  listLapTraces?: (filter?: { sessionToken: string }) => Promise<{ id: string }[] | null>
  readLapTrace?: (id: string) => Promise<unknown>
}
function api(): LapTraceApi | null {
  return typeof window === 'undefined' ? null : (window as Window & { electronAPI?: LapTraceApi }).electronAPI ?? null
}
async function readTrace(id: string) {
  if (!id || traces.value[id]) return
  const trace = normalizeLapTrace(await api()?.readLapTrace?.(id))
  if (trace) traces.value = { ...traces.value, [id]: trace }
}
async function load() {
  error.value = ''
  entries.value = []
  if (!props.sessionToken) { error.value = 'Questa sessione non ha giri registrati sul computer.'; return }
  if (typeof api()?.listLapTraces !== 'function') { error.value = 'L’analisi dei giri è disponibile nel programma Racer Core.'; return }
  loading.value = true
  try {
    const list = (await api()?.listLapTraces?.({ sessionToken: props.sessionToken })) ?? []
    const valid = new Map(props.laps.map(l => [l.lap_number, l.is_valid === true]))
    entries.value = list.map(item => {
      const match = /_L(\d{3})_(\d+)ms\.json\.gz$/.exec(item.id)
      return match ? { id: item.id, lapNumber: Number(match[1]), lapTimeMs: Number(match[2]), valid: valid.get(Number(match[1])) ?? false } : null
    }).filter((e): e is Entry => e !== null).sort((a, b) => a.lapNumber - b.lapNumber)
    if (!entries.value.length) { error.value = 'Nessun giro registrato per questa sessione: le analisi arrivano dai giri guidati con Racer Core attivo.'; return }
    // Default as Track Titan: your best valid lap is the reference, the last lap the one to study.
    const best = [...entries.value].filter(e => e.valid).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? entries.value[0]!
    const other = [...entries.value].reverse().find(e => e.id !== best.id) ?? best
    refId.value = best.id
    lapId.value = other.id
    await Promise.all([readTrace(lapId.value), readTrace(refId.value)])
  } catch {
    error.value = 'Impossibile leggere i giri di questa sessione.'
  } finally {
    loading.value = false
  }
}
watch(lapId, id => { void readTrace(id) })
watch(refId, id => { void readTrace(id) })
watch(() => props.sessionToken, () => { void load() })
onMounted(() => {
  try { const saved = localStorage.getItem(LAYOUT_KEY) as Layout | null; if (saved && LAYOUTS.some(l => l.id === saved)) layout.value = saved } catch { /* default */ }
  void load()
})

const lap = computed(() => traces.value[lapId.value] ?? null)
const reference = computed(() => refId.value && refId.value !== lapId.value ? traces.value[refId.value] ?? null : null)
const corners = computed(() => detectCorners(reference.value ?? lap.value ?? emptyTrace()))
const comparison = computed(() => lap.value && reference.value ? compareCorners(lap.value, reference.value, corners.value) : [])
const worst = computed(() => [...comparison.value].sort((a, b) => b.timeLostS - a.timeLostS).filter(c => c.timeLostS >= 0.03).slice(0, 3))
const totalDelta = computed(() => lap.value && reference.value ? lap.value.lapTimeS - reference.value.lapTimeS : null)
const range = computed<[number, number]>(() => {
  const corner = selectedCorner.value !== null ? corners.value[selectedCorner.value - 1] : null
  return corner ? [corner.start, corner.end] : [0, 1]
})
watch(corners, list => {
  if (layout.value === 'curve' && list.length && (selectedCorner.value === null || selectedCorner.value > list.length)) selectedCorner.value = worst.value[0]?.corner.number ?? 1
})
watch(layout, value => { if (value === 'tracce') selectedCorner.value = null; else if (selectedCorner.value === null) selectedCorner.value = worst.value[0]?.corner.number ?? (corners.value.length ? 1 : null) })

function emptyTrace(): LapTraceView {
  return { gameId: 'acc', variant: null, sessionId: null, track: '', car: '', lapTimeS: 0, source: '', complete: false, valid: null, fuelL: null, gridStepM: 2, lengthM: 0, channels: {} }
}
const has = (name: string) => !!lap.value?.channels[name]
const baseRows = computed<ChartRow[]>(() => [
  ...(reference.value ? [{ key: 'delta', title: 'Delta', unit: 's', channels: [], delta: true, height: 70 } as ChartRow] : []),
  { key: 'speed', title: 'Velocità', unit: 'km/h', channels: [{ name: 'speed_kmh' }], height: 110 },
  { key: 'pedals', title: 'Gas e freno', unit: '%', channels: [{ name: 'throttle_pct', color: '#3ddc5a', label: 'Gas' }, { name: 'brake_pct', color: '#ff5a6e', label: 'Freno' }], height: 80, min: 0, max: 100 },
  { key: 'steer', title: 'Sterzo', channels: [{ name: 'steer_deg', color: '#ffd43b' }], height: 70, digits: 2 },
  { key: 'gear', title: 'Marcia', channels: [{ name: 'gear', color: '#74c0fc' }], height: 50 },
])
const extraRows = computed<ChartRow[]>(() => [
  ...(has('acc_lat_g') ? [{ key: 'latg', title: 'G laterale', unit: 'G', channels: [{ name: 'acc_lat_g', color: '#b197fc' }], height: 60, digits: 2 } as ChartRow] : []),
  ...(has('slip_angle_fl') ? [{ key: 'slip', title: 'Deriva gomme anteriori', unit: '°', channels: [{ name: 'slip_angle_fl', color: '#ffa94d', label: 'Sx', scale: 57.2958 }, { name: 'slip_angle_fr', color: '#ff8787', label: 'Dx', scale: 57.2958 }], height: 60, digits: 1 } as ChartRow] : []),
  ...(has('susp_travel_mm_fl') ? [{ key: 'susp', title: 'Sospensioni anteriori', unit: 'mm', channels: [{ name: 'susp_travel_mm_fl', color: '#63e6be', label: 'Sx' }, { name: 'susp_travel_mm_fr', color: '#4dabf7', label: 'Dx' }], height: 60 } as ChartRow] : []),
])
const cornerRows = computed(() => baseRows.value)
const traceRows = computed(() => [...baseRows.value, ...extraRows.value])
const pilotRows = computed<ChartRow[]>(() => baseRows.value.filter(r => r.key === 'speed' || r.key === 'pedals').map(r => ({ ...r, height: 80 })))

const lapLabel = (e: Entry) => `Giro ${e.lapNumber} · ${formatLapTime(e.lapTimeMs)}${e.valid ? '' : ' · invalido'}`
const ms = (s: number | null | undefined) => typeof s === 'number' ? formatLapTime(s * 1000) : '--'
</script>

<template>
  <section class="analysis">
    <div class="analysis-bar">
      <div class="analysis-layouts" role="tablist" aria-label="Layout dell’analisi">
        <button v-for="l in LAYOUTS" :key="l.id" type="button" role="tab" :aria-selected="layout === l.id" :class="{ active: layout === l.id }" :title="l.hint" @click="setLayout(l.id)">{{ l.label }}</button>
      </div>
      <label class="analysis-pick"><span class="dot dot--lap" />Giro
        <select v-model="lapId" :disabled="!entries.length"><option v-for="e in entries" :key="e.id" :value="e.id">{{ lapLabel(e) }}</option></select>
      </label>
      <label class="analysis-pick"><span class="dot dot--ref" />Riferimento
        <select v-model="refId" :disabled="!entries.length"><option v-for="e in entries" :key="e.id" :value="e.id">{{ lapLabel(e) }}</option></select>
      </label>
      <p v-if="totalDelta !== null" class="analysis-total" :class="{ gain: totalDelta < 0, loss: totalDelta > 0 }">{{ formatDelta(totalDelta) }} s</p>
    </div>
    <p class="analysis-hint">{{ LAYOUTS.find(l => l.id === layout)?.hint }}</p>
    <p v-if="loading" class="analysis-empty" role="status">Caricamento dei giri…</p>
    <p v-else-if="error" class="analysis-empty">{{ error }}</p>
    <p v-else-if="lapId === refId && entries.length > 1" class="analysis-empty">Scegli un riferimento diverso dal giro per vedere il confronto.</p>

    <!-- CURVE: Track Titan — corner list with the time lost, the corner's racing lines and telemetry. -->
    <div v-if="lap && layout === 'curve'" class="layout-curve">
      <aside class="curve-side">
        <AnalysisMap :lap="lap" :reference="reference" :corners="corners" :cursor="cursor" :selected="selectedCorner" zoom show-reference :size="300" @hover="cursor = $event" @select="selectedCorner = $event" />
        <table class="curve-table">
          <thead><tr><th>Curva</th><th>Tempo</th><th>V. min</th></tr></thead>
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
        <AnalysisCharts :lap="lap" :reference="reference" :rows="cornerRows" :range="range" :cursor="cursor" @hover="cursor = $event" />
      </div>
    </div>

    <!-- TRACCE: MoTeC / Garage 61 — every channel stacked over the lap, the map as a guide. -->
    <div v-else-if="lap && layout === 'tracce'" class="layout-tracce">
      <aside class="tracce-side">
        <AnalysisMap :lap="lap" :reference="reference" :corners="corners" :cursor="cursor" :selected="selectedCorner" :size="240" @hover="cursor = $event" @select="selectedCorner = selectedCorner === $event ? null : $event" />
        <button type="button" class="tracce-zoom" :disabled="selectedCorner === null" @click="selectedCorner = null">Giro intero</button>
        <p class="analysis-note">Clic su un numero della mappa per ingrandire la curva.</p>
        <dl class="tracce-facts">
          <div><dt>Giro</dt><dd>{{ ms(lap.lapTimeS) }}</dd></div>
          <div v-if="reference"><dt>Riferimento</dt><dd>{{ ms(reference.lapTimeS) }}</dd></div>
          <div><dt>Lunghezza</dt><dd>{{ (lap.lengthM / 1000).toFixed(2) }} km</dd></div>
        </dl>
      </aside>
      <AnalysisCharts :lap="lap" :reference="reference" :rows="traceRows" :range="range" :cursor="cursor" @hover="cursor = $event" />
    </div>

    <!-- PILOTA: VRS — the coloured map and the three corners to work on, in plain words. -->
    <div v-else-if="lap && layout === 'pilota'" class="layout-pilota">
      <div class="pilota-map">
        <AnalysisMap :lap="lap" :reference="reference" :corners="corners" :cursor="cursor" :selected="selectedCorner" :size="460" @hover="cursor = $event" @select="selectedCorner = $event" />
        <p class="pilota-legend"><i class="g" />guadagni <i class="r" />perdi <i class="n" />uguale</p>
      </div>
      <div class="pilota-side">
        <h3>Dove migliorare</h3>
        <p v-if="!reference" class="analysis-note">Scegli un riferimento per vedere dove migliorare.</p>
        <p v-else-if="!worst.length" class="analysis-note">Nessuna curva sotto il riferimento di oltre 3 centesimi.</p>
        <button v-for="(c, i) in worst" :key="c.corner.number" type="button" class="pilota-card" :class="{ active: selectedCorner === c.corner.number }" @click="selectedCorner = c.corner.number">
          <span class="pilota-rank">{{ i + 1 }}</span>
          <span class="pilota-body"><strong>Curva {{ c.corner.number }} <em class="loss">{{ formatDelta(c.timeLostS) }} s</em></strong>{{ cornerAdvice(c) }}</span>
        </button>
        <AnalysisCharts v-if="selectedCorner !== null" :lap="lap" :reference="reference" :rows="pilotRows" :range="range" :cursor="cursor" @hover="cursor = $event" />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
// Racer Core language: dark cells, thin borders, red accent, italic display titles.
.analysis { display: grid; gap: 10px; }
.analysis-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.analysis-layouts { display: flex; gap: 3px; padding: 3px; border: 1px solid #ffffff1f; background: #0a0a0feb;
  button { height: 30px; padding: 0 16px; border: 0; background: transparent; color: #b3b3b8; font: italic 700 14px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; cursor: pointer;
    &.active { background: #ffffff14; color: #fff; box-shadow: inset 0 -2px #ff0024; } } }
.analysis-pick { display: flex; align-items: center; gap: 6px; color: #b3b3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  select { min-width: 210px; height: 32px; padding: 0 8px; border: 1px solid #ffffff2e; background: #0d0d12; color: #e6e6ea; font: 500 13px 'Inter', sans-serif; text-transform: none; } }
.dot { width: 10px; height: 3px; &--lap { background: #ff3b4f; } &--ref { background: repeating-linear-gradient(90deg, #c9c9cf 0 4px, transparent 4px 6px); } }
.analysis-total { margin: 0 0 0 auto; font: 700 20px 'Inter', sans-serif; font-variant-numeric: tabular-nums; color: #e6e6ea; &.gain { color: #3ddc5a; } &.loss { color: #ff5a6e; } }
.analysis-hint { margin: -4px 0 0; color: #77777d; font-size: 11px; }
.analysis-empty { padding: 30px 0; color: #aaa; }
.analysis-note { margin: 4px 0 0; color: #77777d; font-size: 11px; }
.gain { color: #3ddc5a; }
.loss { color: #ff5a6e; }

.layout-curve { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 12px; align-items: start; }
.curve-side { display: grid; gap: 8px; border: 1px solid #ffffff1f; background: #ffffff06; padding: 8px; }
.curve-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums;
  th { color: #8a8a90; font-weight: 700; font-size: 10px; text-transform: uppercase; text-align: left; padding: 3px 6px; border-bottom: 1px solid #ffffff1f; }
  td { padding: 4px 6px; color: #e6e6ea; small { color: #77777d; } }
  tr { cursor: pointer; &:hover td { background: #ffffff0a; } &.active td { background: #ff002426; } &.active td:first-child { box-shadow: inset 3px 0 #ff0024; } } }
.curve-main { display: grid; gap: 8px; min-width: 0; }
.curve-advice { margin: 0; padding: 8px 12px; border: 1px solid #ffffff1f; background: #ffffff08; color: #e6e6ea; font-size: 13px; font-weight: 600; }

.layout-tracce { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 12px; align-items: start; }
.tracce-side { position: sticky; top: 8px; display: grid; gap: 6px; border: 1px solid #ffffff1f; background: #ffffff06; padding: 8px; }
.tracce-zoom { height: 28px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; font-size: 12px; cursor: pointer; &:disabled { opacity: .4; cursor: default; } }
.tracce-facts { display: grid; gap: 2px; margin: 4px 0 0; font-size: 12px;
  > div { display: flex; justify-content: space-between; }
  dt { color: #8a8a90; } dd { margin: 0; color: #e6e6ea; font-variant-numeric: tabular-nums; } }

.layout-pilota { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.pilota-map { border: 1px solid #ffffff1f; background: #ffffff06; padding: 8px; }
.pilota-legend { display: flex; gap: 6px; align-items: center; margin: 4px 0 0; color: #8a8a90; font-size: 11px;
  i { width: 14px; height: 3px; margin-left: 8px; &.g { background: #3ddc5a; } &.r { background: #ff5a6e; } &.n { background: #8a8a90; } } }
.pilota-side { display: grid; gap: 8px;
  h3 { margin: 0; font: italic 700 15px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; color: #fff; } }
.pilota-card { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid #ffffff1f; background: #ffffff08; color: #e6e6ea; font-size: 13px; text-align: left; cursor: pointer;
  &.active { border-color: #ff0024; background: #ff002414; }
  strong { display: block; margin-bottom: 2px; font-size: 14px; em { font-style: normal; margin-left: 6px; } } }
.pilota-rank { display: grid; place-items: center; width: 26px; height: 26px; flex: 0 0 26px; background: #ff0024; color: #fff; font: italic 700 14px 'Racer Display', sans-serif; }
.pilota-body { display: block; }

@media (max-width: 1100px) {
  .layout-curve, .layout-tracce, .layout-pilota { grid-template-columns: 1fr; }
  .tracce-side { position: static; }
}
</style>
