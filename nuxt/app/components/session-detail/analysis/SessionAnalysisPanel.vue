<script setup lang="ts">
// PIP-618: the session "Avanzata" tab, our Track Titan. One lap ("Tu") against a
// reference from the logger's lap files (laps of this session only, read through
// Electron), in three layouts: Pilota (VRS, default), Curve (Track Titan), Tracce
// (MoTeC / Garage 61). Shared: coloured lap pickers, cursor, corner zoom.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AnalysisMap from './AnalysisMap.vue'
import AnalysisCar from './AnalysisCar.vue'
import AnalysisCharts, { type ChartRow } from './AnalysisCharts.vue'
import { compareCorners, cornerAdvice, detectCorners, formatDelta, sectorBounds } from '~/services/telemetry/lapAnalysis'
import { normalizeLapTrace, type LapTraceView } from '~/services/telemetry/lapTraceChart'
import { formatLapTime } from '~/utils/telemetryFormat'

const props = defineProps<{
  sessionToken: string | null
  laps: { lap_number: number, lap_time_ms: number | null, is_valid: boolean | null, sector_times_ms?: (number | null)[] | null }[]
}>()

type Layout = 'pilota' | 'curve' | 'tracce'
const LAYOUTS: { id: Layout, label: string, hint: string }[] = [
  { id: 'tracce', label: 'Tracce', hint: 'Tutti i canali sul giro intero, un cursore condiviso' },
  { id: 'pilota', label: 'Pilota', hint: 'La mappa colorata e le tre curve dove migliorare, in parole semplici' },
  { id: 'curve', label: 'Curve', hint: 'Il giro diviso per curve: dove perdi tempo, la traiettoria e la telemetria della curva scelta' },
]
// Per-viewer preferences: remembered, never required.
function remembered<T extends string>(key: string, values: readonly T[], fallback: T) {
  const value = ref<T>(fallback)
  onMounted(() => { try { const saved = localStorage.getItem(key) as T | null; if (saved && values.includes(saved)) value.value = saved } catch { /* default */ } })
  watch(value, v => { try { localStorage.setItem(key, v) } catch { /* Storage can be disabled. */ } })
  return value
}
// Tracce is the main view (Garage 61 + Track Titan + VRS); Pilota and Curve stay as alternatives.
const layout = remembered<Layout>('rc:analysis:layout', ['pilota', 'curve', 'tracce'], 'tracce')
const mapMode = remembered<'intera' | 'zoom'>('rc:analysis:map', ['intera', 'zoom'], 'intera')
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
  hudOverlayGetTrackEdges?: (track: string, sim: string, variant: string | null) => Promise<{ left: [number, number][], right: [number, number][] } | null>
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
// Track edges (ACC Drive _L/_R) for the maps; null on tracks without them, the map then draws the plain line.
const edges = ref<{ left: [number, number][], right: [number, number][] } | null>(null)
watch(() => lap.value ? `${lap.value.gameId}/${lap.value.track}/${lap.value.variant ?? ''}` : '', async () => {
  edges.value = null
  const current = lap.value
  if (!current) return
  try { edges.value = (await api()?.hudOverlayGetTrackEdges?.(current.track, current.gameId, current.variant)) ?? null } catch { edges.value = null }
}, { immediate: true })
const reference = computed(() => refId.value && refId.value !== lapId.value ? traces.value[refId.value] ?? null : null)
const lapEntry = computed(() => entries.value.find(e => e.id === lapId.value) ?? null)
const refEntry = computed(() => reference.value ? entries.value.find(e => e.id === refId.value) ?? null : null)
const corners = computed(() => detectCorners(reference.value ?? lap.value ?? emptyTrace()))
const comparison = computed(() => lap.value && reference.value ? compareCorners(lap.value, reference.value, corners.value) : [])
const worst = computed(() => [...comparison.value].sort((a, b) => b.timeLostS - a.timeLostS).filter(c => c.timeLostS >= 0.03).slice(0, 3))
const totalDelta = computed(() => lap.value && reference.value ? lap.value.lapTimeS - reference.value.lapTimeS : null)
// Charts aligned by track position, as MoTeC and Garage 61: the reference dot sits at the same point.
const refCursor = computed(() => cursor.value)
// Tracce: the charts fill the window height, taller when there are fewer of them.
const viewportHeight = ref(900)
function measure() { viewportHeight.value = window.innerHeight }
onMounted(() => { measure(); window.addEventListener('resize', measure) })
onBeforeUnmount(() => window.removeEventListener('resize', measure))
// Tracce: under the sticky bar the charts fill one screen (about 150 px for bar and margins).
// Heights from the five essential channels only: "Altri canali" adds rows below, never shrinks these.
const ESSENTIAL_ROWS = 5
// Tracce fills the window under the lap bar; the five essential charts fill the right column.
const traceRoot = ref<HTMLElement | null>(null)
const traceHeight = ref(600)
function measureTrace() {
  const el = traceRoot.value
  if (el) traceHeight.value = Math.max(420, Math.floor(window.innerHeight - el.getBoundingClientRect().top - 12))
}
onMounted(() => window.addEventListener("resize", measureTrace))
onBeforeUnmount(() => window.removeEventListener("resize", measureTrace))
// Same tall plots as before the window fit (user choice): the charts column scrolls on its own.
const traceRowHeight = computed(() => Math.max(80, Math.floor((viewportHeight.value - 170) / ESSENTIAL_ROWS) - 30))
// Garage 61 keeps the lap bar on the left; on a 1400 px window it would squeeze the charts,
// so it opens by default only on wide windows and folds away with a button.
const leftOpen = ref(false)
onMounted(() => { leftOpen.value = window.innerWidth >= 1700 })
watch([traceRoot, layout, leftOpen], () => nextTick(measureTrace))
// What the charts show now, and the way back to the whole lap (Garage 61 reset, Esc, double click).
const viewLabel = computed(() => zoomRange.value ? "Zoom" : selectedSector.value !== null ? `Settore ${selectedSector.value + 1}` : selectedCorner.value !== null ? `Curva ${selectedCorner.value}` : "Giro intero")
function wholeLap() { selectedCorner.value = null; selectedSector.value = null; zoomRange.value = null }
function onEscape(event: KeyboardEvent) { if (event.key === "Escape" && layout.value === "tracce") wholeLap() }
onMounted(() => window.addEventListener("keydown", onEscape))
onBeforeUnmount(() => window.removeEventListener("keydown", onEscape))
// Garage 61 sectors: the official sector times of the reference, placed on its trace.
const sectorTimes = (e: Entry | null) => e ? props.laps.find(l => l.lap_number === e.lapNumber)?.sector_times_ms ?? null : null
const sectorList = computed(() => {
  const frame = reference.value ?? lap.value
  const bounds = frame ? sectorBounds(frame, (sectorTimes(refEntry.value ?? lapEntry.value) ?? undefined) as number[] | undefined) : null
  return bounds ? bounds.slice(0, -1).map((start, index) => ({ index, start, end: bounds[index + 1]! })) : []
})
const sectorGaps = computed(() => {
  const ref = sectorTimes(refEntry.value), mine = sectorTimes(lapEntry.value)
  if (!ref || !mine || ref.length !== mine.length) return []
  return ref.map((t, i) => ({ ref: t as number, gap: (mine[i] as number) - (t as number) }))
})
const selectedSector = ref<number | null>(null)
// Tracce: a stretch zoomed with the mouse (drag, wheel) wins over the sector or the corner.
const zoomRange = ref<[number, number] | null>(null)
const range = computed<[number, number]>(() => {
  if (layout.value === 'tracce' && zoomRange.value) return zoomRange.value
  const sector = layout.value === 'tracce' && selectedSector.value !== null ? sectorList.value[selectedSector.value] : null
  if (sector) return [sector.start, sector.end]
  const corner = selectedCorner.value !== null ? corners.value[selectedCorner.value - 1] : null
  return corner ? [corner.start, corner.end] : [0, 1]
})
function selectSector(index: number) {
  selectedCorner.value = null
  selectedSector.value = selectedSector.value === index ? null : index
  zoomRange.value = null
}
function selectCorner(number: number) {
  selectedSector.value = null
  selectedCorner.value = selectedCorner.value === number && layout.value === 'tracce' ? null : number
  zoomRange.value = null
}
watch(selectedCorner, () => { zoomRange.value = null })
// The strip follows the charts' distance axis: only what is inside the shown range, in %.
function onAxis(start: number, end: number) {
  const [r0, r1] = range.value
  const span = Math.max(r1 - r0, 1e-9)
  const a = Math.max(start, r0), b = Math.min(end, r1)
  return b <= a ? null : { left: (a - r0) / span * 100, width: (b - a) / span * 100 }
}
const visibleSectors = computed(() => sectorList.value.flatMap(s => { const p = onAxis(s.start, s.end); return p ? [{ ...s, ...p }] : [] }))
const visibleCorners = computed(() => corners.value.flatMap(c => {
  const p = onAxis(c.start, c.end)
  return p ? [{ number: c.number, lost: comparison.value[c.number - 1]?.timeLostS ?? 0, ...p }] : []
}))
// VRS: corners from the costliest; heat from green (gaining) through yellow to red (losing).
const cornersByLoss = computed(() => [...comparison.value].sort((a, b) => b.timeLostS - a.timeLostS))
function heat(seconds: number) {
  if (seconds <= -0.01) return `rgba(61, 220, 90, ${Math.min(0.2 + -seconds * 2, 0.6)})`
  if (seconds < 0.01) return 'rgba(255, 255, 255, 0.06)'
  // 0.01 s yellow → 0.15 s and more red, more opaque as it grows.
  const t = Math.min((seconds - 0.01) / 0.14, 1)
  return `rgba(255, ${Math.round(200 - 140 * t)}, ${Math.round(60 - 20 * t)}, ${(0.28 + 0.37 * t).toFixed(2)})`
}
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
// One channel per chart: every chart shows only your line and the reference's.
const pedalRows: ChartRow[] = [
  { key: 'gas', title: 'Gas', unit: '%', channels: [{ name: 'throttle_pct' }], height: 60, min: 0, max: 100 },
  { key: 'brake', title: 'Freno', unit: '%', channels: [{ name: 'brake_pct' }], height: 60, min: 0, max: 100 },
]
const steerRow: ChartRow = { key: 'steer', title: 'Sterzo', channels: [{ name: 'steer_deg' }], height: 60, digits: 2 }
const gearRow: ChartRow = { key: 'gear', title: 'Marcia', channels: [{ name: 'gear' }], height: 46 }
const DEG = 57.2958
const extraRows = computed<ChartRow[]>(() => [
  ...(has('acc_lat_g') ? [{ key: 'latg', title: 'G laterale', unit: 'G', channels: [{ name: 'acc_lat_g' }], digits: 2 }, { key: 'longg', title: 'G longitudinale', unit: 'G', channels: [{ name: 'acc_long_g' }], digits: 2 }] : []),
  ...(has('slip_angle_fl') ? (['fl', 'fr', 'rl', 'rr'] as const).map(w => ({ key: `slip-${w}`, title: `Deriva gomma ${WHEEL_NAME[w]}`, unit: '°', channels: [{ name: `slip_angle_${w}`, scale: DEG }], digits: 1 })) : []),
  ...(has('susp_travel_mm_fl') ? (['fl', 'fr', 'rl', 'rr'] as const).map(w => ({ key: `susp-${w}`, title: `Sospensione ${WHEEL_NAME[w]}`, unit: 'mm', channels: [{ name: `susp_travel_mm_${w}` }] })) : []),
  ...(has('rpm') ? [{ key: 'rpm', title: 'Giri motore', channels: [{ name: 'rpm' }] }] : []),
] as ChartRow[])
const WHEEL_NAME = { fl: 'ant. sx', fr: 'ant. dx', rl: 'post. sx', rr: 'post. dx' } as const
const pilotRows = computed(() => [...deltaRow.value, speedRow, ...pedalRows])
const cornerRows = computed(() => [...deltaRow.value, speedRow, ...pedalRows, steerRow, gearRow])
// Garage 61: the delta sits under the map; the channels on the right are speed, pedals, steering, gear.
const traceRows = computed(() => [speedRow, ...pedalRows, steerRow, gearRow, ...(allChannels.value ? extraRows.value : [])])

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
      <!-- Track Titan: each lap's select wears its colour, so a colour tells which lap it is. -->
      <label class="pick pick--lap" title="Il tuo giro: azzurro in grafici e mappa"><span class="pick-name">Tu</span>
        <select v-model="lapId" :disabled="!entries.length"><option v-for="e in entries" :key="e.id" :value="e.id" :disabled="!e.complete">{{ lapLabel(e) }}</option></select>
      </label>
      <label class="pick pick--ref" title="Il giro di riferimento: ambra in grafici e mappa"><span class="pick-name">Riferimento</span>
        <select v-model="refId" :disabled="!entries.length"><option v-for="e in entries" :key="e.id" :value="e.id" :disabled="!e.complete">{{ lapLabel(e) }}</option></select>
      </label>
      <!-- The lap gap next to the pickers, in words: who is faster and by how much. -->
      <p v-if="totalDelta !== null" class="delta-badge" :class="{ gain: totalDelta < 0, loss: totalDelta > 0 }" title="Il tuo giro contro il riferimento"><span>Tu</span><strong>{{ formatDelta(totalDelta) }} s</strong><em>{{ totalDelta < 0 ? "più veloce" : totalDelta > 0 ? "più lento" : "pari" }}</em></p>
    </div>

    <p v-if="skipped" class="analysis-note">{{ skipped }} giri non leggibili esclusi.</p>
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
        <AnalysisMap :lap="lap" :reference="reference" :edges="edges" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" :zoom="mapMode === 'zoom'" :size="460" @hover="cursor = $event" @select="selectedCorner = $event" />
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
        <AnalysisMap :lap="lap" :reference="reference" :edges="edges" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" :zoom="mapMode === 'zoom'" :size="300" @hover="cursor = $event" @select="selectedCorner = $event" />
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
        <AnalysisCar :lap="lap" :reference="reference" :cursor="cursor" :ref-cursor="refCursor" />
      </aside>
      <div class="curve-main">
        <p v-if="selectedCorner !== null && comparison[selectedCorner - 1]" class="curve-advice">Curva {{ selectedCorner }} · {{ cornerAdvice(comparison[selectedCorner - 1]!) }}</p>
        <div class="curve-grid">
          <AnalysisCharts :lap="lap" :reference="reference" :rows="cornerRows" :range="range" :cursor="cursor" :ref-cursor="refCursor" @hover="cursor = $event" />
        </div>
      </div>
    </div>

    <!-- TRACCE, as the Garage 61 analyzer: laps and gaps on the left, the map with the
         lap lines and the delta in the middle, the channels on the right, sectors and corners on top of the charts. -->
    <div v-else-if="lap && layout === 'tracce'" ref="traceRoot" class="layout-tracce" :class="{ 'layout-tracce--narrow': !leftOpen }" :style="{ height: `${traceHeight}px` }">
      <aside v-if="leftOpen" class="tracce-left">
        <!-- Who is faster is already in the coloured pickers above: here only where. -->
        <section class="side-box">
          <h4>Settori</h4>
          <div v-if="sectorGaps.length" class="sector-rows">
            <button v-for="(g, i) in sectorGaps" :key="i" type="button" class="sector-row" :class="{ active: selectedSector === i }" :title="`Riferimento ${(g.ref / 1000).toFixed(3)} s · clic per ingrandire`" @click="selectSector(i)">
              <span class="sector-name">S{{ i + 1 }}</span>
              <span class="sector-time">{{ (g.ref / 1000).toFixed(3) }}</span>
              <span class="sector-gap" :style="{ background: heat(g.gap / 1000) }">{{ formatDelta(g.gap / 1000) }}</span>
            </button>
          </div>
          <p v-else class="analysis-note">Tempi dei settori non disponibili per questi giri.</p>
        </section>
        <!-- VRS: corners from the costliest; the first three carry their rank. -->
        <!-- Only corners here; the way back to the whole lap is a real button, as on the strip. -->
        <section v-if="comparison.length" class="side-box side-box--corners">
          <div class="side-head">
            <h4>Dove perdi di più</h4>
            <button v-if="viewLabel !== 'Giro intero'" type="button" class="strip-reset" title="Torna al giro intero (anche Esc)" @click="wholeLap">⟲ Giro intero</button>
          </div>
          <div class="corner-list">
            <button v-for="(c, i) in cornersByLoss" :key="c.corner.number" type="button" class="corner-row" :class="{ active: selectedCorner === c.corner.number }" :title="`Curva ${c.corner.number}`" @click="selectCorner(c.corner.number)">
              <span class="corner-num"><i v-if="i < 3 && c.timeLostS >= 0.03" class="corner-rank">{{ i + 1 }}°</i>{{ c.corner.number }}</span><span class="corner-cell" :style="{ background: heat(c.timeLostS) }">{{ formatDelta(c.timeLostS) }}</span>
            </button>
          </div>
        </section>
      </aside>
      <div class="tracce-center">
        <button type="button" class="tracce-btn tracce-toggle" @click="leftOpen = !leftOpen">{{ leftOpen ? "‹ Chiudi giri e gap" : "Giri, gap e curve ›" }}</button>
        <div class="panel">
          <AnalysisMap :lap="lap" :reference="reference" :edges="edges" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" :zoom="selectedCorner !== null" :focus="selectedSector !== null ? range : null" color-mode="laps" zoom-controls :size="320" @hover="cursor = $event" @select="selectCorner($event)" />
        </div>
        <AnalysisCharts v-if="reference" :lap="lap" :reference="reference" :rows="deltaRow" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="200" zoomable @hover="cursor = $event" @zoom="zoomRange = $event" />
      </div>
      <div class="tracce-right">
        <!-- Sectors and corners on top of the charts, aligned to their distance axis and
             sticky under the lap bar (Track Titan's segment strip, MoTeC's section bar). -->
        <div class="tracce-strip">
          <div class="strip-head">
            <span>Settori</span>
            <!-- Navigation as Garage 61 and Track Titan: every sector always there, whatever the zoom. -->
            <span v-if="sectorList.length" class="strip-nav">
              <button v-for="s in sectorList" :key="s.index" type="button" :class="{ active: selectedSector === s.index }" @click="selectSector(s.index)">S{{ s.index + 1 }}</button>
            </span>
            <button type="button" class="strip-channels" :class="{ active: allChannels }" @click="allChannels = !allChannels">{{ allChannels ? 'Solo l’essenziale' : '+ Altri canali' }}</button>
            <button v-if="viewLabel !== 'Giro intero'" type="button" class="strip-reset" title="Torna al giro intero (anche Esc o doppio clic sul grafico)" @click="wholeLap">⟲ Giro intero</button>
          </div>
          <div v-if="sectorList.length" class="strip-row">
            <button v-for="s in visibleSectors" :key="s.index" type="button" :class="{ active: selectedSector === s.index }" :style="{ left: `${s.left}%`, width: `${s.width}%` }" :title="`Settore ${s.index + 1}: clic per ingrandire, di nuovo per il giro intero`" @click="selectSector(s.index)">S{{ s.index + 1 }}</button>
          </div>
          <div class="strip-row strip-row--corners">
            <button v-for="c in visibleCorners" :key="c.number" type="button" :class="{ active: selectedCorner === c.number, gain: c.lost <= -0.01, loss: c.lost >= 0.01 }" :style="{ left: `${c.left}%`, width: `${c.width}%` }" :title="`Curva ${c.number}: ${formatDelta(c.lost)} s`" @click="selectCorner(c.number)">{{ c.number }}</button>
          </div>
        </div>
        <AnalysisCharts :lap="lap" :reference="reference" :rows="traceRows" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="traceRowHeight" zoomable @hover="cursor = $event" @zoom="zoomRange = $event" />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
// Racer Core language: dark cells, thin borders, red accent, italic display titles.
.analysis { display: grid; gap: 10px; }
// Sticky: lap pickers and layout stay in sight while the charts scroll under them.
.analysis-bar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 6px 0; background: #0b0b10f2; box-shadow: 0 8px 12px -10px #000; }
.seg { display: inline-flex; gap: 3px; padding: 3px; border: 1px solid #ffffff1f; background: #0a0a0feb;
  button { height: 30px; padding: 0 16px; border: 0; background: transparent; color: #b3b3b8; font: italic 700 14px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; cursor: pointer;
    &.active { background: #ffffff14; color: #fff; box-shadow: inset 0 -2px #ff0024; }
    &:disabled { opacity: .4; cursor: default; } }
  &--small button { height: 24px; padding: 0 10px; font: 600 11px 'Inter', sans-serif; text-transform: none; } }
// The lap pickers wear the lap colour (Track Titan): blue for you, amber for the reference.
.pick { --c: #38bdf8; display: flex; align-items: stretch; height: 34px; border: 1px solid var(--c); background: color-mix(in srgb, var(--c) 14%, #0a0a0f);
  &--ref { --c: #fbbf24; }
  .pick-name { display: grid; place-items: center; padding: 0 10px; background: var(--c); color: #0a0a0f; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; }
  select { min-width: 220px; height: 100%; padding: 0 8px; border: 0; background: transparent; color: #fff; font: 600 13px 'Inter', sans-serif; option { background: #0d0d12; color: #e6e6ea; } } }
.delta-badge { display: flex; align-items: baseline; gap: 6px; height: 34px; margin: 0; padding: 0 10px; border: 1px solid #ffffff2e; background: #ffffff08; line-height: 34px; color: #e6e6ea;
  span { color: #8a8a90; font: 700 11px 'Inter', sans-serif; text-transform: uppercase; }
  strong { font: 700 17px 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
  em { font-style: normal; font-size: 12px; color: #b3b3b8; }
  &.gain { border-color: #3ddc5a66; strong { color: #3ddc5a; } }
  &.loss { border-color: #ff5a6e66; strong { color: #ff5a6e; } } }
.analysis-empty { padding: 30px 0; color: #aaa; }
.analysis-note { margin: 4px 0 0; color: #77777d; font-size: 11px; }
.gain { color: #3ddc5a; }
.loss { color: #ff5a6e; }
.panel { display: grid; gap: 8px; border: 1px solid #ffffff1f; background: #ffffff06; padding: 8px; align-content: start; }
.panel-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
.map-legend { display: flex; gap: 5px; align-items: center; color: #8a8a90; font-size: 11px;
  i { width: 14px; height: 3px; margin-left: 6px; &.g { background: #3ddc5a; } &.r { background: #ff5a6e; } &.n { background: #8a8a90; } } }

.layout-pilota { display: grid; grid-template-columns: minmax(0, 460px) minmax(0, 1fr); gap: 12px; align-items: start; }
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
.curve-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; align-items: start; }
.curve-advice { margin: 0; padding: 8px 12px; border: 1px solid #ffffff1f; background: #ffffff08; color: #e6e6ea; font-size: 13px; font-weight: 600; }

// Garage 61 analyzer: left bar, map + delta in the middle, channels on the right, sector strip on top of the charts.
.layout-tracce { display: grid; grid-template-columns: 210px 320px minmax(0, 1fr); grid-template-areas: 'left center right';
  &--narrow { grid-template-columns: 320px minmax(0, 1fr); grid-template-areas: 'center right'; } gap: 10px; align-items: stretch; overflow: hidden; }
// Left column: three boxes with air between them (Garage 61 Laps/Gaps, VRS corners).
// Tracce fills the window: the page does not scroll, each column scrolls on its own.
.tracce-left { grid-area: left; display: flex; flex-direction: column; gap: 10px; height: 100%; overflow-y: auto; overflow-x: hidden; }
.side-box { display: grid; gap: 8px; padding: 10px; border: 1px solid #ffffff1f; background: #ffffff06;
  h4 { margin: 0 0 2px; color: #fff; font: italic 700 14px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: .02em;
    small { color: #77777d; font: 500 10px 'Inter', sans-serif; text-transform: none; margin-left: 4px; } }
  // The corner list reaches the bottom of the column, level with the delta; on a very tall
  // window it stops at a maximum height and scrolls inside.
  &--corners { flex: 1 1 auto; min-height: 160px; max-height: 760px; grid-template-rows: auto minmax(0, 1fr); } }
.side-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; h4 { margin: 0; } }
.sector-rows { display: grid; gap: 3px; }
.sector-row { display: grid; grid-template-columns: 30px 1fr 1fr; gap: 3px; padding: 0; border: 0; background: none; cursor: pointer; font-variant-numeric: tabular-nums;
  &.active .sector-name { background: #ff0024; color: #fff; } }
.sector-name { display: grid; place-items: center; padding: 5px 0; background: #ffffff0d; color: #e6e6ea; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; }
.sector-time { display: grid; place-items: center; background: #ffffff08; color: #b3b3b8; font: 600 12px 'Inter', sans-serif; }
.sector-gap { display: grid; place-items: center; color: #fff; font: 700 12px 'Inter', sans-serif; }
.corner-rank { position: absolute; top: 1px; left: 2px; color: #ffd43b; font: 700 8px 'Inter', sans-serif; font-style: normal; }
// One corner per row, the section scrolls on its own when the list is longer than the column.
.corner-list { display: grid; gap: 3px; align-content: start; min-height: 0; overflow-y: auto; padding-right: 2px; }
.corner-row { display: grid; grid-template-columns: 40px 1fr; gap: 3px; padding: 0; border: 0; background: none; cursor: pointer; text-align: center;
  &.active .corner-num { background: #ff0024; color: #fff; }
  &.active .corner-cell { box-shadow: inset 0 0 0 1px #ff0024; } }
.corner-num { position: relative; display: grid; place-items: center; padding: 3px 0; background: #ffffff0d; color: #e6e6ea; font: italic 700 15px 'Racer Display', 'Arial Narrow', sans-serif; }
.corner-cell { display: grid; place-items: center; color: #fff; font: 700 12px 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
.tracce-center { grid-area: center; display: grid; gap: 8px; align-content: start; height: 100%; overflow-y: auto; overflow-x: hidden; }
.tracce-toggle { justify-self: start; padding: 0 10px; }
.tracce-right { grid-area: right; min-width: 0; height: 100%; overflow-y: auto; overflow-x: hidden; }
// Sector and corner strip: sticky under the lap bar, aligned to the plot area (42 px axis, 8 px right).
.strip-head { display: flex; align-items: center; gap: 10px; height: 20px; margin-left: -34px; color: #b3b3b8; font: 700 11px "Inter", sans-serif; text-transform: uppercase; letter-spacing: .04em; }
.strip-nav { display: flex; gap: 3px;
  button { height: 20px; min-width: 30px; padding: 0 6px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; font: 700 11px "Inter", sans-serif; text-transform: none; cursor: pointer; &.active { border-color: #ff0024; background: #ff002433; color: #fff; } } }
.strip-channels { margin-left: auto; height: 20px; padding: 0 8px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; font: 700 11px "Inter", sans-serif; text-transform: none; letter-spacing: 0; cursor: pointer; &.active { border-color: #ff0024; } }
.strip-reset { height: 20px; padding: 0 8px; border: 1px solid #ff0024; background: #ff00241f; color: #fff; font: 700 11px "Inter", sans-serif; text-transform: none; cursor: pointer; }
.tracce-strip { position: sticky; top: 0; z-index: 4; display: grid; gap: 2px; margin-bottom: 6px; padding: 4px 9px 4px 43px; background: #0b0b10f2; box-shadow: 0 8px 10px -10px #000; }
.strip-row { position: relative; height: 24px;
  button { position: absolute; top: 0; height: 100%; padding: 0; border: 1px solid #0b0b10; background: #ffffff14; color: #e6e6ea; font: 700 12px 'Inter', sans-serif; cursor: pointer; overflow: hidden;
    &:hover { background: #ffffff26; }
    &.active { background: #ffffff33; color: #fff; box-shadow: inset 0 -2px #ff0024; } }
  &--corners { height: 18px;
    button { background: #ffffff0a; color: #b3b3b8; font-size: 10px; &.gain { color: #3ddc5a; } &.loss { color: #ff5a6e; } } } }
.sq { display: inline-block; width: 10px; height: 10px; flex: 0 0 10px; &--lap { background: #38bdf8; } &--ref { background: #fbbf24; } }
.tracce-btn { height: 28px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; font-size: 12px; cursor: pointer; &.active { border-color: #ff0024; } }

@media (max-width: 1100px) {
  .layout-curve, .layout-tracce, .layout-pilota, .curve-grid { grid-template-columns: 1fr; }
  .layout-tracce, .layout-tracce--narrow { grid-template-areas: "left" "center" "right"; }
  .tracce-left, .tracce-center { position: static; }
}
</style>
