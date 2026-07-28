export const COMPLETED_LAP_HOLD_MS = 7_000

export interface CompletedLapHoldSample {
  ready: boolean
  contextKey: string | null
  lapsCompleted: number
  lastLapTimeMs: number | null
  lastLapValid: boolean | null
}

export interface CompletedLapHoldState {
  contextKey: string | null
  observedLapsCompleted: number | null
  heldLapTimeMs: number | null
  heldLapValid: boolean | null
  holdStartedAtMs: number | null
  holdUntilMs: number | null
}

export function createCompletedLapHoldState(): CompletedLapHoldState {
  return {
    contextKey: null,
    observedLapsCompleted: null,
    heldLapTimeMs: null,
    heldLapValid: null,
    holdStartedAtMs: null,
    holdUntilMs: null,
  }
}

function hasReliableCompletedLap(sample: CompletedLapHoldSample): boolean {
  return Number.isFinite(sample.lastLapTimeMs)
    && (sample.lastLapTimeMs ?? 0) > 0
    && typeof sample.lastLapValid === 'boolean'
}

export function advanceCompletedLapHold(
  previous: CompletedLapHoldState,
  sample: CompletedLapHoldSample,
  nowMs: number,
): CompletedLapHoldState {
  if (!sample.ready) return createCompletedLapHoldState()

  const contextChanged = previous.contextKey !== sample.contextKey
  const rewound = previous.observedLapsCompleted !== null
    && sample.lapsCompleted < previous.observedLapsCompleted

  if (contextChanged || rewound || previous.observedLapsCompleted === null) {
    return {
      ...createCompletedLapHoldState(),
      contextKey: sample.contextKey,
      observedLapsCompleted: sample.lapsCompleted,
    }
  }

  if (sample.lapsCompleted > previous.observedLapsCompleted) {
    if (!hasReliableCompletedLap(sample)) {
      return {
        ...createCompletedLapHoldState(),
        contextKey: sample.contextKey,
        observedLapsCompleted: sample.lapsCompleted,
      }
    }

    return {
      contextKey: sample.contextKey,
      observedLapsCompleted: sample.lapsCompleted,
      heldLapTimeMs: sample.lastLapTimeMs,
      heldLapValid: sample.lastLapValid,
      holdStartedAtMs: nowMs,
      holdUntilMs: nowMs + COMPLETED_LAP_HOLD_MS,
    }
  }

  if (previous.holdUntilMs !== null && nowMs >= previous.holdUntilMs) {
    return {
      ...previous,
      heldLapTimeMs: null,
      heldLapValid: null,
      holdStartedAtMs: null,
      holdUntilMs: null,
    }
  }

  return previous
}

export function isCompletedLapHeld(state: CompletedLapHoldState, nowMs: number): boolean {
  return state.holdUntilMs !== null
    && nowMs < state.holdUntilMs
    && state.heldLapTimeMs !== null
    && state.heldLapValid !== null
}
