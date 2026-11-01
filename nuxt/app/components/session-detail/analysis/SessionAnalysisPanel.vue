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
import { useCompareTargets } from '~/composables/useCompareTargets'
import SessionZonesCard from './SessionZonesCard.vue'
import { ZONE_COLORS } from '~/services/telemetry/sessionZones'
import { useSessionZones } from '~/composables/useSessionZones'
import { useSectorCompare } from '~/composables/useSectorCompare'
import LapChoiceCard from './LapChoiceCard.vue'
import LapChoiceDialog from './LapChoiceDialog.vue'
import TraceStripHead, { type DeltaPlace } from './TraceStripHead.vue'
import { useLapChoice } from '~/composables/useLapChoice'
import type { LapSide } from '~/services/telemetry/lapChoice'
import { electronLapSource, pilotLapSource, type LapSource, type LocalLapBridge } from '~/services/telemetry/lapSources'
import { useReferenceLibrary, type Entry } from '~/composables/useReferenceLibrary'
import { LapsArchiveError } from '~/services/telemetry/lapsArchiveClient'
import { lapShareErrorMessage } from '~/services/telemetry/lapShareLink'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { compareCorners, cornerAdvice, detectCorners, formatDelta, stretchDelta } from '~/services/telemetry/lapAnalysis'
import { useCornerStepper } from '~/composables/useCornerStepper'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'
import { readSessionLaps, withArchiveFallback } from '~/services/telemetry/sessionLapLoading'
import { useTrackEdges } from '~/composables/useTrackEdges'
import { useI18n, type TranslationKey } from '~/i18n'

const props = defineProps<{
  sessionToken: string | null
  laps: { lap_number: number, lap_time_ms: number | null, is_valid: boolean | null, sector_times_ms?: (number | null)[] | null, air_temp?: number | null, road_temp?: number | null, track_grip_status?: string | null }[]
  /** Lap to open as "Tu", when the driver picked it in the Sessione table. */
  initialLap?: number | null
  /** PIP-623: coach view of a linked pilot: the laps come from the online archive. */
  pilotUid?: string | null
  /** PIP-623: someone else's session opened by link: never read this PC's laps for it. */
  foreign?: boolean
  /** PIP-651: someone else's session opened by its link: its laps come from the owner's archive (pilotUid = owner). */
  sharedSessionId?: string | null
  /** PIP-652: the page's "Confronta": a session to compare with (its laps become references), a lap link to load. */
  compareWith?: { ownerUid: string, sessionToken: string, sharedSessionId: string | null, label: string } | null
  pendingLapLink?: string | null
  /** PIP-695: the shown session's type (practice / qualify / race), for the lap cards. */
  sessionType?: string | null
  /** PIP-695: a session link pasted in "Cambia il riferimento" → its lap token and track (the page reads it). */
  readSession?: (sessionId: string, userId: string) => Promise<{ sessionToken: string | null, track: string } | null>
}>()

type Layout = 'pilota' | 'tracce'
const LAYOUTS: { id: Layout, label: TranslationKey, hint: TranslationKey }[] = [
  { id: 'tracce', label: 'telemetry.layout.advanced', hint: 'telemetry.layout.advancedHint' },
  { id: 'pilota', label: 'telemetry.layout.simple', hint: 'telemetry.layout.simpleHint' },
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
// 01/11 (user decision, a trial): the delta as the first chart on the right, fixed while the charts scroll,
// or under the map as before. The switch stays until the drivers have tried both.
const deltaPlace = remembered<DeltaPlace>('rc:analysis:delta', ['top', 'centre'], 'top')
const allChannels = ref(false)

// PIP-623: every lap carries its origin. Only laps of the shown session ("local" on the PC,
// "pilot" from the archive in coach view) can be "Tu" and have sector times; "own" (the
// coach's laps) and "shared" (a pasted link) are references only.
const entries = ref<Entry[]>([])
const traces = ref<Record<string, LapTraceView>>({})
const lapId = ref(''), refId = ref('')
const library = useReferenceLibrary({ entries, traces, refId, sessionToken: () => props.sessionToken, sectorTimesOf: e => sectorTimes(e) })
const loading = ref(false), error = ref(''), fromArchive = ref(false), programArchive = ref(false)
// PIP-635: nessun giro da analizzare: la pagina torna su Sessione se l'aveva aperta da sola.
const emit = defineEmits<{ unavailable: [], compare: [], lapLinkHandled: [] }>(); watch(error, message => { if (message) emit('unavailable') })
const { t, locale } = useI18n()
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
// PIP-695: the two lap cards and the "Cambia" chooser (modal; a side panel only in dev builds, for the usability test).
const choice = useLapChoice({ entries, traces, lapId, refId, library, sessionToken: () => props.sessionToken, pilotUid: () => props.pilotUid || null,
  myUid: () => currentUser.value?.uid ?? null, sessionType: () => props.sessionType ?? null, bridge: api, deps: archiveDeps, readSession: props.readSession })
watch([() => entries.value.map(e => e.id).join(), library.suggestedId], () => choice.applyDefault())
const chooser = ref<LapSide | null>(null)
const chooserVariant = ref<'modal' | 'panel'>('modal')
onMounted(() => { try { if (import.meta.dev && localStorage.getItem('rc.telemetry.picker') === 'panel') chooserVariant.value = 'panel' } catch { /* modal */ } })
const pilotName = computed(() => choice.source.subjectName())
const idealScope = computed(() => entries.value.find(e => e.origin === 'ideal')?.idealScope)
const invalidPair = computed(() => [lapEntry.value, refEntry.value].some(e => e && !e.valid && !e.validUnknown))
function openChooser(side: LapSide) { chooser.value = side }
function wholeSession() { chooser.value = null; emit('compare') }
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
  choice.reset()
  if (!token) { error.value = t('telemetry.errors.noToken'); return }
  if (props.foreign && !pilot) { error.value = t('telemetry.errors.foreign'); return }
  const bridge = api()
  const desktop = typeof bridge?.listLapTraces === 'function' && typeof bridge.readLapTrace === 'function'
  // PIP-647: in the browser your own laps come from the online archive, as a coach reads a pilot's
  // (valid and complete laps of the last 30 days); the program keeps reading them from the PC.
  const archiveUid = pilot ?? (desktop ? null : currentUser.value?.uid ?? null)
  fromArchive.value = !pilot && !!archiveUid
  programArchive.value = false
  let source: LapSource
  if (archiveUid) source = pilotLapSource(archiveUid, archiveDeps, props.sharedSessionId ?? null)
  else if (desktop) source = electronLapSource(bridge!)
  else { error.value = t('telemetry.errors.desktopOnly'); return }
  loading.value = true
  const valid = new Map(props.laps.map(l => [l.lap_number, l.is_valid === true]))
  try {
    let result = await readSessionLaps(source, token, valid, isCurrent, !!archiveUid)
    if (!result) return
    // 01/11: a session driven with another installation or PC: its laps come from the online archive.
    const ownUid = currentUser.value?.uid ?? null
    if (desktop && !archiveUid && ownUid && !props.sharedSessionId) {
      const chosen = await withArchiveFallback(result, () => readSessionLaps(pilotLapSource(ownUid, archiveDeps, null), token, valid, isCurrent, true))
      if (!isCurrent() || !chosen) return
      result = chosen.result
      if (chosen.fromArchive) { fromArchive.value = true; programArchive.value = true }
    }
    const ok = result.ok
    skipped.value = result.total - ok.length
    traces.value = Object.fromEntries(ok.map(r => [r.entry.id, r.trace]))
    entries.value = ok.map(r => r.entry).sort((a, b) => a.lapNumber - b.lapNumber)
    // A partial lap (logger started mid-lap, out-lap) covers only part of the track:
    // stretched on the whole lap it would compare different places. Listed, not usable.
    const usable = entries.value.filter(e => e.complete)
    if (!usable.length) {
      error.value = fromArchive.value ? t('telemetry.errors.archiveBrowser')
        : props.sharedSessionId ? t('telemetry.errors.archiveShared')
        : pilot ? t('telemetry.errors.archivePilot')
        : entries.value.length ? t('telemetry.errors.partialOnly') : t('telemetry.errors.noLaps')
      return
    }
    // 01/11 (user decision): "Tu" opens on your fastest valid lap of the session (an invalid lap, even
    // faster, is never the one to study); without valid laps, the last whole lap. The reference is then
    // the step above (your better lap elsewhere, else the driver a step ahead), always with its reason.
    const best = [...usable].filter(e => e.valid).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? null
    const last = [...usable].reverse()[0]!
    // A lap picked in the Sessione table is "Tu".
    const picked = props.initialLap ? usable.find(e => e.lapNumber === props.initialLap) : undefined
    lapId.value = (picked ?? best ?? last).id
    // PIP-695: the reference on open, with its reason; suggestions arriving later move it only until you choose.
    choice.applyDefault()
    // Coach view: the coach's own laps here as references; your own view: your best laps here from every session (PIP-646).
    const first = traces.value[usable[0]!.id]
    library.refreshIdeal()
    if (bridge && first) void (pilot ? library.loadOwnLaps(isCurrent, bridge, first.track, first.car) : library.loadBestLaps(isCurrent, bridge, first.track, first.car))
    else if (!pilot && first) void choice.loadArchiveBest(isCurrent)
    // PIP-650: other drivers' laps here, a step above this session's best in the closest conditions.
    const bestTrace = traces.value[(best ?? last).id]
    if (first) void library.loadOtherDrivers(isCurrent, archiveDeps, { game: first.gameId, track: first.track, car: first.car, variant: first.variant },
      { myUid: pilot ?? currentUser.value?.uid ?? null, myBestMs: best ? best.lapTimeMs : null,
        mine: { grip: bestTrace?.conditions?.grip ?? null, airC: bestTrace?.conditions?.airC ?? null, roadC: bestTrace?.conditions?.roadC ?? null, fuelL: bestTrace?.fuelL ?? null } })
  } catch (e) {
    if (isCurrent()) error.value = e instanceof LapsArchiveError ? e.message : t('telemetry.errors.read')
  } finally {
    if (isCurrent()) loading.value = false
  }
}

// PIP-652: the page's one "Confronta" (a session to compare with, a lap link that becomes the reference).
const { linkError } = useCompareTargets({ pendingLapLink: () => props.pendingLapLink, compareWith: () => props.compareWith, currentLap: () => traces.value[lapId.value] ?? null,
  entries, traces, refId, library, deps: archiveDeps, bridge: api, viewerUid: () => currentUser.value?.uid ?? null, ownView: () => !props.pilotUid,
  isCurrent: () => { const g = loadGeneration; return () => g === loadGeneration }, handled: () => emit('lapLinkHandled'), propose: choice.propose })

// PIP-623: "Condividi giro": the selected lap goes online (if not yet) and its link is copied.
const shareState = ref<'idle' | 'busy' | 'copied' | 'error'>('idle')
const shareMessage = ref('')
let shareTimer: ReturnType<typeof setTimeout> | null = null
const canShare = computed(() => !props.pilotUid && typeof api()?.shareLapTrace === 'function'
  && lapEntry.value?.origin === 'local' && lapEntry.value.complete && lapEntry.value.valid)
const shareHint = computed(() => props.pilotUid ? '' : lapEntry.value && !lapEntry.value.valid ? t('telemetry.share.validOnly') : t('telemetry.share.hint'))
// PIP-695: sharing your lap sits on the Tu card; a lap by link is in "Cambia il riferimento".
const shareAvailable = computed(() => !props.pilotUid && typeof api()?.shareLapTrace === 'function')
async function shareLap() {
  const id = lapId.value
  if (!canShare.value || shareState.value === 'busy') return
  shareState.value = 'busy'
  shareMessage.value = ''
  try {
    const result = await api()!.shareLapTrace!(id)
    await navigator.clipboard.writeText(result.link)
    shareState.value = 'copied'
    shareMessage.value = t('telemetry.share.copied')
  } catch (error) {
    shareState.value = 'error'
    shareMessage.value = lapShareErrorMessage(error)
  }
  if (shareTimer) clearTimeout(shareTimer)
  shareTimer = setTimeout(() => { shareState.value = 'idle'; shareMessage.value = '' }, 4000)
}
onBeforeUnmount(() => { if (shareTimer) clearTimeout(shareTimer); loadGeneration++ }) // leaving stops lap downloads
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
  if (deltaPlace.value !== 'centre') return
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
// The fixed delta on top: a little shorter than a channel row, so the charts under it keep their room.
const deltaTopHeight = computed(() => Math.max(70, Math.round(traceRowHeight.value * 0.8)))
// Garage 61 keeps the lap bar on the left, always open: sectors and corners say where to look.
watch([traceRoot, layout, reference, deltaPlace], () => nextTick(measureTrace))
// What the charts show now, and the way back to the whole lap (Garage 61 reset, Esc, double click).
const viewLabel = computed(() => zoomRange.value ? "Zoom" : selectedSector.value !== null ? t('telemetry.sector', { n: selectedSector.value + 1 }) : selectedCorner.value !== null ? t('telemetry.corner', { n: selectedCorner.value }) : t('telemetry.wholeLap'))
const wholeView = computed(() => !zoomRange.value && selectedSector.value === null && selectedCorner.value === null)
// PIP-635: quanto perdi nel tratto che guardi (curva, settore o zoom), fisso: senza cercarlo in fondo al delta.
const stretchLoss = computed(() => wholeView.value || !lap.value || !reference.value ? null
  : zoomRange.value ? stretchDelta(lap.value, reference.value, range.value)
    // Same numbers as the lists on the left: the corner table and the official sector times.
    : selectedSector.value !== null ? (sectorGaps.value[selectedSector.value] ? sectorGaps.value[selectedSector.value]!.gap / 1000 : stretchDelta(lap.value, reference.value, range.value))
      : comparison.value.find(c => c.corner.number === selectedCorner.value)?.timeLostS ?? null)
function wholeLap() { selectedCorner.value = null; selectedSector.value = null; zoomRange.value = null }
// 01/11 (the focus zone of Track Titan): on the whole lap, the corner where you lose most is highlighted at the
// same place on every chart and named in the bar; a click there opens it. Nothing when you gain or are level.
const focusCorner = computed(() => wholeView.value ? worst.value[0] ?? null : null)
const focusZone = computed<[number, number] | null>(() => focusCorner.value ? [focusCorner.value.corner.start, focusCorner.value.corner.end] : null)
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
const deltaRow = computed<ChartRow[]>(() => reference.value ? [{ key: 'delta', title: t('telemetry.rows.delta'), unit: 's', channels: [], delta: true, height: 70,
  ...(stretchLoss.value !== null ? { note: `${viewLabel.value} · ${formatDelta(stretchLoss.value)}`, noteTone: stretchLoss.value >= 0.01 ? 'loss' as const : stretchLoss.value <= -0.01 ? 'gain' as const : null } : {}) }] : [])
const speedRow: ChartRow = { key: 'speed', title: t('telemetry.rows.speed'), unit: 'km/h', channels: [{ name: 'speed_kmh' }], height: 100 }
// One channel per chart: every chart shows only your line and the reference's.
const pedalRows: ChartRow[] = [
  { key: 'gas', title: t('telemetry.rows.throttle'), unit: '%', channels: [{ name: 'throttle_pct' }], height: 60, min: 0, max: 100 },
  { key: 'brake', title: t('telemetry.rows.brake'), unit: '%', channels: [{ name: 'brake_pct' }], height: 60, min: 0, max: 100 },
]
const steerRow: ChartRow = { key: 'steer', title: t('telemetry.rows.steer'), channels: [{ name: 'steer_deg' }], height: 60, digits: 2 }
const gearRow: ChartRow = { key: 'gear', title: t('telemetry.rows.gear'), channels: [{ name: 'gear' }], height: 46 }
const DEG = 57.2958
const extraRows = computed<ChartRow[]>(() => [
  ...(has('acc_lat_g') ? [{ key: 'latg', title: t('telemetry.rows.latG'), unit: 'G', channels: [{ name: 'acc_lat_g' }], digits: 2 }, { key: 'longg', title: t('telemetry.rows.longG'), unit: 'G', channels: [{ name: 'acc_long_g' }], digits: 2 }] : []),
  ...(has('slip_angle_fl') ? (['fl', 'fr', 'rl', 'rr'] as const).map(w => ({ key: `slip-${w}`, title: t('telemetry.rows.slip', { wheel: t(WHEEL_NAME[w]) }), unit: '°', channels: [{ name: `slip_angle_${w}`, scale: DEG }], digits: 1 })) : []),
  ...(has('susp_travel_mm_fl') ? (['fl', 'fr', 'rl', 'rr'] as const).map(w => ({ key: `susp-${w}`, title: t('telemetry.rows.susp', { wheel: t(WHEEL_NAME[w]) }), unit: 'mm', channels: [{ name: `susp_travel_mm_${w}` }] })) : []),
  ...(has('rpm') ? [{ key: 'rpm', title: t('telemetry.rows.rpm'), channels: [{ name: 'rpm' }] }] : []),
] as ChartRow[])
const WHEEL_NAME = { fl: 'telemetry.wheels.fl', fr: 'telemetry.wheels.fr', rl: 'telemetry.wheels.rl', rr: 'telemetry.wheels.rr' } as const
const pilotRows = computed(() => [...deltaRow.value, speedRow, ...pedalRows])
// Semplice: the four corner charts share the window under the three tips, never below 80 px.
const pilotRowHeight = computed(() => Math.max(80, Math.floor((traceHeight.value - 230) / 4) - 40))
// Garage 61: the delta sits under the map; the channels on the right are speed, pedals, steering, gear.
const traceRows = computed(() => [speedRow, ...pedalRows, steerRow, gearRow, ...(allChannels.value ? extraRows.value : [])])

// PIP-619: air/road and grip of each lap (from the lap, else this session's laps): like for like.
const sessionEntries = computed(() => entries.value.filter(e => e.origin === 'local' || e.origin === 'pilot'))
const zones = useSessionZones(sessionEntries, traces, corners) // PIP-645: Semplice on the whole session
</script>

<template>
  <section class="analysis">
    <div class="analysis-bar">
      <!-- PIP-695: two cards always in sight, "Tu  +1.733 s  Riferimento" (Track Titan colours): whose lap, which one,
           when, its status and why the reference; "Cambia" opens the chooser. The view sits apart, on the right. -->
      <div class="compare" role="group" :aria-label="t('telemetry.compareAria')">
        <LapChoiceCard side="you" :choice="choice.youCard.value" :ideal-scope="idealScope" :disabled="!sessionEntries.length" @change="openChooser('you')">
          <button v-if="shareAvailable" type="button" :disabled="!canShare || shareState === 'busy'" :title="shareHint" :aria-label="t('telemetry.share.action')" @click="shareLap">{{ shareState === 'busy' ? t('telemetry.share.busy') : t('telemetry.choice.share') }}</button>
        </LapChoiceCard>
        <div class="compare-mid">
          <p class="compare-gap" :class="{ gain: (totalDelta ?? 0) < 0, loss: (totalDelta ?? 0) > 0 }" :title="t('telemetry.gapTitle')">
            <template v-if="totalDelta !== null"><strong>{{ formatDelta(totalDelta).replace('.', locale === 'it' ? ',' : '.') }} s</strong><em>{{ totalDelta < 0 ? t('telemetry.faster') : totalDelta > 0 ? t('telemetry.slower') : t('telemetry.even') }}<template v-if="invalidPair"> · {{ t('telemetry.choice.invalidQualifier') }}</template></em></template><em v-else>{{ t('telemetry.versus') }}</em>
          </p>
          <button v-if="choice.canSwap.value" type="button" class="compare-swap" :title="t('telemetry.choice.swap')" :aria-label="t('telemetry.choice.swap')" @click="choice.swap()"><span aria-hidden="true">⇄</span></button>
        </div>
        <LapChoiceCard side="ref" :choice="choice.refCard.value" :reason="choice.reason.value" :ideal-scope="idealScope" :pilot-name="pilotName" :disabled="!entries.length" @change="openChooser('ref')" />
      </div>
      <LapChoiceDialog :open="chooser !== null" :side="chooser ?? 'ref'" :source="choice.source" :apply="choice.apply" :variant="chooserVariant" :ideal-scope="idealScope"
        @close="chooser = null" @whole-session="wholeSession" />
      <span v-if="shareMessage" class="bar-note" :class="{ failed: shareState === 'error' }" role="status">{{ shareMessage }}</span>
      <div v-rc-switch class="rc-switch views-switch" role="tablist" :aria-label="t('telemetry.viewAria')">
        <button v-for="l in LAYOUTS" :key="l.id" type="button" role="tab" :aria-selected="layout === l.id" :class="{ active: layout === l.id }" :title="t(l.hint)" @click="layout = l.id">{{ t(l.label) }}</button>
      </div>
    </div>
    <p v-if="linkError" class="analysis-note analysis-note--warn" role="alert">{{ linkError }}</p>
    <p v-if="refEntry?.note" class="analysis-note analysis-note--warn">{{ refEntry.note }}</p>

    <p v-if="skipped" class="analysis-note">{{ t('telemetry.skipped', { count: skipped }) }}</p>
    <p v-if="fromArchive && entries.length" class="analysis-note">{{ programArchive ? t('telemetry.programArchiveNote') : t('telemetry.browserNote') }}</p>
    <p v-if="loading" class="analysis-empty" role="status">{{ t('telemetry.loading') }}</p>
    <p v-else-if="error" class="analysis-empty">{{ error }}</p>
    <p v-else-if="lapId === refId && entries.length > 1" class="analysis-empty">{{ t('telemetry.sameLap') }}</p>

    <!-- SEMPLICE (VRS): the coloured map and the three corners to work on, in plain words,
         with the same frame as Avanzata: it fills the window and each column scrolls on its own. -->
    <div v-if="lap && layout === 'pilota'" ref="traceRoot" class="layout-pilota" :style="{ height: `${traceHeight}px` }">
      <div class="pilota-left">
        <div class="panel">
          <span v-if="zones.active.value" class="map-legend"><i :style="{ background: ZONE_COLORS.consistency }" />{{ t('telemetry.legend.consistency') }} <i :style="{ background: ZONE_COLORS.potential }" />{{ t('telemetry.legend.potential') }} <i :style="{ background: ZONE_COLORS.mistakes }" />{{ t('telemetry.legend.mistakes') }}</span>
          <span v-else-if="reference" class="map-legend"><i class="g" />{{ t('telemetry.legend.gain') }} <i class="r" />{{ t('telemetry.legend.loss') }} <i class="n" />{{ t('telemetry.legend.equal') }}</span>
          <AnalysisMap :lap="lap" :reference="reference" :edges="edges" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" :zone-colors="zones.colors.value" zoom-controls :size="440" @hover="cursor = $event" @select="selectCorner($event)" />
        </div>
        <AnalysisCar :lap="lap" :reference="reference" :cursor="cursor" :ref-cursor="refCursor" />
      </div>
      <div class="pilota-right">
        <SessionZonesCard v-if="zones.active.value" :insight="zones.insight.value" :selected="selectedCorner" :total-laps="zones.totalLaps.value" @select="selectCorner($event)" />
        <section v-else class="side-box">
          <h4>{{ t('telemetry.improve.title') }}</h4>
          <p v-if="!reference" class="analysis-note">{{ t('telemetry.improve.pickRef') }}</p>
          <p v-else-if="!worst.length" class="analysis-note">{{ t('telemetry.improve.none') }}</p>
          <div v-else class="tip-list">
            <button v-for="(c, i) in worst" :key="c.corner.number" type="button" class="tip-row" :class="{ active: selectedCorner === c.corner.number }" @click="selectCorner(c.corner.number)">
              <span class="tip-rank">{{ i + 1 }}</span>
              <span class="tip-corner">{{ t('telemetry.corner', { n: c.corner.number }) }}</span>
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
          <h4>{{ t('telemetry.sectors') }}</h4>
          <div v-if="sectorGaps.length" class="sector-rows" :class="{ 'has-active': selectedSector !== null && !zoomRange }">
            <button v-for="(g, i) in sectorGaps" :key="i" type="button" class="sector-row" :class="{ active: selectedSector === i }" :title="t('telemetry.sectorTitle', { time: (g.ref / 1000).toFixed(3) })" @click="selectSector(i)">
              <span class="sector-name">S{{ i + 1 }}</span>
              <span class="sector-time">{{ (g.ref / 1000).toFixed(3) }}</span>
              <span class="sector-gap" :style="{ background: heat(g.gap / 1000) }">{{ formatDelta(g.gap / 1000) }}</span>
            </button>
          </div>
          <p v-else class="analysis-note">{{ t('telemetry.noSectors') }}</p>
        </section>
        <!-- VRS: corners from the costliest; the first three carry their rank. -->
        <!-- PIP-635: only the list here (Delta, Garage 61): a row selects and zooms; the way back is in the charts' bar. -->
        <section v-if="comparison.length" ref="cornersBox" class="side-box side-box--corners">
          <div class="side-head">
            <h4>{{ t('telemetry.lossTitle') }}</h4>
          </div>
          <!-- Column heads as in the Curve table: the rows are corners, the cell the time lost there. -->
          <div class="corner-row corner-row--head" aria-hidden="true"><span>{{ t('telemetry.cornerHead') }}</span><span>{{ t('telemetry.timeLost') }}</span></div>
          <div class="corner-list" :class="{ 'has-active': selectedCorner !== null && selectedSector === null && !zoomRange }">
            <button v-for="c in cornersByLoss" :key="c.corner.number" type="button" class="corner-row" :class="{ active: selectedCorner === c.corner.number }" :title="t('telemetry.cornerTitle', { n: c.corner.number, lap: c.lapMinKmh?.toFixed(0) ?? '--', ref: c.refMinKmh?.toFixed(0) ?? '--', advice: cornerAdvice(c) })" @click="selectCorner(c.corner.number)">
              <span class="corner-num">{{ c.corner.number }}</span><span class="corner-cell" :style="{ background: heat(c.timeLostS) }">{{ formatDelta(c.timeLostS) }}</span>
            </button>
          </div>
        </section>
      </aside>
      <div class="tracce-center">
        <div class="panel">
          <AnalysisMap :lap="lap" :reference="reference" :edges="edges" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" :zoom="selectedCorner !== null" :focus="selectedSector !== null ? range : null" color-mode="laps" zoom-controls :size="deltaPlace === 'top' ? 380 : 320" @hover="cursor = $event" @select="selectCorner($event)" />
        </div>
        <div v-if="reference && deltaPlace === 'centre'" ref="deltaWrap">
          <AnalysisCharts :lap="lap" :reference="reference" :rows="deltaRow" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="deltaHeight" :focus="focusZone" zoomable @hover="cursor = $event" @zoom="onZoom" />
        </div>
      </div>
      <div class="tracce-right">
        <!-- Sectors and corners on top of the charts, aligned to their distance axis and
             sticky under the lap bar (Track Titan's segment strip, MoTeC's section bar). -->
        <div class="tracce-top">
        <div class="tracce-strip">
          <TraceStripHead v-model:delta-place="deltaPlace" v-model:all-channels="allChannels" :view-label="viewLabel" :whole-view="wholeView"
            :stepping="selectedCorner !== null && !zoomRange" :focus="focusCorner ? { number: focusCorner.corner.number, lostS: focusCorner.timeLostS } : null"
            :show-delta-switch="!!reference" @step="goCorner" @whole="wholeLap" @open-focus="selectCorner" />
          <div v-if="sectorList.length" class="strip-row">
            <button v-for="s in visibleSectors" :key="s.index" type="button" :class="{ active: selectedSector === s.index }" :style="{ left: `${s.left}%`, width: `${s.width}%` }" :title="t('telemetry.sectorStripTitle', { n: s.index + 1 })" @click="selectSector(s.index)">S{{ s.index + 1 }}</button>
          </div>
          <div class="strip-row strip-row--corners">
            <button v-for="c in visibleCorners" :key="c.number" type="button" :class="{ active: selectedCorner === c.number, gain: c.lost <= -0.01, loss: c.lost >= 0.01 }" :style="{ left: `${c.left}%`, width: `${c.width}%` }" :title="`${t('telemetry.corner', { n: c.number })}: ${formatDelta(c.lost)} s`" @click="selectCorner(c.number)">{{ c.number }}</button>
          </div>
        </div>
        <!-- 01/11: the delta first, fixed with the bar while the other charts scroll under it. -->
        <AnalysisCharts v-if="reference && deltaPlace === 'top'" class="tracce-delta" :lap="lap" :reference="reference" :rows="deltaRow" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="deltaTopHeight" :focus="focusZone" zoomable @hover="cursor = $event" @zoom="onZoom" />
        </div>
        <AnalysisCharts :lap="lap" :reference="reference" :rows="traceRows" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="traceRowHeight" :cursor-tag="cursorCorner" :focus="focusZone" zoomable @hover="cursor = $event" @zoom="onZoom" />
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
.compare-mid { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.compare-swap { width: 34px; height: 26px; padding: 0; border: 1px solid #ffffff40; background: #ffffff0d; color: #fff; font: 700 15px/1 "Inter", sans-serif; cursor: pointer;
  &:hover { border-color: #fff; } &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; } }
@media (max-width: 860px) { .compare { flex-wrap: wrap; } .compare > .lap-card { flex: 1 1 100%; max-width: none; } .compare-mid { flex: 1 1 100%; flex-direction: row; justify-content: center; } .compare-gap { height: 30px; display: flex; gap: 6px; justify-content: center; align-items: baseline; } }
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
// 01/11: the bar and (when on top) the delta stay fixed together while the charts scroll.
.tracce-top { position: sticky; top: 0; z-index: 4; display: grid; gap: 6px; margin-bottom: 6px; padding-bottom: 4px; background: #0b0b10f2; box-shadow: 0 8px 10px -10px #000; }
.tracce-strip { display: grid; gap: 2px; padding: 4px 9px 4px 43px; }
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
