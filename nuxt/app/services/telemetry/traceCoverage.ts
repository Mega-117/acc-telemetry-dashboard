/** What the check reads of a lap trace (LapTraceView fits; no import: lapTraceChart reads this module). */
export interface TimedTrace { lapTimeS: number, channels: Record<string, number[] | undefined> }

/**
 * PIP-751: does a lap trace cover the lap ACC timed? The header of the Telemetria page uses ACC's
 * official lap times; the delta, the measured sectors and "Dove perdi di più" use the trace's own
 * clock (`time_s`). When the two disagree the page says the opposite of itself: Silverstone traces
 * saved before the fix run from the position wrap to the line and are 1.67-1.9 s short (Spa ~0.5 s).
 *
 * The game is the arbiter: a trace whose duration is more than a quarter of a second from ACC's lap
 * time is never used for a delta, and it is never stretched to fit (the missing stretch cannot be
 * rebuilt). Same 0.25 s as the logger (`COVERAGE_TOLERANCE_S`, recorder.py) and the trace audit
 * (`scripts/qa/laptrace_audit.py`).
 */
export const TRACE_COVERAGE_TOLERANCE_S = 0.25

/**
 * What the page does with a lap whose trace does not cover it (laps saved before the fix: they stay
 * short, the missing piece cannot be rebuilt). User decision pending (PIP-751): this is the one place
 * to change it.
 * - 'warn': the lap stays visible and can be picked; the page says the trace is incomplete and draws no
 *   delta, segments or measured sectors from it. The official header and sector times stay.
 * - 'exclude': the lap counts as incomplete (`normalizeLapTrace`): never offered for a comparison.
 */
export type ShortTracePolicy = 'warn' | 'exclude'
export const SHORT_TRACE_POLICY: ShortTracePolicy = 'warn'

export interface TraceCoverage {
  covers: boolean
  /** Trace duration minus ACC's lap time, in ms (negative: the trace is short). Null when unknown. */
  spanGapMs: number | null
}

export function traceCoversLap(trace: TimedTrace): TraceCoverage {
  const time = trace.channels?.time_s
  if (!Array.isArray(time) || time.length < 2 || !(trace.lapTimeS > 0)) return { covers: false, spanGapMs: null }
  // A clock going back is not a lap of ACC (Codex 08/11): the endpoints alone would hide it.
  for (let i = 1; i < time.length; i++) if (!(time[i]! >= time[i - 1]!)) return { covers: false, spanGapMs: null }
  const gapS = time[time.length - 1]! - time[0]! - trace.lapTimeS
  if (!Number.isFinite(gapS)) return { covers: false, spanGapMs: null }
  // A microsecond of slack for the float sum, never more: the tolerance itself is the rule.
  return { covers: Math.abs(gapS) <= TRACE_COVERAGE_TOLERANCE_S + 1e-6, spanGapMs: Math.round(gapS * 1000) }
}

export interface PairCheck {
  /**
   * The delta, the segments and the measured sectors can be drawn: both traces cover their laps AND the
   * end of the delta lands within the same quarter second of the official gap in the header (Codex 08/11:
   * two traces each 0.24 s off in opposite directions would still turn +0.10 into -0.38).
   */
  comparable: boolean
  you: TraceCoverage
  ref: TraceCoverage
  /** The larger of the two gaps (absolute, ms): how far the worse trace is from ACC. */
  spanGapMs: number | null
  /** How far the end of the delta would be from the official gap in the header (ms, absolute). */
  mismatchMs: number | null
}

export function lapPairCheck(lap: TimedTrace, reference: TimedTrace): PairCheck {
  const you = traceCoversLap(lap), ref = traceCoversLap(reference)
  const known = you.spanGapMs !== null && ref.spanGapMs !== null
  const mismatchMs = known ? Math.abs(you.spanGapMs! - ref.spanGapMs!) : null
  return {
    comparable: you.covers && ref.covers && mismatchMs !== null && mismatchMs <= TRACE_COVERAGE_TOLERANCE_S * 1000,
    you,
    ref,
    spanGapMs: known ? Math.max(Math.abs(you.spanGapMs!), Math.abs(ref.spanGapMs!)) : null,
    mismatchMs,
  }
}

/** The policy applied when a trace is read: under 'exclude' a trace that does not cover its lap is incomplete. */
export function completeUnderPolicy(complete: boolean, trace: TimedTrace, policy: ShortTracePolicy = SHORT_TRACE_POLICY): boolean {
  return complete && (policy !== 'exclude' || traceCoversLap(trace).covers)
}
