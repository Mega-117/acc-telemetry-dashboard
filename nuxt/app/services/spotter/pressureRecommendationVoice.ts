import type { PressureRecommendationViewModel } from '~/services/overlay/tyreSetupViewModel'

export const PRESSURE_WARNING_SCENARIO_ID = 'pressureAdjustmentNeeded'
export const PRESSURE_WARNING_LAPS = [3, 4, 5] as const

export interface PressureRecommendationVoiceState {
  pendingFinishCrossings: number
  latestRecommendation: PressureRecommendationViewModel | null
  resolvedLaps: number[]
  lastCompletedLaps: number | null
  initialized: boolean
}

export interface PressureRecommendationVoiceOutcome {
  state: PressureRecommendationVoiceState
  announce: boolean
}

export function createPressureRecommendationVoiceState(): PressureRecommendationVoiceState {
  return {
    pendingFinishCrossings: 0,
    latestRecommendation: null,
    resolvedLaps: [],
    lastCompletedLaps: null,
    initialized: false,
  }
}

function isWarningLap(lap: number): boolean {
  return (PRESSURE_WARNING_LAPS as readonly number[]).includes(lap)
}

function settle(state: PressureRecommendationVoiceState): PressureRecommendationVoiceOutcome {
  const recommendation = state.latestRecommendation
  if (!recommendation || state.pendingFinishCrossings <= 0) return { state, announce: false }
  const lap = recommendation.completedLaps
  if (state.resolvedLaps.includes(lap)) return { state, announce: false }

  const resolvedLaps = [...state.resolvedLaps, lap]
  return {
    state: {
      ...state,
      pendingFinishCrossings: state.pendingFinishCrossings - 1,
      resolvedLaps,
    },
    announce: isWarningLap(lap)
      && recommendation.status === 'ready'
      && recommendation.eligible
      && recommendation.needsAdjustment,
  }
}

export function recordPressureFinishCrossing(
  state: PressureRecommendationVoiceState,
): PressureRecommendationVoiceOutcome {
  return settle({ ...state, pendingFinishCrossings: state.pendingFinishCrossings + 1 })
}

export function recordPressureRecommendation(
  state: PressureRecommendationVoiceState,
  recommendation: PressureRecommendationViewModel | null,
): PressureRecommendationVoiceOutcome {
  if (!recommendation) return { state: { ...state, latestRecommendation: null }, announce: false }
  const newStint = state.lastCompletedLaps !== null
    && recommendation.completedLaps < state.lastCompletedLaps
  const next = newStint
    ? createPressureRecommendationVoiceState()
    : state
  if (!next.initialized && next.pendingFinishCrossings === 0) {
    return {
      state: {
        ...next,
        initialized: true,
        latestRecommendation: recommendation,
        lastCompletedLaps: recommendation.completedLaps,
        resolvedLaps: [recommendation.completedLaps],
      },
      announce: false,
    }
  }
  return settle({
    ...next,
    initialized: true,
    latestRecommendation: recommendation,
    lastCompletedLaps: recommendation.completedLaps,
  })
}

export function pressureWarningVoicePath(voice: string): string {
  return `/voice/qualifying/${PRESSURE_WARNING_SCENARIO_ID}-${voice}.wav`
}
