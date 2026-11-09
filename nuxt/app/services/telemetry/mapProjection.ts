/**
 * PIP-618 / PIP-760: the track map's geometry, apart from the lap analysis. World coordinates (pos_x, pos_z) to map
 * points, oriented as ACC; one transform for laps and track edges, fitted on the frame's recorded samples, so a line
 * recovered from a MoTeC repair (partial: null where nothing was recorded) frames and draws the map too, never
 * bridging a hole with a chord.
 */
import type { LapTraceView } from './lapTraceChart'
import { hasMapPositions, ownMapPositions } from './mapPositions'

export interface MapPoint { x: number, y: number }

/**
 * ACC map orientation, as the minimap HUD (desktop-app/runtime/trackMaps.js, from
 * ACC Drive's TrackMapWindow): world X right, world Z down, then the whole map
 * turned 270° clockwise. This is the shape ACC itself shows.
 */
export const ACC_MAP_ROTATION_DEG = 270

function turn(x: number, z: number, degrees: number): MapPoint {
  const r = (degrees * Math.PI) / 180
  // Screen coordinates (y down): a positive angle turns clockwise.
  return { x: x * Math.cos(r) - z * Math.sin(r), y: x * Math.sin(r) + z * Math.cos(r) }
}

/**
 * Track map from the world coordinates (pos_x, pos_z), fitted in a box with the
 * same scale on both axes. Null when the lap or the frame has no coordinates that draw a track.
 */
export function mapPoints(trace: LapTraceView, at: number[], width: number, height: number, padding = 10, frame: LapTraceView = trace, rotationDeg = ACC_MAP_ROTATION_DEG): MapPoint[] | null {
  if (!hasMapPositions(trace) || !hasMapPositions(frame)) return null
  // Full coordinates on both: every point is recorded (one projection for every line, lapMapLine).
  return lapMapLine(trace, at, width, height, padding, frame, rotationDeg)!.points as MapPoint[]
}

/**
 * The same world → map transform as `mapPoints` with this frame, for geometry that is
 * not a lap (track edges): one transform for laps and edges, never fitted separately.
 */
export function worldToMap(frame: LapTraceView, at: number[], width: number, height: number, padding = 10, rotationDeg = ACC_MAP_ROTATION_DEG): ((x: number, z: number) => MapPoint) | null {
  // PIP-760: fitted on the frame's recorded samples, so a recovered (partial) line frames the map too.
  const sampled = ownWorldAt(frame, at)
  if (!sampled) return null
  const bounds = sampled.points.flatMap(p => (p ? [turn(p.x, p.z, rotationDeg)] : []))
  if (bounds.length < 2) return null
  const xs = bounds.map(p => p.x), ys = bounds.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const scale = Math.min((width - 2 * padding) / Math.max(maxX - minX, 1e-6), (height - 2 * padding) / Math.max(maxY - minY, 1e-6))
  const offsetX = (width - (maxX - minX) * scale) / 2
  const offsetY = (height - (maxY - minY) * scale) / 2
  return (x, z) => {
    const p = turn(x, z, rotationDeg)
    return { x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale }
  }
}

/**
 * PIP-760: the lap's own line on the map, with the frame's transform, from full or recovered (partial) coordinates.
 * `points[i]` is null where the lap has no recorded coordinate; `joined[i]` says whether the stretch from `at[i]` to
 * `at[i+1]` was recorded throughout (no sample missing between them): a hole is never bridged by a chord.
 * Null when the lap has no coordinates of its own or the frame cannot frame the map.
 */
export function lapMapLine(trace: LapTraceView, at: number[], width: number, height: number, padding = 10, frame: LapTraceView = trace,
  rotationDeg = ACC_MAP_ROTATION_DEG): { points: (MapPoint | null)[], joined: boolean[] } | null {
  const sampled = ownWorldAt(trace, at)
  const project = worldToMap(frame, at, width, height, padding, rotationDeg)
  if (!sampled || !project) return null
  return { points: sampled.points.map(p => (p ? project(p.x, p.z) : null)), joined: sampled.joined }
}

/**
 * PIP-760: a trace's own world coordinates (full or recovered) at each lap fraction: null where nothing was recorded,
 * `joined[i]` true when no sample is missing between `at[i]` and `at[i+1]` (a hole is never bridged). Null without any.
 */
function ownWorldAt(trace: LapTraceView, at: number[]): { points: ({ x: number, z: number } | null)[], joined: boolean[] } | null {
  const own = ownMapPositions(trace)
  if (!own) return null
  const { xs, zs } = own
  const last = xs.length - 1
  const missingBefore = [0]
  for (let k = 0; k <= last; k++) missingBefore.push(missingBefore[k]! + (xs[k] === null || zs[k] === null ? 1 : 0))
  const value = (values: readonly (number | null)[], low: number, high: number, t: number) => {
    const a = values[low], b = values[high]
    if (a === null || a === undefined) return null
    if (t === 0) return a
    return b === null || b === undefined ? null : a + (b - a) * t
  }
  const where = at.map(f => Math.min(Math.max(f, 0), 1) * last)
  const points = where.map((p) => {
    const low = Math.floor(p), high = Math.min(low + 1, last), t = high > low ? p - low : 0
    const x = value(xs, low, high, t), z = value(zs, low, high, t)
    return x === null || z === null ? null : { x, z }
  })
  const joined = points.slice(1).map((p, i) => {
    if (!p || !points[i]) return false
    const from = Math.floor(where[i]!), to = Math.min(Math.ceil(where[i + 1]!), last)
    return missingBefore[to + 1]! - missingBefore[from]! === 0
  })
  return { points, joined }
}

/** Finish line: a short tick across the track at the start of the lap. */
export function finishLine(points: MapPoint[], halfLength = 9): { x1: number, y1: number, x2: number, y2: number } | null {
  if (points.length < 2) return null
  const [a, b] = [points[0]!, points[1]!]
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length
  return { x1: a.x - nx * halfLength, y1: a.y - ny * halfLength, x2: a.x + nx * halfLength, y2: a.y + ny * halfLength }
}
