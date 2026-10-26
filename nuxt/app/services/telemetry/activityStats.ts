// PIP-619: Statistiche di attivita' (solo ACC). Logica pura, nessun I/O.
//
// Due sorgenti, entrambe a costo quasi zero su Firebase:
// - la lista sessioni gia' proiettata (ore, auto, periodi, miglior giro per sessione);
// - un solo riepilogo per utente (`sessionListMeta/statsV1`) calcolato sul PC dai file delle
//   sessioni: migliori settori, migliori giri per fascia di temperatura dell'aria e per grip,
//   per pista+auto. Nessun dato per giro va su Firebase.
import { normalizeSessionListKey } from '~/services/sync/sessionListProjectionService'
import { recordingGame } from '~/services/telemetry/gameIdentity'
import type { SessionDocument } from '~/types/telemetry'

export const STATS_SUMMARY_SCHEMA_VERSION = 3
/** Fasce dell'aria a estremi non sovrapposti: [min, max). */
export const AIR_BANDS = [
  { id: 'lt15', label: '< 15°', min: -Infinity, max: 15 },
  { id: '15-20', label: '15–20°', min: 15, max: 20 },
  { id: '20-25', label: '20–25°', min: 20, max: 25 },
  { id: '25-30', label: '25–30°', min: 25, max: 30 },
  { id: 'ge30', label: '≥ 30°', min: 30, max: Infinity },
] as const
export type AirBandId = typeof AIR_BANDS[number]['id']
export const GRIP_ORDER = ['Green', 'Fast', 'Optimum', 'Greasy', 'Damp', 'Wet', 'Flooded'] as const

type Sectors = [number | null, number | null, number | null]

/** Contributo di una sessione: piccolo, si mette in cache per file sul PC. */
export interface SessionStatsContribution {
  key: string
  track: string
  car: string
  date: string
  bestLapMs: number | null
  bestSectorsMs: Sectors
  byAir: Partial<Record<AirBandId, number>>
  byGrip: Record<string, number>
}

export interface ComboStats {
  track: string
  car: string
  sessions: number
  lastDate: string
  bestLapMs: number | null
  bestSectorsMs: Sectors
  byAir: Partial<Record<AirBandId, number>>
  byGrip: Record<string, number>
}

export interface StatsSummary {
  schemaVersion: number
  updatedAt: string
  /**
   * Sessioni contate (id della lista) -> giri validi quando sono state contate. Una sessione si
   * riconta solo se nella lista i giri validi cambiano (es. sincronizzata a meta' e poi completata).
   */
  counted: Record<string, number>
  /** Letture online di oggi per lo storico, condivise fra i PC dell'utente (tetto giornaliero). */
  cloudReads: { day: string, count: number }
  /** Chiave `${trackKey}|${carKey}`, stesse chiavi della lista sessioni. */
  combos: Record<string, ComboStats>
}

/** Una sessione esaminata: il suo contributo (o null) e i giri validi della lista in quel momento. */
export interface StatsSessionUpdate { sessionId: string, lapsValid: number, contribution: SessionStatsContribution | null }

/** Oltre questa dimensione il documento si avvicina al limite di Firestore (1 MiB): non si scrive. */
export const STATS_SUMMARY_MAX_BYTES = 900_000

export class StatsSummaryTooLargeError extends Error {
  constructor() { super('stats-summary-too-large') }
}

const positive = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null)
const minOf = (a: number | null | undefined, b: number | null | undefined) => (a == null ? (b ?? null) : b == null ? a : Math.min(a, b))

export function airBandOf(airC: unknown): AirBandId | null {
  if (typeof airC !== 'number' || !Number.isFinite(airC)) return null
  return AIR_BANDS.find(band => airC >= band.min && airC < band.max)?.id ?? null
}

export function comboKey(track: string, car: string): string {
  return `${normalizeSessionListKey(track)}|${normalizeSessionListKey(car)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- file sessione grezzo del logger
type RawSession = any

/** Giro utile per i record: valido, completo, tempo reale. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- giro grezzo del logger
function usableLap(lap: any): boolean {
  if (!lap || lap.is_valid !== true || positive(lap.lap_time_ms) === null) return false
  if (lap.completeness !== undefined && lap.completeness !== 'complete') return false
  return lap.validity === undefined || lap.validity === 'valid'
}

/** Contributo di un file sessione ACC; `null` se non e' ACC o non ha giri utili. */
export function contributionFromSession(raw: RawSession): SessionStatsContribution | null {
  if (recordingGame(raw) !== 'acc') return null
  const track = String(raw?.session_info?.track || '')
  const car = String(raw?.session_info?.car || '')
  if (!track || !car) return null
  const out: SessionStatsContribution = {
    key: comboKey(track, car), track, car, date: String(raw?.session_info?.date_start || ''),
    bestLapMs: null, bestSectorsMs: [null, null, null], byAir: {}, byGrip: {},
  }
  let any = false
  for (const stint of Array.isArray(raw?.stints) ? raw.stints : []) {
    for (const lap of Array.isArray(stint?.laps) ? stint.laps : []) {
      if (!usableLap(lap)) continue
      any = true
      const ms = lap.lap_time_ms as number
      out.bestLapMs = minOf(out.bestLapMs, ms)
      const band = airBandOf(lap.air_temp)
      if (band) out.byAir[band] = minOf(out.byAir[band], ms) as number
      const grip = typeof lap.track_grip_status === 'string' && lap.track_grip_status ? lap.track_grip_status : null
      if (grip) out.byGrip[grip] = minOf(out.byGrip[grip], ms) as number
      const sectors = Array.isArray(lap.sector_times_ms) ? lap.sector_times_ms : []
      if (lap.sectors_reliable === true && sectors.length === 3 && sectors.every((s: unknown) => positive(s) !== null)) {
        for (let i = 0; i < 3; i++) out.bestSectorsMs[i] = minOf(out.bestSectorsMs[i], sectors[i])
      }
    }
  }
  return any ? out : null
}

/**
 * Aggiunge al riepilogo le sessioni appena esaminate (anche quelle senza giri utili: non vanno
 * rilette) e le letture online di oggi. I minimi sono idempotenti: ricontare una sessione cambiata
 * non sporca i record; il conteggio delle sessioni per combinazione sale solo per id nuovi.
 */
export function mergeStatsSummary(base: StatsSummary | null, updates: StatsSessionUpdate[], updatedAt: string, cloudReads = 0): StatsSummary {
  const combos: Record<string, ComboStats> = { ...(base?.combos ?? {}) }
  const counted: Record<string, number> = { ...(base?.counted ?? {}) }
  for (const u of updates) {
    const isNew = !(u.sessionId in counted)
    counted[u.sessionId] = u.lapsValid
    const c = u.contribution
    if (!c) continue
    const prev = combos[c.key] ?? { track: c.track, car: c.car, sessions: 0, lastDate: '', bestLapMs: null, bestSectorsMs: [null, null, null] as Sectors, byAir: {}, byGrip: {} }
    const byAir = { ...prev.byAir }
    for (const [band, ms] of Object.entries(c.byAir) as [AirBandId, number][]) byAir[band] = minOf(byAir[band], ms) as number
    const byGrip = { ...prev.byGrip }
    for (const [grip, ms] of Object.entries(c.byGrip)) byGrip[grip] = minOf(byGrip[grip], ms) as number
    const newer = c.date > prev.lastDate
    combos[c.key] = {
      track: newer ? c.track : prev.track, car: newer ? c.car : prev.car,
      sessions: prev.sessions + (isNew ? 1 : 0), lastDate: newer ? c.date : prev.lastDate,
      bestLapMs: minOf(prev.bestLapMs, c.bestLapMs),
      bestSectorsMs: prev.bestSectorsMs.map((s, i) => minOf(s, c.bestSectorsMs[i])) as Sectors,
      byAir, byGrip,
    }
  }
  const day = updatedAt.slice(0, 10)
  const already = base?.cloudReads?.day === day ? base.cloudReads.count : 0
  const summary: StatsSummary = { schemaVersion: STATS_SUMMARY_SCHEMA_VERSION, updatedAt, counted, cloudReads: { day, count: already + cloudReads }, combos }
  if (new TextEncoder().encode(JSON.stringify(summary)).length > STATS_SUMMARY_MAX_BYTES) throw new StatsSummaryTooLargeError()
  return summary
}

/** Impronta del contenuto (senza data e contatori): se non cambia, i record non si riscrivono. */
export function statsSummaryFingerprint(summary: StatsSummary): string {
  // Chiavi ordinate a ogni livello: l'ordine dei file letti non cambia l'impronta.
  const canonical = (value: unknown): unknown => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical((value as Record<string, unknown>)[k])]))
    : value
  return JSON.stringify(canonical({ v: summary.schemaVersion, counted: summary.counted, combos: summary.combos }))
}

/** Riepilogo letto da Firestore: scarta schemi diversi o forme rotte. */
export function parseStatsSummary(value: unknown): StatsSummary | null {
  const v = value as Partial<StatsSummary> | null
  if (!v || v.schemaVersion !== STATS_SUMMARY_SCHEMA_VERSION || !v.combos || typeof v.combos !== 'object' || !v.counted || typeof v.counted !== 'object') return null
  const counted = Object.fromEntries(Object.entries(v.counted).filter(([, n]) => typeof n === 'number' && Number.isFinite(n)))
  const reads = v.cloudReads && typeof v.cloudReads.day === 'string' ? { day: v.cloudReads.day, count: Number(v.cloudReads.count) || 0 } : { day: '', count: 0 }
  return { schemaVersion: v.schemaVersion, updatedAt: String(v.updatedAt || ''), counted, cloudReads: reads, combos: v.combos as Record<string, ComboStats> }
}

export function idealLapMs(sectors: Sectors): number | null {
  return sectors.every(s => s !== null) ? (sectors as number[]).reduce((a, b) => a + b, 0) : null
}

// ---- Vista: dalla lista sessioni ----

export interface StatsFilter { periodDays: number | null, trackKey: string | null, carKey: string | null, sessionType: number | null }

export function filterSessions(sessions: SessionDocument[], filter: StatsFilter, nowMs: number): SessionDocument[] {
  const from = filter.periodDays ? nowMs - filter.periodDays * 86_400_000 : -Infinity
  return sessions.filter((s) => {
    if ((s.meta?.gameId ?? 'acc') !== 'acc') return false
    const at = Date.parse(s.meta?.date_start || '')
    if (!Number.isFinite(at) || at < from) return false
    if (filter.trackKey && normalizeSessionListKey(s.meta?.track || '') !== filter.trackKey) return false
    if (filter.carKey && normalizeSessionListKey(s.meta?.car || '') !== filter.carKey) return false
    return filter.sessionType === null || Number(s.meta?.session_type) === filter.sessionType
  })
}

export interface CarTime { carKey: string, car: string, timeMs: number, sessions: number, laps: number, lapsValid: number }

export function timeByCar(sessions: SessionDocument[]): CarTime[] {
  const map = new Map<string, CarTime>()
  for (const s of sessions) {
    const car = s.meta?.car || ''
    const key = normalizeSessionListKey(car)
    const row = map.get(key) ?? { carKey: key, car, timeMs: 0, sessions: 0, laps: 0, lapsValid: 0 }
    row.timeMs += Number(s.summary?.totalTime) || 0
    row.sessions += 1
    row.laps += Number(s.summary?.laps) || 0
    row.lapsValid += Number(s.summary?.lapsValid) || 0
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.timeMs - a.timeMs)
}

/** Ore per settimana (lunedi' UTC), dalla piu' vecchia alla piu' recente, settimane vuote incluse. */
export function timeByWeek(sessions: SessionDocument[], weeks: number, nowMs: number): { weekStart: string, timeMs: number }[] {
  const monday = (ms: number) => { const d = new Date(ms); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) }
  const last = monday(nowMs)
  const buckets = Array.from({ length: weeks }, (_, i) => ({ start: last - (weeks - 1 - i) * 7 * 86_400_000, timeMs: 0 }))
  for (const s of sessions) {
    const at = Date.parse(s.meta?.date_start || '')
    if (!Number.isFinite(at)) continue
    const bucket = buckets.find(b => b.start === monday(at))
    if (bucket) bucket.timeMs += Number(s.summary?.totalTime) || 0
  }
  return buckets.map(b => ({ weekStart: new Date(b.start).toISOString().slice(0, 10), timeMs: b.timeMs }))
}

export interface CarComparisonRow { trackKey: string, track: string, bestA: number | null, bestB: number | null, gapMs: number | null, timeA: number, timeB: number }

/** Due auto sulle stesse piste: miglior giro di sessione e ore di ciascuna. */
export function compareCars(sessions: SessionDocument[], carA: string, carB: string): CarComparisonRow[] {
  const rows = new Map<string, CarComparisonRow>()
  for (const s of sessions) {
    const carKey = normalizeSessionListKey(s.meta?.car || '')
    const side = carKey === carA ? 'A' : carKey === carB ? 'B' : null
    if (!side) continue
    const trackKey = normalizeSessionListKey(s.meta?.track || '')
    const row = rows.get(trackKey) ?? { trackKey, track: s.meta?.track || '', bestA: null, bestB: null, gapMs: null, timeA: 0, timeB: 0 }
    const best = positive(s.summary?.bestLap)
    if (side === 'A') { row.bestA = minOf(row.bestA, best); row.timeA += Number(s.summary?.totalTime) || 0 }
    else { row.bestB = minOf(row.bestB, best); row.timeB += Number(s.summary?.totalTime) || 0 }
    rows.set(trackKey, row)
  }
  return [...rows.values()]
    .map(r => ({ ...r, gapMs: r.bestA !== null && r.bestB !== null ? r.bestB - r.bestA : null }))
    .sort((a, b) => Number(b.gapMs !== null) - Number(a.gapMs !== null) || a.track.localeCompare(b.track))
}

// ---- Vista: dal riepilogo ----

export function filterCombos(summary: StatsSummary | null, filter: Pick<StatsFilter, 'trackKey' | 'carKey'>): (ComboStats & { key: string })[] {
  if (!summary) return []
  return Object.entries(summary.combos)
    .filter(([key]) => {
      const [trackKey, carKey] = key.split('|')
      return (!filter.trackKey || trackKey === filter.trackKey) && (!filter.carKey || carKey === filter.carKey)
    })
    .map(([key, combo]) => ({ key, ...combo }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
}

