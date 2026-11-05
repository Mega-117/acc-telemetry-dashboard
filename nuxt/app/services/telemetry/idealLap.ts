/**
 * PIP-646: sectors for any reference and the Giro ideale (Track Titan's theoretical best).
 * Sector boundaries are points of the lap (0..1, from the official sector times of a session
 * lap); any other trace is timed at the same points on its own time channel, so a lap pasted
 * by link or from another session gets sector times too. The ideal lap takes, sector by
 * sector, the quickest of the given laps and stitches their traces at the boundaries.
 */
import { channelAt, detectCorners } from './lapAnalysis'
import type { LapTraceView } from './lapTraceChart'

/** dev.10: joins at least this far apart (2% of the lap), and a join whose speeds differ more is not used. */
const MIN_SEGMENT = 0.02
export const MAX_JOIN_KMH = 12

/**
 * dev.10 (user 05/11, TrackTitan's theoretical lap): one segment per corner. The joins are the speed
 * peaks between corners (on the straights, where every lap runs at about the same speed), so the
 * stitched lap does not jump; the official sector lines join in too. Without enough corners: the
 * sectors alone (null without them).
 */
export function segmentBounds(trace: LapTraceView, sectors: number[] | null): number[] | null {
  // The official sector lines first (they never move), then every peak not too close to a line already in.
  const bounds = [...new Set([0, ...(sectors ?? []).filter(f => f > 0 && f < 1), 1])]
  for (const peak of detectCorners(trace).map(c => c.end)) {
    if (peak > 0 && peak < 1 && bounds.every(b => Math.abs(b - peak) >= MIN_SEGMENT)) bounds.push(peak)
  }
  bounds.sort((a, b) => a - b)
  return bounds.length >= 3 ? bounds : null
}

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
  /** dev.10: segments where the quickest lap was skipped because its join speed did not match. */
  joinsSkipped: number
}

/**
 * The quickest sector of the given laps, stitched in order. Values are sampled on the grid of
 * the first lap; time restarts from the sum of the sectors before, the other channels are copied
 * (a small step at the joins is the price of stitching, as in every theoretical lap).
 */
export function stitchIdealLap(laps: LapTraceView[], bounds: number[], maxJoinKmh = Infinity): IdealLap | null {
  const timed = laps.map(t => measureSectorTimes(t, bounds))
  const sectors = bounds.length - 1
  const sources: number[] = []
  let joinsSkipped = 0
  const speed = (i: number, f: number) => channelAt(laps[i]!, 'speed_kmh', f)
  for (let s = 0; s < sectors; s++) {
    const order = timed.map((times, i) => ({ i, t: times?.[s] })).filter((c): c is { i: number, t: number } => typeof c.t === 'number')
      .sort((a, b) => a.t - b.t)
    if (!order.length) return null
    // dev.10 (Codex 05/11): the quickest segment whose entry speed matches the exit of the one before.
    const prev = sources[s - 1]
    const joins = (i: number) => prev === undefined || i === prev
      || Math.abs((speed(i, bounds[s]!) ?? 0) - (speed(prev, bounds[s]!) ?? 0)) <= maxJoinKmh
    const pick = order.find(c => joins(c.i)) ?? order.find(c => c.i === prev) ?? order[0]!
    if (pick.i !== order[0]!.i) joinsSkipped++
    sources.push(pick.i)
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
  return { sources, sectorTimesS, joinsSkipped, trace: { ...base, sessionId: null, source: 'ideal', lapTimeS, valid: true, complete: true, fuelL: null, conditions: null, channels } }
}
