/**
 * PIP-618: lap analysis for the session "Avanzata" tab (our Track Titan).
 * Pure logic on two LapTraces (logger lap files, 2 m grid): delta along the lap,
 * corners found on the reference speed, per-corner comparison, track map points.
 * Laps are aligned on the lap fraction (0..1), as the existing charts, so laps of
 * slightly different length stay aligned on start and finish.
 */
import type { LapTraceView } from './lapTraceChart'
import { useI18n } from '~/i18n'

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

// 01/11: a braking that never reaches this pressure is a touch (trail or balance, 11% at Hungaroring T1), not
// where the braking starts; a light real braking (30-40%) still is. Two pressings closer than BRAKE_JOIN_M are one
// braking released for a moment.
const BRAKE_MAIN = 25
const BRAKE_JOIN_M = 20

/**
 * Where the braking for this corner starts: the last real braking before the apex (one that reaches
 * BRAKE_MAIN), followed back to its first sample. The search may go before the corner start (up to 300 m), so
 * braking earlier than the reference is measured in full. 01/11: before, a light touch near the apex (11% at
 * Hungaroring T1, 136 m after the real braking) was taken for the braking and the advice said "138 m later".
 */
function brakePoint(trace: LapTraceView, start: number, apex: number): number | null {
  const values = trace.channels.brake_pct
  if (!values?.length) return null
  const last = values.length - 1
  const floor = Math.max(0, Math.floor((start - BRAKE_LOOKBACK_M / Math.max(trace.lengthM, 1)) * last))
  const join = Math.max(1, Math.round(BRAKE_JOIN_M / Math.max(trace.gridStepM || trace.lengthM / last, 0.1)))
  let i = Math.ceil(apex * last)
  let found: number | null = null
  while (i >= floor) {
    while (i >= floor && (values[i] ?? 0) <= BRAKE_ON) i--
    if (i < floor) break
    let peak = 0, first = i
    while (first >= floor && (values[first] ?? 0) > BRAKE_ON) { peak = Math.max(peak, values[first] ?? 0); first-- }
    first++
    if (peak >= BRAKE_MAIN) { found = first; break }
    i = first - 1
  }
  if (found === null) return null
  // Pressings just before it, after a short release, belong to the same braking.
  for (let j = found - 1; j >= Math.max(floor, found - join); j--) {
    if ((values[j] ?? 0) > BRAKE_ON) { found = j; while (found > floor && (values[found - 1] ?? 0) > BRAKE_ON) found--; j = found }
  }
  return found / last
}

export interface CornerComparison {
  corner: Corner
  timeLostS: number
  lapMinKmh: number | null
  refMinKmh: number | null
  /** Metres: positive = the lap brakes later than the reference. */
  brakeDeltaM: number | null
  exitDeltaKmh: number | null
  /** Seconds lost in each part of the corner: entry (braking), middle (apex), exit (to the next straight). */
  phaseLossS: { entry: number, mid: number, exit: number }
}

/** PIP-635: time lost (+) or gained (−) against the reference over a stretch of the lap (0-1), null without times. */
export function stretchDelta(lap: LapTraceView, reference: LapTraceView, [start, end]: [number, number]): number | null {
  const t = (trace: LapTraceView, f: number) => channelAt(trace, 'time_s', f)
  const la = t(lap, start), lb = t(lap, end), ra = t(reference, start), rb = t(reference, end)
  return la === null || lb === null || ra === null || rb === null ? null : (lb - la) - (rb - ra)
}

/** 01/11: what the pedals did in the zone: which one, and whether you pressed it more or less than the reference. */
export interface FocusCause { pedal: 'brake' | 'throttle', lapMore: boolean, metres: number, /** One driver off the pedal: a when, not a how much. */ timing: boolean }
/** 01/11: the focus zone of a stretch: where to work, the seconds of the loss it starts, the pedal difference there. */
export interface FocusZone { zone: [number, number], lossS: number, cause: FocusCause | null }

/** The recorded time only moves forward over [start, end]: a reset or a jump back makes the measure unusable. */
export function timeRuns(trace: LapTraceView, [start, end]: [number, number]): boolean {
  const time = trace.channels.time_s
  if (!time?.length) return false
  const last = time.length - 1
  const from = Math.max(0, Math.floor(start * last)), to = Math.min(last, Math.ceil(end * last))
  for (let i = from + 1; i <= to; i++) if (!(time[i]! >= time[i - 1]!)) return false
  return true
}

/**
 * 01/11 (research docs/wiki/research/2026-11-01-telemetria-focus-zone-metodo-fonti.md): the focus zone inside a
 * stretch. D = the gap to the reference along it (loss over a piece = D(b) - D(a)); only the gap you keep counts:
 * at each point the smallest gap still ahead, so a bump given back is no loss (often a line or alignment
 * difference). The kept gap grows in runs; the zone is the start of the run that costs most (where that loss
 * begins), moved back to where the pedals differ just before it (inputCause) when they do; one band only.
 * Separate losses are never joined. Null when no run keeps `min` seconds, or when the
 * time of either lap jumps back (a reset) inside the stretch.
 */
/**
 * 01/11 (user, Hungaroring T1; research: "the zone to work on can come before the one with the biggest loss"):
 * just before a kept loss starts, where the two drivers' pedals differ most (one releases the brake while the
 * other still brakes, one is on the gas and the other not). The piece of at least `minM` metres where the brake or
 * throttle differ by `minPct` or more, with the largest total difference, within `lookM` metres before the loss
 * starts (and up to it). Short blips (downshift throttle) never make a piece on their own. Null without pedals.
 */
function inputCause(lap: LapTraceView, reference: LapTraceView, [from, to]: [number, number], { minPct = 25, minM = 10 } = {}): { range: [number, number], cause: FocusCause } | null {
  const lb = lap.channels.brake_pct, rb = reference.channels.brake_pct, lt = lap.channels.throttle_pct, rt = reference.channels.throttle_pct
  if (!lb?.length || !rb?.length || !lt?.length || !rt?.length || !(to > from)) return null
  const stepF = 2 / Math.max(lap.lengthM || 0, 1)
  const steps = Math.max(1, Math.round((to - from) / stepF))
  type Sample = { key: string, d: number, lapOff: boolean, refOff: boolean, full: boolean }
  // The bigger of the two pedal differences at a point, with which pedal, its sign, and who is off that pedal.
  const sample = (f: number): Sample => {
    const l = { b: channelAt(lap, 'brake_pct', f) ?? 0, t: channelAt(lap, 'throttle_pct', f) ?? 0 }
    const r = { b: channelAt(reference, 'brake_pct', f) ?? 0, t: channelAt(reference, 'throttle_pct', f) ?? 0 }
    const db = l.b - r.b, dt = l.t - r.t
    const onBrake = Math.abs(db) >= Math.abs(dt)
    const d = onBrake ? db : dt
    const off = (v: number) => v <= BRAKE_ON
    // The one pressing more is still fully on it (>= 90%): the other has started letting go (or not yet pressed).
    const full = Math.max(onBrake ? l.b : l.t, onBrake ? r.b : r.t) >= 90
    return { key: `${onBrake ? 'brake' : 'throttle'}:${d > 0 ? '+' : '-'}`, d: Math.abs(d), lapOff: off(onBrake ? l.b : l.t), refOff: off(onBrake ? r.b : r.t), full }
  }
  // A piece is one pedal in one direction: a change of pedal or of sign starts a new piece (Codex 01/11).
  let best: { a: number, b: number, sum: number, key: string, lapOff: number, refOff: number, full: number } | null = null
  let run: { a: number, sum: number, key: string, lapOff: number, refOff: number, full: number } | null = null
  const close = (b: number) => {
    if (run && (b - run.a + 1) * 2 >= minM && (!best || run.sum > best.sum)) best = { ...run, b }
    run = null
  }
  for (let i = 0; i <= steps; i++) {
    const p = sample(from + i * stepF)
    if (p.d < minPct) { close(i - 1); continue }
    if (run && run.key !== p.key) close(i - 1)
    if (!run) run = { a: i, sum: 0, key: p.key, lapOff: 0, refOff: 0, full: 0 }
    run.sum += p.d
    if (p.lapOff) run.lapOff++
    if (p.refOff) run.refOff++
    if (p.full) run.full++
  }
  close(steps)
  if (!best) return null
  const found = best as { a: number, b: number, sum: number, key: string, lapOff: number, refOff: number, full: number }
  const count = found.b - found.a + 1
  const [pedal, sign] = found.key.split(':') as ['brake' | 'throttle', '+' | '-']
  // Timing when one driver is off the pedal, or still fully on it while the other lets go, for a good part of the
  // piece (Hungaroring T1: you release from 594 m, the reference holds 100% to 604 m); otherwise how much.
  // "Still fully on it" counts as timing only when the other really lets go across the piece (its pedal moves by
  // 30 points or more): steady half pressure against full pressure is how much, not when.
  const channel = pedal === 'brake' ? 'brake_pct' : 'throttle_pct'
  const lower = sign === '+' ? reference : lap
  const moves = Math.abs((channelAt(lower, channel, from + found.a * stepF) ?? 0) - (channelAt(lower, channel, from + found.b * stepF) ?? 0)) >= 30
  const timing = found.lapOff >= count * 0.4 || found.refOff >= count * 0.4 || (found.full >= count * 0.4 && moves)
  return { range: [from + found.a * stepF, from + found.b * stepF],
    cause: { pedal, lapMore: sign === '+', metres: Math.round(count * 2), timing } }
}

export function focusInStretch(lap: LapTraceView, reference: LapTraceView, [start, end]: [number, number], { min = 0.02, stepM = 5, zoneShare = 1 / 8, pauseM = 40, lookM = 100, maxM = 150, minM = 30 } = {}): FocusZone | null {
  if (!(end > start) || !timeRuns(lap, [start, end]) || !timeRuns(reference, [start, end])) return null
  const metres = Math.max((lap.lengthM || 0) * (end - start), 1)
  const steps = Math.min(400, Math.max(24, Math.round(metres / stepM)))
  const piece = (end - start) / steps
  const gap: number[] = [0]
  for (let i = 1; i <= steps; i++) {
    const d = stretchDelta(lap, reference, [start, start + i * piece])
    if (d === null) return null // a hole in the data: no measure, never an invented one
    gap.push(d)
  }
  const kept = gap.slice()
  for (let i = steps - 1; i >= 0; i--) kept[i] = Math.min(kept[i]!, kept[i + 1]!)
  // Runs of growth. Only a pause of more than `pauseM` metres without growth splits a run: on real 2 m data the
  // gap wiggles by a few thousandths, and the kept gap then grows in small steps with short flats between them.
  const eps = 1e-4
  const pausePieces = Math.max(1, Math.round(pauseM / (metres / steps)))
  let best: { from: number, to: number, loss: number } | null = null
  let runFrom = -1, lastGrow = -1
  const close = () => {
    if (runFrom < 0) return
    const loss = kept[lastGrow + 1]! - kept[runFrom]!
    if (loss >= min && (!best || loss > best.loss)) best = { from: runFrom, to: lastGrow + 1, loss }
    runFrom = -1
  }
  for (let i = 0; i < steps; i++) {
    if (kept[i + 1]! - kept[i]! > eps) {
      if (runFrom >= 0 && i - lastGrow - 1 > pausePieces) close()
      if (runFrom < 0) runFrom = i
      lastGrow = i
    }
  }
  close()
  if (!best) return null
  const run = best as { from: number, to: number, loss: number }
  const width = Math.max(1, Math.round(steps * zoneShare))
  const zoneTo = Math.min(run.to, run.from + width)
  const at = (i: number) => start + i * piece
  // Where you act: the pedal difference just before the start of the loss (searched before it only, plus 10 m for
  // a difference that starts with it), joined to that start.
  const lossFrom = at(run.from)
  const fracM = 1 / Math.max(lap.lengthM || 0, 1)
  // Every band is 30-150 m (shorter only when the stretch itself is), always inside the stretch.
  const bounded = (from: number, to: number): [number, number] => {
    // Near the end of the stretch the band grows backwards, so it is still 30 m when the stretch allows it.
    const lo = Math.max(start, Math.min(from, end - minM * fracM))
    return [lo, Math.min(Math.max(to, lo + minM * fracM), lo + maxM * fracM, end)]
  }
  const found = inputCause(lap, reference, [Math.max(start, lossFrom - lookM * fracM), Math.min(end, lossFrom + 10 * fracM)])
  if (found) {
    const zone = bounded(Math.min(found.range[0], lossFrom), Math.max(found.range[1], lossFrom))
    if (zone[1] > zone[0]) return { zone, lossS: run.loss, cause: found.cause }
  }
  return { zone: bounded(lossFrom, at(zoneTo)), lossS: run.loss, cause: null }
}

/** 01/11: the advice of a focus zone born from the pedals: what you do differently there, and what it costs after. */
export function focusAdvice(f: FocusZone, cornerLossS?: number): string | null {
  if (!f.cause) return null
  const { t } = useI18n()
  // A "when" only when one driver is off the pedal for most of the piece; otherwise "how much" (Codex 01/11).
  const how = f.cause.timing ? 'When' : 'Amount'
  const key = `${f.cause.pedal === 'brake' ? 'brake' : 'gas'}${f.cause.lapMore ? 'More' : 'Less'}${how}` as
    'brakeMoreWhen' | 'brakeLessWhen' | 'brakeMoreAmount' | 'brakeLessAmount' | 'gasMoreWhen' | 'gasLessWhen' | 'gasMoreAmount' | 'gasLessAmount'
  // Never more than the corner's own loss (the list on the left says that number).
  const seconds = cornerLossS !== undefined && cornerLossS > 0 ? Math.min(f.lossS, cornerLossS) : f.lossS
  return t(`telemetry.advice.focus.${key}`, { m: f.cause.metres, s: seconds.toFixed(2) })
}

/** PIP-635: the previous or next corner, round the lap: after the last comes the first, before the first the last. */
export function stepCorner(current: number, count: number, step: 1 | -1): number | null {
  if (count < 1) return null
  return ((((current - 1 + step) % count) + count) % count) + 1
}

/** PIP-635: the corner a point of the lap (0-1) falls in, for the cursor label ("C6 · 1.2 km"); null on the straights. */
export function cornerAt(corners: Corner[], fraction: number | null): Corner | null {
  if (fraction === null) return null
  return corners.find(c => fraction >= c.start && fraction <= c.end) ?? null
}

/**
 * PIP-635: a zoomed map keeps the cursor dot centred (Track Titan), gliding instead of jumping: each
 * animation frame moves the centre a share `k` of the way to the dot, the zoom stays. `done` once it
 * is closer than a hundredth of the view, so the animation can stop.
 */
export function glideFrame(frame: { cx: number, cy: number, span: number }, point: { x: number, y: number }, k = 0.25,
  bounds?: { x0: number, x1: number, y0: number, y1: number }): { frame: { cx: number, cy: number, span: number }, done: boolean } {
  // The map's centre is kept inside the track's bounds: aim at the reachable point, or it never settles.
  const tx = bounds ? Math.min(Math.max(point.x, bounds.x0), bounds.x1) : point.x
  const ty = bounds ? Math.min(Math.max(point.y, bounds.y0), bounds.y1) : point.y
  const dx = tx - frame.cx, dy = ty - frame.cy
  if (Math.hypot(dx, dy) <= frame.span * 0.01) return { frame: { cx: tx, cy: ty, span: frame.span }, done: true }
  return { frame: { cx: frame.cx + dx * k, cy: frame.cy + dy * k, span: frame.span }, done: false }
}

/** Entry ends a quarter before the apex, the middle a quarter after it: the rest is braking and exit. */
function phaseBounds(corner: Corner): [number, number] {
  return [corner.apex - (corner.apex - corner.start) * 0.25, corner.apex + (corner.end - corner.apex) * 0.25]
}

export function compareCorners(lap: LapTraceView, reference: LapTraceView, corners: Corner[]): CornerComparison[] {
  const delta = (f: number) => (channelAt(lap, 'time_s', f) ?? 0) - (channelAt(reference, 'time_s', f) ?? 0)
  // 01/11: the parts of a corner are measured on the gap you keep (the smallest gap still ahead in the corner):
  // a bump given back (slower on the brakes, faster at the apex) is not a loss of the entry.
  const keptIn = (corner: Corner) => {
    const n = 80, span = corner.end - corner.start
    const kept = Array.from({ length: n + 1 }, (_, i) => delta(corner.start + (span * i) / n))
    for (let i = n - 1; i >= 0; i--) kept[i] = Math.min(kept[i]!, kept[i + 1]!)
    return (f: number) => {
      const x = Math.min(Math.max((f - corner.start) / Math.max(span, 1e-9), 0), 1) * n
      const lo = Math.floor(x), hi = Math.min(lo + 1, n)
      return kept[lo]! + (kept[hi]! - kept[lo]!) * (x - lo)
    }
  }
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
      phaseLossS: (() => {
        const [entryEnd, midEnd] = phaseBounds(corner)
        const kept = keptIn(corner)
        return { entry: kept(entryEnd) - kept(corner.start), mid: kept(midEnd) - kept(entryEnd), exit: kept(corner.end) - kept(midEnd) }
      })(),
    }
  })
}

/**
 * One plain sentence per corner, from the part where the time goes (Track Titan's root
 * cause): entry, middle or exit, read on the delta. A slow exit caused by a slow apex
 * is lost in the middle, so it is told as the middle. The fact first, against the
 * reference, then what to try. Only where time is actually lost.
 */
export function cornerAdvice(c: CornerComparison): string {
  const { t } = useI18n()
  if (c.timeLostS < 0.03) return c.timeLostS <= -0.03 ? t('telemetry.advice.faster') : t('telemetry.advice.same')
  const loss = c.phaseLossS
  const main = (['entry', 'mid', 'exit'] as const).reduce((best, phase) => loss[phase] > loss[best] + 0.005 ? phase : best, 'entry' as 'entry' | 'mid' | 'exit')
  // No part holds even 40% of the loss: the time goes everywhere, not in one place. Measured against the kept
  // losses of the three parts themselves (they can add up to more than the net loss after an early gain).
  const parts = Math.max(loss.entry, 0) + Math.max(loss.mid, 0) + Math.max(loss.exit, 0)
  if (loss[main] < parts * 0.4) return t('telemetry.advice.everywhere')
  const seconds = loss[main].toFixed(2)
  if (main === 'entry') {
    if (c.brakeDeltaM !== null && c.brakeDeltaM <= -10) return t('telemetry.advice.brakeEarly', { m: Math.round(-c.brakeDeltaM) })
    if (c.brakeDeltaM !== null && c.brakeDeltaM >= 10) return t('telemetry.advice.brakeLate', { m: Math.round(c.brakeDeltaM) })
    return t('telemetry.advice.entry', { s: seconds })
  }
  if (main === 'mid') {
    if (c.lapMinKmh !== null && c.refMinKmh !== null && c.refMinKmh - c.lapMinKmh >= 3) return t('telemetry.advice.midSlow', { kmh: Math.round(c.refMinKmh - c.lapMinKmh) })
    return t('telemetry.advice.mid', { s: seconds })
  }
  if (c.exitDeltaKmh !== null && c.exitDeltaKmh <= -3) return t('telemetry.advice.exitSlow', { kmh: Math.round(-c.exitDeltaKmh) })
  return t('telemetry.advice.exit', { s: seconds })
}

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
 * same scale on both axes. Null when the lap has no coordinates.
 */
export function mapPoints(trace: LapTraceView, at: number[], width: number, height: number, padding = 10, frame: LapTraceView = trace, rotationDeg = ACC_MAP_ROTATION_DEG): MapPoint[] | null {
  if (!trace.channels.pos_x || !trace.channels.pos_z || !frame.channels.pos_x || !frame.channels.pos_z) return null
  const raw = at.map(f => turn(channelAt(trace, 'pos_x', f)!, channelAt(trace, 'pos_z', f)!, rotationDeg))
  // The frame (usually the reference) fixes scale and offset, so two laps overlay exactly.
  const bounds = frame === trace ? raw : at.map(f => turn(channelAt(frame, 'pos_x', f)!, channelAt(frame, 'pos_z', f)!, rotationDeg))
  const xs = bounds.map(p => p.x), ys = bounds.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const scale = Math.min((width - 2 * padding) / Math.max(maxX - minX, 1e-6), (height - 2 * padding) / Math.max(maxY - minY, 1e-6))
  const offsetX = (width - (maxX - minX) * scale) / 2
  const offsetY = (height - (maxY - minY) * scale) / 2
  return raw.map(p => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale }))
}

/**
 * The same world → map transform as `mapPoints` with this frame, for geometry that is
 * not a lap (track edges): one transform for laps and edges, never fitted separately.
 */
export function worldToMap(frame: LapTraceView, at: number[], width: number, height: number, padding = 10, rotationDeg = ACC_MAP_ROTATION_DEG): ((x: number, z: number) => MapPoint) | null {
  if (!frame.channels.pos_x || !frame.channels.pos_z) return null
  const bounds = at.map(f => turn(channelAt(frame, 'pos_x', f)!, channelAt(frame, 'pos_z', f)!, rotationDeg))
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

/** Finish line: a short tick across the track at the start of the lap. */
export function finishLine(points: MapPoint[], halfLength = 9): { x1: number, y1: number, x2: number, y2: number } | null {
  if (points.length < 2) return null
  const [a, b] = [points[0]!, points[1]!]
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length
  return { x1: a.x - nx * halfLength, y1: a.y - ny * halfLength, x2: a.x + nx * halfLength, y2: a.y + ny * halfLength }
}

/**
 * Time-sync, as Track Titan's replay: where the reference car was when the lap
 * reached `fraction`. The gap shows as distance on track. Same fraction if the
 * reference has no time channel.
 */
const monotonic = new WeakMap<number[], boolean>()
function increasing(values: number[]): boolean {
  let known = monotonic.get(values)
  if (known === undefined) {
    known = values.every((v, i) => i === 0 || v >= values[i - 1]!)
    monotonic.set(values, known)
  }
  return known
}

/** Lap fraction where the trace reaches `seconds`; null on a time axis that goes back. */
export function fractionAtTime(trace: LapTraceView, seconds: number): number | null {
  const times = trace.channels.time_s
  if (!times?.length || !increasing(times)) return null
  if (seconds <= times[0]!) return 0
  if (seconds >= times[times.length - 1]!) return 1
  let low = 0, high = times.length - 1
  while (high - low > 1) { const mid = (low + high) >> 1; if (times[mid]! <= seconds) low = mid; else high = mid }
  const span = times[high]! - times[low]! || 1
  return (low + (seconds - times[low]!) / span) / (times.length - 1)
}

/**
 * Sector boundaries on the lap (Garage 61's S1/S2/S3 bar): from the official
 * sector times of the lap, placed where its trace reached them. Null without them.
 */
export function sectorBounds(trace: LapTraceView, sectorTimesMs: (number | null)[] | undefined): number[] | null {
  if (!sectorTimesMs?.length || sectorTimesMs.some(t => typeof t !== 'number' || t <= 0)) return null
  const bounds = [0]
  let elapsed = 0
  for (const t of sectorTimesMs.slice(0, -1)) {
    elapsed += t as number
    const f = fractionAtTime(trace, elapsed / 1000)
    if (f === null) return null
    bounds.push(f)
  }
  bounds.push(1)
  return bounds
}

export function timeSyncedFraction(lap: LapTraceView, reference: LapTraceView, fraction: number): number {
  const time = channelAt(lap, 'time_s', fraction)
  const times = reference.channels.time_s
  // A time axis that goes back (damaged file) cannot be searched: same point instead.
  if (time === null || !times?.length || !increasing(times)) return fraction
  if (time <= times[0]!) return 0
  if (time >= times[times.length - 1]!) return 1
  let low = 0, high = times.length - 1
  while (high - low > 1) { const mid = (low + high) >> 1; if (times[mid]! <= time) low = mid; else high = mid }
  const span = times[high]! - times[low]! || 1
  return (low + (time - times[low]!) / span) / (times.length - 1)
}

/**
 * Where the car points against where it goes (degrees, positive = nose inside to
 * the right on screen). ACC heading = -atan2(dx, dz) of the path (checked on real
 * laps: 2° spread on straights). Null without heading or coordinates.
 */
export function bodySlipDeg(trace: LapTraceView, fraction: number): number | null {
  const x = trace.channels.pos_x, z = trace.channels.pos_z, h = trace.channels.heading_rad
  if (!x || !z || !h || x.length < 3) return null
  const last = x.length - 1
  const i = Math.min(Math.max(Math.round(fraction * last), 1), last - 1)
  const travel = -Math.atan2(x[i + 1]! - x[i - 1]!, z[i + 1]! - z[i - 1]!)
  const diff = Math.atan2(Math.sin(h[i]! - travel), Math.cos(h[i]! - travel))
  return (diff * 180) / Math.PI
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
