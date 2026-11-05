/**
 * dev.10 (user 05/11): the stint of "Tu" under the minimap, in one glance, as on the Sessione page:
 *   Stint 2 · Gara · 52 → 31 L
 *   Passo medio 1:46.9 (14 giri puliti) · Validi 15 · Non validi 2
 *   Migliore 1:46.19 · Teorico 1:45.72 · 2,98 L/giro · Aria 18° · Pista 24°
 * Pure: the session's lap rows in, the facts out. The average pace is recomputed from the clean laps
 * (valid, not through the pits; Codex 05/11: a saved average can be stale) and only from 5 of them, as
 * the Sessione page. Pit and unknown laps are neither valid nor invalid.
 */
import { MIN_CLEAN_LAPS_FOR_AVG } from '~/services/session-detail/sessionStintMetrics'
import { fuelBand, type LapKind } from './lapChoice'

export interface StintLapRow {
  lap_number: number
  lap_time_ms: number | null
  is_valid: boolean | null
  stint?: number | null
  stint_fuel?: number | null
  fuel_used?: number | null
  has_pit_stop?: boolean | null
  pit_out_lap?: boolean | null
  air_temp?: number | null
  road_temp?: number | null
}

export interface StintFacts {
  stint: number
  kind: LapKind | null
  startFuelL: number | null
  endFuelL: number | null
  laps: number
  valid: number
  invalid: number
  cleanCount: number
  avgMs: number | null
  bestMs: number | null
  theoreticalMs: number | null
  fuelPerLapL: number | null
  airC: number | null
  roadC: number | null
}

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null
const mean = (list: number[]) => list.length ? list.reduce((s, v) => s + v, 0) / list.length : null

export function stintFacts(rows: StintLapRow[], lapNumber: number | null, theoreticalMs: number | null = null): StintFacts | null {
  const you = rows.find(r => r.lap_number === lapNumber)
  if (!you) return null
  const stint = num(you.stint) ?? 1
  const laps = rows.filter(r => (num(r.stint) ?? 1) === stint).sort((a, b) => a.lap_number - b.lap_number)
  const pit = (r: StintLapRow) => !!r.has_pit_stop || !!r.pit_out_lap
  const clean = laps.filter(r => r.is_valid === true && !pit(r) && (num(r.lap_time_ms) ?? 0) > 0)
  const startFuelL = num(you.stint_fuel)
  const burned = laps.map(r => num(r.fuel_used)).filter((v): v is number => v !== null && v > 0)
  const cleanBurn = clean.map(r => num(r.fuel_used)).filter((v): v is number => v !== null && v > 0)
  const band = fuelBand(startFuelL)
  const bestMs = clean.length ? Math.min(...clean.map(r => r.lap_time_ms as number)) : null
  return {
    stint,
    kind: band === null ? null : band === 'qualify' ? 'qualify' : 'race',
    startFuelL,
    endFuelL: startFuelL !== null && burned.length ? Math.max(0, startFuelL - burned.reduce((s, v) => s + v, 0)) : null,
    laps: laps.length,
    valid: laps.filter(r => r.is_valid === true && !pit(r)).length,
    invalid: laps.filter(r => r.is_valid === false && !pit(r)).length,
    cleanCount: clean.length,
    avgMs: clean.length >= MIN_CLEAN_LAPS_FOR_AVG ? Math.round(mean(clean.map(r => r.lap_time_ms as number))!) : null,
    bestMs,
    // The theoretical lap only when it beats the stint's best (it is built from more laps than this stint's).
    theoreticalMs: theoreticalMs !== null && (bestMs === null || theoreticalMs < bestMs) ? theoreticalMs : null,
    fuelPerLapL: mean(cleanBurn.length ? cleanBurn : burned),
    airC: mean(laps.map(r => num(r.air_temp)).filter((v): v is number => v !== null)),
    roadC: mean(laps.map(r => num(r.road_temp)).filter((v): v is number => v !== null)),
  }
}
