<script setup lang="ts">
import { vRcSwitch } from '~/directives/rcSwitch'
// PIP-618: the session "Avanzata" tab, our Track Titan. One lap ("Tu") against a
// reference from the logger's lap files (laps of this session only, read through
// Electron), in two layouts: Tracce (MoTeC / Garage 61, default) to see why, Pilota
// (VRS) to know what to do, in words. Shared: coloured lap pickers, cursor, corner zoom.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AnalysisMap from './AnalysisMap.vue'
import AnalysisCar from './AnalysisCar.vue'
import AnalysisCharts, { type ChartRow } from './AnalysisCharts.vue'
import SharedLapPanel, { type SharedLapLoaded } from './SharedLapPanel.vue'
import SessionZonesCard from './SessionZonesCard.vue'
import { ZONE_COLORS } from '~/services/telemetry/sessionZones'
import { useSessionZones } from '~/composables/useSessionZones'
import { useSectorCompare } from '~/composables/useSectorCompare'
import LapPicker, { type LapAction, type LapGroup, type LapOption } from './LapPicker.vue'
import { electronLapSource, pilotLapSource, type LapSource, type LocalLapBridge } from '~/services/telemetry/lapSources'
import { CAR_MISMATCH_NOTE, useReferenceLibrary, type Entry } from '~/composables/useReferenceLibrary'
import { LapsArchiveError } from '~/services/telemetry/lapsArchiveClient'
import { lapShareErrorMessage } from '~/services/telemetry/lapShareLink'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { compareCorners, cornerAdvice, detectCorners, formatDelta, stretchDelta } from '~/services/telemetry/lapAnalysis'
import { useCornerStepper } from '~/composables/useCornerStepper'
import { formatLapConditions, mergeLapConditions, normalizeLapTrace, type LapTraceView } from '~/services/telemetry/lapTraceChart'
import { formatLapTime } from '~/utils/telemetryFormat'
import { useTrackEdges } from '~/composables/useTrackEdges'

const props = defineProps<{
  sessionToken: string | null
  laps: { lap_number: number, lap_time_ms: number | null, is_valid: boolean | null, sector_times_ms?: (number | null)[] | null, air_temp?: number | null, road_temp?: number | null, track_grip_status?: string | null }[]
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
const entries = ref<Entry[]>([])
const traces = ref<Record<string, LapTraceView>>({})
const lapId = ref(''), refId = ref('')
const library = useReferenceLibrary({ entries, traces, refId, sessionToken: () => props.sessionToken, sectorTimesOf: e => sectorTimes(e) })
const loading = ref(false), error = ref(''), fromArchive = ref(false)
// PIP-635: nessun giro da analizzare: la pagina torna su Sessione se l'aveva aperta da sola.
const emit = defineEmits<{ unavailable: [] }>(); watch(error, message => { if (message) emit('unavailable') })
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
  if (!token) { error.value = 'Questa sessione non ha giri registrati sul computer.'; return }
  if (props.foreign && !pilot) { error.value = 'I giri di questa sessione restano sul PC di chi ha guidato: per confrontarti chiedi un link con "Condividi giro".'; return }
  const bridge = api()
  const desktop = typeof bridge?.listLapTraces === 'function' && typeof bridge.readLapTrace === 'function'
  // PIP-647: in the browser your own laps come from the online archive, as a coach reads a pilot's
  // (valid and complete laps of the last 30 days); the program keeps reading them from the PC.
  const archiveUid = pilot ?? (desktop ? null : currentUser.value?.uid ?? null)
  fromArchive.value = !pilot && !!archiveUid
  let source: LapSource
  if (archiveUid) source = pilotLapSource(archiveUid, archiveDeps)
  else if (desktop) source = electronLapSource(bridge!)
  else { error.value = 'L’analisi dei giri è disponibile nel programma Racer Core.'; return }
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
    if (archiveUid) {
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
      error.value = fromArchive.value ? 'Nel browser ci sono solo i giri validi e completi degli ultimi 30 giorni, e questa sessione non ne ha: tutti i giri sono nel programma Racer Core.'
        : pilot ? 'Nessun giro di questa sessione nell’archivio online: arrivano quando il pilota guida con Racer Core aggiornato.'
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
    // Coach view: the coach's own laps here as references; your own view: your best laps here from every session (PIP-646).
    const first = traces.value[usable[0]!.id]
    library.refreshIdeal()
    if (bridge && first) void (pilot ? library.loadOwnLaps(isCurrent, bridge, first.track, first.car) : library.loadBestLaps(isCurrent, bridge, first.track, first.car))
    // PIP-650: other drivers' laps here, a step above this session's best in the closest conditions.
    const bestTrace = traces.value[best.id]
    // Proposed automatically as the reference, unless you picked another one meanwhile (fallback: your best).
    const defaultRef = refId.value
    if (first) void library.loadOtherDrivers(isCurrent, archiveDeps, { game: first.gameId, track: first.track, car: first.car, variant: first.variant },
      { myUid: pilot ?? currentUser.value?.uid ?? null, myBestMs: best.valid ? best.lapTimeMs : null,
        mine: { grip: bestTrace?.conditions?.grip ?? null, airC: bestTrace?.conditions?.airC ?? null, roadC: bestTrace?.conditions?.roadC ?? null, fuelL: bestTrace?.fuelL ?? null } })
      .then(id => { if (id && isCurrent() && refId.value === defaultRef && !picked) refId.value = id })
  } catch (e) {
    if (isCurrent()) error.value = e instanceof LapsArchiveError ? e.message : 'Impossibile leggere i giri di questa sessione.'
  } finally {
    if (isCurrent()) loading.value = false
  }
}

// PIP-623: a lap shared with a link becomes the reference (one at a time).
const showShared = ref(false)
function onSharedLoaded(shared: SharedLapLoaded) {
  traces.value = { ...traces.value, [shared.id]: shared.trace }
  entries.value = [...entries.value.filter(e => e.origin !== 'shared'), {
    id: shared.id, lapNumber: shared.lapNumber, lapTimeMs: shared.lapTimeMs, valid: true, complete: shared.trace.complete,
    origin: 'shared', sessionToken: '', label: shared.label, note: shared.carMismatch ? CAR_MISMATCH_NOTE : undefined,
  }]
  refId.value = shared.id
  showShared.value = false
}

// PIP-623: "Condividi giro": the selected lap goes online (if not yet) and its link is copied.
const shareState = ref<'idle' | 'busy' | 'copied' | 'error'>('idle')
const shareMessage = ref('')
let shareTimer: ReturnType<typeof setTimeout> | null = null
const canShare = computed(() => !props.pilotUid && typeof api()?.shareLapTrace === 'function'
  && lapEntry.value?.origin === 'local' && lapEntry.value.complete && lapEntry.value.valid)
const shareHint = computed(() => props.pilotUid ? '' : lapEntry.value && !lapEntry.value.valid ? 'Si condividono solo giri validi' : 'Copia il link di questo giro: chi lo riceve lo usa come riferimento')
// PIP-635: the two lap actions sit at the bottom of their menu (your lap: share it; reference: a lap by link).
const lapActions = computed<LapAction[]>(() => !props.pilotUid && typeof api()?.shareLapTrace === 'function'
  ? [{ id: 'share', label: shareState.value === 'busy' ? 'Condivido…' : 'Condividi questo giro (copia il link)', disabled: !canShare.value || shareState.value === 'busy', hint: shareHint.value }] : [])
const refActions = computed<LapAction[]>(() => entries.value.length ? [{ id: 'shared', label: '+ Giro di un altro pilota (incolla il link)', hint: 'Incolla il link di un giro ricevuto: diventa il riferimento' }] : [])
function onLapAction(id: string) { if (id === 'share') void shareLap(); else if (id === 'shared') showShared.value = true }
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
// PIP-647: the browser reads your laps with your account: load again once it is known.
watch(() => [props.sessionToken, props.pilotUid, currentUser.value?.uid], () => { void load() })
onMounted(() => { void load() })

const lap = computed(() => traces.value[lapId.value] ?? null)
// Track edges for the maps: desktop app or, in the browser, the site's files (PIP-636).
const edges = useTrackEdges(lap, api)
const reference = computed(() => refId.value && refId.value !== lapId.value ? traces.value[refId.value] ?? null : null)
const lapEntry = computed(() => entries.value.find(e => e.id === lapId.value) ?? null)
// Also when Tu and Riferimento are the same lap (one lap only): the sector times still show, with zero gaps.
const refEntry = computed(() => refId.value ? entries.value.find(e => e.id === refId.value) ?? null : null)
// PIP-645: corners from the session's best valid lap (else the reference, else yours): the same numbers and
// boundaries whatever reference is picked, so the session statistics of Semplice never move with it.
const sessionBest = computed(() => entries.value.filter(e => (e.origin === 'local' || e.origin === 'pilot') && e.valid && e.complete).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? null)
const corners = computed(() => detectCorners((sessionBest.value && traces.value[sessionBest.value.id]) ?? reference.value ?? lap.value ?? emptyTrace()))
const comparison = computed(() => lap.value && reference.value ? compareCorners(lap.value, reference.value, corners.value) : [])
const worst = computed(() => [...comparison.value].sort((a, b) => b.timeLostS - a.timeLostS).filter(c => c.timeLostS >= 0.03).slice(0, 3))
const totalDelta = computed(() => lap.value && reference.value ? lap.value.lapTimeS - reference.value.lapTimeS : null)
// Charts aligned by track position, as MoTeC and Garage 61: the reference dot sits at the same point.
const refCursor = computed(() => cursor.value)
// Tracce: the charts fill the window height, taller when there are fewer of them.
const viewportHeight = ref(900); function measure() { viewportHeight.value = window.innerHeight }
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
// PIP-635: quanto perdi nel tratto che guardi (curva, settore o zoom), fisso: senza cercarlo in fondo al delta.
const stretchLoss = computed(() => viewLabel.value === 'Giro intero' || !lap.value || !reference.value ? null
  : zoomRange.value ? stretchDelta(lap.value, reference.value, range.value)
    // Same numbers as the lists on the left: the corner table and the official sector times.
    : selectedSector.value !== null ? (sectorGaps.value[selectedSector.value] ? sectorGaps.value[selectedSector.value]!.gap / 1000 : stretchDelta(lap.value, reference.value, range.value))
      : comparison.value.find(c => c.corner.number === selectedCorner.value)?.timeLostS ?? null)
function wholeLap() { selectedCorner.value = null; selectedSector.value = null; zoomRange.value = null }
// PIP-645: the double click (and zooming all the way out) goes back to the whole lap, as the chart hint says.
function onZoom(next: [number, number] | null) { if (next) zoomRange.value = next; else if (layout.value === 'tracce') wholeLap(); else zoomRange.value = null }
// Garage 61 sectors: the official sector times of the reference, placed on its trace.
// Sector times exist only for laps of the shown session (not for "own" or "shared" references).
const sessionRow = (e: Entry) => (e.origin === 'local' || e.origin === 'pilot') && e.sessionToken === props.sessionToken ? props.laps.find(l => l.lap_number === e.lapNumber) : undefined
const sectorTimes = (e: Entry | null) => e ? sessionRow(e)?.sector_times_ms ?? null : null
// PIP-646: any reference gets sector times, measured at the same points of the lap.
const { sectorList, sectorGaps } = useSectorCompare({ lap, reference, lapTimes: computed(() => sectorTimes(lapEntry.value)), refTimes: computed(() => sectorTimes(refEntry.value)) })
const selectedSector = ref<number | null>(null)
// Tracce: a stretch zoomed with the mouse (drag, wheel) wins over the sector or the corner.
const zoomRange = ref<[number, number] | null>(null)
const { goCorner, cursorCorner } = useCornerStepper({ active: () => layout.value === 'tracce', corners, selectedCorner, selectedSector, zoomRange, cursor, wholeLap })
const range = computed<[number, number]>(() => {
  // PIP-645: a dragged zoom applies in Semplice too.
  if (zoomRange.value) return zoomRange.value
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
// Red where you lose, green where you gain (VRS). PIP-635: full colours, so a loss reads as a loss at a
// glance; the seconds only shade it a little (full at 0.15 s). Under a hundredth it is even (grey).
function heat(seconds: number) {
  if (Math.abs(seconds) < 0.01) return 'rgba(255, 255, 255, 0.06)'
  const strength = (0.72 + 0.28 * Math.min((Math.abs(seconds) - 0.01) / 0.14, 1)).toFixed(2)
  return seconds > 0 ? `rgba(228, 0, 43, ${strength})` : `rgba(22, 163, 74, ${strength})`
}
function selectFirst() {
  if (!corners.value.length) { selectedCorner.value = null; return }
  if (selectedCorner.value === null || selectedCorner.value > corners.value.length) selectedCorner.value = zones.firstCorner.value ?? worst.value[0]?.corner.number ?? 1
}
watch(corners, () => { if (layout.value !== 'tracce') selectFirst() })
// Changing view starts clean: no sector or zoom carried over, so the Delta note matches what is shown.
watch(layout, value => { selectedSector.value = null; zoomRange.value = null; if (value === 'tracce') selectedCorner.value = null; else selectFirst() })

function emptyTrace(): LapTraceView { return { gameId: 'acc', variant: null, sessionId: null, track: '', car: '', lapTimeS: 0, source: '', complete: false, valid: null, fuelL: null, conditions: null, gridStepM: 2, lengthM: 0, channels: {} } }
const has = (name: string) => !!lap.value?.channels[name]
// PIP-635: the time in the stretch you look at sits in the Delta header (Garage 61, Delta), fixed.
const deltaRow = computed<ChartRow[]>(() => reference.value ? [{ key: 'delta', title: 'Delta', unit: 's', channels: [], delta: true, height: 70,
  ...(stretchLoss.value !== null ? { note: `${viewLabel.value} · ${formatDelta(stretchLoss.value)}`, noteTone: stretchLoss.value >= 0.01 ? 'loss' as const : stretchLoss.value <= -0.01 ? 'gain' as const : null } : {}) }] : [])
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

// PIP-619: air/road and grip of each lap (from the lap, else this session's laps): like for like.
const sessionEntries = computed(() => entries.value.filter(e => e.origin === 'local' || e.origin === 'pilot'))
const ownEntries = computed(() => entries.value.filter(e => e.origin === 'own'))
const sharedEntries = computed(() => entries.value.filter(e => e.origin === 'shared'))
const bestEntries = computed(() => entries.value.filter(e => e.origin === 'best')), idealEntries = computed(() => entries.value.filter(e => e.origin === 'ideal'))
const libraryEntries = computed(() => entries.value.filter(e => e.origin === 'library'))
const zones = useSessionZones(sessionEntries, traces, corners) // PIP-645: Semplice on the whole session
// PIP-635: il best (valido e completo) della sessione, segnato nei giri come nei tempi del gioco.
const bestId = computed(() => sessionBest.value?.id ?? '')
const lapOption = (e: Entry): LapOption => ({ id: e.id, title: e.label ?? `Giro ${e.lapNumber}`, time: e.label ? '' : formatLapTime(e.lapTimeMs), valid: e.valid, complete: e.complete, best: e.id === bestId.value,
  conditions: formatLapConditions(mergeLapConditions(traces.value[e.id]?.conditions ?? null, sessionRow(e))) })
const lapGroups = computed<LapGroup[]>(() => [{ label: '', options: sessionEntries.value.map(lapOption) }])
const refGroups = computed<LapGroup[]>(() => [{ label: props.pilotUid ? 'Giri del pilota' : 'Questa sessione', options: sessionEntries.value.map(lapOption) },
  ...(ownEntries.value.length ? [{ label: 'I miei giri', options: ownEntries.value.map(lapOption) }] : []), ...(sharedEntries.value.length ? [{ label: 'Condiviso', options: sharedEntries.value.map(lapOption) }] : []),
  ...(idealEntries.value.length ? [{ label: 'Giro ideale (i tuoi settori migliori)', options: idealEntries.value.map(lapOption) }] : []),
  ...(bestEntries.value.length ? [{ label: 'I tuoi migliori su questa pista', options: bestEntries.value.map(lapOption) }] : []),
  ...(libraryEntries.value.length ? [{ label: 'Altri piloti (stessa auto)', options: libraryEntries.value.map(lapOption) }] : [])])
const short = (e: Entry | null) => e ? `Giro ${e.lapNumber} · ${formatLapTime(e.lapTimeMs)}` : '--'
const ms = (s: number | null | undefined) => typeof s === 'number' ? formatLapTime(s * 1000) : '--'
</script>

<template>
  <section class="analysis">
    <div class="analysis-bar">
      <!-- PIP-635: one comparison block, "Tu  +1.733 s  Riferimento": each lap in its colour (Track Titan), the gap
           between them; sharing your lap and a lap by link live in the two menus. The view sits apart, on the right. -->
      <div class="compare" role="group" aria-label="Confronto dei giri">
        <LapPicker v-model="lapId" name="Tu" color="#38bdf8" :groups="lapGroups" :actions="lapActions" :disabled="!sessionEntries.length" hint="Il tuo giro: azzurro in grafici e mappa" @action="onLapAction" />
        <p class="compare-gap" :class="{ gain: (totalDelta ?? 0) < 0, loss: (totalDelta ?? 0) > 0 }" title="Il tuo giro contro il riferimento">
          <template v-if="totalDelta !== null"><strong>{{ formatDelta(totalDelta) }} s</strong><em>{{ totalDelta < 0 ? "più veloce" : totalDelta > 0 ? "più lento" : "pari" }}</em></template><em v-else>contro</em>
        </p>
        <LapPicker v-model="refId" name="Riferimento" align="right" color="#fbbf24" :groups="refGroups" :actions="refActions" :disabled="!entries.length" hint="Il giro di riferimento: ambra in grafici e mappa" @action="onLapAction" />
      </div>
      <span v-if="shareMessage" class="bar-note" :class="{ failed: shareState === 'error' }" role="status">{{ shareMessage }}</span>
      <div v-rc-switch class="rc-switch views-switch" role="tablist" aria-label="Vista dell’analisi">
        <button v-for="l in LAYOUTS" :key="l.id" type="button" role="tab" :aria-selected="layout === l.id" :class="{ active: layout === l.id }" :title="l.hint" @click="layout = l.id">{{ l.label }}</button>
      </div>
    </div>
    <SharedLapPanel v-if="showShared" :current="lap" :deps="archiveDeps" @loaded="onSharedLoaded" @close="showShared = false" />
    <p v-if="refEntry?.note" class="analysis-note analysis-note--warn">{{ refEntry.note }}</p>

    <p v-if="skipped" class="analysis-note">{{ skipped }} giri non leggibili esclusi.</p>
    <p v-if="fromArchive && entries.length" class="analysis-note">Nel browser: i tuoi giri validi e completi degli ultimi 30 giorni. Tutti gli altri sono nel programma.</p>
    <p v-if="loading" class="analysis-empty" role="status">Caricamento dei giri…</p>
    <p v-else-if="error" class="analysis-empty">{{ error }}</p>
    <p v-else-if="lapId === refId && entries.length > 1" class="analysis-empty">Scegli un riferimento diverso dal tuo giro per vedere il confronto.</p>

    <!-- SEMPLICE (VRS): the coloured map and the three corners to work on, in plain words,
         with the same frame as Avanzata: it fills the window and each column scrolls on its own. -->
    <div v-if="lap && layout === 'pilota'" ref="traceRoot" class="layout-pilota" :style="{ height: `${traceHeight}px` }">
      <div class="pilota-left">
        <div class="panel">
          <span v-if="zones.active.value" class="map-legend"><i :style="{ background: ZONE_COLORS.consistency }" />costanza <i :style="{ background: ZONE_COLORS.potential }" />potenziale <i :style="{ background: ZONE_COLORS.mistakes }" />errori</span>
          <span v-else-if="reference" class="map-legend"><i class="g" />guadagni <i class="r" />perdi <i class="n" />uguale</span>
          <AnalysisMap :lap="lap" :reference="reference" :edges="edges" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" :zone-colors="zones.colors.value" zoom-controls :size="440" @hover="cursor = $event" @select="selectCorner($event)" />
        </div>
        <AnalysisCar :lap="lap" :reference="reference" :cursor="cursor" :ref-cursor="refCursor" />
      </div>
      <div class="pilota-right">
        <SessionZonesCard v-if="zones.active.value" :insight="zones.insight.value" :selected="selectedCorner" :total-laps="zones.totalLaps.value" @select="selectCorner($event)" />
        <section v-else class="side-box">
          <h4>Dove migliorare</h4>
          <p v-if="!reference" class="analysis-note">Scegli un riferimento per vedere dove migliorare.</p>
          <p v-else-if="!worst.length" class="analysis-note">Nessuna curva sotto il riferimento di oltre 3 centesimi.</p>
          <div v-else class="tip-list">
            <button v-for="(c, i) in worst" :key="c.corner.number" type="button" class="tip-row" :class="{ active: selectedCorner === c.corner.number }" @click="selectCorner(c.corner.number)">
              <span class="tip-rank">{{ i + 1 }}</span>
              <span class="tip-corner">Curva {{ c.corner.number }}</span>
              <span class="tip-gap" :style="{ background: heat(c.timeLostS) }">{{ formatDelta(c.timeLostS) }}</span>
              <span class="tip-text">{{ cornerAdvice(c) }}</span>
            </button>
          </div>
        </section>
        <AnalysisCharts v-if="selectedCorner !== null" :lap="lap" :reference="reference" :rows="pilotRows" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="pilotRowHeight" zoomable @hover="cursor = $event" @zoom="onZoom" />
      </div>
    </div>

    <!-- TRACCE, as the Garage 61 analyzer: laps and gaps on the left, the map with the
         lap lines and the delta in the middle, the channels on the right, sectors and corners on top of the charts. -->
    <div v-else-if="lap && layout === 'tracce'" ref="traceRoot" class="layout-tracce" :style="{ height: `${traceHeight}px` }">
      <aside class="tracce-left">
        <!-- Who is faster is already in the coloured pickers above: here only where. -->
        <section class="side-box">
          <h4>Settori</h4>
          <div v-if="sectorGaps.length" class="sector-rows" :class="{ 'has-active': selectedSector !== null && !zoomRange }">
            <button v-for="(g, i) in sectorGaps" :key="i" type="button" class="sector-row" :class="{ active: selectedSector === i }" :title="`Riferimento ${(g.ref / 1000).toFixed(3)} s · clic per ingrandire`" @click="selectSector(i)">
              <span class="sector-name">S{{ i + 1 }}</span>
              <span class="sector-time">{{ (g.ref / 1000).toFixed(3) }}</span>
              <span class="sector-gap" :style="{ background: heat(g.gap / 1000) }">{{ formatDelta(g.gap / 1000) }}</span>
            </button>
          </div>
          <p v-else class="analysis-note">Tempi dei settori non disponibili per questi giri.</p>
        </section>
        <!-- VRS: corners from the costliest; the first three carry their rank. -->
        <!-- PIP-635: only the list here (Delta, Garage 61): a row selects and zooms; the way back is in the charts' bar. -->
        <section v-if="comparison.length" ref="cornersBox" class="side-box side-box--corners">
          <div class="side-head">
            <h4>Dove perdi di più</h4>
          </div>
          <!-- Column heads as in the Curve table: the rows are corners, the cell the time lost there. -->
          <div class="corner-row corner-row--head" aria-hidden="true"><span>Curva</span><span>Tempo perso</span></div>
          <div class="corner-list" :class="{ 'has-active': selectedCorner !== null && selectedSector === null && !zoomRange }">
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
          <AnalysisCharts :lap="lap" :reference="reference" :rows="deltaRow" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="deltaHeight" zoomable @hover="cursor = $event" @zoom="onZoom" />
        </div>
      </div>
      <div class="tracce-right">
        <!-- Sectors and corners on top of the charts, aligned to their distance axis and
             sticky under the lap bar (Track Titan's segment strip, MoTeC's section bar). -->
        <div class="tracce-strip">
          <!-- PIP-635 (Garage 61, Delta, MoTeC): one context control on the left (what you are looking at, ‹ › for
               corners, ✕ back to the whole lap, also Esc / double click), the channels on the right. -->
          <div class="strip-head">
            <span class="strip-context" :class="{ 'is-zoomed': viewLabel !== 'Giro intero' }">
              <button v-if="selectedCorner !== null && !zoomRange" type="button" class="strip-context__step" aria-label="Curva precedente" title="Curva precedente (←)" @click="goCorner(-1)">‹</button>
              <strong aria-live="polite">{{ viewLabel }}</strong>
              <button v-if="selectedCorner !== null && !zoomRange" type="button" class="strip-context__step" aria-label="Curva successiva" title="Curva successiva (→)" @click="goCorner(1)">›</button>
              <button v-if="viewLabel !== 'Giro intero'" type="button" class="strip-context__close" aria-label="Torna al giro intero" title="Torna al giro intero (anche Esc o doppio clic sul grafico)" @click="wholeLap">✕</button>
            </span>
            <button type="button" class="strip-channels" :class="{ active: allChannels }" @click="allChannels = !allChannels">{{ allChannels ? 'Solo l’essenziale' : '+ Altri canali' }}</button>
          </div>
          <div v-if="sectorList.length" class="strip-row">
            <button v-for="s in visibleSectors" :key="s.index" type="button" :class="{ active: selectedSector === s.index }" :style="{ left: `${s.left}%`, width: `${s.width}%` }" :title="`Settore ${s.index + 1}: clic per ingrandire, di nuovo per il giro intero`" @click="selectSector(s.index)">S{{ s.index + 1 }}</button>
          </div>
          <div class="strip-row strip-row--corners">
            <button v-for="c in visibleCorners" :key="c.number" type="button" :class="{ active: selectedCorner === c.number, gain: c.lost <= -0.01, loss: c.lost >= 0.01 }" :style="{ left: `${c.left}%`, width: `${c.width}%` }" :title="`Curva ${c.number}: ${formatDelta(c.lost)} s`" @click="selectCorner(c.number)">{{ c.number }}</button>
          </div>
        </div>
        <AnalysisCharts :lap="lap" :reference="reference" :rows="traceRows" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="traceRowHeight" :cursor-tag="cursorCorner" zoomable @hover="cursor = $event" @zoom="onZoom" />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
// Racer Core language: dark cells, thin borders, red accent, italic display titles.
.analysis { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
// Sticky: lap pickers and layout stay in sight while the charts scroll under them.
.analysis-bar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 6px 0; background: #0b0b10f2; box-shadow: 0 8px 12px -10px #000; }
// PIP-635: sugli schermi larghi una riga sola: i selettori dei giri si stringono, lo switcher non va a capo.
@media (min-width: 1200px) { .analysis-bar { flex-wrap: nowrap; } .analysis-bar > * { flex-shrink: 0; } .analysis-bar > .compare { flex-shrink: 1; } }
.views-switch { margin-left: auto; }
// PIP-623: share and paste, square buttons as tall as the pickers.
.bar-note { color: #3ddc5a; font-size: 12px; &.failed { color: #ff5a6e; } }
.analysis-note--warn { color: #fbbf24; }
// PIP-635: the comparison block: Tu, the gap between the two laps, Riferimento.
.compare { display: flex; align-items: center; gap: 0; min-width: 0; flex: 1 1 auto; }
.compare-gap { display: grid; justify-items: center; align-content: center; min-width: 104px; height: 38px; margin: 0; padding: 0 10px; line-height: 1.1; color: #b3b3b8;
  strong { font: 700 16px 'Inter', sans-serif; font-variant-numeric: tabular-nums; color: #e6e6ea; }
  em { font-style: normal; font-size: 11px; }
  &.gain strong { color: #3ddc5a; } &.loss strong { color: #ff5a6e; } }
// Narrow screens: the two laps one under the other, the gap between them (they need about 620 px side by side).
@media (max-width: 860px) { .compare { flex-wrap: wrap; } .compare > .lap-picker { flex: 1 1 100%; } .compare-gap { flex: 1 1 100%; height: 30px; display: flex; gap: 6px; justify-content: center; align-items: baseline; } }
.analysis-empty { padding: 30px 0; color: #aaa; }
.analysis-note { margin: 4px 0 0; color: #77777d; font-size: 11px; }
.gain { color: #3ddc5a; }
.loss { color: #ff5a6e; }
.panel { display: grid; gap: 8px; border: 1px solid #ffffff1f; background: #ffffff06; padding: 8px; align-content: start; }
.map-legend { display: flex; gap: 5px; align-items: center; color: #8a8a90; font-size: 11px;
  i { width: 14px; height: 3px; margin-left: 6px; &.g { background: #3ddc5a; } &.r { background: #ff5a6e; } &.n { background: #8a8a90; } } }

.layout-pilota { display: grid; grid-template-columns: 440px minmax(0, 1fr); gap: 10px; overflow: hidden; }
.pilota-left, .pilota-right { display: grid; gap: 10px; align-content: start; min-width: 0; height: 100%; overflow-y: auto; overflow-x: hidden; }
.tip-list { display: grid; gap: 3px; }
// One tip per row as the corner list of Avanzata: rank, corner, time lost on the red/green scale, the advice.
.tip-row { display: grid; grid-template-columns: 26px 74px 64px minmax(0, 1fr); gap: 3px; padding: 0; border: 0; background: none; color: #e6e6ea; text-align: left; cursor: pointer;
  &.active .tip-corner { background: #ff0024; color: #fff; } &.active .tip-text { box-shadow: inset 0 0 0 1px #ff0024; } }
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
// PIP-635: the row you are looking at stands out as a whole (white frame, number on white), the others step back;
// red and green stay only for losing and gaining.
.sector-row, .corner-row { transition: opacity .15s ease; &.active { outline: 2px solid #fff; outline-offset: 1px; z-index: 1; } }
.has-active > .sector-row:not(.active), .has-active > .corner-row:not(.active) { opacity: .5; &:hover { opacity: .85; } }
.sector-row { display: grid; grid-template-columns: 30px 1fr 1fr; gap: 3px; padding: 0; border: 0; background: none; cursor: pointer; font-variant-numeric: tabular-nums;
  &.active .sector-name { background: #fff; color: #0b0b10; } }
.sector-name { display: grid; place-items: center; padding: 5px 0; background: #ffffff0d; color: #e6e6ea; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; }
.sector-time { display: grid; place-items: center; background: #ffffff08; color: #b3b3b8; font: 600 12px 'Inter', sans-serif; }
.sector-gap { display: grid; place-items: center; color: #fff; font: 700 12px 'Inter', sans-serif; }
.corner-row--head { cursor: default; color: #8a8a90; font: 700 10px 'Inter', sans-serif; text-transform: uppercase; letter-spacing: .04em; }
// One corner per row, the section scrolls on its own when the list is longer than the column.
.corner-list { display: grid; gap: 3px; align-content: start; min-height: 0; overflow-y: auto; padding-right: 2px; }
.corner-row { display: grid; grid-template-columns: 52px 1fr; gap: 3px; padding: 0; border: 0; background: none; cursor: pointer; text-align: center;
  &.active .corner-num { background: #fff; color: #0b0b10; }
  &.active .corner-cell { box-shadow: none; } }
.corner-num { position: relative; display: grid; place-items: center; padding: 3px 0; background: #ffffff0d; color: #e6e6ea; font: italic 700 15px 'Racer Display', 'Arial Narrow', sans-serif; }
.corner-cell { display: grid; place-items: center; color: #fff; font: 700 12px 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
.tracce-center { grid-area: center; display: grid; gap: 8px; align-content: start; height: 100%; overflow-y: auto; overflow-x: hidden; }
.tracce-right { grid-area: right; min-width: 0; height: 100%; overflow-y: auto; overflow-x: hidden; }
// Sector and corner strip: sticky under the lap bar, aligned to the plot area (42 px axis, 8 px right).
.strip-head { display: flex; align-items: center; gap: 10px; height: 22px; margin-left: -34px; color: #b3b3b8; font: 700 11px "Inter", sans-serif; text-transform: uppercase; letter-spacing: .04em; }
.strip-channels { margin-left: auto; height: 22px; padding: 0 8px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; font: 700 11px "Inter", sans-serif; text-transform: none; letter-spacing: 0; cursor: pointer; &.active { border-color: #ff0024; } }
// PIP-635: what you are looking at, in one framed control: "‹ Curva 5 › ✕" or "Giro intero".
.strip-context { display: inline-flex; align-items: stretch; height: 22px; border: 1px solid #ffffff2e; background: #ffffff08;
  strong { display: grid; place-items: center; min-width: 86px; padding: 0 10px; color: #b3b3b8; font: italic 700 12px "Racer Display", sans-serif; letter-spacing: .03em; }
  &.is-zoomed { border-color: #ffffff59; strong { color: #fff; } }
  button { width: 24px; padding: 0; border: 0; border-left: 1px solid #ffffff1f; background: transparent; color: #e6e6ea; font: 700 13px/1 "Inter", sans-serif; cursor: pointer;
    &:hover { background: #ffffff1a; color: #fff; } &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; } }
  &__step:first-child { border-left: 0; border-right: 1px solid #ffffff1f; }
  &__close:hover { background: #ff002433; } }
.tracce-strip { position: sticky; top: 0; z-index: 4; display: grid; gap: 2px; margin-bottom: 6px; padding: 4px 9px 4px 43px; background: #0b0b10f2; box-shadow: 0 8px 10px -10px #000; }
.strip-row { position: relative; height: 24px;
  button { position: absolute; top: 0; height: 100%; padding: 0; border: 1px solid #0b0b10; background: #ffffff14; color: #e6e6ea; font: 700 12px 'Inter', sans-serif; cursor: pointer; overflow: hidden;
    &:hover { background: #ffffff26; }
    &.active { background: #ffffff33; color: #fff; box-shadow: inset 0 -2px #ff0024; } }
  &--corners { height: 18px;
    button { background: #ffffff0a; color: #b3b3b8; font-size: 10px; &.gain { color: #3ddc5a; } &.loss { color: #ff5a6e; } } } }

// PIP-639: stacked (phone) or lists beside the map (tablet): the page scrolls, not each column (nested scroll areas
// trap the thumb on a phone), so the fitted window height (inline style) and the sticky bar are for desktop only.
@media (max-width: 1100px) { .layout-tracce, .layout-pilota { grid-template-columns: minmax(0, 1fr); overflow: visible; height: auto !important; } .analysis-bar { position: static; }
  .layout-tracce { grid-template-areas: "left" "center" "right"; } .tracce-left, .tracce-center, .tracce-right, .pilota-left, .pilota-right { position: static; height: auto; overflow: visible; } }
@media (min-width: 701px) and (max-width: 1100px) { .layout-tracce { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-areas: "left center" "right right"; } }
</style>
