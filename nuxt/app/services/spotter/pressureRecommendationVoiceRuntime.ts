import type { PressureRecommendationViewModel } from '../overlay/tyreSetupViewModel'
import type { VoiceCue } from '../audio/voicePlaybackQueue'
import {
  createPressureRecommendationVoiceState,
  pressureWarningVoicePath,
  recordPressureFinishCrossing,
  recordPressureRecommendation,
  PRESSURE_WARNING_SCENARIO_ID,
  type PressureRecommendationVoiceOutcome,
} from './pressureRecommendationVoice'

export type PressureVoiceRuntimeEventKind =
  | 'recommendation_received'
  | 'finish_crossing_received'
  | 'cue_created'

export interface PressureVoiceRuntimeEvent {
  kind: PressureVoiceRuntimeEventKind
  correlationId: string
  completedLaps: number
  cue?: VoiceCue
}

export interface PressureRecommendationVoiceRuntime {
  recordFinishCrossing: (completedLaps: number) => void
  recordRecommendation: (recommendation: PressureRecommendationViewModel | null) => void
  reset: () => void
}

function pressureCorrelationId(completedLaps: number): string {
  return `pressure-lap-${Math.max(0, Math.trunc(completedLaps))}`
}

export function createPressureRecommendationVoiceRuntime(options: {
  getVoice: () => string
  enqueue: (cue: VoiceCue) => boolean
  onEvent?: (event: PressureVoiceRuntimeEvent) => void
}): PressureRecommendationVoiceRuntime {
  let state = createPressureRecommendationVoiceState()
  let stintGeneration = 0
  const publish = options.onEvent ?? (() => {})

  function applyOutcome(outcome: PressureRecommendationVoiceOutcome) {
    state = outcome.state
    if (!outcome.announce) return
    const completedLaps = state.latestRecommendation?.completedLaps
    if (!Number.isFinite(completedLaps)) return
    const lap = Number(completedLaps)
    const correlationId = pressureCorrelationId(lap)
    const cue: VoiceCue = {
      id: `${PRESSURE_WARNING_SCENARIO_ID}-stint-${stintGeneration}-lap-${lap}`,
      path: pressureWarningVoicePath(options.getVoice()),
      source: 'pressure-warning',
      correlationId,
      scenarioId: PRESSURE_WARNING_SCENARIO_ID,
    }
    publish({ kind: 'cue_created', correlationId, completedLaps: lap, cue })
    options.enqueue(cue)
  }

  return {
    recordFinishCrossing(completedLaps) {
      const lap = Math.max(0, Math.trunc(completedLaps))
      publish({
        kind: 'finish_crossing_received',
        correlationId: pressureCorrelationId(lap),
        completedLaps: lap,
      })
      applyOutcome(recordPressureFinishCrossing(state))
    },
    recordRecommendation(recommendation) {
      if (
        recommendation
        && state.lastCompletedLaps !== null
        && recommendation.completedLaps < state.lastCompletedLaps
      ) {
        stintGeneration += 1
      }
      if (recommendation) {
        publish({
          kind: 'recommendation_received',
          correlationId: pressureCorrelationId(recommendation.completedLaps),
          completedLaps: recommendation.completedLaps,
        })
      }
      applyOutcome(recordPressureRecommendation(state, recommendation))
    },
    reset() {
      state = createPressureRecommendationVoiceState()
      stintGeneration += 1
    },
  }
}
