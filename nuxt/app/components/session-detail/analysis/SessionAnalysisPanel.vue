<script setup lang="ts">
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
import { useSessionZones } from '~/composables/useSessionZones'
import { useSectorCompare } from '~/composables/useSectorCompare'
import LapChoiceCard from './LapChoiceCard.vue'
import LapChoiceDialog from './LapChoiceDialog.vue'
import TraceStrip from './TraceStrip.vue'
import TraceSkeleton from './TraceSkeleton.vue'
import type { DeltaPlace } from './traceDeltaPlace'
import StintBlock from './StintBlock.vue'
import UnderMapSlides from './UnderMapSlides.vue'
import { stintFacts, stintVerdict, type StintSummary } from '~/services/telemetry/stintBlock'
import { noteFeatureUse } from '~/services/usage/featureUseNote'
import { deltaHeat } from '~/utils/deltaHeat'
import { deltaBars, deltaLevel } from '~/utils/deltaRead'
import { useLapChoice } from '~/composables/useLapChoice'
import { traceClass, type LapSide, type SessionKindBests } from '~/services/telemetry/lapChoice'
import { electronLapSource, pilotLapSource, type LapSource, type LocalLapBridge } from '~/services/telemetry/lapSources'
import { useReferenceLibrary, type Entry } from '~/composables/useReferenceLibrary'
import { LapsArchiveError } from '~/services/telemetry/lapsArchiveClient'
import { lapShareErrorMessage } from '~/services/telemetry/lapShareLink'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { compareCorners, detectCorners, formatDelta, stretchDelta } from '~/services/telemetry/lapAnalysis'
import { segmentsCheck, withApproach } from '~/services/telemetry/segmentApproach'
import { useFocusZone } from '~/composables/useFocusZone'
import { carMismatchNote } from '~/composables/useReferenceLibrary'
import { useCornerStepper } from '~/composables/useCornerStepper'
import { useWheelForward } from '~/composables/useWheelForward'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'
import { readSessionLaps, withArchiveFallback } from '~/services/telemetry/sessionLapLoading'
import { useTrackEdges } from '~/composables/useTrackEdges'
import { useI18n } from '~/i18n'

const props = defineProps<{
  sessionToken: string | null
  laps: { lap_number: number, lap_time_ms: number | null, is_valid: boolean | null, sector_times_ms?: (number | null)[] | null, air_temp?: number | null, road_temp?: number | null, track_grip_status?: string | null, stint_fuel?: number | null,
    /** dev.10: for the stint block under the map. */
    stint?: number | null, fuel_used?: number | null, fuel_remaining?: number | null, has_pit_stop?: boolean | null, pit_out_lap?: boolean | null }[]
  stintSummaries?: Record<number, StintSummary> // dev.11: the Sessione page's best, average, RIFERIMENTO per stint
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
  /** 02/11: best qualifying / race time of each session of a driver, by lap token (the page reads the summaries). */
  readSessionBests?: (ownerUid: string) => Promise<Record<string, SessionKindBests>>
  /** 01/11: the driver took the reference away (✕): no default or late answer brings it back. */
  referenceRemoved?: boolean
  /** 01/11: where the Tu / Riferimento bar goes (the page's title row); none = in place. */
  headTarget?: string | null
  /** 01/11: where Condividi giro goes (the page's buttons); none = in place. */
  shareTarget?: string | null
  /** 01/11: false while the page shows Sessione (the panel stays mounted, hidden): keys do nothing. */
  active?: boolean
}>()

// 01/11: one layout left (Dove migliorare's 'pilota' view was removed); the name stays for the checks below.
type Layout = 'tracce'
// The page chooses the view: Telemetria = Tracce (Garage 61 + Track Titan + VRS), Dove migliorare = Pilota.
const layout = computed<Layout>(() => 'tracce')
// 01/11 (a trial) -> dev.10 (user 05/11): the delta always first on the right, fixed while the charts scroll;
// under the map goes the stint block. The switch is gone (a saved 'centre' is ignored).
const deltaPlace = ref<DeltaPlace>('top')


// PIP-623: every lap carries its origin. Only laps of the shown session ("local" on the PC,
// "pilot" from the archive in coach view) can be "Tu" and have sector times; "own" (the
// coach's laps) and "shared" (a pasted link) are references only.
const entries = ref<Entry[]>([])
const traces = ref<Record<string, LapTraceView>>({})
const lapId = ref(''), refId = ref('')
const library = useReferenceLibrary({ entries, traces, refId, sessionToken: () => props.sessionToken, sectorTimesOf: e => sectorTimes(e) })
const loading = ref(false), error = ref(''), fromArchive = ref(false)
// PIP-635: nessun giro da analizzare: la pagina torna su Sessione se l'aveva aperta da sola.
const emit = defineEmits<{ unavailable: [], lapLinkHandled: [], removeCompare: [], referenceChosen: [] }>(); watch(error, message => { if (message) emit('unavailable') })
const { t } = useI18n()
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
  myUid: () => currentUser.value?.uid ?? null, sessionType: () => props.sessionType ?? null, bridge: api, deps: archiveDeps, readSession: props.readSession,
  readSessionBests: props.readSessionBests, refRemoved: () => !!props.referenceRemoved, sessionRow: e => sessionRow(e) })
// A lap picked for the reference in Cambia is a new choice: the page forgets the ✕.
async function applyChoice(side: LapSide, c: Parameters<typeof choice.apply>[1]) {
  const result = await choice.apply(side, c)
  if (result === null && side === 'ref') emit('referenceChosen')
  return result
}
watch([() => entries.value.map(e => e.id).join(), library.suggestedId], () => choice.applyDefault())
const chooser = ref<LapSide | null>(null)
const chooserVariant = ref<'modal' | 'panel'>('modal')
onMounted(() => { try { if (import.meta.dev && localStorage.getItem('rc.telemetry.picker') === 'panel') chooserVariant.value = 'panel' } catch { /* modal */ } })
const pilotName = computed(() => choice.source.subjectName())
const idealScope = computed(() => entries.value.find(e => e.origin === 'ideal')?.idealScope)
const invalidPair = computed(() => [lapEntry.value, refEntry.value].some(e => e && !e.valid && !e.validUnknown))
function openChooser(side: LapSide) { chooser.value = side }
// Each load gets a generation: a late answer for another session or pilot never replaces the current one.
let loadGeneration = 0
const SUGGESTIONS_WAIT_MS = 2500 // the skeleton waits this long at most for the reference suggestions
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
  let source: LapSource
  if (archiveUid) source = pilotLapSource(archiveUid, archiveDeps, props.sharedSessionId ?? null)
  else if (desktop) source = electronLapSource(bridge!)
  else { error.value = t('telemetry.errors.desktopOnly'); return }
  loading.value = true
  // 01/11 (Codex): unknown validity stays unknown (never "invalid").
  const valid = new Map(props.laps.map(l => [l.lap_number, l.is_valid ?? null]))
  try {
    let result = await readSessionLaps(source, token, valid, isCurrent, !!archiveUid)
    if (!result) return
    // 01/11: a session driven with another installation or PC: its laps come from the online archive.
    const ownUid = currentUser.value?.uid ?? null
    if (desktop && !archiveUid && ownUid && !props.sharedSessionId) {
      const chosen = await withArchiveFallback(result, () => readSessionLaps(pilotLapSource(ownUid, archiveDeps, null), token, valid, isCurrent, true))
      if (!isCurrent() || !chosen) return
      result = chosen.result
      // 06/11 (user): laps from the online archive open as any other, with no note above the page.
      if (chosen.fromArchive) fromArchive.value = true
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
    // 06/11 (user: the page jumped ~0.7 s after opening): the suggestions below can change the reference, so the
    // skeleton stays until they answer (at most SUGGESTIONS_WAIT_MS); a slow one still moves it later, as before.
    const suggestions: Promise<unknown>[] = []
    if (bridge && first) suggestions.push(pilot ? library.loadOwnLaps(isCurrent, bridge, first.track, first.car) : library.loadBestLaps(isCurrent, bridge, first.track, first.car))
    else if (!pilot && first) suggestions.push(choice.loadArchiveBest(isCurrent))
    // PIP-650: other drivers' laps here, a step above this session's best in the closest conditions.
    const bestTrace = traces.value[(best ?? last).id]
    const youEntry = entries.value.find(e => e.id === lapId.value) ?? best ?? last
    const youClass = () => traceClass(traces.value[youEntry.id], sessionRow(youEntry))
    // Codex 05/11: the step ahead is measured from your best valid lap of Tu's kind (a quicker qualifying
    // lap must not hide the race laps a step ahead of your race lap); Tu's own time when it is the only one.
    const myClassBestMs = () => {
      const kind = youClass().kind
      const same = usable.filter(e => e.valid && (!kind || traceClass(traces.value[e.id], sessionRow(e)).kind === kind))
      return same.length ? Math.min(...same.map(e => e.lapTimeMs)) : youEntry.lapTimeMs
    }
    if (first) suggestions.push(library.loadOtherDrivers(isCurrent, archiveDeps, { game: first.gameId, track: first.track, car: first.car, variant: first.variant },
      { myUid: pilot ?? currentUser.value?.uid ?? null, myBestMs: myClassBestMs(),
        mine: { grip: bestTrace?.conditions?.grip ?? null, airC: bestTrace?.conditions?.airC ?? null, roadC: bestTrace?.conditions?.roadC ?? null, fuelL: bestTrace?.fuelL ?? null },
        // dev.10: the class of Tu (kind, fuel band, dry/wet) picks the same class first (Codex 05/11: Tu, not the session's best).
        cls: youClass() }))
    if (first) suggestions.push(library.loadCoachLaps(isCurrent, { track: first.track, car: first.car }, youClass()))
    let waitTimer: ReturnType<typeof setTimeout> | undefined // cleared when the suggestions win (Codex 06/11)
    await Promise.race([Promise.allSettled(suggestions), new Promise(resolve => { waitTimer = setTimeout(resolve, SUGGESTIONS_WAIT_MS) })]).finally(() => clearTimeout(waitTimer))
  } catch (e) {
    if (isCurrent()) error.value = e instanceof LapsArchiveError ? e.message : t('telemetry.errors.read')
  } finally {
    if (isCurrent()) loading.value = false
  }
}

// PIP-652: the page's one "Confronta" (a session to compare with, a lap link that becomes the reference).
const { linkError } = useCompareTargets({ pendingLapLink: () => props.pendingLapLink, compareWith: () => props.compareWith, currentLap: () => traces.value[lapId.value] ?? null,
  entries, traces, refId, library, deps: archiveDeps, bridge: api, viewerUid: () => currentUser.value?.uid ?? null, ownView: () => !props.pilotUid,
  isCurrent: () => { const g = loadGeneration; return () => g === loadGeneration }, handled: () => emit('lapLinkHandled'), propose: (id, why) => { if (!props.referenceRemoved) choice.propose(id, why) } })

// PIP-623: "Condividi giro": the selected lap goes online (if not yet) and its link is copied.
const shareState = ref<'idle' | 'busy' | 'copied' | 'error'>('idle')
const shareMessage = ref('')
let shareTimer: ReturnType<typeof setTimeout> | null = null
// The lap file on this PC behind an entry (this session, your best or a lap of yours from another session).
function localLapFile(e: Entry | null | undefined): string | null {
  if (!e) return null
  if (e.origin === 'local') return e.id
  // Only a file of this PC (folder/lap_….json.gz): an archive key is not a file here.
  if (e.origin === 'history' || e.origin === 'best' || e.origin === 'compare') { const id = e.id.replace(/^(history|best|compare):/, ''); return /\/[^/]+\.json\.gz$/.test(id) ? id : null }
  return null
}
const canShare = computed(() => !props.pilotUid && typeof api()?.shareLapTrace === 'function'
  && !!localLapFile(lapEntry.value) && !!lapEntry.value?.complete && !!lapEntry.value?.valid)
const shareHint = computed(() => props.pilotUid ? '' : lapEntry.value && !lapEntry.value.valid ? t('telemetry.share.validOnly')
  : lapEntry.value && !localLapFile(lapEntry.value) ? t('telemetry.share.notLocal') : t('telemetry.share.hint'))
// PIP-695: sharing your lap sits on the Tu card; a lap by link is in "Cambia il riferimento".
const shareAvailable = computed(() => !props.pilotUid && typeof api()?.shareLapTrace === 'function')
async function shareLap() {
  const id = localLapFile(lapEntry.value) ?? lapId.value
  if (!canShare.value || shareState.value === 'busy') return
  shareState.value = 'busy'
  shareMessage.value = t('telemetry.share.busy')
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
// 01/11 (Codex): the panel stays mounted; a new lap clicked in the Sessione table is the new "Tu".
watch(() => props.initialLap, n => {
  const e = n ? entries.value.find(x => (x.origin === 'local' || x.origin === 'pilot') && x.lapNumber === n) : undefined
  if (e && e.id !== lapId.value) { lapId.value = e.id; choice.applyDefault() }
})

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
// 06/11 (user): each segment starts before its braking (withApproach), on the same trace the corners come from.
const cornerSource = computed(() => (sessionBest.value && traces.value[sessionBest.value.id]) ?? reference.value ?? lap.value ?? emptyTrace())
const corners = computed(() => withApproach(detectCorners(cornerSource.value), cornerSource.value))
// PIP-737 spy: the moved boundaries checked against the detected ones (KO: a gap, an overlap, a lost or moved segment).
watch(corners, c => { if (c.length) noteFeatureUse({ event: 'laps.segments', ...segmentsCheck(detectCorners(cornerSource.value), c) }) })
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
// Heights from the five essential channels only: the other channels add rows below, never shrink these.
const ESSENTIAL_ROWS = 5
// Tracce fills the window under the lap bar; the five essential charts fill the right column.
const traceRoot = ref<HTMLElement | null>(null)
// 06/11 (user): the wheel over the fixed top (strip, delta) scrolls the charts below it, with the same feel.
const { box: chartScroll, onWheel: scrollCharts } = useWheelForward()
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
  // 01/11: as tall as the channel charts at most (it stretched to the bottom of the column: too tall to read).
  deltaHeight.value = Math.min(Math.max(120, Math.floor(bottom - box.top - chrome) - 1), Math.max(140, traceRowHeight.value))
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
  traceHeight.value = Math.max(420, Math.floor(window.innerHeight - el.getBoundingClientRect().top))
  nextTick(() => {
    // Padding and margins below the panel (page, layout) can still push the page a few
    // pixels past the window: take them off, so the page itself never scrolls.
    // 06/11: the session page may hide its scrollbar in Telemetria: found by its class first, then by its overflow.
    let page: Element | null = el.closest('.session-detail-wrapper') ?? el.parentElement
    while (page && page !== document.documentElement && !page.classList.contains('session-detail-wrapper')
      && !/(auto|scroll)/.test(getComputedStyle(page).overflowY)) page = page.parentElement
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
// Shown again after Sessione: measured while hidden (zero size), so measure now.
watch(() => props.active, on => { if (on !== false) nextTick(() => { measureTrace(); measureDelta() }) })
// What the charts show now, and the way back to the whole lap (Garage 61 reset, Esc, double click).
const wholeView = computed(() => !zoomRange.value && selectedSector.value === null && selectedCorner.value === null)
// PIP-635: quanto perdi nel tratto che guardi (curva, settore o zoom), fisso: senza cercarlo in fondo al delta.
const stretchLoss = computed(() => wholeView.value || !lap.value || !reference.value ? null
  : zoomRange.value ? stretchDelta(lap.value, reference.value, range.value)
    // Same numbers as the lists on the left: the corner table and the official sector times.
    : selectedSector.value !== null ? (sectorGaps.value[selectedSector.value] ? sectorGaps.value[selectedSector.value]!.gap / 1000 : stretchDelta(lap.value, reference.value, range.value))
      : comparison.value.find(c => c.corner.number === selectedCorner.value)?.timeLostS ?? null)
function wholeLap() { selectedCorner.value = null; selectedSector.value = null; zoomRange.value = null }
const lossScope = ref<'lap' | 'session'>('lap')
// The whole-session colours on the map: the map stays whole (a picked zone highlights its corner, no zoom).
const sessionColours = computed(() => lossScope.value === 'session' && zones.active.value)
const refNote = computed(() => lap.value && reference.value && reference.value.car !== lap.value.car ? carMismatchNote() : '')
const gapWord = computed(() => totalDelta.value === null ? '' : totalDelta.value < 0 ? t('telemetry.faster') : totalDelta.value > 0 ? t('telemetry.slower') : t('telemetry.even'))
const gapTitle = computed(() => totalDelta.value === null ? t('telemetry.gapTitle')
  : `${t('telemetry.gapTitle')}: ${formatDelta(totalDelta.value)} s, ${gapWord.value}`)
// PIP-645: the double click (and zooming all the way out) goes back to the whole lap, as the chart hint says.
function onZoom(next: [number, number] | null) { if (next) zoomRange.value = next; else if (layout.value === 'tracce') wholeLap(); else zoomRange.value = null }
// Garage 61 sectors: the official sector times of the reference, placed on its trace.
// Sector times exist only for laps of the shown session (not for "own" or "shared" references).
const sessionRow = (e: Entry) => (e.origin === 'local' || e.origin === 'pilot') && e.sessionToken === props.sessionToken ? props.laps.find(l => l.lap_number === e.lapNumber) : undefined
const sectorTimes = (e: Entry | null) => e ? sessionRow(e)?.sector_times_ms ?? null : null
// dev.10: the stint of Tu, only for a lap of the shown session; the theoretical lap when it is built.
const stintBlock = computed(() => {
  const you = lapEntry.value
  if (!you || !sessionRow(you)) return null
  const ideal = entries.value.find(e => e.origin === 'ideal')
  return stintFacts(props.laps, you.lapNumber, ideal ? ideal.lapTimeMs : null)
})
// dev.11: the Sessione page's own numbers for that stint (none for a foreign or shared session). Spy (PIP-720), once per
// change of what is shown (Codex: not per refresh): the best shown must be one of that stint's laps (exclusions allowed).
const stintSummary = computed(() => stintBlock.value ? props.stintSummaries?.[stintBlock.value.stint] ?? null : null)
watch(() => { const s = stintSummary.value; return s ? JSON.stringify([stintBlock.value?.stint, s.kind, s.bestMs, s.refBestMs, s.avgMs, s.refAvgMs]) : '' }, (k) => { const s = stintSummary.value; if (!k || !s) return
  noteFeatureUse({ event: 'laps.stint_card', kind: s.kind === 'qualify' ? 1 : 0, reference: stintVerdict(s).length, bestMismatch: s.bestMs !== null && !props.laps.some(r => (r.stint ?? 1) === stintBlock.value?.stint && r.lap_time_ms === s.bestMs) ? 1 : 0 }) }, { immediate: true })
// PIP-646: any reference gets sector times, measured at the same points of the lap.
const { sectorList, sectorGaps } = useSectorCompare({ lap, reference, lapTimes: computed(() => sectorTimes(lapEntry.value)), refTimes: computed(() => sectorTimes(refEntry.value)) })
const selectedSector = ref<number | null>(null)
// Tracce: a stretch zoomed with the mouse (drag, wheel) wins over the sector or the corner.
const zoomRange = ref<[number, number] | null>(null)
const { goStep, canStep, cursorCorner } = useCornerStepper({ active: () => layout.value === 'tracce' && props.active !== false, corners, sectorCount: computed(() => sectorList.value.length), selectedCorner, selectedSector, zoomRange, cursor, wholeLap })
const range = computed<[number, number]>(() => {
  // PIP-645: a dragged zoom applies in Semplice too.
  if (zoomRange.value) return zoomRange.value
  const sector = layout.value === 'tracce' && selectedSector.value !== null ? sectorList.value[selectedSector.value] : null
  if (sector) return [sector.start, sector.end]
  const corner = selectedCorner.value !== null ? corners.value[selectedCorner.value - 1] : null
  return corner ? [corner.start, corner.end] : [0, 1]
})
const { focus, focusZone } = useFocusZone({ lap, reference, comparison, worst, range, wholeView, selectedSector, selectedCorner, zoomRange })
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
// 01/11: the same seconds as the corner list, beside each number on the map.
const cornerDeltas = computed(() => Object.fromEntries(comparison.value.map(c => [c.corner.number, c.timeLostS])))
// Red where you lose, green where you gain (VRS). PIP-635: full colours, so a loss reads as a loss at a
// glance; the seconds only shade it a little (full at 0.15 s). Under a hundredth it is even (grey).
const heat = deltaHeat

function emptyTrace(): LapTraceView { return { gameId: 'acc', variant: null, sessionId: null, track: '', car: '', lapTimeS: 0, source: '', complete: false, valid: null, fuelL: null, conditions: null, gridStepM: 2, lengthM: 0, channels: {} } }
// PIP-635: the time in the stretch you look at sits in the Delta header (Garage 61, Delta), fixed. 05/11 (user): the
// number only - the strip above already names the stretch.
const deltaRow = computed<ChartRow[]>(() => reference.value ? [{ key: 'delta', title: t('telemetry.rows.delta'), unit: 's', channels: [], delta: true, height: 70,
  ...(stretchLoss.value !== null ? { note: formatDelta(stretchLoss.value), noteTone: stretchLoss.value > 0 ? 'loss' as const : stretchLoss.value < 0 ? 'gain' as const : null } : {}) }] : [])
const speedRow: ChartRow = { key: 'speed', title: t('telemetry.rows.speed'), unit: 'km/h', channels: [{ name: 'speed_kmh' }], height: 100 }
// One channel per chart: every chart shows only your line and the reference's.
const pedalRows: ChartRow[] = [
  { key: 'gas', title: t('telemetry.rows.throttle'), unit: '%', channels: [{ name: 'throttle_pct' }], height: 60, min: 0, max: 100 },
  { key: 'brake', title: t('telemetry.rows.brake'), unit: '%', channels: [{ name: 'brake_pct' }], height: 60, min: 0, max: 100 },
]
const steerRow: ChartRow = { key: 'steer', title: t('telemetry.rows.steer'), channels: [{ name: 'steer_deg' }], height: 60, digits: 2 }
const gearRow: ChartRow = { key: 'gear', title: t('telemetry.rows.gear'), channels: [{ name: 'gear' }], height: 46 }
// Semplice: the four corner charts share the window under the three tips, never below 80 px.
// Garage 61: the delta sits under the map; the channels on the right are speed, pedals, steering, gear.
// 05/11 (user): no "Altri canali" button. PIP-736: no G, slip, suspension or rpm charts either (rpm stays in the
// lap file: the Dashboard HUD's reference-rpm marker reads it).
const traceRows = computed(() => [speedRow, ...pedalRows, steerRow, gearRow])

// PIP-619: air/road and grip of each lap (from the lap, else this session's laps): like for like.
const sessionEntries = computed(() => entries.value.filter(e => e.origin === 'local' || e.origin === 'pilot'))
const zones = useSessionZones(sessionEntries, traces, corners) // PIP-645: Semplice on the whole session
</script>

<template>
  <section class="analysis">
    <!-- 01/11 (Track Titan): Tu and Riferimento sit in the page's title row, no row of their own: more height for the charts. -->
    <Teleport defer :to="headTarget || 'body'" :disabled="!headTarget">
    <div class="analysis-bar" :class="{ 'analysis-bar--head': headTarget }">
      <!-- PIP-695: two cards always in sight, "Tu  +1.733 s  Riferimento" (Track Titan colours): whose lap, which one,
           when, its status and why the reference; "Cambia" opens the chooser. The view sits apart, on the right. -->
      <div class="compare" role="group" :aria-label="t('telemetry.compareAria')">
        <LapChoiceCard side="you" :pending="loading" :choice="choice.youCard.value" :ideal-scope="idealScope" :disabled="!sessionEntries.length" @change="openChooser('you')" />
        <div class="compare-mid">
          <!-- 01/11: only the number (the colour says faster or slower; the words stay in the tooltip). -->
          <!-- 05/11 (user): a small "Distacco" over the number, and the dot as every other time on the page. -->
          <p class="compare-gap" :class="{ gain: (totalDelta ?? 0) < 0, loss: (totalDelta ?? 0) > 0 }" :title="gapTitle">
            <template v-if="totalDelta !== null && !loading"><span class="compare-gap__label" aria-hidden="true">{{ t('telemetry.gapLabel') }}</span><strong>{{ formatDelta(totalDelta) }}</strong><span class="sr-only"> s, {{ gapWord }}</span><em v-if="invalidPair">{{ t('telemetry.choice.invalidQualifier') }}</em></template>
          </p>
        </div>
        <LapChoiceCard side="ref" :pending="loading" :choice="choice.refCard.value" :reason="choice.reason.value" :ideal-scope="idealScope" :pilot-name="pilotName" :disabled="!entries.length" @change="openChooser('ref')" />
      </div>
      <LapChoiceDialog :open="chooser !== null" :side="chooser ?? 'ref'" :source="choice.source" :apply="applyChoice" :variant="chooserVariant" :ideal-scope="idealScope"
        @close="chooser = null; choice.cancelPending()" />
      <span v-if="shareMessage" class="bar-note" :class="{ failed: shareState === 'error' }" role="status">{{ shareMessage }}</span>
    </div>
    </Teleport>
    <!-- 01/11: Condividi giro among the page's buttons (where Sessione has Condividi), not inside the Tu pill. -->
    <Teleport v-if="shareAvailable" defer :to="shareTarget || 'body'" :disabled="!shareTarget">
      <button type="button" class="rc-btn rc-btn--compact share-lap" :disabled="!canShare || shareState === 'busy'" :title="shareHint" :aria-busy="shareState === 'busy'" @click="shareLap">
        <UiRacingIcon name="share" :size="16" />{{ shareState === 'busy' ? t('telemetry.share.busy') : t('telemetry.choice.share') }}
      </button>
    </Teleport>
    <p v-if="linkError" class="analysis-note analysis-note--warn" role="alert">{{ linkError }}</p>
    <p v-if="refNote" class="analysis-note analysis-note--warn">{{ refNote }}</p>

    <p v-if="skipped" class="analysis-note">{{ t('telemetry.skipped', { count: skipped }) }}</p>
    <TraceSkeleton v-if="loading" :height="traceHeight" :label="t('telemetry.loading')" />
    <p v-else-if="error" class="analysis-empty">{{ error }}</p>
    <p v-else-if="lapId === refId && entries.length > 1" class="analysis-empty">{{ t('telemetry.sameLap') }}</p>

    <!-- TRACCE, as the Garage 61 analyzer: laps and gaps on the left, the map with the
         lap lines and the delta in the middle, the channels on the right, sectors and corners on top of the charts. -->
    <div v-else-if="lap" ref="traceRoot" class="layout-tracce" :class="{ 'layout-tracce--wide': deltaPlace === 'top' }" :style="{ height: `${traceHeight}px` }">
      <aside class="tracce-left">
        <!-- Who is faster is already in the coloured pickers above: here only where. -->
        <!-- 05/11 (user: "S1 S2 S3 from afar say nothing"): a clear title, "Settore 1" in full, the time and, below, the band
             of the difference - the sector table of MoTeC and Track Titan, made easier to read. -->
        <!-- 05/11 (user): no title ("Settore 1, 2, 3" already says it); each card stands out on its own ground. -->
        <section class="side-box side-box--sectors" :aria-label="t('telemetry.sectorsTitle')">
          <div v-if="sectorGaps.length" class="sector-rows" :class="{ 'has-active': selectedSector !== null && !zoomRange }">
            <button v-for="(g, i) in sectorGaps" :key="i" type="button" class="sector-row" :class="{ active: selectedSector === i }" :title="t('telemetry.sectorTitle', { time: (g.ref / 1000).toFixed(3) })" @click="selectSector(i)">
              <span class="sector-name">{{ t('telemetry.sectorN', { n: i + 1 }) }}</span>
              <span class="sector-time">{{ (g.ref / 1000).toFixed(3) }}</span>
              <span class="sector-gap corner-bar" :class="[`is-${deltaLevel(g.gap / 1000)}`, g.gap > 0 ? 'is-loss' : 'is-gain']">
                <span class="corner-bar__fill" :style="{ width: `${deltaBars(sectorGaps.map(x => x.gap))[i]}%` }" />
                <span class="corner-bar__value">{{ formatDelta(g.gap / 1000) }}</span>
              </span>
            </button>
          </div>
          <p v-else class="analysis-note">{{ t('telemetry.noSectors') }}</p>
        </section>
        <!-- VRS: corners from the costliest; the first three carry their rank. -->
        <!-- PIP-635: only the list here (Delta, Garage 61): a row selects and zooms; the way back is in the charts' bar. -->
        <!-- 05/11 (user): the session's advice moved under the map (dots); here only this lap's losses. -->
        <section v-if="comparison.length" ref="cornersBox" class="side-box side-box--corners">
          <div class="side-head">
            <h4>{{ t('telemetry.lossTitle') }}</h4>
          </div>
          <!-- Column heads as in the Curve table: the rows are corners, the cell the time lost there. -->
          <div class="corner-row corner-row--head" aria-hidden="true"><span>{{ t('telemetry.cornerHead') }}</span><span>{{ t('telemetry.timeLost') }}</span></div>
          <div class="corner-list" :class="{ 'has-active': selectedCorner !== null && selectedSector === null && !zoomRange }">
            <!-- 05/11 (user, as Trophi / Track Titan / Delta): a bar as long as the time lost against the worst corner,
                 the first three losses stand out, the others step back; near zero a grey number, never a word. -->
            <button v-for="(c, i) in cornersByLoss" :key="c.corner.number" type="button" class="corner-row" :class="{ active: selectedCorner === c.corner.number }" :title="t('telemetry.cornerTitle', { n: c.corner.number, lap: c.lapMinKmh?.toFixed(0) ?? '--', ref: c.refMinKmh?.toFixed(0) ?? '--' })" @click="selectCorner(c.corner.number)">
              <span class="corner-num">{{ c.corner.number }}</span>
              <span class="corner-cell corner-bar" :class="[`is-${deltaLevel(c.timeLostS)}`, c.timeLostS > 0 ? 'is-loss' : 'is-gain']">
                <span class="corner-bar__fill" :style="{ width: `${deltaBars(cornersByLoss.map(x => x.timeLostS))[i]}%` }" />
                <span class="corner-bar__value">{{ formatDelta(c.timeLostS) }}</span>
              </span>
            </button>
          </div>
        </section>
      </aside>
      <div class="tracce-center">
        <!-- 06/11 (user): the way back to the whole lap, in words for a beginner, over the map, aligned right. Its row is
             always kept (the map never jumps), the button shows only while a sector, a corner or a dragged stretch is
             open (also a click on the open box, Esc, double click). -->
        <div class="whole-row"><button v-if="!wholeView" type="button" class="rc-btn rc-btn--compact whole-lap" data-testid="whole-lap" :title="t('telemetry.backWholeTitle')" @click="wholeLap"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" /></svg>{{ t('telemetry.backWhole') }}</button></div>
        <div class="panel panel--map">
          <AnalysisMap :lap="lap" :reference="reference" :edges="edges" :corners="corners" :cursor="cursor" :ref-cursor="refCursor" :selected="selectedCorner" :zoom="selectedCorner !== null && !sessionColours" :focus="selectedSector !== null ? range : null" :color-mode="sessionColours ? 'delta' : 'laps'" :zone-colors="sessionColours ? zones.colors.value : null" zoom-controls :size="deltaPlace === 'top' ? 420 : 320" :corner-deltas="cornerDeltas" @hover="cursor = $event" @select="selectCorner($event)" />
        </div>
        <!-- 05/11 (user): under the map, pages with dots: the stint of Tu, then the session's advice (always there, with
             few laps it says how many it needs). On the session page the map takes the session's colours, as the old
             Giro/Sessione switch. -->
        <UnderMapSlides v-if="stintBlock || zones.active.value" :labels="[stintBlock ? t('telemetry.underMap.stint') : '', t('telemetry.underMap.session')].filter(Boolean)"
          :index="lossScope === 'session' && stintBlock ? 1 : 0" @update:index="lossScope = $event === 1 || !stintBlock ? 'session' : 'lap'">
          <template #default="{ index }">
            <StintBlock v-if="stintBlock && index === 0" :facts="stintBlock" :summary="stintSummary" />
            <SessionZonesCard v-else :insight="zones.insight.value" :selected="selectedCorner" :total-laps="zones.totalLaps.value" @select="selectCorner($event)" />
          </template>
        </UnderMapSlides>
        <div v-if="reference && deltaPlace === 'centre'" ref="deltaWrap">
          <AnalysisCharts :lap="lap" :reference="reference" :rows="deltaRow" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="deltaHeight" :focus="focusZone" zoomable @hover="cursor = $event" @zoom="onZoom" />
        </div>
      </div>
      <div class="tracce-right">
        <!-- Sectors and corners on top of the charts, aligned to their distance axis and
             sticky under the lap bar (Track Titan's segment strip, MoTeC's section bar). -->
        <div class="tracce-top" @wheel="scrollCharts">
        <TraceStrip :sectors="visibleSectors" :corners="visibleCorners" :selected-sector="selectedSector" :selected-corner="selectedCorner" :can-step="canStep"
          @sector="selectSector" @corner="selectCorner" @step="goStep" />
        <!-- 01/11: the delta first, fixed with the bar while the other charts scroll under it. -->
        <AnalysisCharts v-if="reference && deltaPlace === 'top'" class="tracce-delta" :lap="lap" :reference="reference" :rows="deltaRow" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="deltaTopHeight" :focus="focusZone" zoomable @hover="cursor = $event" @zoom="onZoom" />
        </div>
        <!-- 05/11 (user): the charts scroll in their own box under the strip and the delta, never behind them. -->
        <div ref="chartScroll" class="tracce-scroll">
          <AnalysisCharts :lap="lap" :reference="reference" :rows="traceRows" :range="range" :cursor="cursor" :ref-cursor="refCursor" :row-height="traceRowHeight" :cursor-tag="cursorCorner" :distances="!reference" :focus="focusZone" zoomable @hover="cursor = $event" @zoom="onZoom" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
// The left column's styles (Settori, Dove perdi di più), kept apart for max-lines; scoped with the rest.
@use "./analysisSideBoxes";
// Racer Core language: dark cells, thin borders, red accent, italic display titles.
.analysis { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; animation: rc-panel-in 200ms ease-out; }
// 02/11: shown again after Sessione (v-show) the view fades in, as the Sessione view does.
@keyframes rc-panel-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .analysis { animation: none; } }
// Sticky: lap pickers and layout stay in sight while the charts scroll under them.
.analysis-bar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 6px 0; background: #0b0b10f2; box-shadow: 0 8px 12px -10px #000;
  &--head { position: static; flex: 1 1 auto; justify-content: flex-end; min-width: 0; padding: 0; background: none; box-shadow: none; } }
// PIP-635: sugli schermi larghi una riga sola: i selettori dei giri si stringono, lo switcher non va a capo.
@media (min-width: 1200px) { .analysis-bar { flex-wrap: nowrap; } .analysis-bar > * { flex-shrink: 0; } .analysis-bar > .compare { flex-shrink: 1; } }
// 01/11: in the title row the share message takes a line of its own: it never pushes the pills into the buttons.
.analysis-bar--head { flex-wrap: wrap; > .compare { flex: 1 1 0; justify-content: flex-end; } > .bar-note { flex: 1 1 100%; text-align: right; } }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
// PIP-623: share and paste, square buttons as tall as the pickers.
.bar-note { color: #3ddc5a; font-size: 12px; &.failed { color: #ff5a6e; } }
.analysis-note--warn { color: #fbbf24; }
// PIP-635: the comparison block: Tu, the gap between the two laps, Riferimento.
.compare { display: flex; align-items: center; gap: 0; min-width: 0; flex: 1 1 auto; }
// 06/11 (user): as tall as the sectors/segments strip beside it (58 px, TraceStrip) and its ◀ ▶ (50 px), so the map
// starts level with the delta chart (strip + the right column's 4 px gap; the centre column's gap is 8 px, hence -4).
// 06/11 (user): the same thin line as between the charts, between the delta and the charts below it.
.tracce-delta { border-bottom: 1px solid #ffffff17; }
.whole-row { flex: none; display: flex; align-items: center; justify-content: flex-end; height: 58px; margin-bottom: -4px; padding: 4px 0; }
// 06/11 (user): the site's light button (.rc-btn, as Condividi: thin white edge, the cut corner, a fuller white on hover)
// instead of a dark box going red; only its height follows the strip's ◀ ▶.
.whole-lap { flex: none; height: 50px;
  svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; } }
.compare-gap { display: grid; justify-items: center; align-content: center; min-width: 104px; height: 38px; margin: 0; padding: 0 10px; line-height: 1.1; color: #b3b3b8;
  strong { font: 700 16px 'Inter', sans-serif; font-variant-numeric: tabular-nums; color: #e6e6ea; }
  em { font-style: normal; font-size: 11px; }
  &.gain strong { color: #3ddc5a; } &.loss strong { color: #ff5a6e; } }
.compare-gap__label { color: #8a8a90; font: 700 9px 'Inter', sans-serif; letter-spacing: .08em; text-transform: uppercase; }
// Narrow screens: the two laps one under the other, the gap between them (they need about 620 px side by side).
.compare-mid { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.compare-swap { width: 34px; height: 26px; padding: 0; border: 1px solid #ffffff40; background: #ffffff0d; color: #fff; font: 700 15px/1 "Inter", sans-serif; cursor: pointer;
  &:hover { border-color: #fff; } &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; } }
@media (max-width: 860px) { .compare { flex-wrap: wrap; } .compare > .lap-pill { flex: 1 1 100%; max-width: none; } .compare-mid { flex: 1 1 100%; flex-direction: row; justify-content: center; } .compare-gap { height: 30px; display: flex; gap: 6px; justify-content: center; align-items: baseline; } }
.analysis-empty { padding: 30px 0; color: #aaa; }
.analysis-note { margin: 4px 0 0; color: #77777d; font-size: 11px; }
.gain { color: #3ddc5a; }
.loss { color: #ff5a6e; }
// 06/11 (user): no frame around the map either, as the charts: the thin line under it separates it from the pages below.
.panel { display: grid; gap: 8px; padding: 0 0 22px; border-bottom: 1px solid #ffffff2b; align-content: start; }
.map-legend { display: flex; gap: 5px; align-items: center; color: #8a8a90; font-size: 11px;
  i { width: 14px; height: 3px; margin-left: 6px; &.g { background: #3ddc5a; } &.r { background: #ff5a6e; } &.n { background: #8a8a90; } } }

// Garage 61 analyzer: left bar, map + delta in the middle, channels on the right, sector strip on top of the charts.
// 06/11 (user): a thin line between the columns, with air on both sides (24 px; each column 24 px wider, the content
// keeps its width).
.layout-tracce { display: grid; grid-template-columns: 234px 344px minmax(0, 1fr); grid-template-areas: 'left center right'; gap: 24px; align-items: stretch; overflow: hidden;
  // 01/11: with the delta on top the map has the middle column to itself: wider, numbers and times readable.
  &--wide { grid-template-columns: 234px 444px minmax(0, 1fr); }
  > .tracce-left, > .tracce-center { padding-right: 24px; }
  > .tracce-left { border-right: 1px solid #ffffff2b; }
  // The line between the map and the charts starts under "Torna al giro intero" (its row: 58 px, button 4..54 px).
  > .tracce-center { position: relative; &::after { content: ''; position: absolute; top: 54px; right: 0; bottom: 0; width: 1px; background: #ffffff17; pointer-events: none; } } }
// Left column: three boxes with air between them (Garage 61 Laps/Gaps, VRS corners).
// Tracce fills the window: the page does not scroll, each column scrolls on its own.
.tracce-left { grid-area: left; display: flex; flex-direction: column; gap: 10px; height: 100%; overflow-y: auto; overflow-x: hidden; }
// 05/11 (user): the map on top, the pages under it fill the column down to the window's bottom, level with the other two.
// 06/11 (user): the column itself never scrolls; only the pages under the map do, inside their frame, without a scrollbar.
.tracce-center { grid-area: center; display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; overflow: hidden auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; }
  > * { flex: none; } > .under-map { flex: 1 1 auto; min-height: 200px; } }
// (Codex 06/11) a wide but short window: the pages under the map keep 200 px, and only then the column scrolls (no bar).
// 01/11: the charts reach the right edge: the column still scrolls (wheel, touch), without the 15 px scrollbar
// that left a gap beside the pills.
.tracce-right { grid-area: right; min-width: 0; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.tracce-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
// 01/11: the bar and (when on top) the delta stay fixed together while the charts scroll.
.tracce-top { flex: none; display: grid; gap: 4px; margin-bottom: 6px; padding-bottom: 2px; }

// PIP-639: stacked (phone) or lists beside the map (tablet): the page scrolls, not each column (nested scroll areas
// trap the thumb on a phone), so the fitted window height (inline style) and the sticky bar are for desktop only.
@media (max-width: 1100px) { .layout-tracce, .layout-pilota { grid-template-columns: minmax(0, 1fr); overflow: visible; height: auto !important; } .analysis-bar { position: static; }
  .layout-tracce { grid-template-areas: "left" "center" "right"; } .tracce-left, .tracce-center, .tracce-right, .tracce-scroll, .pilota-left, .pilota-right { position: static; height: auto; overflow: visible; } .tracce-right { display: block; }
  .layout-tracce > .tracce-left, .layout-tracce > .tracce-center { padding-right: 0; border-right: 0; &::after { display: none; } }
  // Stacked, the column has no height of its own: the pages under the map keep a frame to show in.
  .tracce-center > .under-map { min-height: 260px; } }
@media (min-width: 701px) and (max-width: 1100px) { .layout-tracce { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-areas: "left center" "right right"; } }
</style>
