import type { Ref } from 'vue'
import { listFastestLaps, listOwnLaps, type LapDescriptor, type LapOrigin, type LocalLapBridge } from '~/services/telemetry/lapSources'
import { normalizeLapTrace, type LapTraceView } from '~/services/telemetry/lapTraceChart'
import { channelAt, sectorBounds } from '~/services/telemetry/lapAnalysis'
import { stitchIdealLap } from '~/services/telemetry/idealLap'
import { formatLapTime } from '~/utils/telemetryFormat'
import { fetchLibraryLap, listLibrary, type LapsArchiveDeps } from '~/services/telemetry/lapsArchiveClient'
import { pickReferences, type ReferenceConditions } from '~/services/telemetry/referencePick'
import { loadPublicNickname } from '~/repositories/publicProfileRepository'

/** One lap of the Telemetria menus. Only "local"/"pilot" laps of the shown session can be "Tu". */
export interface Entry { id: string, lapNumber: number, lapTimeMs: number, valid: boolean, complete: boolean, origin: LapOrigin, sessionToken: string, label?: string, note?: string }
type Loaded = { trace: LapTraceView, entry: Entry }

export const CAR_MISMATCH_NOTE = 'Auto diversa dalla tua: il confronto è indicativo.'
const IDEAL_ID = 'ideal'
const day = (token: string) => `${token.slice(6, 8)}/${token.slice(4, 6)}`
const seconds = (s: number) => `${s <= 0 ? '−' : '+'}${Math.abs(s).toFixed(1).replace('.', ',')} s`

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
        valid: t.valid === true, complete: true, origin: 'own', sessionToken: d.sessionToken, label: `Mio · Giro ${d.lapNumber} · ${formatLapTime(d.lapTimeMs)}` }))
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
        origin: 'best', sessionToken: d.sessionToken, label: `Giro ${d.lapNumber} del ${day(d.sessionToken)} · ${formatLapTime(d.lapTimeMs)}` }))
      const otherCar = await read(bridge, anyCar, (d, t) => t.car === car ? null : ({ id: d.id, lapNumber: d.lapNumber, lapTimeMs: d.lapTimeMs,
        valid: true, complete: true, origin: 'best', sessionToken: d.sessionToken, label: `${t.car} · ${day(d.sessionToken)} · ${formatLapTime(d.lapTimeMs)}`, note: CAR_MISMATCH_NOTE }))
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
      label: `Giro ideale · ${formatLapTime(ms)} · ${seconds(potentialS)} sul tuo migliore` } }])
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
      const picked = [[suggested, 'consigliato'], [fastest, 'il più veloce']] as const
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
            label: `${nick || 'Pilota'} · ${formatLapTime(e.lapTimeMs)} · ${tag}` } } : null
        } catch { return null }
      }))
      if (!isCurrent()) return null
      const ok = loaded.filter((r): r is Loaded => r !== null)
      add(ok)
      // The suggested lap's id, so the page can propose it as the reference (user decision: automatic).
      return suggested && ok.some(r => r.entry.id === `library:${suggested.libId}`) ? `library:${suggested.libId}` : null
    } catch { return null /* other drivers' laps are an extra */ }
  }

  return { loadOwnLaps, loadBestLaps, refreshIdeal, loadOtherDrivers }
}
