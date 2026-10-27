/**
 * PIP-645: the Semplice view on the whole session, no reference needed. Every valid lap is
 * timed corner by corner (the corners of the best lap: peak to peak, so they cover the lap);
 * per corner: your best, the typical time (median) and how much it swings from lap to lap.
 * From those, three places to work on: where you are least consistent, where the typical lap
 * is furthest from your best (potential), where laps get spoiled (mistakes: far above the
 * typical time, invalid laps included). Pure logic on LapTraces, as lapAnalysis.
 */
import { channelAt, type Corner } from './lapAnalysis'
import type { LapTraceView } from './lapTraceChart'

/** Below this many valid laps there is no "typical" lap: the view keeps the comparison with a reference. */
export const MIN_ZONE_LAPS = 4
/** A pass is spoiled when it is this far above the typical time (and well outside the usual swing). */
const MISTAKE_MIN_S = 0.3
const MISTAKE_SPREAD_FACTOR = 4

export interface ZoneStat {
  corner: Corner
  bestS: number
  typicalS: number
  /** Typical swing from lap to lap: twice the median distance from the typical time. */
  spreadS: number
  /** Typical minus best: what the usual lap leaves on the table here. */
  potentialS: number
  /** Laps spoiled here (valid and invalid) and the time they lost on the typical pass. */
  mistakes: number
  mistakeLossS: number
}

export interface SessionZones {
  laps: number
  zones: ZoneStat[]
  leastConsistent: ZoneStat | null
  mostPotential: ZoneStat | null
  mostMistakes: ZoneStat | null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const at = (i: number) => sorted[i] ?? 0
  return sorted.length % 2 ? at(mid) : (at(mid - 1) + at(mid)) / 2
}

function zoneTime(trace: LapTraceView, corner: Corner): number | null {
  const a = channelAt(trace, 'time_s', corner.start), b = channelAt(trace, 'time_s', corner.end)
  return a === null || b === null || b < a ? null : b - a
}

export function sessionZones(validLaps: LapTraceView[], corners: Corner[], invalidLaps: LapTraceView[] = []): SessionZones {
  const empty: SessionZones = { laps: validLaps.length, zones: [], leastConsistent: null, mostPotential: null, mostMistakes: null }
  if (validLaps.length < MIN_ZONE_LAPS || !corners.length) return empty
  const zones = corners.flatMap((corner): ZoneStat[] => {
    const times = validLaps.map(t => zoneTime(t, corner)).filter((v): v is number => v !== null)
    if (times.length < MIN_ZONE_LAPS) return []
    const typicalS = median(times)
    const spreadS = 2 * median(times.map(t => Math.abs(t - typicalS)))
    const limit = typicalS + Math.max(MISTAKE_MIN_S, MISTAKE_SPREAD_FACTOR * spreadS / 2)
    const spoiled = [...times, ...invalidLaps.map(t => zoneTime(t, corner)).filter((v): v is number => v !== null)].filter(t => t > limit)
    return [{ corner, bestS: Math.min(...times), typicalS, spreadS, potentialS: typicalS - Math.min(...times),
      mistakes: spoiled.length, mistakeLossS: spoiled.reduce((sum, t) => sum + t - typicalS, 0) }]
  })
  // Each card names the corner that really ranks first for it, even when another card names it too.
  const pick = (score: (z: ZoneStat) => number, keep: (z: ZoneStat) => boolean) =>
    zones.filter(keep).sort((a, b) => score(b) - score(a))[0] ?? null
  const mostMistakes = pick(z => z.mistakes * 1000 + z.mistakeLossS, z => z.mistakes > 0)
  const leastConsistent = pick(z => z.spreadS, z => z.spreadS >= 0.01)
  const mostPotential = pick(z => z.potentialS, z => z.potentialS >= 0.01)
  return { laps: validLaps.length, zones, leastConsistent, mostPotential, mostMistakes }
}

/** One colour per card, the same on the map: amber swing, violet potential, red mistakes (blue is "Tu"). */
export const ZONE_COLORS = { consistency: '#fbbf24', potential: '#a78bfa', mistakes: '#ff5a6e' } as const

/** The three chosen stretches coloured on the map; everything else stays grey. */
export function zoneMapColors(insight: SessionZones): { start: number, end: number, color: string }[] {
  return ([['mostMistakes', ZONE_COLORS.mistakes], ['leastConsistent', ZONE_COLORS.consistency], ['mostPotential', ZONE_COLORS.potential]] as const)
    .flatMap(([key, color]) => { const zone = insight[key]; return zone ? [{ start: zone.corner.start, end: zone.corner.end, color }] : [] })
}

/** Seconds with a comma, as the sentences read in Italian: 0.4 → "0,4", 0.06 → "0,06". */
export function zoneSeconds(seconds: number): string {
  return (seconds >= 0.1 ? seconds.toFixed(1) : seconds.toFixed(2)).replace('.', ',')
}
