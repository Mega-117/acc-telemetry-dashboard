// PIP-633: "da dove sei partito, dove stai andando". Tendenze rispetto al periodo prima (come Apple
// Fitness), calendario dei giorni di guida (come Strava), record personali per pista e auto (come
// Garmin/GTLane) e progressi nel tempo. Solo raggruppamenti della lista sessioni gia' caricata.
import type { SessionDocument } from '~/types/telemetry'
import type { StatsFilter } from '~/services/telemetry/activityStats'
import { normalizeSessionListKey } from '~/services/sync/sessionListProjectionService'

const DAY_MS = 86_400_000
const startOf = (s: SessionDocument) => Date.parse(s.meta?.date_start || '')
const positive = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const isAcc = (s: SessionDocument) => (s.meta?.gameId ?? 'acc') === 'acc'
/** Giorno di calendario locale AAAA-MM-GG. */
export const localDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** "26/10" o "26/10/26" nel calendario locale (un orario UTC di notte puo' essere il giorno dopo). */
export function shortDate(iso: string, withYear = false): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const [y, m, d] = localDay(ms).split('-')
  return withYear ? `${d}/${m}/${y!.slice(2)}` : `${d}/${m}`
}

// ---- Tendenze: il periodo scelto contro quello subito prima, della stessa durata ----

export interface PeriodTotals { timeMs: number, sessions: number, laps: number, validPct: number | null }

export function periodTotals(sessions: SessionDocument[]): PeriodTotals {
  let timeMs = 0, laps = 0, valid = 0
  for (const s of sessions) {
    timeMs += Number(s.summary?.totalTime) || 0
    laps += Number(s.summary?.laps) || 0
    valid += Number(s.summary?.lapsValid) || 0
  }
  return { timeMs, sessions: sessions.length, laps, validPct: laps ? Math.round((valid / laps) * 100) : null }
}

/** Le sessioni del periodo precedente con gli stessi filtri; con "Tutto" non c'e' un prima. */
export function previousPeriodSessions(sessions: SessionDocument[], filter: StatsFilter, nowMs: number): SessionDocument[] | null {
  if (!filter.periodDays) return null
  const to = nowMs - filter.periodDays * DAY_MS
  const from = to - filter.periodDays * DAY_MS
  return sessions.filter((s) => {
    const at = startOf(s)
    if (!isAcc(s) || !Number.isFinite(at) || at < from || at >= to) return false
    if (filter.trackKey && normalizeSessionListKey(s.meta?.track || '') !== filter.trackKey) return false
    if (filter.carKey && normalizeSessionListKey(s.meta?.car || '') !== filter.carKey) return false
    return filter.sessionType === null || Number(s.meta?.session_type) === filter.sessionType
  })
}

export function trend(current: number | null, previous: number | null): { delta: number, direction: 'up' | 'down' | 'flat' } | null {
  if (current === null || previous === null) return null
  const delta = current - previous
  return { delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' }
}

// ---- Calendario: un quadretto per giorno, colore relativo al tuo giorno piu' lungo ----

export interface CalendarDay { date: string, timeMs: number, sessions: number, level: 0 | 1 | 2 | 3 | 4, future: boolean }

/** Settimane da lunedi' a domenica (colonne), le ultime `weeks` fino a oggi. */
export function calendarWeeks(sessions: SessionDocument[], weeks: number, nowMs: number): CalendarDay[][] {
  const byDay = new Map<string, { timeMs: number, sessions: number }>()
  for (const s of sessions) {
    const at = startOf(s)
    if (!isAcc(s) || !Number.isFinite(at)) continue
    const key = localDay(at)
    const day = byDay.get(key) ?? { timeMs: 0, sessions: 0 }
    day.timeMs += Number(s.summary?.totalTime) || 0
    day.sessions += 1
    byDay.set(key, day)
  }
  const today = new Date(nowMs)
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
  const first = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (weeks - 1) * 7)
  const days: Omit<CalendarDay, 'level'>[] = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)
    const key = localDay(d.getTime())
    const v = byDay.get(key)
    days.push({ date: key, timeMs: v?.timeMs ?? 0, sessions: v?.sessions ?? 0, future: d.getTime() > nowMs })
  }
  const max = Math.max(0, ...days.map(d => d.timeMs))
  const level = (t: number): CalendarDay['level'] => (!t || !max ? 0 : t <= max * 0.25 ? 1 : t <= max * 0.5 ? 2 : t <= max * 0.75 ? 3 : 4)
  const out: CalendarDay[][] = []
  for (let w = 0; w < weeks; w++) out.push(days.slice(w * 7, w * 7 + 7).map(d => ({ ...d, level: d.sessions && !d.timeMs ? 1 : level(d.timeMs) })))
  return out
}

export interface DrivingHabits { daysDriven: number, longestStreak: number, currentStreak: number, longestSessionMs: number }

export function drivingHabits(sessions: SessionDocument[], nowMs: number): DrivingHabits {
  const days = new Set<string>()
  let longestSessionMs = 0
  for (const s of sessions) {
    const at = startOf(s)
    if (!isAcc(s) || !Number.isFinite(at)) continue
    days.add(localDay(at))
    longestSessionMs = Math.max(longestSessionMs, Number(s.summary?.totalTime) || 0)
  }
  const sorted = [...days].sort()
  let longest = 0, run = 0, prev: number | null = null
  for (const d of sorted) {
    const t = Date.parse(`${d}T12:00:00`)
    run = prev !== null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = t
  }
  // Serie in corso: fino a oggi o a ieri (oggi puoi ancora guidare).
  let current = 0
  const cursor = new Date(nowMs)
  if (!days.has(localDay(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
  while (days.has(localDay(cursor.getTime()))) { current += 1; cursor.setDate(cursor.getDate() - 1) }
  return { daysDriven: days.size, longestStreak: longest, currentStreak: current, longestSessionMs }
}

// ---- Record personali: qualifica, gara, media gara e giro secco per pista e auto, di sempre ----

export interface RecordTime { ms: number, date: string }
export interface RecordRow {
  key: string, trackKey: string, carKey: string, track: string, car: string, sessions: number, lastDate: string
  bestLap: RecordTime | null, qualy: RecordTime | null, race: RecordTime | null, avgRace: RecordTime | null
  /** Un record fatto negli ultimi 7 giorni. */
  isNew: boolean
}

export function personalRecords(sessions: SessionDocument[], nowMs: number): RecordRow[] {
  const rows = new Map<string, RecordRow>()
  // A parita' di tempo conta la prima volta che l'hai fatto, qualunque sia l'ordine della lista.
  const better = (cur: RecordTime | null, ms: number | null, date: string) => {
    if (ms === null) return cur
    if (!cur || ms < cur.ms || (ms === cur.ms && Date.parse(date) < Date.parse(cur.date))) return { ms, date }
    return cur
  }
  for (const s of sessions) {
    const at = startOf(s)
    if (!isAcc(s) || !Number.isFinite(at)) continue
    const trackKey = normalizeSessionListKey(s.meta?.track || ''), carKey = normalizeSessionListKey(s.meta?.car || '')
    if (!trackKey || !carKey) continue
    const key = `${trackKey}|${carKey}`
    const date = s.meta.date_start
    const row = rows.get(key) ?? { key, trackKey, carKey, track: s.meta.track, car: s.meta.car, sessions: 0, lastDate: date, bestLap: null, qualy: null, race: null, avgRace: null, isNew: false }
    row.sessions += 1
    if (date > row.lastDate) row.lastDate = date
    const sum = s.summary
    row.bestLap = better(row.bestLap, positive(sum?.bestLap), date)
    row.qualy = better(row.qualy, positive(sum?.best_qualy_ms), date)
    row.race = better(row.race, positive(sum?.best_race_ms), date)
    row.avgRace = better(row.avgRace, positive(sum?.best_avg_race_ms), date)
    rows.set(key, row)
  }
  const recent = (t: RecordTime | null) => !!t && nowMs - Date.parse(t.date) <= 7 * DAY_MS
  return [...rows.values()]
    .map(r => ({ ...r, isNew: recent(r.qualy) || recent(r.race) || recent(r.avgRace) }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
}

// ---- Progressi: il tempo di ogni sessione nel tempo, per pista e auto ----

export type ProgressMetric = 'bestLap' | 'qualy' | 'race' | 'avgRace'
const METRIC_FIELD = { bestLap: 'bestLap', qualy: 'best_qualy_ms', race: 'best_race_ms', avgRace: 'best_avg_race_ms' } as const
export interface ProgressPoint { date: string, ms: number }

export function progressSeries(sessions: SessionDocument[], trackKey: string, carKey: string, metric: ProgressMetric): ProgressPoint[] {
  return sessions
    .filter(s => isAcc(s) && normalizeSessionListKey(s.meta?.track || '') === trackKey && normalizeSessionListKey(s.meta?.car || '') === carKey)
    .map(s => ({ date: s.meta.date_start, ms: positive((s.summary as unknown as Record<string, unknown> | undefined)?.[METRIC_FIELD[metric]]) }))
    .filter((p): p is ProgressPoint => p.ms !== null && Number.isFinite(Date.parse(p.date)))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Il migliore del primo terzo delle sessioni contro il migliore dell'ultimo terzo (servono almeno 3 sessioni). */
export function progressDelta(points: ProgressPoint[]): { fromMs: number, toMs: number, deltaMs: number, fromDate: string } | null {
  if (points.length < 3) return null
  const third = Math.max(1, Math.floor(points.length / 3))
  const head = points.slice(0, third), tail = points.slice(-third)
  const fromMs = Math.min(...head.map(p => p.ms)), toMs = Math.min(...tail.map(p => p.ms))
  return { fromMs, toMs, deltaMs: toMs - fromMs, fromDate: head[0]!.date }
}
