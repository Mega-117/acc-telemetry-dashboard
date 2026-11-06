import { channelAt, type Corner } from './lapAnalysis'
import type { LapTraceView } from './lapTraceChart'

/**
 * 06/11 (user: "the braking sometimes starts before the segment"): a segment begins at the speed peak of the session's
 * best lap, i.e. where that lap starts braking, so a lap braking a few metres earlier (8-28 m on Barcelona) fell in the
 * previous segment. Each start moves back by about one second of travel at that point (40-100 m), and the previous
 * segment ends there: one shared boundary, no gaps or overlaps. It never goes back past half the way from the previous
 * apex (a chicane keeps its exit), nor before the line. Numbers and apexes stay: the theoretical lap (idealLap.ts) and
 * every caller of detectCorners keep the peaks.
 */
/**
 * PIP-737 spy (`laps.segments`): what can be wrong with the moved boundaries, counted. A KO is any of: a segment lost or
 * renumbered, an apex moved, a start not before its apex or an end not after it, outside the lap, or two neighbours
 * that leave a gap or overlap where the detected segments touched.
 */
export function segmentsCheck(detected: Corner[], timed: Corner[]): { segments: number, badBounds: number } {
  let bad = detected.length === timed.length ? 0 : 1
  timed.forEach((c, i) => {
    const d = detected[i]
    if (!d || d.number !== c.number || d.apex !== c.apex) bad++
    if (!(c.start < c.apex && c.apex < c.end) || c.start < 0 || c.end > 1) bad++
    const prev = timed[i - 1]
    if (prev && detected[i - 1] && detected[i - 1]!.end === d?.start && prev.end !== c.start) bad++
  })
  return { segments: timed.length, badBounds: bad }
}

export function withApproach(corners: Corner[], trace: LapTraceView, seconds = 1, minM = 40, maxM = 100): Corner[] {
  const length = trace.lengthM
  if (!corners.length || !(length > 0)) return corners
  const out = corners.map(c => ({ ...c }))
  out.forEach((c, i) => {
    const kmh = channelAt(trace, 'speed_kmh', c.start) ?? 0
    const marginM = Math.min(maxM, Math.max(minM, (kmh / 3.6) * seconds))
    const prev = out[i - 1]
    const floor = prev ? prev.apex + (c.start - prev.apex) / 2 : 0
    const start = Math.max(floor, c.start - marginM / length)
    if (prev && prev.end === c.start) prev.end = start
    c.start = start
  })
  return out
}
