<script setup lang="ts">
// PIP-618: the session "Avanzata" tab, our Track Titan. One lap ("Tu") against a
// reference from the logger's lap files (laps of this session only, read through
// Electron), in two layouts: Tracce (MoTeC / Garage 61, default) to see why, Pilota
// (VRS) to know what to do, in words. Shared: coloured lap pickers, cursor, corner zoom.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AnalysisMap from './AnalysisMap.vue'
import AnalysisCar from './AnalysisCar.vue'
import AnalysisCharts, { type ChartRow } from './AnalysisCharts.vue'
import SharedLapPanel, { type SharedLapLoaded } from './SharedLapPanel.vue'
import { electronLapSource, listOwnLaps, pilotLapSource, type LapOrigin, type LapSource, type LocalLapBridge } from '~/services/telemetry/lapSources'
import { LapsArchiveError } from '~/services/telemetry/lapsArchiveClient'
import { lapShareErrorMessage } from '~/services/telemetry/lapShareLink'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { compareCorners, cornerAdvice, detectCorners, formatDelta, sectorBounds } from '~/services/telemetry/lapAnalysis'
import { normalizeLapTrace, type LapTraceView } from '~/services/telemetry/lapTraceChart'
import { formatLapTime } from '~/utils/telemetryFormat'

const props = defineProps<{
  sessionToken: string | null
  laps: { lap_number: number, lap_time_ms: number | null, is_valid: boolean | null, sector_times_ms?: (number | null)[] | null }[]
  /** Lap to open as "Tu", when the driver picked it in the Sessione table. */
  initialLap?: number | null
  /** PIP-623: coach view of a linked pilot: the laps come from the online archive. */
  pilotUid?: string | null
  /** PIP-623: someone else's session opened by link: never read this PC's laps for it. */
  foreign?: boolean
}>()

type Layout = 'pilota' | 'tracce'
const LAYOUTS: { id: Layout, label: string, hint: string }[] = [
  { id: 'tracce', label: 'Avanzata', hint: 'Tutti i canali sul giro, settori e curve: per capire perché' },
  { id: 'pilota', label: 'Semplice', hint: 'La mappa colorata e le tre curve dove migliorare, in parole semplici' },
]
// Per-viewer preferences: remembered, never required.
function remembered<T extends string>(key: string, values: readonly T[], fallback: T) {
  const value = ref<T>(fallback)
  onMounted(() => { try { const saved = localStorage.getItem(key) as T | null; if (saved && values.includes(saved)) value.value = saved } catch { /* default */ } })
  watch(value, v => { try { localStorage.setItem(key, v) } catch { /* Storage can be disabled. */ } })
  return value
}
// Tracce is the main view (Garage 61 + Track Titan + VRS); Pilota and Curve stay as alternatives.
const layout = remembered<Layout>('rc:analysis:layout', ['pilota', 'tracce'], 'tracce')
const allChannels = ref(false)

// PIP-623: every lap carries its origin. Only laps of the shown session ("local" on the PC,
// "pilot" from the archive in coach view) can be "Tu" and have sector times; "own" (the
// coach's laps) and "shared" (a pasted link) are references only.
interface Entry { id: string, lapNumber: number, lapTimeMs: number, valid: boolean, complete: boolean, origin: LapOrigin, sessionToken: string, label?: string }
const entries = ref<Entry[]>([])
const traces = ref<Record<string, LapTraceView>>({})
const lapId = ref(''), refId = ref('')
const loading = ref(false), error = ref('')
const cursor = ref<number | null>(null)
const selectedCorner = ref<number | null>(null)
const skipped = ref(0)

interface LapTraceApi extends LocalLapBridge {
  shareLapTrace?: (id: string) => Promise<{ link: string, shareId: string }>
  hudOverlayGetTrackEdges?: (track: string, sim: string, variant: string | null) => Promise<{ left: [number, number][], right: [number, number][] } | null>
}
function api(): LapTraceApi | null {
  return typeof window === 'undefined' ? null : (window as Window & { electronAPI?: LapTraceApi }).electronAPI ?? null
}
const { currentUser } = useFirebaseAuth()
const archiveDeps = { getToken: async () => (await currentUser.value?.getIdToken()) ?? null }
// Each load gets a generation: a late answer for another session or pilot never replaces the current one.
let loadGeneration = 0
async function load() {
  const generation = ++loadGeneration
  const isCurrent = () => generation === loadGeneration
  const token = props.sessionToken
  const pilot = props.pilotUid || null
  loading.value = false
  error.value = ''
  entries.value = []
  traces.value = {}
  skipped.value = 0
  sharedWarning.value = ''
  if (!token) { error.value = 'Questa sessione non ha giri registrati sul computer.'; return }
  if (props.foreign && !pilot) { error.value = 'I giri di questa sessione restano sul PC di chi ha guidato: per confrontarti chiedi un link con "Condividi giro".'; return }
  const bridge = api()
  let source: LapSource
  if (pilot) source = pilotLapSource(pilot, archiveDeps)
  else {
    if (typeof bridge?.listLapTraces !== 'function' || typeof bridge.readLapTrace !== 'function') { error.value = 'L’analisi dei giri è disponibile nel programma Racer Core.'; return }
    source = electronLapSource(bridge)
  }
  loading.value = true
  try {
    const list = await source.list(token)
    if (!isCurrent()) return
    const valid = new Map(props.laps.map(l => [l.lap_number, l.is_valid === true]))
    // All laps of the session at once (about 120 KB each): a lap that cannot be read
    // (pruned meanwhile, damaged) is left out here, never on a later click.
    const readOne = async (d: (typeof list)[number]): Promise<{ trace: LapTraceView, entry: Entry } | null> => {
      try {
        const trace = normalizeLapTrace(await source.read(d))
        return trace ? { trace, entry: { id: d.id, lapNumber: d.lapNumber, lapTimeMs: d.lapTimeMs, valid: d.valid ?? valid.get(d.lapNumber) ?? false, complete: trace.complete, origin: d.origin, sessionToken: d.sessionToken } } : null
      } catch { return null }
    }
    // Laps on the PC are read together; from the archive one at a time, stopping if the view changed.
    let read: ({ trace: LapTraceView, entry: Entry } | null)[] = []
    if (pilot) {
      for (const d of list) {
        if (!isCurrent()) return
        read.push(await readOne(d))
      }
    } else read = await Promise.all(list.map(readOne))
    if (!isCurrent()) return
    const ok = read.filter((r): r is { trace: LapTraceView, entry: Entry } => r !== null)
    skipped.value = list.length - ok.length
    traces.value = Object.fromEntries(ok.map(r => [r.entry.id, r.trace]))
    entries.value = ok.map(r => r.entry).sort((a, b) => a.lapNumber - b.lapNumber)
    // A partial lap (logger started mid-lap, out-lap) covers only part of the track:
    // stretched on the whole lap it would compare different places. Listed, not usable.
    const usable = entries.value.filter(e => e.complete)
    if (!usable.length) {
      error.value = pilot
        ? 'Nessun giro di questa sessione nell’archivio online: arrivano quando il pilota guida con Racer Core aggiornato.'
        : entries.value.length ? 'Ci sono solo giri parziali in questa sessione: servono giri completi, partiti dal traguardo.' : 'Nessun giro registrato per questa sessione: le analisi arrivano dai giri guidati con Racer Core attivo.'
      return
    }
    // Default as Track Titan: your best valid lap is the reference, the last lap the one to study.
    const best = [...usable].filter(e => e.valid).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? usable[0]!
    const other = [...usable].reverse().find(e => e.id !== best.id) ?? best
    // A lap picked in the Sessione table is "Tu"; the reference stays the best (or the next one).
    const picked = props.initialLap ? usable.find(e => e.lapNumber === props.initialLap) : undefined
    if (picked) {
      lapId.value = picked.id
      refId.value = picked.id !== best.id ? best.id : ([...usable].filter(e => e.valid && e.id !== picked.id).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? usable.find(e => e.id !== picked.id) ?? best).id
    } else {
      refId.value = best.id
      lapId.value = other.id
    }
    // Coach view: the coach's own laps on the same track and car, as possible references.
    const first = traces.value[usable[0]!.id]
    if (pilot && bridge && first) void loadOwnLaps(generation, bridge, first.track, first.car)
  } catch (e) {
    if (isCurrent()) error.value = e instanceof LapsArchiveError ? e.message : 'Impossibile leggere i giri di questa sessione.'
  } finally {
    if (isCurrent()) loading.value = false
  }
}

async function loadOwnLaps(generation: number, bridge: LapTraceApi, track: string, car: string) {
  try {
    const own = (await listOwnLaps(bridge, track, car)).slice(0, 10)
    const read = await Promise.all(own.map(async (d): Promise<{ trace: LapTraceView, entry: Entry } | null> => {
      try {
        const trace = normalizeLapTrace(await bridge.readLapTrace!(d.id.replace(/^own:/, '')))
        return trace?.complete ? { trace, entry: { id: d.id, lapNumber: d.lapNumber, lapTimeMs: d.lapTimeMs, valid: trace.valid === true, complete: true, origin: 'own' as const, sessionToken: d.sessionToken, label: `Mio · Giro ${d.lapNumber} · ${formatLapTime(d.lapTimeMs)}` } } : null
      } catch { return null }
    }))
    if (generation !== loadGeneration) return
    const ok = read.filter((r): r is { trace: LapTraceView, entry: Entry } => r !== null)
    traces.value = { ...traces.value, ...Object.fromEntries(ok.map(r => [r.entry.id, r.trace])) }
    entries.value = [...entries.value, ...ok.map(r => r.entry).sort((a, b) => a.lapTimeMs - b.lapTimeMs)]
  } catch { /* the coach's own laps are an extra: the pilot's laps stay usable */ }
}

// PIP-623: a lap shared with a link becomes the reference (one at a time).
const showShared = ref(false)
const sharedWarning = ref('')
function onSharedLoaded(shared: SharedLapLoaded) {
  traces.value = { ...traces.value, [shared.id]: shared.trace }
  entries.value = [...entries.value.filter(e => e.origin !== 'shared'), {
    id: shared.id, lapNumber: shared.lapNumber, lapTimeMs: shared.lapTimeMs, valid: true, complete: shared.trace.complete,
    origin: 'shared', sessionToken: '', label: shared.label,
  }]
  refId.value = shared.id
  sharedWarning.value = shared.carMismatch ? 'Auto diversa dalla tua: il confronto è indicativo.' : ''
  showShared.value = false
}

// PIP-623: "Condividi giro": the selected lap goes online (if not yet) and its link is copied.
const shareState = ref<'idle' | 'busy' | 'copied' | 'error'>('idle')
const shareMessage = ref('')
let shareTimer: ReturnType<typeof setTimeout> | null = null
const canShare = computed(() => !props.pilotUid && typeof api()?.shareLapTrace === 'function'
  && lapEntry.value?.origin === 'local' && lapEntry.value.complete && lapEntry.value.valid)
const shareHint = computed(() => props.pilotUid ? '' : lapEntry.value && !lapEntry.value.valid ? 'Si condividono solo giri validi' : 'Copia il link di questo giro: chi lo riceve lo usa come riferimento')
async function shareLap() {
  const id = lapId.value
  if (!canShare.value || shareState.value === 'busy') return
  shareState.value = 'busy'
  shareMessage.value = ''
  try {
    const result = await api()!.shareLapTrace!(id)
    await navigator.clipboard.writeText(result.link)
    shareState.value = 'copied'
    shareMessage.value = 'Link copiato: mandalo a chi vuoi.'
  } catch (error) {
    shareState.value = 'error'
    shareMessage.value = lapShareErrorMessage(error)
  }
  if (shareTimer) clearTimeout(shareTimer)
  shareTimer = setTimeout(() => { shareState.value = 'idle'; shareMessage.value = '' }, 4000)
}
onBeforeUnmount(() => { if (shareTimer) clearTimeout(shareTimer) })
watch(() => [props.sessionToken, props.pilotUid], () => { void load() })
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
// The delta under the map grows down to the same bottom as the corner list on the left
// (or the bottom of Tracce when that column is closed), so the three columns end level.
const cornersBox = ref<HTMLElement | null>(null)
const deltaWrap = ref<HTMLElement | null>(null)
const deltaHeight = ref(200)
function measureDelta() {
  const wrap = deltaWrap.value, root = traceRoot.value
  if (!wrap || !root) return
  const bottom = cornersBox.value?.getBoundingClientRect().bottom ?? root.getBoundingClientRect().top + traceHeight.value
  const box = wrap.getBoundingClientRect()
  // Header, distance axis and padding around the plot stay as they are: only the plot grows.
  const chrome = box.height - deltaHeight.value
  deltaHeight.value = Math.max(120, Math.floor(bottom - box.top - chrome) - 1)
  // Safety net: if the column still overflows (layout not settled at the first measure),
  // take the excess off the plot, so the centre column never needs its scrollbar.
  nextTick(() => {
    const column = deltaWrap.value?.parentElement
    const over = column ? column.scrollHeight - column.clientHeight : 0
    if (over > 0) deltaHeight.value = Math.max(120, deltaHeight.value - over)
  })
}
// The left column settles after the laps load (sectors, corner list): measure again when
// it or the frame changes size, not only on window resize.
let resizeObserver: ResizeObserver | null = null
watch([traceRoot, cornersBox], elements => {
  resizeObserver?.disconnect()
  if (typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => measureDelta())
  elements.forEach(el => { if (el) resizeObserver!.observe(el) })
})
onBeforeUnmount(() => resizeObserver?.disconnect())
function measureTrace() {
  const el = traceRoot.value
  if (!el) return
  traceHeight.value = Math.max(420, Math.floor(window.innerHeight - el.getBoundingClientRect().top - 12))
  nextTick(() => {
    // Padding and margins below the panel (page, layout) can still push the page a few
    // pixels past the window: take them off, so the page itself never scrolls.
    let page: Element | null = el.parentElement
    while (page && page !== document.documentElement && !/(auto|scroll)/.test(getComputedStyle(page).overflowY)) page = page.parentElement
    page ??= document.scrollingElement
    const extra = page ? page.scrollHeight - page.clientHeight : 0
    if (extra > 0) traceHeight.value = Math.max(420, traceHeight.value - extra)
    nextTick(measureDelta)
  })
}
onMounted(() => window.addEventListener("resize", measureTrace))
onBeforeUnmount(() => window.removeEventListener("resize", measureTrace))
// Same tall plots as before the window fit (user choice): the charts column scrolls on its own.
const traceRowHeight = computed(() => Math.max(80, Math.floor((viewportHeight.value - 170) / ESSENTIAL_ROWS) - 30))
// Garage 61 keeps the lap bar on the left, always open: sectors and corners say where to look.
watch([traceRoot, layout, reference], () => nextTick(measureTrace))
// What the charts show now, and the way back to the whole lap (Garage 61 reset, Esc, double click).
const viewLabel = computed(() => zoomRange.value ? "Zoom" : selectedSector.value !== null ? `Settore ${selectedSector.value + 1}` : selectedCorner.value !== null ? `Curva ${selectedCorner.value}` : "Giro intero")
function wholeLap() { selectedCorner.value = null; selectedSector.value = null; zoomRange.value = null }
function onEscape(event: KeyboardEvent) { if (event.key === "Escape" && layout.value === "tracce") wholeLap() }
onMounted(() => window.addEventListener("keydown", onEscape))
onBeforeUnmount(() => window.removeEventListener("keydown", onEscape))
// Garage 61 sectors: the official sector times of the reference, placed on its trace.
// Sector times exist only for laps of the shown session (not for "own" or "shared" references).
const sectorTimes = (e: Entry | null) => e && (e.origin === 'local' || e.origin === 'pilot') && e.sessionToken === props.sessionToken
  ? props.laps.find(l => l.lap_number === e.lapNumber)?.sector_times_ms ?? null
  : null
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
// Diverging scale as VRS: red where you lose, green where you gain, the same red and green as
// the map and the delta. The strength follows the seconds on a fixed scale (full at 0.15 s), so
// a 2-hundredths corner never looks like a disaster and a bad lap can be red all over.
function heat(seconds: number) {
  if (Math.abs(seconds) < 0.01) return 'rgba(255, 255, 255, 0.06)'
  const strength = (0.18 + 0.5 * Math.min((Math.abs(seconds) - 0.01) / 0.14, 1)).toFixed(2)
  return seconds > 0 ? `rgba(255, 90, 110, ${strength})` : `rgba(61, 220, 90, ${strength})`
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
// Semplice: the four corner charts share the window under the three tips, never below 80 px.
const pilotRowHeight = computed(() => Math.max(80, Math.floor((traceHeight.value - 230) / 4) - 40))
// Garage 61: the delta sits under the map; the channels on the right are speed, pedals, steering, gear.
const traceRows = computed(() => [speedRow, ...pedalRows, steerRow, gearRow, ...(allChannels.value ? extraRows.value : [])])

const lapLabel = (e: Entry) => e.label ?? `Giro ${e.lapNumber} · ${formatLapTime(e.lapTimeMs)}${e.complete ? '' : ' · parziale'}${e.valid ? '' : ' · invalido'}`
const sessionEntries = computed(() => entries.value.filter(e => e.origin === 'local' || e.origin === 'pilot'))
const ownEntries = computed(() => entries.value.filter(e => e.origin === 'own'))
const sharedEntries = computed(() => entries.value.filter(e => e.origin === 'shared'))
const short = (e: Entry | null) => e ? `Giro ${e.lapNumber} · ${formatLapTime(e.lapTimeMs)}` : '--'
const ms = (s: number | null | undefined) => typeof s === 'number' ? formatLapTime(s * 1000) : '--'
</script>

<template>
  <section class="analysis">
    <div class="analysis-bar">
      <!-- Track Titan: each lap's select wears its colour, so a colour tells which lap it is. -->
      <label class="pick pick--lap" title="Il tuo giro: azzurro in grafici e mappa"><span class="pick-name">Tu</span>
        <select v-model="lapId" :disabled="!sessionEntries.length"><option v-for="e in sessionEntries" :key="e.id" :value="e.id" :disabled="!e.complete">{{ lapLabel(e) }}</option></select>
      </label>
      <label class="pick pick--ref" title="Il giro di riferimento: ambra in grafici e mappa"><span class="pick-name">Riferimento</span>
        <select v-model="refId" :disabled="!entries.length">
          <optgroup :label="pilotUid ? 'Giri del pilota' : 'Questa sessione'"><option v-for="e in sessionEntries" :key="e.id" :value="e.id" :disabled="!e.complete">{{ lapLabel(e) }}</option></optgroup>
          <optgroup v-if="ownEntries.length" label="I miei giri"><option v-for="e in ownEntries" :key="e.id" :value="e.id">{{ lapLabel(e) }}</option></optgroup>
          <optgroup v-if="sharedEntries.length" label="Condiviso"><option v-for="e in sharedEntries" :key="e.id" :value="e.id">{{ lapLabel(e) }}</option></optgroup>
        </select>
      </label>
      <!-- The lap gap next to the pickers, in words: who is faster and by how much. -->
      <!-- PIP-623: a lap from another pilot as reference, by link. -->
      <button v-if="entries.length" type="button" class="bar-btn" :class="{ active: showShared }" title="Incolla il link di un giro ricevuto: diventa il riferimento" @click="showShared = !showShared">+ Giro di un altro pilota</button>
      <p v-if="totalDelta !== null" class="delta-badge" :class="{ gain: totalDelta < 0, loss: totalDelta > 0 }" title="Il tuo giro contro il riferimento"><span>Tu</span><strong>{{ formatDelta(totalDelta) }} s</strong><em>{{ totalDelta < 0 ? "più veloce" : totalDelta > 0 ? "più lento" : "pari" }}</em></p>
      <button v-if="!pilotUid && api()?.shareLapTrace" type="button" class="bar-btn" :class="{ copied: shareState === 'copied', failed: shareState === 'error' }"
        :disabled="!canShare || shareState === 'busy'" :title="shareHint" @click="shareLap">{{ shareState === 'busy' ? 'Condivido…' : shareState === 'copied' ? 'Link copiato' : 'Condividi giro' }}</button>
      <span v-if="shareMessage" class="bar-note" :class="{ failed: shareState === 'error' }" role="status">{{ shareMessage }}</span>
      <!-- What you look at on the left (laps and gap), how you look at it on the right,
           under the Sessione / Telemetria switch: page, then view. -->
      <div class="seg seg--views" role="tablist" aria-label="Layout dell’analisi">
        <button v-for="l in LAYOUTS" :key="l.id" type="button" role="tab" :aria-selected="layout === l.id" :class="{ active: layout === l.id }" :title="l.hint" @click="layout = l.id">{{ l.label }}</button>
      </div>
    </div>
    <SharedLapPanel v-if="showShared" :current="lap" :deps="archiveDeps" @loaded="onSharedLoaded" @close="showShared = false" />
    <p v-if="sharedWarning && refEntry?.origin === 'shared'" class="analysis-note analysis-note--warn">{{ sharedWarning }}</p>

    <p v-if="skipped" class="analysis-note">{{ skipped }} giri non leggibili esclusi.</p>
    <p v-if="loading" class="analysis-empty" role="status">Caricamento dei giri…</p>
    <p v-else-if="error" class="analysis-empty">{{ error }}</p>
    <p v-else-if="lapId === refId && entries.length > 1" class="analysis-empty">Scegli un riferimento diverso dal tuo giro per vedere il confronto.</p>

    <!-- SEMPLICE (VRS): the coloured map and the three corners to work on, in plain words,
         with the same frame as Avanzata: it fills the window and each column scrolls on its own. -->
    <div v-if="lap && layout === 'pilota'" ref="traceRoot" class="layout-pilota" :style="{ height: `${traceHeight}px` }">
      <div class="pilota-left">
        <div class="panel">
          <span v-if="reference" class="map-legend"><i class="g" />guadagni <i class="r" />perdi <i class="n" />uguale</span>
          <AnalysisMap :lap="lap" :reference="reference" :edges="edges" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" zoom-controls :size="440" @hover="cursor = $event" @select="selectedCorner = $event" />
        </div>
        <AnalysisCar :lap="lap" :reference="reference" :cursor="cursor" :ref-cursor="refCursor" />
      </div>
      <div class="pilota-right">
        <section class="side-box">
          <h4>Dove migliorare</h4>
          <p v-if="!reference" class="analysis-note">Scegli un riferimento per vedere dove migliorare.</p>
          <p v-else-if="!worst.length" class="analysis-note">Nessuna curva sotto il riferimento di oltre 3 centesimi.</p>
          <div v-else class="tip-list">
            <button v-for="(c, i) in worst" :key="c.corner.number" type="button" class="tip-row" :class="{ active: selectedCorner === c.corner.number }" @click="selectedCorner = c.corner.number">
              <span class="tip-rank">{{ i + 1 }}</span>
              <span class="tip-corner">Curva {{ c.corner.number }}</span>
              <span class="tip-gap" :style="{ background: heat(c.timeLostS) }">{{ formatDelta(c.timeLostS) }}</span>
              <span class="tip-text">{{ cornerAdvice(c) }}</span>
            </button>
          </div>
        </section>
        <AnalysisCharts v-if="selectedCorner !== null" :lap="lap" :reference="reference" :rows="pilotRows" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="pilotRowHeight" zoomable @hover="cursor = $event" @zoom="zoomRange = $event" />
      </div>
    </div>

    <!-- TRACCE, as the Garage 61 analyzer: laps and gaps on the left, the map with the
         lap lines and the delta in the middle, the channels on the right, sectors and corners on top of the charts. -->
    <div v-else-if="lap && layout === 'tracce'" ref="traceRoot" class="layout-tracce" :style="{ height: `${traceHeight}px` }">
      <aside class="tracce-left">
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
        <section v-if="comparison.length" ref="cornersBox" class="side-box side-box--corners">
          <div class="side-head">
            <h4>Dove perdi di più</h4>
            <button v-if="viewLabel !== 'Giro intero'" type="button" class="strip-reset" title="Torna al giro intero (anche Esc)" @click="wholeLap">⟲ Giro intero</button>
          </div>
          <!-- Column heads as in the Curve table: the rows are corners, the cell the time lost there. -->
          <div class="corner-row corner-row--head" aria-hidden="true"><span>Curva</span><span>Tempo perso</span></div>
          <div class="corner-list">
            <button v-for="c in cornersByLoss" :key="c.corner.number" type="button" class="corner-row" :class="{ active: selectedCorner === c.corner.number }" :title="`Curva ${c.corner.number} · velocità minima ${c.lapMinKmh?.toFixed(0) ?? '--'} / ${c.refMinKmh?.toFixed(0) ?? '--'} km/h (tu / rif.) · ${cornerAdvice(c)}`" @click="selectCorner(c.corner.number)">
              <span class="corner-num">{{ c.corner.number }}</span><span class="corner-cell" :style="{ background: heat(c.timeLostS) }">{{ formatDelta(c.timeLostS) }}</span>
            </button>
          </div>
        </section>
      </aside>
      <div class="tracce-center">
        <div class="panel">
          <AnalysisMap :lap="lap" :reference="reference" :edges="edges" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" :zoom="selectedCorner !== null" :focus="selectedSector !== null ? range : null" color-mode="laps" zoom-controls :size="320" @hover="cursor = $event" @select="selectCorner($event)" />
        </div>
        <div v-if="reference" ref="deltaWrap">
          <AnalysisCharts :lap="lap" :reference="reference" :rows="deltaRow" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="deltaHeight" zoomable @hover="cursor = $event" @zoom="zoomRange = $event" />
        </div>
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
.seg--views { margin-left: auto; }
// PIP-623: share and paste, square buttons as tall as the pickers.
.bar-btn { height: 38px; padding: 0 12px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; font: 700 12px 'Inter', sans-serif; cursor: pointer;
  &:hover:not(:disabled), &.active { border-color: #fbbf24; }
  &:disabled { opacity: .45; cursor: default; }
  &.copied { border-color: #3ddc5a; color: #3ddc5a; }
  &.failed { border-color: #ff5a6e; } }
.bar-note { color: #3ddc5a; font-size: 12px; &.failed { color: #ff5a6e; } }
.analysis-note--warn { color: #fbbf24; }
.seg { display: inline-flex; gap: 3px; padding: 3px; border: 1px solid #ffffff1f; background: #0a0a0feb;
  button { height: 30px; padding: 0 16px; border: 0; background: transparent; color: #b3b3b8; font: italic 700 14px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; cursor: pointer;
    &.active { background: #ffffff14; color: #fff; box-shadow: inset 0 -2px #ff0024; }
    &:disabled { opacity: .4; cursor: default; } }
  &--small button { height: 24px; padding: 0 10px; font: 600 11px 'Inter', sans-serif; text-transform: none; } }
// The lap pickers wear the lap colour (Track Titan): blue for you, amber for the reference.
.pick { --c: #38bdf8; display: flex; align-items: stretch; height: 38px; border: 1px solid var(--c); background: color-mix(in srgb, var(--c) 14%, #0a0a0f);
  &--ref { --c: #fbbf24; }
  .pick-name { display: grid; place-items: center; padding: 0 10px; background: var(--c); color: #0a0a0f; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; }
  select { min-width: 220px; height: 100%; padding: 0 8px; border: 0; background: transparent; color: #fff; font: 600 13px 'Inter', sans-serif; option { background: #0d0d12; color: #e6e6ea; } } }
.delta-badge { display: flex; align-items: baseline; gap: 6px; height: 38px; margin: 0; padding: 0 10px; border: 1px solid #ffffff2e; background: #ffffff08; line-height: 38px; color: #e6e6ea;
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

.layout-pilota { display: grid; grid-template-columns: 440px minmax(0, 1fr); gap: 10px; overflow: hidden; }
.pilota-left, .pilota-right { display: grid; gap: 10px; align-content: start; min-width: 0; height: 100%; overflow-y: auto; overflow-x: hidden; }
.tip-list { display: grid; gap: 3px; }
// One tip per row as the corner list of Avanzata: rank, corner, time lost on the red/green scale, the advice.
.tip-row { display: grid; grid-template-columns: 26px 74px 64px minmax(0, 1fr); gap: 3px; padding: 0; border: 0; background: none; color: #e6e6ea; text-align: left; cursor: pointer;
  &.active .tip-corner { background: #ff0024; color: #fff; }
  &.active .tip-text { box-shadow: inset 0 0 0 1px #ff0024; } }
.tip-rank { display: grid; place-items: center; background: #ffffff0d; color: #b3b3b8; font: 700 12px 'Inter', sans-serif; }
.tip-corner { display: grid; place-items: center; padding: 6px 0; background: #ffffff0d; font: italic 700 14px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; }
.tip-gap { display: grid; place-items: center; color: #fff; font: 700 12px 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
.tip-text { display: flex; align-items: center; padding: 4px 10px; background: #ffffff08; font-size: 13px; }

// Garage 61 analyzer: left bar, map + delta in the middle, channels on the right, sector strip on top of the charts.
.layout-tracce { display: grid; grid-template-columns: 210px 320px minmax(0, 1fr); grid-template-areas: 'left center right'; gap: 10px; align-items: stretch; overflow: hidden; }
// Left column: three boxes with air between them (Garage 61 Laps/Gaps, VRS corners).
// Tracce fills the window: the page does not scroll, each column scrolls on its own.
.tracce-left { grid-area: left; display: flex; flex-direction: column; gap: 10px; height: 100%; overflow-y: auto; overflow-x: hidden; }
.side-box { display: grid; gap: 8px; padding: 10px; border: 1px solid #ffffff1f; background: #ffffff06;
  h4 { margin: 0 0 2px; color: #fff; font: italic 700 14px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: .02em;
    small { color: #77777d; font: 500 10px 'Inter', sans-serif; text-transform: none; margin-left: 4px; } }
  // The corner list reaches the bottom of the column, level with the delta; on a very tall
  // window it stops at a maximum height and scrolls inside.
  &--corners { flex: 1 1 auto; min-height: 160px; max-height: 760px; grid-template-rows: auto auto minmax(0, 1fr); } }
.side-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; h4 { margin: 0; } }
.sector-rows { display: grid; gap: 3px; }
.sector-row { display: grid; grid-template-columns: 30px 1fr 1fr; gap: 3px; padding: 0; border: 0; background: none; cursor: pointer; font-variant-numeric: tabular-nums;
  &.active .sector-name { background: #ff0024; color: #fff; } }
.sector-name { display: grid; place-items: center; padding: 5px 0; background: #ffffff0d; color: #e6e6ea; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; }
.sector-time { display: grid; place-items: center; background: #ffffff08; color: #b3b3b8; font: 600 12px 'Inter', sans-serif; }
.sector-gap { display: grid; place-items: center; color: #fff; font: 700 12px 'Inter', sans-serif; }
.corner-row--head { cursor: default; color: #8a8a90; font: 700 10px 'Inter', sans-serif; text-transform: uppercase; letter-spacing: .04em; }
// One corner per row, the section scrolls on its own when the list is longer than the column.
.corner-list { display: grid; gap: 3px; align-content: start; min-height: 0; overflow-y: auto; padding-right: 2px; }
.corner-row { display: grid; grid-template-columns: 52px 1fr; gap: 3px; padding: 0; border: 0; background: none; cursor: pointer; text-align: center;
  &.active .corner-num { background: #ff0024; color: #fff; }
  &.active .corner-cell { box-shadow: inset 0 0 0 1px #ff0024; } }
.corner-num { position: relative; display: grid; place-items: center; padding: 3px 0; background: #ffffff0d; color: #e6e6ea; font: italic 700 15px 'Racer Display', 'Arial Narrow', sans-serif; }
.corner-cell { display: grid; place-items: center; color: #fff; font: 700 12px 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
.tracce-center { grid-area: center; display: grid; gap: 8px; align-content: start; height: 100%; overflow-y: auto; overflow-x: hidden; }
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
  .layout-tracce, .layout-pilota { grid-template-columns: 1fr; }
  .layout-tracce { grid-template-areas: "left" "center" "right"; }
  .tracce-left, .tracce-center { position: static; }
}
</style>
