import type { PressureRecommendationViewModel } from '~/services/overlay/tyreSetupViewModel'

export const PRESSURE_WARNING_SCENARIO_ID = 'pressureAdjustmentNeeded'
export const PRESSURE_WARNING_STINT_LAPS: Readonly<Record<number, number>> = { 1: 3, 2: 5 }

export interface PressureRecommendationVoiceState {
  pendingFinishLaps: number[]
  latestRecommendation: PressureRecommendationViewModel | null
  sessionId: string | null
  warnedStints: number[]
  resolvedSourceLap: number | null
  initialized: boolean
}

export interface PressureRecommendationVoiceOutcome {
  state: PressureRecommendationVoiceState
  announce: boolean
}

export function createPressureRecommendationVoiceState(): PressureRecommendationVoiceState {
  return {
    pendingFinishLaps: [], latestRecommendation: null, sessionId: null,
    warnedStints: [], resolvedSourceLap: null, initialized: false,
  }
}

function settle(state: PressureRecommendationVoiceState): PressureRecommendationVoiceOutcome {
  const r = state.latestRecommendation
  const sourceLap = r?.sourceCompletedLaps
  if (!r || !r.sessionId || !Number.isInteger(sourceLap) || sourceLap == null
    || !state.pendingFinishLaps.includes(sourceLap)
    || (state.resolvedSourceLap !== null && sourceLap <= state.resolvedSourceLap)) {
    return { state, announce: false }
  }
  const stint = r.stintNumber ?? 0
  const threshold = PRESSURE_WARNING_STINT_LAPS[stint]
  const announce = threshold !== undefined && r.completedLaps >= threshold
    && !state.warnedStints.includes(stint)
    && r.status === 'ready' && r.eligible && r.needsAdjustment
  return {
    state: {
      ...state,
      pendingFinishLaps: state.pendingFinishLaps.filter(lap => lap > sourceLap),
      resolvedSourceLap: sourceLap,
      warnedStints: announce ? [...state.warnedStints, stint] : state.warnedStints,
    },
    announce,
  }
}

export function recordPressureFinishCrossing(
  state: PressureRecommendationVoiceState, completedLaps: number,
): PressureRecommendationVoiceOutcome {
  if (!Number.isInteger(completedLaps) || completedLaps < 0
    || (state.resolvedSourceLap !== null && completedLaps <= state.resolvedSourceLap)) {
    return { state, announce: false }
  }
  return settle({ ...state, pendingFinishLaps: [...new Set([...state.pendingFinishLaps, completedLaps])].slice(-8) })
}

export function recordPressureRecommendation(
  state: PressureRecommendationVoiceState,
  recommendation: PressureRecommendationViewModel | null,
): PressureRecommendationVoiceOutcome {
  if (!recommendation?.sessionId) {
    // Older producers cannot identify physical stints: keep manual correction, stay silent.
    return { state: { ...state, latestRecommendation: null }, announce: false }
  }
  const changedSession = state.sessionId !== null && state.sessionId !== recommendation.sessionId
  const next = changedSession ? createPressureRecommendationVoiceState() : state
  const updated = {
    ...next, sessionId: recommendation.sessionId, latestRecommendation: recommendation, initialized: true,
  }
  if (!next.initialized && next.pendingFinishLaps.length === 0) {
    // Attaching/reopening must not announce the already completed lap.
    updated.resolvedSourceLap = recommendation.sourceCompletedLaps ?? null
    return { state: updated, announce: false }
  }
  return settle(updated)
}

export function pressureWarningVoicePath(voice: string): string {
  return `/voice/qualifying/${PRESSURE_WARNING_SCENARIO_ID}-${voice}.wav`
}
