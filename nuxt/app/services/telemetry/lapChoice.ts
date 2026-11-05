// PIP-695: choosing "Tu" and "Riferimento". The pure part: what a lap row is, how my laps are grouped
// by date and session, the default reference with its reason, the driver search and the link kinds.
// No I/O and no translations here: the composable reads the laps, the components say the words.
import { parseLapShareLink } from './lapShareLink'
import type { LapTraceView } from './lapTraceChart'

export type LapSide = 'you' | 'ref'
/** Status always told by an icon and a word, never by colour only. */
export type LapStatus = 'valid' | 'invalid' | 'incomplete' | 'unknown'

/** Why a lap is the reference: one short line under the Riferimento card. */
export type RefReason =
  | { kind: 'myBest' }
  | { kind: 'nextBest' }
  | { kind: 'sessionBest' }
  | { kind: 'stepUp', driver: string | null, pct: number, relaxed?: Relaxed | null, band?: FuelBand | null }
  /** dev.10: a coach lap from a replay (`session`: the replay's session; fuel never known). */
  | { kind: 'coach', driver: string | null, session: 'practice' | 'qualifying' | 'race' | null, otherCar?: string | null, fuelKnown?: boolean }
  | { kind: 'ideal' }
  | { kind: 'fastest', driver: string | null }
  | { kind: 'coachBest' }
  | { kind: 'picked' }
  | { kind: 'link', driver: string | null }
  | { kind: 'compare', label: string }

/** Where a row's trace comes from when it is confirmed. */
export type LapRef =
  | { kind: 'entry', id: string }
  | { kind: 'local', id: string }
  | { kind: 'archive', uid: string, sessionToken: string, lapId: string, shared?: string | null }
  | { kind: 'library', libId: string, uid: string }
  | { kind: 'loaded', id: string, trace: LapTraceView, entry: LapEntryLike }

/** The fields of a loaded lap (useReferenceLibrary's Entry) that the choice needs. */
export interface LapEntryLike {
  id: string, lapNumber: number, lapTimeMs: number, valid: boolean, complete: boolean, origin: string, sessionToken: string,
  note?: string, driver?: string | null, ownerUid?: string | null, recordedAt?: string | null
}

/** 01/11: what the lap was driven with: fuel at the start, tyres, air and track, grip. No weather: the grip already
 *  says what the track was like (wet, damp), and in the dry a sun beside OPT said the same thing twice. */
export interface LapRunConditions { fuelL: number | null, tyre: 'dry' | 'wet' | null, airC: number | null, roadC: number | null, grip: LapGrip | null }
export type LapGrip = 'green' | 'fast' | 'optimum' | 'greasy' | 'damp' | 'wet' | 'flooded'
const GRIPS: readonly LapGrip[] = ['green', 'fast', 'optimum', 'greasy', 'damp', 'wet', 'flooded']
export function gripOf(value: unknown): LapGrip | null {
  if (typeof value !== 'string') return null
  const word = value.trim().toLowerCase()
  const key = word === 'opt' ? 'optimum' : word === 'flood' ? 'flooded' : word
  return (GRIPS as readonly string[]).includes(key) ? key as LapGrip : null
}
/** This session's row of the lap (the table): fills what the lap file does not carry. */
export interface LapSessionRow { air_temp?: number | null, road_temp?: number | null, track_grip_status?: string | null, stint_fuel?: number | null }

/** The conditions of a lap trace (and its session row), or null when nothing is known. */
export function runConditions(trace: { fuelL: number | null, tyreCompound?: 'dry' | 'wet' | null, conditions: { airC: number | null, roadC: number | null, grip?: string | null } | null } | null | undefined,
  row?: LapSessionRow | null): LapRunConditions | null {
  if (!trace) return null
  const temp = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null
  const out = { fuelL: trace.fuelL, tyre: trace.tyreCompound ?? null, airC: trace.conditions?.airC ?? temp(row?.air_temp), roadC: trace.conditions?.roadC ?? temp(row?.road_temp),
    grip: gripOf(trace.conditions?.grip) ?? gripOf(row?.track_grip_status) }
  return Object.values(out).every(v => v === null) ? null : out
}

export interface LapChoice {
  /** Owner + session + lap number for real laps (the same lap from any source), the id otherwise. */
  key: string
  ref: LapRef
  ownerUid: string | null
  driver: string | null
  mine: boolean
  lapNumber: number | null
  lapTimeMs: number
  sessionToken: string | null
  recordedAt?: string | null
  sessionType?: string | null
  status: LapStatus
  /** The fastest valid lap of its session (★, purple). */
  best?: boolean
  ideal?: boolean
  reason?: RefReason
  note?: string
  /** 01/11: known only for laps whose file is already loaded (cards and session rows). */
  conditions?: LapRunConditions | null
  /** 02/11: the departure fuel of the lap's stint, for laps of the shown session. */
  stintFuelL?: number | null
}

/** 02/11: a library lap (the Worker keeps one best qualifying and one best race lap per driver). */
export interface LibraryLapLike { libId: string, uid: string, lapTimeMs: number, recordedAt: string | null, grip?: string | null, airC?: number | null,
  roadC?: number | null, fuelL?: number | null, stintFuelL?: number | null, kind?: string | null }
export interface DriverBestRow { rank: number, uid: string, nickname: string | null, mine: boolean, kind: LapKind, entry: LibraryLapLike }

export const IDEAL_KEY = 'ideal'
const TOKEN = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/

export function lapStatus(valid: boolean | null | undefined, complete: boolean | null | undefined): LapStatus {
  if (complete === false) return 'incomplete'
  return valid === true ? 'valid' : valid === false ? 'invalid' : 'unknown'
}

export function lapKey(ownerUid: string | null | undefined, sessionToken: string | null | undefined, lapNumber: number | null | undefined) {
  return `${ownerUid ?? '?'}|${sessionToken ?? '?'}|${lapNumber ?? '?'}`
}

/** A logger session token (`yyyyMMdd_HHmmss`, the PC's wall clock) or an ISO date, as a local date. */
export function sessionDate(token: string | null | undefined, iso?: string | null): Date | null {
  // The library's recordedAt is a session token too (YYYYMMDD_HHMMSS), not an ISO date.
  const m = (token ? TOKEN.exec(token) : null) ?? (iso ? TOKEN.exec(iso) : null)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const daysAgo = (d: Date, now: Date) => Math.round((dayStart(now) - dayStart(d)) / 86_400_000)

/** "Oggi 17:52" / "Ieri 17:52" / "24/10 17:52": the pieces, worded by the caller. */
export function whenParts(date: Date | null, now: Date): { day: 'today' | 'yesterday' | 'date', dm: string, hm: string } | null {
  if (!date) return null
  const two = (n: number) => String(n).padStart(2, '0')
  const ago = daysAgo(date, now)
  return { day: ago === 0 ? 'today' : ago === 1 ? 'yesterday' : 'date', dm: `${two(date.getDate())}/${two(date.getMonth() + 1)}`, hm: `${two(date.getHours())}:${two(date.getMinutes())}` }
}

export type DateBucket = 'current' | 'today' | 'yesterday' | 'week' | 'older'
export function dateBucket(date: Date | null, now: Date): Exclude<DateBucket, 'current'> {
  if (!date) return 'older'
  const ago = daysAgo(date, now)
  return ago <= 0 ? 'today' : ago === 1 ? 'yesterday' : ago < 7 ? 'week' : 'older'
}

/** 02/11: the best qualifying (<= 20 L) and race (> 20 L) lap time of a session, from its summary (same rule as the stints). */
export interface SessionKindBests { qualifyMs: number | null, raceMs: number | null,
  /** The summary's air, track and grip of those laps (no fuel): the tags of the rows. */
  qualifyConditions?: LapRunConditions | null, raceConditions?: LapRunConditions | null }
export interface MySessionRow { token: string, laps: LapChoice[], best: LapChoice | null, qualify: LapChoice | null, race: LapChoice | null }

type SummaryLike = { best_qualy_ms?: number | null, best_race_ms?: number | null,
  best_qualy_conditions?: { airTemp: number, roadTemp: number, grip: string } | null, best_race_conditions?: { airTemp: number, roadTemp: number, grip: string } | null,
  best_by_grip?: Record<string, unknown> }
const BUCKET_ORDER = ['100+', '80-100', '60-80', '40-60'] as const
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
const temp = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * 02/11 (user): the best laps of a session by the historical rules. Qualifying = departure fuel <= 20 L.
 * Race = the fastest lap of the HIGHEST fuel band the session reached (100+, 80-100, 60-80, 40-60; departure
 * fuel), even when a lighter band was quicker. 20-40 L counts for neither (as the historical bests).
 */
export function sessionKindBests(summary: SummaryLike | null | undefined): SessionKindBests {
  const grips = summary?.best_by_grip && typeof summary.best_by_grip === 'object' ? Object.values(summary.best_by_grip) as Record<string, unknown>[] : []
  let race: { ms: number, c: LapRunConditions } | null = null
  for (const band of BUCKET_ORDER) {
    for (const g of grips) {
      const r = (g?.raceBestByFuelBucket as Record<string, Record<string, unknown>> | undefined)?.[band]
      const ms = num(r?.timeMs)
      if (ms && (!race || ms < race.ms)) race = { ms, c: { fuelL: num(r?.fuel), tyre: null, airC: temp(r?.airTemp), roadC: temp(r?.roadTemp), grip: gripOf(r?.grip) } }
    }
    if (race) break
  }
  const qualifyMs = num(summary?.best_qualy_ms)
  const qualifyGrip = grips.find(g => qualifyMs && num(g?.bestQualy) === qualifyMs)
  const qc = summary?.best_qualy_conditions
  const qualifyConditions = qc ? { fuelL: num(qualifyGrip?.bestQualyFuel), tyre: null, airC: temp(qc.airTemp), roadC: temp(qc.roadTemp), grip: gripOf(qc.grip) } : null
  // Older summaries without the bands: the historical race best (over 40 L).
  const rc = summary?.best_race_conditions
  const historicalMs = num(summary?.best_race_ms)
  const fallback = !race && historicalMs
    ? { ms: historicalMs, c: rc ? { fuelL: null, tyre: null, airC: temp(rc.airTemp), roadC: temp(rc.roadTemp), grip: gripOf(rc.grip) } : null } : null
  const raceBest = race ?? fallback
  return { qualifyMs, raceMs: raceBest?.ms ?? null, qualifyConditions, raceConditions: raceBest?.c ?? null }
}

/**
 * 02/11 (user, as Track Titan): one row per past session, newest first, with its best qualifying and race lap.
 * The summary gives the times (stint departure fuel; invalid, pit-in and pit-out laps excluded); the row uses the
 * listed lap with that time. Without a summary the row shows the fastest valid lap only.
 */
export function mySessionRows(laps: LapChoice[], currentToken: string | null, bests: Record<string, SessionKindBests>): MySessionRow[] {
  const sessions = new Map<string, LapChoice[]>()
  for (const lap of laps) {
    const token = lap.sessionToken ?? ''
    if (!token || token === currentToken || lap.ideal) continue
    const list = sessions.get(token) ?? []
    sessions.set(token, list)
    if (!list.some(l => l.key === lap.key)) list.push(lap)
  }
  const usable = (l: LapChoice) => l.status !== 'invalid' && l.status !== 'incomplete' && l.lapTimeMs > 0
  const byTime = (list: LapChoice[], ms: number | null | undefined, not: LapChoice | null = null) =>
    ms ? list.filter(l => usable(l) && l.key !== not?.key && Math.abs(l.lapTimeMs - ms) <= 1).sort((a, b) => Math.abs(a.lapTimeMs - ms) - Math.abs(b.lapTimeMs - ms))[0] ?? null : null
  return [...sessions].sort(([a], [b]) => b.localeCompare(a)).map(([token, list]) => {
    const fastest = list.filter(l => l.status === 'valid' && l.lapTimeMs > 0).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? null
    const kinds = bests[token]
    const qualify = byTime(list, kinds?.qualifyMs)
    const race = byTime(list, kinds?.raceMs, qualify)
    const best = [fastest, qualify, race].filter((l): l is LapChoice => !!l).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? null
    const sorted = [...list].sort((a, b) => (a.lapNumber ?? 0) - (b.lapNumber ?? 0)).map(l => ({ ...l, best: l.key === best?.key }))
    const marked = (l: LapChoice | null, c?: LapRunConditions | null) => {
      const found = l ? sorted.find(s => s.key === l.key) ?? null : null
      if (!found) return null
      // The summary counts valid laps only: a lap it names is valid even when the file list did not say.
      const named = found.key === qualify?.key || found.key === race?.key
      return { ...found, status: named ? 'valid' as const : found.status, conditions: found.conditions ?? c ?? null }
    }
    return { token, laps: sorted, best: marked(best), qualify: marked(qualify, kinds?.qualifyConditions), race: marked(race, kinds?.raceConditions) }
  })
}

/** Case, accents and spaces do not matter; a part of the nickname is enough. */
export function normalizeSearch(text: string | null | undefined): string {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
export function matchesDriver(nickname: string | null | undefined, query: string): boolean {
  const q = normalizeSearch(query)
  return !q || normalizeSearch(nickname).includes(q)
}

/** The departure fuel of a library lap (older laps only know the lap's own fuel). */
export const libraryFuel = (e: LibraryLapLike) => typeof e.stintFuelL === 'number' ? e.stintFuelL : typeof e.fuelL === 'number' ? e.fuelL : null
/** Its kind as the Worker files it; older entries by their fuel (unknown = qualifying, as the Worker). */
export function libraryKind(e: LibraryLapLike): LapKind {
  if (e.kind === 'qualify' || e.kind === 'race') return e.kind
  const fuel = libraryFuel(e)
  return fuel !== null && fuel > 20 ? 'race' : 'qualify'
}

/**
 * 02/11 (user): "Altri piloti" = at most two rows per driver, best qualifying and best race, no list of laps.
 * Drivers ordered by their fastest row (rank per driver); qualifying before race inside a driver.
 */
export function driverBestRows(entries: LibraryLapLike[], nicknames: Record<string, string | null>, myUid: string | null): DriverBestRow[] {
  const best = new Map<string, LibraryLapLike>()
  for (const e of entries) {
    const key = `${e.uid}|${libraryKind(e)}`
    const prev = best.get(key)
    if (!prev || e.lapTimeMs < prev.lapTimeMs) best.set(key, e)
  }
  const byDriver = new Map<string, LibraryLapLike[]>()
  for (const e of best.values()) byDriver.set(e.uid, [...(byDriver.get(e.uid) ?? []), e])
  const order = [...byDriver].sort(([, a], [, b]) => Math.min(...a.map(e => e.lapTimeMs)) - Math.min(...b.map(e => e.lapTimeMs)))
  return order.flatMap(([uid, list], i) => list.sort((a, b) => (libraryKind(a) === 'qualify' ? 0 : 1) - (libraryKind(b) === 'qualify' ? 0 : 1))
    .map(entry => ({ rank: i + 1, uid, nickname: nicknames[uid] ?? null, mine: !!myUid && uid === myUid, kind: libraryKind(entry), entry })))
}

/**
 * 01/11 (user decision, same rule as the stints, PIP-649): a lap started with 20 L or less is a qualifying
 * lap, more is a race lap; unknown without the fuel. Comparing like with like: race with race.
 */
export type LapKind = 'qualify' | 'race'
export function lapKind(fuelL: number | null | undefined): LapKind | null {
  return typeof fuelL === 'number' && Number.isFinite(fuelL) && fuelL > 0 ? (fuelL <= 20 ? 'qualify' : 'race') : null
}

/** dev.10 (user 05/11): the fuel bands of the library and of the suggestion (departure fuel of the stint). */
export type FuelBand = 'qualify' | '20-40' | '40-60' | '60-80' | '80-100' | '100+'
export const FUEL_BANDS: readonly FuelBand[] = ['qualify', '20-40', '40-60', '60-80', '80-100', '100+']
export function fuelBand(fuelL: number | null | undefined): FuelBand | null {
  if (typeof fuelL !== 'number' || !Number.isFinite(fuelL) || fuelL <= 0) return null
  return fuelL <= 20 ? 'qualify' : fuelL <= 40 ? '20-40' : fuelL <= 60 ? '40-60' : fuelL <= 80 ? '60-80' : fuelL <= 100 ? '80-100' : '100+'
}
/** How far apart two bands are (0 = the same); unknown counts as far. */
export const bandDistance = (a: FuelBand | null, b: FuelBand | null) => a === null || b === null ? 9 : Math.abs(FUEL_BANDS.indexOf(a) - FUEL_BANDS.indexOf(b))
export const isWetGrip = (grip: string | null | undefined) => typeof grip === 'string' && /damp|wet|flood/i.test(grip)

/** What a lap was: qualifying or race, its fuel band, wet or dry (null = unknown). */
export interface LapClass { kind: LapKind | null, band: FuelBand | null, wet: boolean | null }
/**
 * dev.10 (Codex 05/11): the kind comes from the stint's departure fuel (a race stint's 12th lap with 12 L
 * left is still a race lap); the lap's own fuel only when that is all a lap carries. A replay knows none.
 */
export function traceClass(trace: { stintFuelL?: number | null, fuelL: number | null, fuelUncertain?: boolean, tyreCompound?: 'dry' | 'wet' | null,
  conditions: { grip?: string | null } | null } | null | undefined, row?: LapSessionRow | null): LapClass {
  if (!trace) return { kind: null, band: null, wet: null }
  const departure = typeof trace.stintFuelL === 'number' ? trace.stintFuelL : typeof row?.stint_fuel === 'number' ? row.stint_fuel : trace.fuelUncertain ? null : trace.fuelL
  const band = fuelBand(departure)
  const grip = trace.conditions?.grip ?? row?.track_grip_status ?? null
  const wet = trace.tyreCompound === 'wet' || isWetGrip(grip) ? true : grip || trace.tyreCompound === 'dry' ? false : null
  return { kind: band === null ? null : band === 'qualify' ? 'qualify' : 'race', band, wet }
}
/** The same for a library entry (the Worker's slot when it gave one, else its fuel and grip). */
export function libraryClass(e: LibraryLapLike & { wet?: boolean | null }): LapClass {
  const band = fuelBand(libraryFuel(e)) ?? (e.kind === 'qualify' || libraryFuel(e) === null ? 'qualify' : null)
  return { kind: band === 'qualify' ? 'qualify' : band ? 'race' : libraryKind(e), band, wet: typeof e.wet === 'boolean' ? e.wet : e.grip ? isWetGrip(e.grip) : null }
}
/** dev.10: how far a suggestion had to move from your lap's class, said in the reason ("never empty"). */
export type Relaxed = 'band' | 'weather' | 'kind'
/** The laps of the same kind as `you` when there is at least one; otherwise all of them. */
export function sameKindFirst<T>(laps: T[], kindOf: (lap: T) => LapKind | null, you: LapKind | null): T[] {
  if (!you) return laps
  const same = laps.filter(l => kindOf(l) === you)
  return same.length ? same : laps
}

/** How much quicker `faster` is than `slower`, in % with one decimal. */
export function pctFaster(fasterMs: number, slowerMs: number): number {
  return slowerMs > 0 ? Math.round((slowerMs - fasterMs) / slowerMs * 1000) / 10 : 0
}

/**
 * The reference on open. dev.10 (user 05/11, as Track Titan's personalised lap): a step ahead of you in
 * your class first (another driver 1-2% quicker, same kind, weather and fuel band, the ladder said in the
 * reason); then the coach lap if it is quicker than "Tu"; then your best valid lap of the same kind if it
 * beats "Tu"; then your theoretical lap; then your next best lap. Always a reason.
 * (Until 31/10 your own best lap came first: the user chose the step ahead on 05/11.)
 */
export function chooseDefaultReference(o: { you: LapEntryLike | null, mine: LapEntryLike[], stepUp: LapEntryLike | null, stepUpDriver?: string | null,
  stepUpRelaxed?: Relaxed | null, coach?: (LapEntryLike & { coachSession?: string | null, coachOtherCar?: boolean, coachFuelKnown?: boolean }) | null, ideal?: LapEntryLike | null,
  kindOf?: (id: string) => LapKind | null }): { id: string, reason: RefReason } | null {
  const you = o.you
  const kindOf = (e: LapEntryLike) => o.kindOf?.(e.id) ?? null
  const quicker = (e: LapEntryLike | null | undefined): e is LapEntryLike => !!e && e.id !== you?.id && (!you || e.lapTimeMs < you.lapTimeMs)
  // 01/11: your laps of the same kind as "Tu" first (race with race, qualifying with qualifying).
  const valid = sameKindFirst(o.mine.filter(e => e.valid && e.complete && !e.note && e.id !== you?.id), kindOf, you ? kindOf(you) : null)
    .sort((a, b) => a.lapTimeMs - b.lapTimeMs)
  const best = valid[0]
  const bestOfMyKind = best && you && kindOf(best) !== null && kindOf(best) === kindOf(you) && best.lapTimeMs < you.lapTimeMs ? best : null
  // Codex 05/11: a driver of another kind (the ladder's last step) never beats your own quicker lap of Tu's kind.
  if (o.stepUp && o.stepUp.id !== you?.id && !(o.stepUpRelaxed === 'kind' && bestOfMyKind)) return { id: o.stepUp.id, reason: { kind: 'stepUp', driver: o.stepUpDriver ?? o.stepUp.driver ?? null,
    pct: you ? pctFaster(o.stepUp.lapTimeMs, you.lapTimeMs) : 0, relaxed: o.stepUpRelaxed ?? null } }
  if (quicker(o.coach)) return { id: o.coach.id, reason: { kind: 'coach', driver: o.coach.driver ?? null, session: coachSessionOf(o.coach.coachSession), otherCar: o.coach.coachOtherCar ? 'class' : null, fuelKnown: o.coach.coachFuelKnown === true } }
  if (best && (!you || best.lapTimeMs < you.lapTimeMs)) return { id: best.id, reason: { kind: 'myBest' } }
  if (quicker(o.ideal)) return { id: o.ideal.id, reason: { kind: 'ideal' } }
  if (best) return { id: best.id, reason: { kind: 'nextBest' } }
  const any = o.mine.find(e => e.complete && e.id !== you?.id)
  return any ? { id: any.id, reason: { kind: 'sessionBest' } } : null
}
/**
 * dev.10 (PIP-720 spy): the numbers the diary keeps about a proposed reference. KO when its kind differs
 * from Tu's while a quicker lap of Tu's kind was there (`kindAvailable`). Unknown kinds never mismatch.
 */
export function referencePickNote(reason: RefReason, youKind: LapKind | null, pickKind: LapKind | null, kindAvailable: boolean) {
  const ORIGIN: Partial<Record<RefReason['kind'], number>> = { stepUp: 1, coach: 2, myBest: 3, ideal: 4, nextBest: 5 }
  const RELAXED: Record<Relaxed, number> = { band: 1, weather: 2, kind: 3 }
  const relaxed = reason.kind === 'stepUp' && reason.relaxed ? RELAXED[reason.relaxed] : 0
  return { event: 'laps.reference_pick' as const, origin: ORIGIN[reason.kind] ?? 6, relaxed,
    kindWrong: youKind && pickKind && youKind !== pickKind && kindAvailable ? 1 : 0 }
}
export const coachSessionOf =(s: string | null | undefined) => s === 'practice' || s === 'qualifying' || s === 'race' ? s : null

/** A row may become this side: whole laps only, never the lap already on the other side. */
export function choiceBlock(choice: LapChoice | null, otherKey: string | null): 'none' | 'incomplete' | 'sameLap' | null {
  if (!choice) return 'none'
  if (choice.status === 'incomplete') return 'incomplete'
  return otherKey && choice.key === otherKey ? 'sameLap' : null
}

/** The session link of the site (`/sessioni/<id>?userId=<uid>`); the lap links live in lapShareLink. */
export function parseSessionLink(url: string | null | undefined): { sessionId: string, userId: string } | null {
  const match = String(url ?? '').match(/\/sessioni\/([^?]+)\?userId=([^&]+)/)
  return match && match[1] && match[2] ? { sessionId: match[1], userId: match[2] } : null
}
export function classifyLink(text: string | null | undefined): 'empty' | 'lap' | 'session' | 'unknown' {
  const value = String(text ?? '').trim()
  if (!value) return 'empty'
  if (parseLapShareLink(value)) return 'lap'
  return parseSessionLink(value) ? 'session' : 'unknown'
}

/** The same track as the shown lap (names compared loosely, as the session picker does). */
export function sameTrackName(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '_')
  const x = n(a), y = n(b)
  return !!x && !!y && (x.includes(y) || y.includes(x))
}
