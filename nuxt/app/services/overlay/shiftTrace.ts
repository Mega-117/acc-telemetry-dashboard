/**
 * PIP-704: where the dashboard's shift flash starts and where the driver really upshifts, so the
 * 150 rpm lead (ACC Drive's rule) can be checked from normal driving. Every 10 upshifts of the
 * same car one `hud.shift` line goes to the diary:
 *   {car, targetRpm, shifts, flashed, onsetRpmMedian, upshiftRpmMedian, leadMsMedian, beforeFlash, late}
 * - flashed: upshifts with the flash already on in that gear; leadMs = flash on -> gear change;
 * - beforeFlash: the driver shifted before the flash (short shift, or the flash is late);
 * - late: shifted more than 200 rpm past the shift point (ACC Drive's flash window ends there).
 * Pure logic: the page feeds frames, nothing here touches the DOM or IPC.
 */
export const SHIFT_TRACE_BATCH = 10
export const SHIFT_TRACE_LATE_RPM = 200
export const SHIFT_TRACE_ONSET_MAX_MS = 3_000

export interface ShiftTraceFrame {
  now: number
  car: string | null
  gear: number | null
  rpm: number | null
  flash: boolean
  targetRpm: number | null
}

export interface ShiftTraceSummary {
  car: string
  targetRpm: number
  shifts: number
  flashed: number
  onsetRpmMedian: number | null
  upshiftRpmMedian: number
  leadMsMedian: number | null
  beforeFlash: number
  late: number
}

function median(values: number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid]
  if (upper === undefined) return null
  const lower = sorted.length % 2 ? upper : sorted[mid - 1] ?? upper
  return Math.round((lower + upper) / 2)
}

export function createShiftTraceAggregator(report: (summary: ShiftTraceSummary) => void, batch = SHIFT_TRACE_BATCH) {
  let car: string | null = null
  let target: number | null = null
  let prev: { gear: number; rpm: number; flash: boolean } | null = null
  let onset: { rpm: number; at: number } | null = null
  let onsets: number[] = [], upshifts: number[] = [], leads: number[] = []
  let flashed = 0, beforeFlash = 0, late = 0

  function clear() {
    onsets = []; upshifts = []; leads = []
    flashed = beforeFlash = late = 0
  }

  return {
    feed(frame: ShiftTraceFrame) {
      const { gear, rpm, car: frameCar, targetRpm } = frame
      if (frameCar === null || targetRpm === null || gear === null || rpm === null
        || !Number.isFinite(gear) || !Number.isFinite(rpm)) { prev = null; onset = null; return }
      if (frameCar !== car || targetRpm !== target) {
        // Another car or shift point: the batch would mix two rules.
        car = frameCar; target = targetRpm; clear(); prev = null; onset = null
      }
      // Codex 02/11: a flash followed by a lift belongs to no shift: it expires after 3 s.
      if (onset && frame.now - onset.at > SHIFT_TRACE_ONSET_MAX_MS) onset = null
      if (prev && gear === prev.gear && frame.flash && !prev.flash) onset = { rpm: Math.round(rpm), at: frame.now }
      if (prev && prev.gear >= 1 && gear === prev.gear + 1) {
        const upshiftRpm = Math.round(prev.rpm)
        upshifts.push(upshiftRpm)
        if (onset) { flashed++; onsets.push(onset.rpm); leads.push(Math.max(0, Math.round(frame.now - onset.at))) }
        else beforeFlash++
        if (upshiftRpm > targetRpm + SHIFT_TRACE_LATE_RPM) late++
        if (upshifts.length >= batch) {
          report({ car: frameCar, targetRpm, shifts: upshifts.length, flashed, onsetRpmMedian: median(onsets),
            upshiftRpmMedian: median(upshifts) ?? upshiftRpm, leadMsMedian: median(leads), beforeFlash, late })
          clear()
        }
      }
      if (prev && gear !== prev.gear) onset = null
      prev = { gear, rpm, flash: frame.flash }
    },
  }
}
