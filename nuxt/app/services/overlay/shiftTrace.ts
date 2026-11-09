import { shiftFlashDue, shiftFlashLeadArmed } from '~/utils/dashboardPresentation'

/**
 * PIP-704: where the dashboard's shift flash starts and where the driver really upshifts, so the
 * 150 rpm lead (ACC Drive's rule) can be checked from normal driving. Every 10 upshifts of the
 * same car one `hud.shift` line goes to the diary:
 *   {car, targetRpm, shifts, flashed, onsetRpmMedian, upshiftRpmMedian, leadMsMedian, beforeFlash, late}
 * - flashed: upshifts with the flash already on in that gear; leadMs = flash on -> gear change;
 * - beforeFlash: the driver shifted before the flash (short shift, or the flash is late);
 * - late: shifted more than 200 rpm past the shift point (ACC Drive's flash window ends there).
 * - every flash onset is judged against the sample where the light was first due in that rise
 *   (shiftFlashDue, the presentation's own rule): on time, early (lit while not due) or late (due
 *   on an earlier sample, still off; lateMsMax is the worst delay). `lead` onsets are those whose
 *   first due sample came from the 150 rpm lead (armed below the point); `plain` the others, also
 *   when the lead arms only after the point (second Codex review 09/11). The counters decide the
 *   R2 verdict; the medians (leadOnsetRpmMedian, plainOnsetRpmMedian) are information only.
 * Pure logic: the page feeds frames, nothing here touches the DOM or IPC.
 */
export const SHIFT_TRACE_BATCH = 10
export const SHIFT_TRACE_LATE_RPM = 200
export const SHIFT_TRACE_ONSET_MAX_MS = 3_000
/** PIP-755: ACC passes through neutral between two gears; longer than this it is a real neutral (logger: SHIFT_NEUTRAL_MAX_S). */
export const SHIFT_TRACE_NEUTRAL_MAX_MS = 500

export interface ShiftTraceFrame {
  now: number
  car: string | null
  gear: number | null
  rpm: number | null
  flash: boolean
  targetRpm: number | null
  /** Throttle and brake (0-1) of the frame: whether the lead was armed at the onset. */
  throttle?: number | null
  brake?: number | null
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
  leadOnsets: number
  leadOnsetRpmMedian: number | null
  plainOnsets: number
  plainOnsetRpmMedian: number | null
  leadOnTime: number
  leadEarly: number
  leadLate: number
  plainOnTime: number
  plainEarly: number
  plainLate: number
  lateMsMax: number | null
}

type OnsetVerdict = { onTime: number, early: number, late: number }

function median(values: number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid]
  if (upper === undefined) return null
  const lower = sorted.length % 2 ? upper : sorted[mid - 1] ?? upper
  return Math.round((lower + upper) / 2)
}

/**
 * 02/11: in ~70 laps with the dashboard open no `hud.shift` line arrived and nothing said why.
 * The health counters say it: frames fed, frames skipped by reason, upshifts seen, reports sent.
 */
export interface ShiftTraceHealth {
  frames: number
  noCar: number
  noTarget: number
  noGearOrRpm: number
  upshifts: number
  reports: number
}

export function createShiftTraceAggregator(report: (summary: ShiftTraceSummary) => void, batch = SHIFT_TRACE_BATCH) {
  let car: string | null = null
  let target: number | null = null
  let prev: { gear: number; rpm: number; flash: boolean } | null = null
  let onset: { rpm: number; at: number; lead: boolean } | null = null
  let neutralAt: number | null = null
  // The first sample of this rise where the light was due, and whether the lead made it due.
  let firstDue: { at: number; lead: boolean } | null = null
  let lead: OnsetVerdict = { onTime: 0, early: 0, late: 0 }, plain: OnsetVerdict = { onTime: 0, early: 0, late: 0 }
  let lateMsMax: number | null = null
  let onsets: number[] = [], upshifts: number[] = [], leads: number[] = [], leadOnsets: number[] = [], plainOnsets: number[] = []
  let flashed = 0, beforeFlash = 0, late = 0
  let health: ShiftTraceHealth = { frames: 0, noCar: 0, noTarget: 0, noGearOrRpm: 0, upshifts: 0, reports: 0 }

  function clear() {
    onsets = []; upshifts = []; leads = []; leadOnsets = []; plainOnsets = []
    flashed = beforeFlash = late = 0
    lead = { onTime: 0, early: 0, late: 0 }; plain = { onTime: 0, early: 0, late: 0 }; lateMsMax = null
  }

  return {
    /** Counters since the last call, then zeroed. */
    takeHealth(): ShiftTraceHealth {
      const taken = health
      health = { frames: 0, noCar: 0, noTarget: 0, noGearOrRpm: 0, upshifts: 0, reports: 0 }
      return taken
    },
    feed(frame: ShiftTraceFrame) {
      const { gear, rpm, car: frameCar, targetRpm } = frame
      health.frames++
      if (frameCar === null) health.noCar++
      else if (targetRpm === null) health.noTarget++
      else if (gear === null || rpm === null || !Number.isFinite(gear) || !Number.isFinite(rpm)) health.noGearOrRpm++
      if (frameCar === null || targetRpm === null || gear === null || rpm === null
        || !Number.isFinite(gear) || !Number.isFinite(rpm)) { prev = null; onset = null; neutralAt = null; firstDue = null; return }
      if (frameCar !== car || targetRpm !== target) {
        // Another car or shift point: the batch would mix two rules.
        car = frameCar; target = targetRpm; clear(); prev = null; onset = null; neutralAt = null; firstDue = null
      }
      // PIP-755: ACC passes through neutral between two gears (g -> N -> g+1, as the logger's
      // ShiftTracker knows): the gear, its last rpm and the flash onset wait across it. Without
      // this the trace saw N -> g+1 and counted no upshift at all (R2 08/11: upshifts=0).
      if (gear === 0 && prev && prev.gear >= 1) {
        neutralAt ??= frame.now
        return
      }
      if (neutralAt !== null) {
        if (frame.now - neutralAt > SHIFT_TRACE_NEUTRAL_MAX_MS) { prev = null; onset = null; firstDue = null }
        neutralAt = null
      }
      // Codex 02/11: a flash followed by a lift belongs to no shift: it expires after 3 s.
      if (onset && frame.now - onset.at > SHIFT_TRACE_ONSET_MAX_MS) onset = null
      const throttle = frame.throttle ?? null, brake = frame.brake ?? null
      const due = shiftFlashDue(rpm, targetRpm, throttle, brake)
      if (!prev || gear !== prev.gear || (!due && !frame.flash)) firstDue = null   // a new rise
      if (due && !firstDue) firstDue = { at: frame.now, lead: rpm < targetRpm }
      if (prev && gear === prev.gear && frame.flash && !prev.flash) {
        // Lit while not due: early (lead when the lead was armed below the point, plain otherwise).
        const isLead = firstDue ? firstDue.lead : shiftFlashLeadArmed(throttle, brake) && rpm < targetRpm
        const verdict = isLead ? lead : plain
        if (!due) verdict.early++
        else if (firstDue && firstDue.at < frame.now) {
          verdict.late++
          lateMsMax = Math.max(lateMsMax ?? 0, Math.round(frame.now - firstDue.at))
        } else verdict.onTime++
        onset = { rpm: Math.round(rpm), at: frame.now, lead: isLead }
      }
      if (prev && prev.gear >= 1 && gear === prev.gear + 1) {
        health.upshifts++
        const upshiftRpm = Math.round(prev.rpm)
        upshifts.push(upshiftRpm)
        if (onset) {
          flashed++; onsets.push(onset.rpm); leads.push(Math.max(0, Math.round(frame.now - onset.at)))
          if (onset.lead) leadOnsets.push(onset.rpm)
          else plainOnsets.push(onset.rpm)
        }
        else beforeFlash++
        if (upshiftRpm > targetRpm + SHIFT_TRACE_LATE_RPM) late++
        if (upshifts.length >= batch) {
          health.reports++
          report({ car: frameCar, targetRpm, shifts: upshifts.length, flashed, onsetRpmMedian: median(onsets),
            upshiftRpmMedian: median(upshifts) ?? upshiftRpm, leadMsMedian: median(leads), beforeFlash, late,
            leadOnsets: leadOnsets.length, leadOnsetRpmMedian: median(leadOnsets),
            plainOnsets: plainOnsets.length, plainOnsetRpmMedian: median(plainOnsets),
            leadOnTime: lead.onTime, leadEarly: lead.early, leadLate: lead.late,
            plainOnTime: plain.onTime, plainEarly: plain.early, plainLate: plain.late, lateMsMax })
          clear()
        }
      }
      if (prev && gear !== prev.gear) onset = null
      prev = { gear, rpm, flash: frame.flash }
    },
  }
}
