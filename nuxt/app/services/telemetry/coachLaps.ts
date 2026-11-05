/**
 * dev.10 (user 05/11): coach laps shipped with the program, from the coach's replays (VRS-style
 * datapacks). The index lists them (track, car, class, time, session, weather at the start); a lap
 * file is a LapTrace v1 with fuel unknown. The choice: same track and car first, else the same class
 * (GT3/GT4, said in the reason); among them the coach lap of your session kind when known (a
 * qualifying replay for qualifying), then the closest weather, then the quickest.
 */
import type { LapClass } from './lapChoice'

export interface CoachLap { id: string, track: string, car: string, carClass: string, lapTimeMs: number, session: string,
  airC: number | null, roadC: number | null, rain: number | null, steer: boolean }
export interface CoachIndex { coach: string, laps: CoachLap[] }

export const COACH_INDEX_SCHEMA = 'racercore.coach_laps.v1'
const SAFE_ID = /^[a-f0-9]{16}$/
const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')

export function parseCoachIndex(raw: unknown): CoachIndex | null {
  const data = raw as { schema?: unknown, coach?: unknown, laps?: unknown } | null
  if (!data || data.schema !== COACH_INDEX_SCHEMA || typeof data.coach !== 'string' || !Array.isArray(data.laps)) return null
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null
  const laps = (data.laps as Record<string, unknown>[]).flatMap((l) => typeof l?.id === 'string' && SAFE_ID.test(l.id) && typeof l.track === 'string' && typeof l.car === 'string'
    && typeof l.lapTimeMs === 'number' && l.lapTimeMs > 0
    ? [{ id: l.id, track: l.track, car: l.car, carClass: String(l.carClass ?? ''), lapTimeMs: l.lapTimeMs, session: String(l.session ?? ''),
        airC: num(l.airC), roadC: num(l.roadC), rain: num(l.rain), steer: l.steer !== false }] : [])
  return { coach: data.coach.slice(0, 40), laps }
}

/** GT3 or GT4 from an ACC model id; null for any other car (Cup, GT2, TCX: Codex 05/11), which gets same-car coach laps only. */
export const carClassOf = (car: string): 'GT3' | 'GT4' | null => /cup|gt2|tcx/i.test(car) ? null : /gt4/i.test(car) ? 'GT4'
  // ACC GT3 models whose id does not say it (Codex 05/11): Audi R8 LMS, Jaguar G3, Gallardo REX.
  : /gt3|^audi_r8_lms|jaguar_g3|lamborghini_gallardo_rex/i.test(car) ? 'GT3' : null

/**
 * The coach laps to offer for your lap: the best match first. `otherCar` when only a lap of the same
 * class but another car exists (said in the reason, never silent).
 */
export function pickCoachLaps(index: CoachIndex | null, where: { track: string, car: string }, mine: LapClass | null, limit = 2):
  { lap: CoachLap, otherCar: boolean }[] {
  if (!index) return []
  const here = index.laps.filter(l => norm(l.track) === norm(where.track))
  const sameCar = here.filter(l => norm(l.car) === norm(where.car))
  const myClass = carClassOf(where.car)
  const pool = sameCar.length || !myClass ? sameCar : here.filter(l => (l.carClass || carClassOf(l.car)) === myClass)
  const wantQualify = mine?.kind === 'qualify'
  const wet = (l: CoachLap) => (l.rain ?? 0) > 0.1
  const score = (l: CoachLap) => (mine?.kind ? (wantQualify === (l.session === 'qualifying') ? 0 : 1) : 0)
    + (mine?.wet === null || mine?.wet === undefined ? 0 : wet(l) === mine.wet ? 0 : 2)
  return [...pool].sort((a, b) => score(a) - score(b) || a.lapTimeMs - b.lapTimeMs).slice(0, limit)
    .map(lap => ({ lap, otherCar: !sameCar.length }))
}

