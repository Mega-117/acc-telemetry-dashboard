/**
 * PIP-646: sectors for any reference and the Giro ideale (Track Titan's theoretical best).
 * Sector boundaries are points of the lap (0..1, from the official sector times of a session
 * lap); any other trace is timed at the same points on its own time channel, so a lap pasted
 * by link or from another session gets sector times too. The ideal lap takes, sector by
 * sector, the quickest of the given laps and stitches their traces at the boundaries.
 */
import { channelAt } from './lapAnalysis'
import type { LapTraceView } from './lapTraceChart'

/** Seconds spent in each sector, measured on the trace at the boundary points; null without times. */
export function measureSectorTimes(trace: LapTraceView, bounds: number[]): number[] | null {
  if (bounds.length < 2) return null
  const at = bounds.map(f => channelAt(trace, 'time_s', f))
  if (at.some(t => t === null)) return null
  const times = at.slice(1).map((t, i) => (t as number) - (at[i] as number))
  return times.every(t => t > 0) ? times : null
}

export interface IdealLap {
  trace: LapTraceView
  /** Index in the given laps of the one each sector comes from. */
  sources: number[]
  sectorTimesS: number[]
}

/**
 * The quickest sector of the given laps, stitched in order. Values are sampled on the grid of
 * the first lap; time restarts from the sum of the sectors before, the other channels are copied
 * (a small step at the joins is the price of stitching, as in every theoretical lap).
 */
export function stitchIdealLap(laps: LapTraceView[], bounds: number[]): IdealLap | null {
  const timed = laps.map(t => measureSectorTimes(t, bounds))
  const sectors = bounds.length - 1
  const sources: number[] = []
  for (let s = 0; s < sectors; s++) {
    let best = -1
    timed.forEach((times, i) => { if (times && (best < 0 || (times[s] as number) < (timed[best]![s] as number))) best = i })
    if (best < 0) return null
    sources.push(best)
  }
  const sectorTimesS = sources.map((lap, s) => timed[lap]![s] as number)
  const base = laps[0]!
  const n = base.channels.time_s?.length ?? 0
  if (n < 2) return null
  const names = Object.keys(base.channels).filter(name => sources.every(i => laps[i]!.channels[name]?.length))
  const starts = sectorTimesS.map((_, s) => sectorTimesS.slice(0, s).reduce((sum, t) => sum + t, 0))
  const channels: Record<string, number[]> = Object.fromEntries(names.map(name => [name, [] as number[]]))
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1)
    // The sector this point falls in; the finish line (f = 1) belongs to the last one.
    const next = bounds.findIndex(b => b > f)
    const s = next < 0 ? sectors - 1 : Math.min(Math.max(next - 1, 0), sectors - 1)
    const src = laps[sources[s]!]!
    for (const name of names) {
      const value = channelAt(src, name, f) ?? 0
      channels[name]!.push(name === 'time_s' ? starts[s]! + value - (channelAt(src, 'time_s', bounds[s]!) ?? 0) : value)
    }
  }
  const lapTimeS = sectorTimesS.reduce((sum, t) => sum + t, 0)
  return { sources, sectorTimesS, trace: { ...base, sessionId: null, source: 'ideal', lapTimeS, valid: true, complete: true, fuelL: null, conditions: null, channels } }
}
