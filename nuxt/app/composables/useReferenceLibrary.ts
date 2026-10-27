import type { Ref } from 'vue'
import { listFastestLaps, listOwnLaps, type LapDescriptor, type LapOrigin, type LapSource, type LocalLapBridge } from '~/services/telemetry/lapSources'
import { normalizeLapTrace, type LapTraceView } from '~/services/telemetry/lapTraceChart'
import { channelAt, sectorBounds } from '~/services/telemetry/lapAnalysis'
import { stitchIdealLap } from '~/services/telemetry/idealLap'
import { formatLapTime } from '~/utils/telemetryFormat'
import { fetchLibraryLap, listLibrary, type LapsArchiveDeps } from '~/services/telemetry/lapsArchiveClient'
import { pickReferences, type ReferenceConditions } from '~/services/telemetry/referencePick'
import { loadPublicNickname } from '~/repositories/publicProfileRepository'
import { noteFeatureUse } from '~/services/usage/featureUseNote'
import { useI18n } from '~/i18n'

/** One lap of the Telemetria menus. Only "local"/"pilot" laps of the shown session can be "Tu". */
export interface Entry { id: string, lapNumber: number, lapTimeMs: number, valid: boolean, complete: boolean, origin: LapOrigin, sessionToken: string, label?: string, note?: string }
type Loaded = { trace: LapTraceView, entry: Entry }

/** Note on a reference driven with another car, in the interface language. */
export const carMismatchNote = () => useI18n().t('telemetry.carMismatch')
const lapWord = (lap: number) => useI18n().t('sessionDetail.chart.lap', { lap })
const IDEAL_ID = 'ideal'
const day = (token: string) => `${token.slice(6, 8)}/${token.slice(4, 6)}`
const seconds = (s: number) => `${s <= 0 ? '−' : '+'}${Math.abs(s).toFixed(1).replace('.', useI18n().locale.value === 'it' ? ',' : '.')} s`

/**
 * PIP-623/646: the references beyond the shown session. The coach's own laps (coach view); your
 * fastest laps on this track from every session, with this car and with any car (a note warns
 * when the car differs); the Giro ideale, your best sectors stitched together.
 */
export function useReferenceLibrary(o: {
  entries: Ref<Entry[]>
  traces: Ref<Record<string, LapTraceView>>
  sessionToken: () => string | null
  /** Official sector times (ms) of a lap of the shown session. */
  sectorTimesOf: (e: Entry) => (number | null)[] | null | undefined
  /** The selected reference: when the ideal lap goes away it falls back on the session's best lap. */
  refId?: Ref<string>
}) {
  function add(loaded: Loaded[]) {
    o.traces.value = { ...o.traces.value, ...Object.fromEntries(loaded.map(r => [r.entry.id, r.trace])) }
    o.entries.value = [...o.entries.value.filter(e => !loaded.some(r => r.entry.id === e.id)), ...loaded.map(r => r.entry)]
  }
  async function read(bridge: LocalLapBridge, list: LapDescriptor[], make: (d: LapDescriptor, t: LapTraceView) => Entry | null) {
    const read = await Promise.all(list.map(async (d): Promise<Loaded | null> => {
      try {
        const trace = normalizeLapTrace(await bridge.readLapTrace!(d.id.replace(/^(own|best):/, '')))
        const entry = trace?.complete ? make(d, trace) : null
        return trace && entry ? { trace, entry } : null
      } catch { return null }
    }))
    return read.filter((r): r is Loaded => r !== null)
  }

  /** Coach view: the coach's own laps on the same track and car. */
  async function loadOwnLaps(isCurrent: () => boolean, bridge: LocalLapBridge, track: string, car: string) {
    try {
      const own = await read(bridge, (await listOwnLaps(bridge, track, car)).slice(0, 10), (d, t) => ({ id: d.id, lapNumber: d.lapNumber, lapTimeMs: d.lapTimeMs,
        valid: t.valid === true, complete: true, origin: 'own', sessionToken: d.sessionToken, label: `${useI18n().t('telemetry.labels.mine')} · ${lapWord(d.lapNumber)} · ${formatLapTime(d.lapTimeMs)}` }))
      if (isCurrent()) add(own.sort((a, b) => a.entry.lapTimeMs - b.entry.lapTimeMs))
    } catch { /* the coach's own laps are an extra: the pilot's laps stay usable */ }
  }

  // The ideal lap also draws on your faster laps of other sessions beyond the three in the menu (review: a
  // sector winner can sit in a lap that is not among the quickest whole laps).
  let historyTraces: LapTraceView[] = []

  /** Your fastest laps on this track from the other sessions: this car (3 in the menu, 8 for the ideal lap), then the quickest of another car. */
  async function loadBestLaps(isCurrent: () => boolean, bridge: LocalLapBridge, track: string, car: string) {
    try {
      const exceptSessionToken = o.sessionToken()
      const [sameCar, anyCar] = await Promise.all([listFastestLaps(bridge, { track, car, exceptSessionToken, limit: 8 }),
        listFastestLaps(bridge, { track, car, exceptSessionToken, otherCars: true, limit: 1 })])
      const mine = await read(bridge, sameCar, (d) => ({ id: d.id, lapNumber: d.lapNumber, lapTimeMs: d.lapTimeMs, valid: true, complete: true,
        origin: 'best', sessionToken: d.sessionToken, label: `${useI18n().t('telemetry.labels.lapOf', { lap: d.lapNumber, day: day(d.sessionToken) })} · ${formatLapTime(d.lapTimeMs)}` }))
      const otherCar = await read(bridge, anyCar, (d, t) => t.car === car ? null : ({ id: d.id, lapNumber: d.lapNumber, lapTimeMs: d.lapTimeMs,
        valid: true, complete: true, origin: 'best', sessionToken: d.sessionToken, label: `${t.car} · ${day(d.sessionToken)} · ${formatLapTime(d.lapTimeMs)}`, note: carMismatchNote() }))
      if (!isCurrent()) return
      historyTraces = mine.map(r => r.trace)
      add([...mine.slice(0, 3), ...otherCar])
    } catch { /* the best laps are an extra */ }
    if (isCurrent()) refreshIdeal()
  }

  /** The Giro ideale: your best sectors (this session and your faster laps here with this car), stitched. */
  function refreshIdeal() {
    const pool = o.entries.value.filter(e => e.valid && e.complete && (e.origin === 'local' || e.origin === 'pilot'))
    const best = [...pool].sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0]
    const bestTrace = best && o.traces.value[best.id]
    const bounds = bestTrace ? sectorBounds(bestTrace, o.sectorTimesOf(best)?.map(t => t ?? 0)) : null
    const laps = bestTrace ? [bestTrace, ...pool.filter(e => e !== best).map(e => o.traces.value[e.id]).filter((t): t is LapTraceView => !!t), ...historyTraces] : []
    const ideal = bounds ? stitchIdealLap(laps, bounds) : null
    // Like for like (review): the potential is measured on the traces, start to finish, as the ideal lap is;
    // the official times of a lap and its trace can differ by a few hundredths at the line.
    const measured = laps.map(t => (channelAt(t, 'time_s', 1) ?? Infinity) - (channelAt(t, 'time_s', 0) ?? 0))
    const potentialS = ideal ? ideal.trace.lapTimeS - Math.min(...measured) : 0
    const fastestMs = Math.min(...pool.map(e => e.lapTimeMs), ...o.entries.value.filter(e => e.origin === 'best' && !e.note).map(e => e.lapTimeMs))
    const wasIdeal = o.refId?.value === IDEAL_ID
    o.entries.value = o.entries.value.filter(e => e.id !== IDEAL_ID)
    // Worth showing only when it beats your best lap.
    if (!ideal || potentialS > -0.001) {
      o.traces.value = Object.fromEntries(Object.entries(o.traces.value).filter(([id]) => id !== IDEAL_ID))
      if (wasIdeal && o.refId && best) o.refId.value = best.id
      return
    }
    const ms = Math.round(fastestMs + potentialS * 1000)
    add([{ trace: { ...ideal.trace, lapTimeS: ms / 1000 }, entry: { id: IDEAL_ID, lapNumber: 0, lapTimeMs: ms, valid: true, complete: true, origin: 'ideal', sessionToken: '',
      label: useI18n().t('telemetry.labels.ideal', { time: formatLapTime(ms), gap: seconds(potentialS) }) } }])
  }

  /**
   * PIP-650: other drivers' laps here (same track and car), from the shared library: the suggested one,
   * a step above your best in the closest conditions, and the fastest. Shown with the driver's nickname.
   */
  async function loadOtherDrivers(isCurrent: () => boolean, deps: LapsArchiveDeps & { loadNickname?: (uid: string) => Promise<string | null> },
    where: { game: string, track: string, car: string, variant: string | null }, ctx: { myUid: string | null, myBestMs: number | null, mine: ReferenceConditions }): Promise<string | null> {
    try {
      const { suggested, fastest } = pickReferences(await listLibrary(where, deps), ctx)
      const nickname = deps.loadNickname ?? loadPublicNickname
      const picked = [[suggested, useI18n().t('telemetry.labels.suggested')], [fastest, useI18n().t('telemetry.labels.fastest')]] as const
      const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
      const loaded = await Promise.all(picked.map(async ([e, tag]): Promise<Loaded | null> => {
        if (!e) return null
        try {
          const [{ trace: raw }, nick] = await Promise.all([fetchLibraryLap(e.libId, deps), nickname(e.uid).catch(() => null)])
          const trace = normalizeLapTrace(raw)
          // Review: the library holds what uploaders declared; the lap itself must agree before it becomes a
          // reference: same track, car and layout, complete and valid, the declared time, a believable speed.
          const believable = !!trace && trace.complete && trace.valid === true && same(trace.track, where.track) && same(trace.car, where.car)
            && same(trace.variant, where.variant) && Math.abs(trace.lapTimeS * 1000 - e.lapTimeMs) <= 100
            && trace.lengthM / trace.lapTimeS * 3.6 <= 330
          return believable ? { trace: trace!, entry: { id: `library:${e.libId}`, lapNumber: 0, lapTimeMs: e.lapTimeMs, valid: true, complete: true, origin: 'library', sessionToken: '',
            label: `${nick || useI18n().t('sessions.picker.driver')} · ${formatLapTime(e.lapTimeMs)} · ${tag}` } } : null
        } catch { return null }
      }))
      if (!isCurrent()) return null
      const ok = loaded.filter((r): r is Loaded => r !== null)
      add(ok)
      // R2 check (fix_signals): laps offered by the library, loaded or discarded. Nothing when there were none.
      // The suggested lap can also be the fastest: count distinct laps.
      const offered = new Set(picked.flatMap(([e]) => (e ? [e.libId] : []))).size
      const usable = new Set(ok.map(r => r.entry.id)).size
      if (offered) noteFeatureUse({ event: 'laps.library_loaded', laps: usable, rejected: offered - usable })
      // The suggested lap's id, so the page can propose it as the reference (user decision: automatic).
      return suggested && ok.some(r => r.entry.id === `library:${suggested.libId}`) ? `library:${suggested.libId}` : null
    } catch { return null /* other drivers' laps are an extra */ }
  }

  /**
   * PIP-652: the session picked in "Confronta" (yours or by link): its whole valid laps become references,
   * labelled with the driver; returns the id of its best lap, to propose it as the reference.
   */
  async function loadCompareSession(isCurrent: () => boolean, source: LapSource, target: { sessionToken: string, label: string }): Promise<string | null> {
    try {
      const list = await source.list(target.sessionToken)
      // One lap at a time, as the archive is read for a coach, and one retry: a lap that does not arrive
      // once (a busy network) is not silently missing from the comparison.
      const readOne = async (d: LapDescriptor): Promise<Loaded | null> => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const trace = normalizeLapTrace(await source.read(d))
            return trace?.complete && (d.valid ?? trace.valid) === true ? { trace, entry: { id: `compare:${d.id}`, lapNumber: d.lapNumber, lapTimeMs: d.lapTimeMs, valid: true, complete: true,
              origin: 'compare', sessionToken: d.sessionToken, label: `${target.label} · ${lapWord(d.lapNumber)} · ${formatLapTime(d.lapTimeMs)}` } } : null
          } catch { if (!isCurrent()) return null }
        }
        return null
      }
      const read: (Loaded | null)[] = []
      for (const d of list) { if (!isCurrent()) return null; read.push(await readOne(d)) }
      if (!isCurrent()) return null
      o.entries.value = o.entries.value.filter(e => e.origin !== 'compare')
      const ok = read.filter((r): r is Loaded => r !== null).sort((a, b) => a.entry.lapTimeMs - b.entry.lapTimeMs)
      add(ok)
      return ok[0]?.entry.id ?? null
    } catch { return null }
  }
  function clearCompareSession() { o.entries.value = o.entries.value.filter(e => e.origin !== 'compare') }

  return { loadOwnLaps, loadBestLaps, refreshIdeal, loadOtherDrivers, loadCompareSession, clearCompareSession }
}
