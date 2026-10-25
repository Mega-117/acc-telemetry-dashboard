/**
 * PIP-618: lap analysis for the session "Avanzata" tab (our Track Titan).
 * Pure logic on two LapTraces (logger lap files, 2 m grid): delta along the lap,
 * corners found on the reference speed, per-corner comparison, track map points.
 * Laps are aligned on the lap fraction (0..1), as the existing charts, so laps of
 * slightly different length stay aligned on start and finish.
 */
import type { LapTraceView } from './lapTraceChart'

/** Levels have no values in between: the logger stores them as steps (PIP-617). */
const DISCRETE = new Set(['gear', 'engine_map', 'traction_control', 'traction_control_2', 'abs'])

/** Value of a channel at a lap fraction, linearly interpolated (levels: previous sample); null without the channel. */
export function channelAt(trace: LapTraceView, channel: string, fraction: number): number | null {
  const values = trace.channels[channel]
  if (!values?.length) return null
  const position = Math.min(Math.max(fraction, 0), 1) * (values.length - 1)
  const low = Math.floor(position)
  if (DISCRETE.has(channel)) return values[low]!
  const high = Math.min(low + 1, values.length - 1)
  return values[low]! + (values[high]! - values[low]!) * (position - low)
}

export function fractions(points: number): number[] {
  const n = Math.max(2, Math.floor(points))
  return Array.from({ length: n }, (_, i) => i / (n - 1))
}

/** Seconds the lap is behind the reference at each fraction: positive = slower. */
export function lapDelta(lap: LapTraceView, reference: LapTraceView, at: number[]): number[] {
  return at.map(f => (channelAt(lap, 'time_s', f) ?? 0) - (channelAt(reference, 'time_s', f) ?? 0))
}

export interface Corner {
  number: number
  start: number
  apex: number
  end: number
  minSpeedKmh: number
}

/**
 * Corners on the reference speed: every slowdown of at least `dropKmh` into a
 * minimum and back up, like Track Titan's one segment per corner. A corner runs
 * from the speed peak before it to the peak after it.
 */
export function detectCorners(reference: LapTraceView, dropKmh = 12, smoothSamples = 5): Corner[] {
  const raw = reference.channels.speed_kmh
  if (!raw || raw.length < 3) return []
  const half = Math.floor(smoothSamples / 2)
  const speed = raw.map((_, i) => {
    let sum = 0, count = 0
    for (let j = Math.max(0, i - half); j <= Math.min(raw.length - 1, i + half); j++) { sum += raw[j]!; count++ }
    return sum / count
  })
  // Alternate peaks and valleys with hysteresis: small wobbles are not corners.
  const extremes: { index: number, kind: 'peak' | 'valley' }[] = []
  let kind: 'peak' | 'valley' = 'peak'
  let candidate = 0
  for (let i = 1; i < speed.length; i++) {
    if (kind === 'peak') {
      if (speed[i]! > speed[candidate]!) candidate = i
      else if (speed[candidate]! - speed[i]! >= dropKmh) { extremes.push({ index: candidate, kind: 'peak' }); kind = 'valley'; candidate = i }
    } else {
      if (speed[i]! < speed[candidate]!) candidate = i
      else if (speed[i]! - speed[candidate]! >= dropKmh) { extremes.push({ index: candidate, kind: 'valley' }); kind = 'peak'; candidate = i }
    }
  }
  const last = speed.length - 1
  // A slowdown that never climbs back before the line is not a corner of this lap:
  // the lap ends on the peak it was leaving.
  extremes.push(kind === 'peak' ? { index: candidate, kind } : { index: last, kind: 'peak' })
  const corners: Corner[] = []
  extremes.forEach((point, i) => {
    if (point.kind !== 'valley') return
    const before = extremes[i - 1]?.index ?? 0
    const after = extremes[i + 1]?.index ?? last
    corners.push({ number: corners.length + 1, start: before / last, apex: point.index / last, end: after / last, minSpeedKmh: Math.round(raw[point.index]!) })
  })
  return corners
}

function minIn(trace: LapTraceView, channel: string, start: number, end: number): number | null {
  const values = trace.channels[channel]
  if (!values?.length) return null
  const last = values.length - 1
  let min: number | null = null
  for (let i = Math.floor(start * last); i <= Math.ceil(end * last); i++) {
    const v = values[i]
    if (v !== undefined && (min === null || v < min)) min = v
  }
  return min
}

const BRAKE_ON = 10
const BRAKE_LOOKBACK_M = 300

/**
 * Where the braking for this corner starts: the last braking before the apex,
 * followed back to its first sample. The search may go before the corner start
 * (up to 300 m), so braking earlier than the reference is measured in full.
 */
function brakePoint(trace: LapTraceView, start: number, apex: number): number | null {
  const values = trace.channels.brake_pct
  if (!values?.length) return null
  const last = values.length - 1
  const floor = Math.max(0, Math.floor((start - BRAKE_LOOKBACK_M / Math.max(trace.lengthM, 1)) * last))
  let i = Math.ceil(apex * last)
  while (i >= floor && (values[i] ?? 0) <= BRAKE_ON) i--
  if (i < floor) return null
  while (i > floor && (values[i - 1] ?? 0) > BRAKE_ON) i--
  return i / last
}

export interface CornerComparison {
  corner: Corner
  timeLostS: number
  lapMinKmh: number | null
  refMinKmh: number | null
  /** Metres: positive = the lap brakes later than the reference. */
  brakeDeltaM: number | null
  exitDeltaKmh: number | null
}

export function compareCorners(lap: LapTraceView, reference: LapTraceView, corners: Corner[]): CornerComparison[] {
  const delta = (f: number) => (channelAt(lap, 'time_s', f) ?? 0) - (channelAt(reference, 'time_s', f) ?? 0)
  return corners.map(corner => {
    const lapBrake = brakePoint(lap, corner.start, corner.apex)
    const refBrake = brakePoint(reference, corner.start, corner.apex)
    const lapExit = channelAt(lap, 'speed_kmh', corner.end)
    const refExit = channelAt(reference, 'speed_kmh', corner.end)
    return {
      corner,
      timeLostS: delta(corner.end) - delta(corner.start),
      lapMinKmh: minIn(lap, 'speed_kmh', corner.start, corner.end),
      refMinKmh: minIn(reference, 'speed_kmh', corner.start, corner.end),
      brakeDeltaM: lapBrake !== null && refBrake !== null ? (lapBrake - refBrake) * reference.lengthM : null,
      exitDeltaKmh: lapExit !== null && refExit !== null ? lapExit - refExit : null,
    }
  })
}

/**
 * One plain sentence per corner, in the VRS order: exit first, then entry,
 * then the middle of the corner. Only where time is actually lost.
 */
export function cornerAdvice(c: CornerComparison): string {
  if (c.timeLostS < 0.03) return c.timeLostS <= -0.03 ? 'Qui sei più veloce del riferimento' : 'Come il riferimento'
  if (c.exitDeltaKmh !== null && c.exitDeltaKmh <= -3) return `Esci più forte: in uscita sei ${Math.round(-c.exitDeltaKmh)} km/h più lento`
  if (c.brakeDeltaM !== null && c.brakeDeltaM <= -10) return `Frena più tardi: freni ${Math.round(-c.brakeDeltaM)} m prima`
  if (c.brakeDeltaM !== null && c.brakeDeltaM >= 10) return `Frena prima: freni ${Math.round(c.brakeDeltaM)} m dopo e arrivi lungo`
  if (c.lapMinKmh !== null && c.refMinKmh !== null && c.refMinKmh - c.lapMinKmh >= 3) return `Porta più velocità in centro curva: ${Math.round(c.refMinKmh - c.lapMinKmh)} km/h in meno`
  return 'Perdi tempo in modo diffuso: guarda la traiettoria'
}

export interface MapPoint { x: number, y: number }

/**
 * Track map from the world coordinates (pos_x, pos_z), fitted in a box with the
 * same scale on both axes. Null when the lap has no coordinates.
 */
export function mapPoints(trace: LapTraceView, at: number[], width: number, height: number, padding = 10, frame: LapTraceView = trace): MapPoint[] | null {
  if (!trace.channels.pos_x || !trace.channels.pos_z || !frame.channels.pos_x || !frame.channels.pos_z) return null
  const raw = at.map(f => ({ x: channelAt(trace, 'pos_x', f)!, z: channelAt(trace, 'pos_z', f)! }))
  // The frame (usually the reference) fixes scale and offset, so two laps overlay exactly.
  const bounds = frame === trace ? raw : at.map(f => ({ x: channelAt(frame, 'pos_x', f)!, z: channelAt(frame, 'pos_z', f)! }))
  const xs = bounds.map(p => p.x), zs = bounds.map(p => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const scale = Math.min((width - 2 * padding) / Math.max(maxX - minX, 1e-6), (height - 2 * padding) / Math.max(maxZ - minZ, 1e-6))
  const offsetX = (width - (maxX - minX) * scale) / 2
  const offsetY = (height - (maxZ - minZ) * scale) / 2
  // Screen y grows downwards: north (larger z) at the top.
  return raw.map(p => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (maxZ - p.z) * scale }))
}

/** Gain/loss of each map segment: the change of the delta along it (negative = gaining). */
export function deltaTrend(delta: number[]): number[] {
  return delta.slice(1).map((value, i) => value - delta[i]!)
}

const TOKEN = /^\d{8}_\d{6}$/

/**
 * The logger's session id (YYYYMMDD_HHMMSS) that names the lap files. Newer
 * sessions carry it; older ones only have it in their start time, written by
 * the same logger clock (date_start "2026-10-25T17:52:40.72" -> 20261025_175240).
 */
export function analysisSessionToken(sessionId: unknown, pageId: unknown, dateStart: unknown): string | null {
  for (const id of [sessionId, pageId]) if (typeof id === 'string' && TOKEN.test(id)) return id
  const match = typeof dateStart === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(dateStart) : null
  return match ? `${match[1]}${match[2]}${match[3]}_${match[4]}${match[5]}${match[6]}` : null
}

export function formatDelta(seconds: number): string {
  return `${seconds >= 0 ? '+' : '−'}${Math.abs(seconds).toFixed(3)}`
}
