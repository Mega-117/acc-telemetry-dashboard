// PIP-695: "Tu" and "Riferimento" as two cards and one chooser. This composable joins the loaded laps
// (entries/traces of the Telemetria) and the places a lap can come from (this PC, the online archive,
// the library of other drivers, a link) behind one small interface for the cards and the dialog.
import { computed, ref, type Ref } from 'vue'
import { parseLocalLapId, pilotLapSource, type LocalLapBridge } from '~/services/telemetry/lapSources'
import { normalizeLapTrace, type LapTraceView } from '~/services/telemetry/lapTraceChart'
import { fetchLibraryLap, fetchPilotLap, LapsArchiveError, listPilotTrackLaps, type LapsArchiveDeps } from '~/services/telemetry/lapsArchiveClient'
import { loadSharedLapLink } from '~/services/telemetry/sharedLapLoad'
import { loadPublicNickname } from '~/repositories/publicProfileRepository'
import {
  chooseDefaultReference, classifyLink, IDEAL_KEY, lapKey, lapStatus, leaderboard, parseSessionLink, pctFaster, sameTrackName,
  type DriverRow, type LapChoice, type LapSide, type RefReason,
} from '~/services/telemetry/lapChoice'
import { carMismatchNote, type Entry, type useReferenceLibrary } from './useReferenceLibrary'
import { sharedLapEntry } from './useCompareTargets'
import { useI18n } from '~/i18n'

export type LinkResult =
  | { state: 'lap', choice: LapChoice }
  | { state: 'session', choices: LapChoice[], proposedKey: string | null, driver: string | null, sessionToken: string }
  | { state: 'error', message: string }
export type LoadState = 'idle' | 'loading' | 'ready' | 'error'

/** What the dialog reads: one plug, whatever the container (modal or side panel). */
export interface LapChoiceSource {
  /** Coach view: the driver whose laps are shown ("Giri di …"); null = your own laps. */
  subjectName: () => string | null
  currentKey: (side: LapSide) => string | null
  suggested: () => LapChoice[]
  sessionLaps: () => LapChoice[]
  listMine: () => Promise<{ laps: LapChoice[], truncated: boolean }>
  drivers: () => DriverRow[]
  driversState: () => LoadState
  loadDriverNames: () => Promise<void>
  listDriverLaps: (uid: string) => Promise<LapChoice[]>
  resolveLink: (text: string) => Promise<LinkResult | null>
}

const YOU_ORIGINS = ['local', 'pilot', 'best', 'history'] as const
const SESSION_ORIGINS = ['local', 'pilot'] as const

export function useLapChoice(o: {
  entries: Ref<Entry[]>
  traces: Ref<Record<string, LapTraceView>>
  lapId: Ref<string>
  refId: Ref<string>
  library: ReturnType<typeof useReferenceLibrary>
  sessionToken: () => string | null
  pilotUid: () => string | null
  myUid: () => string | null
  sessionType: () => string | null
  bridge: () => LocalLapBridge | null
  deps: LapsArchiveDeps
  /** Session link of the site → its lap token and track (the page reads Firestore). */
  readSession?: (sessionId: string, userId: string) => Promise<{ sessionToken: string | null, track: string } | null>
}) {
  const { t } = useI18n()
  const subjectUid = () => o.pilotUid() ?? o.myUid()
  // Nicknames, cached by the repository, reactive here so the cards fill in when they arrive.
  // Read inside computeds: the request is remembered outside Vue and the answer written later, never during a render.
  const nicknames = ref<Record<string, string | null>>({})
  const asked = new Set<string>()
  function nick(uid: string | null | undefined): string | null {
    if (!uid) return null
    if (!asked.has(uid)) {
      asked.add(uid)
      void loadPublicNickname(uid).then(n => { nicknames.value = { ...nicknames.value, [uid]: n } }).catch(() => {})
    }
    return nicknames.value[uid] ?? null
  }

  const ownerOf = (e: Entry): string | null => e.ownerUid ?? ((YOU_ORIGINS as readonly string[]).includes(e.origin) || e.origin === 'ideal' ? subjectUid() : e.origin === 'own' ? o.myUid() : null)
  const entryKey = (e: Entry) => e.origin === 'ideal' ? IDEAL_KEY : e.lapNumber > 0 && e.sessionToken && ownerOf(e) ? lapKey(ownerOf(e), e.sessionToken, e.lapNumber) : e.id
  const current = () => o.traces.value[o.lapId.value] ?? null
  function where() {
    const tr = current() ?? Object.values(o.traces.value)[0] ?? null
    return tr ? { game: tr.gameId, track: tr.track, car: tr.car, variant: tr.variant } : null
  }

  function entryChoice(e: Entry, reason?: RefReason): LapChoice {
    const owner = ownerOf(e)
    return { key: entryKey(e), ref: { kind: 'entry', id: e.id }, ownerUid: owner, driver: e.driver ?? nick(owner), mine: !!owner && owner === o.myUid(),
      lapNumber: e.lapNumber > 0 ? e.lapNumber : null, lapTimeMs: e.lapTimeMs, sessionToken: e.sessionToken || null, recordedAt: e.recordedAt ?? null,
      sessionType: e.sessionToken && e.sessionToken === o.sessionToken() ? o.sessionType() : null,
      status: e.validUnknown ? lapStatus(null, e.complete) : lapStatus(e.valid, e.complete), ideal: e.origin === 'ideal', note: e.note, reason }
  }
  const byId = (id: string) => o.entries.value.find(e => e.id === id) ?? null
  const lapEntry = computed(() => byId(o.lapId.value))
  const refEntry = computed(() => o.refId.value ? byId(o.refId.value) : null)

  // The reason under the Riferimento card: the one given when it was set, else told by where the lap came from.
  const refReason = ref<{ id: string, reason: RefReason } | null>(null)
  /** True once the driver chose a lap (here, by link or with the page's Confronta): no suggestion replaces it. */
  const userChose = ref(false)
  function inferReason(e: Entry | null): RefReason | null {
    if (!e) return null
    if (e.origin === 'shared') return { kind: 'link', driver: e.driver ?? nick(e.ownerUid) }
    if (e.origin === 'ideal') return { kind: 'ideal' }
    if (e.origin === 'own') return { kind: 'coachBest' }
    if (e.origin === 'library') return e.id === o.library.suggestedId.value && lapEntry.value
      ? { kind: 'stepUp', driver: e.driver ?? null, pct: pctFaster(e.lapTimeMs, lapEntry.value.lapTimeMs) } : { kind: 'fastest', driver: e.driver ?? null }
    return { kind: 'picked' }
  }
  const reason = computed<RefReason | null>(() => refReason.value && refReason.value.id === o.refId.value ? refReason.value.reason : inferReason(refEntry.value))
  const youCard = computed(() => lapEntry.value ? entryChoice(lapEntry.value) : null)
  const refCard = computed(() => refEntry.value && o.refId.value !== o.lapId.value ? entryChoice(refEntry.value, reason.value ?? undefined) : null)
  const canSwap = computed(() => !!lapEntry.value && !!refEntry.value && lapEntry.value.id !== refEntry.value.id
    && (YOU_ORIGINS as readonly string[]).includes(refEntry.value.origin) && (YOU_ORIGINS as readonly string[]).includes(lapEntry.value.origin))

  function setRef(id: string, why: RefReason, chosen: boolean) {
    o.refId.value = id
    refReason.value = { id, reason: why }
    if (chosen) userChose.value = true
  }
  /** The comparison on open (and while suggestions arrive), never after the driver chose. */
  function applyDefault() {
    if (userChose.value) return
    const mine = o.entries.value.filter(e => (YOU_ORIGINS as readonly string[]).includes(e.origin) && e.origin !== 'history')
    const stepUp = o.library.suggestedId.value ? byId(o.library.suggestedId.value) : null
    const pick = chooseDefaultReference({ you: lapEntry.value, mine, stepUp })
    if (pick && (pick.id !== o.refId.value || refReason.value?.id !== pick.id)) setRef(pick.id, pick.reason, false)
  }
  function reset() { userChose.value = false; refReason.value = null; o.library.resetLibrary() }
  function swap() {
    if (!canSwap.value) return
    const you = o.lapId.value
    o.lapId.value = o.refId.value
    setRef(you, { kind: 'picked' }, true)
  }
  /** A link or a compared session proposed a reference: it is the driver's own action. */
  function propose(id: string, why: RefReason) { setRef(id, why, true) }

  // ── Reading a lap picked in the dialog ─────────────────────────────────────────────
  async function materialize(choice: LapChoice): Promise<string> {
    const known = o.entries.value.find(e => entryKey(e) === choice.key)
    if (known) return known.id
    const ref = choice.ref
    if (ref.kind === 'entry') return ref.id
    if (ref.kind === 'loaded') { o.library.addLoaded(ref.entry as Entry, ref.trace); return ref.id }
    let raw: unknown, id: string
    if (ref.kind === 'local') { raw = await o.bridge()?.readLapTrace?.(ref.id); id = `history:${ref.id}` }
    else if (ref.kind === 'archive') { raw = (await fetchPilotLap(ref.uid, ref.sessionToken, ref.lapId, o.deps, ref.shared ?? null)).trace; id = `${ref.uid === subjectUid() ? 'history' : 'driver'}:pilot:${ref.lapId}` }
    else { raw = (await fetchLibraryLap(ref.libId, o.deps)).trace; id = `library:${ref.libId}` }
    const trace = normalizeLapTrace(raw)
    if (!trace) throw new LapsArchiveError(t('telemetry.sharedLap.badFormat'))
    if (!trace.complete) throw new LapsArchiveError(t('telemetry.choice.dialog.incomplete'))
    const here = current()
    if (here && (trace.track !== here.track || (trace.variant ?? null) !== (here.variant ?? null))) throw new LapsArchiveError(t('telemetry.sharedLap.otherTrack', { track: trace.track }))
    const origin = ref.kind === 'library' ? 'library' : choice.ownerUid && choice.ownerUid !== subjectUid() ? 'driver' : 'history'
    o.library.addLoaded({ id, origin, lapNumber: choice.lapNumber ?? 0, lapTimeMs: choice.lapTimeMs, valid: trace.valid === true || choice.status === 'valid',
      validUnknown: trace.valid === null && choice.status === 'unknown', complete: true, sessionToken: choice.sessionToken ?? '', driver: choice.driver,
      ownerUid: choice.ownerUid, recordedAt: choice.recordedAt ?? null, note: here && trace.car !== here.car ? carMismatchNote() : undefined }, trace)
    return id
  }
  /** Confirm a row for one side: null when done, else the sentence to show (the comparison stays as it was). */
  async function apply(side: LapSide, choice: LapChoice): Promise<string | null> {
    try {
      const id = await materialize(choice)
      if (side === 'you') { o.lapId.value = id; userChose.value = true }
      else setRef(id, choice.reason ?? { kind: 'picked' }, true)
      return null
    } catch (e) {
      return e instanceof LapsArchiveError ? e.message : t('telemetry.sharedLap.loadError')
    }
  }

  // ── The dialog's sources ───────────────────────────────────────────────────────────
  const realLaps = (origins: readonly string[]) => o.entries.value.filter(e => origins.includes(e.origin) && e.complete)
  const fastestValid = (list: Entry[]) => [...list].filter(e => e.valid && !e.note).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? null
  function suggested(): LapChoice[] {
    const you = lapEntry.value
    const out: LapChoice[] = []
    const myBest = fastestValid(realLaps(YOU_ORIGINS).filter(e => e.id !== you?.id))
    if (myBest) out.push(entryChoice(myBest, { kind: 'myBest' }))
    const coachBest = o.pilotUid() ? fastestValid(realLaps(['own'])) : null
    if (coachBest) out.push(entryChoice(coachBest, { kind: 'coachBest' }))
    const step = o.library.suggestedId.value ? byId(o.library.suggestedId.value) : null
    if (step) out.push(entryChoice(step, { kind: 'stepUp', driver: step.driver ?? null, pct: you ? pctFaster(step.lapTimeMs, you.lapTimeMs) : 0 }))
    const ideal = o.entries.value.find(e => e.origin === 'ideal')
    if (ideal) out.push(entryChoice(ideal, { kind: 'ideal' }))
    const fastest = o.library.fastestId.value ? byId(o.library.fastestId.value) : null
    if (fastest && out.length < 4) out.push(entryChoice(fastest, { kind: 'fastest', driver: fastest.driver ?? null }))
    return out.slice(0, 4)
  }
  const sessionLaps = () => o.entries.value.filter(e => (SESSION_ORIGINS as readonly string[]).includes(e.origin)).map(e => entryChoice(e))

  async function listMine(): Promise<{ laps: LapChoice[], truncated: boolean }> {
    const w = where(), bridge = o.bridge(), owner = subjectUid()
    if (!w || !owner) return { laps: [], truncated: false }
    const loaded = o.entries.value.filter(e => (YOU_ORIGINS as readonly string[]).includes(e.origin)).map(e => entryChoice(e))
    // The program reads your laps from this PC; the browser and the coach from the online archive.
    if (!o.pilotUid() && typeof bridge?.listLapTraces === 'function') {
      const items = await bridge.listLapTraces({ track: w.track, car: w.car }) ?? []
      const validRaw = new Set(o.entries.value.filter(e => e.origin === 'best').map(e => e.id.replace(/^best:/, '')))
      const laps = items.flatMap(item => {
        const p = parseLocalLapId(item.id)
        return p ? [{ key: lapKey(owner, p.sessionToken, p.lapNumber), ref: { kind: 'local' as const, id: item.id }, ownerUid: owner, driver: nick(owner), mine: true,
          lapNumber: p.lapNumber, lapTimeMs: p.lapTimeMs, sessionToken: p.sessionToken, status: validRaw.has(item.id) ? 'valid' as const : 'unknown' as const }] : []
      })
      if (items.length < 40) return { laps: [...loaded, ...laps], truncated: false }
      // The PC lists only the 40 newest laps (each one is checked on disk): the older ones come from the
      // online archive, which keeps them forever (PIP-694).
      const known = new Set([...loaded, ...laps].map(c => c.key))
      try {
        const online = await listPilotTrackLaps(owner, w, o.deps)
        const older = online.laps.map(d => archiveChoice(owner, d)).filter(c => !known.has(c.key))
        return { laps: [...loaded, ...laps, ...older], truncated: online.truncated }
      } catch { return { laps: [...loaded, ...laps], truncated: true } }
    }
    const { laps, truncated } = await listPilotTrackLaps(owner, w, o.deps)
    return { laps: [...loaded, ...laps.map(d => archiveChoice(owner, d))], truncated }
  }
  function archiveChoice(uid: string, d: { lapId: string, sessionToken: string, lapNumber: number | null, lapTimeMs: number | null, valid: boolean | null, complete?: boolean }, shared: string | null = null): LapChoice {
    return { key: lapKey(uid, d.sessionToken, d.lapNumber), ref: { kind: 'archive', uid, sessionToken: d.sessionToken, lapId: d.lapId, shared }, ownerUid: uid, driver: nick(uid),
      mine: uid === o.myUid(), lapNumber: d.lapNumber, lapTimeMs: d.lapTimeMs ?? 0, sessionToken: d.sessionToken, status: lapStatus(d.valid, d.complete ?? true) }
  }

  /**
   * Browser (no program): your fastest valid lap here from your other sessions, from the online archive, so
   * "Il tuo migliore" is suggested as in the program (which reads it from this PC, PIP-646).
   */
  async function loadArchiveBest(isCurrent: () => boolean): Promise<void> {
    const w = where(), owner = o.myUid()
    if (!w || !owner || o.pilotUid()) return
    try {
      const { laps } = await listPilotTrackLaps(owner, w, o.deps)
      const best = laps.filter(d => d.valid === true && d.sessionToken !== o.sessionToken() && d.lapTimeMs).sort((a, b) => (a.lapTimeMs ?? 0) - (b.lapTimeMs ?? 0))[0]
      if (!best || !isCurrent()) return
      const raw = (await fetchPilotLap(owner, best.sessionToken, best.lapId, o.deps)).trace
      const trace = normalizeLapTrace(raw)
      if (!trace || !trace.complete || !isCurrent()) return
      o.library.addLoaded({ id: `best:pilot:${best.lapId}`, origin: 'best', lapNumber: best.lapNumber ?? 0, lapTimeMs: best.lapTimeMs ?? 0, valid: true, complete: true,
        sessionToken: best.sessionToken, ownerUid: owner, driver: nick(owner), recordedAt: null, note: trace.car !== w.car ? carMismatchNote() : undefined }, trace)
      applyDefault()
    } catch { /* a suggestion only: the comparison works without it */ }
  }

  const myBestMs = () => fastestValid(realLaps(YOU_ORIGINS))?.lapTimeMs ?? null
  const drivers = () => leaderboard(o.library.libraryList.value, nicknames.value, o.myUid(), myBestMs())
  const driversState = (): LoadState => { const s = o.library.libraryState.value; return s === 'error' ? 'error' : s === 'ready' ? 'ready' : 'loading' }
  /** The nicknames of the whole leaderboard, for the search: a few at a time (it can list hundreds of drivers). */
  async function loadDriverNames() {
    const uids = [...new Set(o.library.libraryList.value.map(e => e.uid))].filter(uid => !asked.has(uid))
    uids.forEach(uid => asked.add(uid))
    for (let i = 0; i < uids.length; i += 8) {
      const part = await Promise.all(uids.slice(i, i + 8).map(async uid => [uid, await loadPublicNickname(uid).catch(() => null)] as const))
      nicknames.value = { ...nicknames.value, ...Object.fromEntries(part) }
    }
  }
  async function listDriverLaps(uid: string): Promise<LapChoice[]> {
    const w = where()
    if (!w) return []
    const { laps } = await listPilotTrackLaps(uid, w, o.deps)
    const list = laps.map(d => archiveChoice(uid, d))
    if (list.length) return list
    // Only the library's lap (best lap here): the leaderboard row is always usable.
    const lib = o.library.libraryList.value.find(e => e.uid === uid)
    return lib ? [{ key: `library:${lib.libId}`, ref: { kind: 'library', libId: lib.libId, uid }, ownerUid: uid, driver: nick(uid), mine: uid === o.myUid(),
      lapNumber: null, lapTimeMs: lib.lapTimeMs, sessionToken: null, recordedAt: lib.recordedAt, status: 'valid' }] : []
  }

  async function resolveLink(text: string): Promise<LinkResult | null> {
    const kind = classifyLink(text)
    if (kind === 'lap') {
      const result = await loadSharedLapLink(text, current(), o.deps)
      if (!result) return null
      if (result.error || !result.lap) return { state: 'error', message: result.error ?? t('telemetry.sharedLap.loadError') }
      const entry = sharedLapEntry(result.lap)
      const choice = entryChoice(entry, { kind: 'link', driver: result.lap.driver ?? null })
      return { state: 'lap', choice: { ...choice, ref: { kind: 'loaded', id: entry.id, trace: result.lap.trace, entry }, driver: result.lap.driver ?? null, ownerUid: result.lap.ownerUid ?? null, mine: false } }
    }
    if (kind !== 'session') return { state: 'error', message: t('telemetry.choice.link.unknown') }
    const parsed = parseSessionLink(text)
    if (!parsed || !o.readSession) return { state: 'error', message: t('telemetry.choice.link.sessionUnavailable') }
    try {
      const info = await o.readSession(parsed.sessionId, parsed.userId)
      if (!info?.sessionToken) return { state: 'error', message: t('telemetry.choice.link.notFound') }
      const here = current()
      if (here && !sameTrackName(info.track, here.track)) return { state: 'error', message: t('telemetry.choice.link.otherTrack', { track: info.track }) }
      const shared = parsed.userId === o.myUid() ? null : parsed.sessionId
      const list = await pilotLapSource(parsed.userId, o.deps, shared).list(info.sessionToken)
      const choices = list.map(d => archiveChoice(parsed.userId, { lapId: d.id.replace(/^pilot:/, ''), sessionToken: d.sessionToken, lapNumber: d.lapNumber, lapTimeMs: d.lapTimeMs, valid: d.valid }, shared))
        .sort((a, b) => (a.lapNumber ?? 0) - (b.lapNumber ?? 0))
      const proposed = choices.filter(c => c.status === 'valid').sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? null
      return { state: 'session', choices, proposedKey: proposed?.key ?? null, driver: nick(parsed.userId), sessionToken: info.sessionToken }
    } catch (e) {
      return { state: 'error', message: e instanceof LapsArchiveError ? e.message : t('telemetry.choice.link.notFound') }
    }
  }

  const source: LapChoiceSource = {
    subjectName: () => o.pilotUid() ? nick(o.pilotUid()) ?? t('sessions.picker.driver') : null,
    currentKey: side => (side === 'you' ? youCard.value : refCard.value)?.key ?? null,
    suggested, sessionLaps, listMine, drivers, driversState, loadDriverNames, listDriverLaps, resolveLink,
  }
  return { youCard, refCard, reason, canSwap, swap, apply, applyDefault, propose, reset, userChose, source, nick, loadArchiveBest }
}
