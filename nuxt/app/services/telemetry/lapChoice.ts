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
  | { kind: 'stepUp', driver: string | null, pct: number }
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
function gripOf(value: unknown): LapGrip | null {
  if (typeof value !== 'string') return null
  const word = value.trim().toLowerCase()
  const key = word === 'opt' ? 'optimum' : word === 'flood' ? 'flooded' : word
  return (GRIPS as readonly string[]).includes(key) ? key as LapGrip : null
}
/** This session's row of the lap (the table): fills what the lap file does not carry. */
export interface LapSessionRow { air_temp?: number | null, road_temp?: number | null, track_grip_status?: string | null }

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
}

export interface DriverRow { uid: string, nickname: string | null, lapTimeMs: number, rank: number, gapMs: number | null, mine: boolean, libId: string, recordedAt: string | null }

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
export interface SessionKindBests { qualifyMs: number | null, raceMs: number | null }
export interface MySessionRow { token: string, laps: LapChoice[], best: LapChoice | null, qualify: LapChoice | null, race: LapChoice | null }

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
  const byTime = (list: LapChoice[], ms: number | null | undefined) => ms ? list.find(l => usable(l) && Math.abs(l.lapTimeMs - ms) <= 1) ?? null : null
  return [...sessions].sort(([a], [b]) => b.localeCompare(a)).map(([token, list]) => {
    const fastest = list.filter(l => l.status === 'valid' && l.lapTimeMs > 0).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? null
    const kinds = bests[token]
    const qualify = byTime(list, kinds?.qualifyMs), race = byTime(list, kinds?.raceMs)
    const best = [fastest, qualify, race].filter((l): l is LapChoice => !!l).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0] ?? null
    const sorted = [...list].sort((a, b) => (a.lapNumber ?? 0) - (b.lapNumber ?? 0)).map(l => ({ ...l, best: l.key === best?.key }))
    const marked = (l: LapChoice | null) => l ? sorted.find(s => s.key === l.key) ?? null : null
    return { token, laps: sorted, best: marked(best), qualify: marked(qualify), race: marked(race) }
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

/** Best lap per driver here, fastest first, with the gap to my best (positive = slower than me). */
export function leaderboard(entries: { libId: string, uid: string, lapTimeMs: number, recordedAt: string | null }[], nicknames: Record<string, string | null>,
  myUid: string | null, myBestMs: number | null, ownView = false): DriverRow[] {
  const best = new Map<string, (typeof entries)[number]>()
  for (const e of entries) { const prev = best.get(e.uid); if (!prev || e.lapTimeMs < prev.lapTimeMs) best.set(e.uid, e) }
  // 01/11: in your own view (never a coach looking at a pilot: those laps are not the coach's) your row
  // shows your true best here. The library can hold an older, slower lap of yours (a lap not uploaded
  // yet): the row keeps that library lap to open, but ranks with the real time. Gaps use the same best.
  const mineRow = ownView && myUid ? best.get(myUid) : undefined
  if (mineRow && myBestMs && myBestMs < mineRow.lapTimeMs) best.set(myUid!, { ...mineRow, lapTimeMs: myBestMs })
  const base = mineRow ? Math.min(best.get(myUid!)!.lapTimeMs, myBestMs ?? Infinity) : myBestMs
  return [...best.values()].sort((a, b) => a.lapTimeMs - b.lapTimeMs).map((e, i) => ({ uid: e.uid, nickname: nicknames[e.uid] ?? null, lapTimeMs: e.lapTimeMs, rank: i + 1,
    gapMs: base ? e.lapTimeMs - base : null, mine: !!myUid && e.uid === myUid, libId: e.libId, recordedAt: e.recordedAt }))
}

/**
 * 01/11 (user decision, same rule as the stints, PIP-649): a lap started with 20 L or less is a qualifying
 * lap, more is a race lap; unknown without the fuel. Comparing like with like: race with race.
 */
export type LapKind = 'qualify' | 'race'
export function lapKind(fuelL: number | null | undefined): LapKind | null {
  return typeof fuelL === 'number' && Number.isFinite(fuelL) && fuelL > 0 ? (fuelL <= 20 ? 'qualify' : 'race') : null
}
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
 * The reference on open (user decision 31/10): my best valid lap here with this car if it beats "Tu";
 * otherwise the driver a step ahead (the library's suggestion); otherwise my next best lap. Always a reason.
 */
export function chooseDefaultReference(o: { you: LapEntryLike | null, mine: LapEntryLike[], stepUp: LapEntryLike | null, stepUpDriver?: string | null,
  kindOf?: (id: string) => LapKind | null }): { id: string, reason: RefReason } | null {
  const you = o.you
  const kindOf = (e: LapEntryLike) => o.kindOf?.(e.id) ?? null
  // 01/11: your laps of the same kind as "Tu" first (race with race, qualifying with qualifying).
  const valid = sameKindFirst(o.mine.filter(e => e.valid && e.complete && !e.note && e.id !== you?.id), kindOf, you ? kindOf(you) : null)
    .sort((a, b) => a.lapTimeMs - b.lapTimeMs)
  const best = valid[0]
  if (best && (!you || best.lapTimeMs < you.lapTimeMs)) return { id: best.id, reason: { kind: 'myBest' } }
  if (o.stepUp && o.stepUp.id !== you?.id) return { id: o.stepUp.id, reason: { kind: 'stepUp', driver: o.stepUpDriver ?? o.stepUp.driver ?? null, pct: you ? pctFaster(o.stepUp.lapTimeMs, you.lapTimeMs) : 0 } }
  if (best) return { id: best.id, reason: { kind: 'nextBest' } }
  const any = o.mine.find(e => e.complete && e.id !== you?.id)
  return any ? { id: any.id, reason: { kind: 'sessionBest' } } : null
}

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
