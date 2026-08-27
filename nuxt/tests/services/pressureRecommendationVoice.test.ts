import { describe, expect, it } from 'vitest'
import {
  createPressureRecommendationVoiceState,
  pressureWarningVoicePath,
  recordPressureFinishCrossing,
  recordPressureRecommendation,
} from '~/services/spotter/pressureRecommendationVoice'
import type { PressureRecommendationViewModel } from '~/services/overlay/tyreSetupViewModel'

function recommendation(
  completedLaps: number,
  overrides: Partial<PressureRecommendationViewModel> = {},
): PressureRecommendationViewModel {
  return {
    status: 'ready',
    eligible: true,
    needsAdjustment: true,
    completedLaps,
    requiredCompletedLaps: 3,
    planId: `plan-${completedLaps}`,
    ...overrides,
  }
}

describe('pressureRecommendationVoice', () => {
  it('accoda dopo il traguardo quando la raccomandazione arriva prima', () => {
    let state = createPressureRecommendationVoiceState()
    state = recordPressureRecommendation(state, recommendation(2, {
      status: 'waiting_for_laps',
      eligible: false,
      needsAdjustment: false,
      planId: null,
    })).state
    state = recordPressureRecommendation(state, recommendation(3)).state
    const outcome = recordPressureFinishCrossing(state)
    expect(outcome.announce).toBe(true)
    expect(outcome.state.resolvedLaps).toEqual([2, 3])
  })

  it('accoda quando la raccomandazione arriva dopo il traguardo', () => {
    let state = recordPressureFinishCrossing(createPressureRecommendationVoiceState()).state
    const outcome = recordPressureRecommendation(state, recommendation(3))
    expect(outcome.announce).toBe(true)
  })

  it('parla una volta sola per ciascuno dei giri 3, 4 e 5', () => {
    let state = recordPressureRecommendation(
      createPressureRecommendationVoiceState(),
      recommendation(2, { status: 'waiting_for_laps', eligible: false, needsAdjustment: false }),
    ).state
    for (const lap of [3, 4, 5]) {
      state = recordPressureRecommendation(state, recommendation(lap)).state
      const first = recordPressureFinishCrossing(state)
      expect(first.announce).toBe(true)
      state = first.state
    }
    const duplicate = recordPressureRecommendation(state, recommendation(5))
    expect(recordPressureFinishCrossing(duplicate.state).announce).toBe(false)
  })

  it('consuma silenziosamente un giro entro tolleranza o non eleggibile', () => {
    let state = recordPressureFinishCrossing(recordPressureRecommendation(
      createPressureRecommendationVoiceState(),
      recommendation(2, { status: 'waiting_for_laps', eligible: false, needsAdjustment: false }),
    ).state).state
    const within = recordPressureRecommendation(
      state,
      recommendation(3, { status: 'within_tolerance', needsAdjustment: false }),
    )
    expect(within.announce).toBe(false)
    expect(within.state.resolvedLaps).toEqual([2, 3])

    state = recordPressureRecommendation(within.state, recommendation(4, { eligible: false })).state
    expect(recordPressureFinishCrossing(state).announce).toBe(false)
  })

  it('ignora piani stale all’avvio e giri fuori dalla finestra 3-5', () => {
    let state = recordPressureRecommendation(createPressureRecommendationVoiceState(), recommendation(5)).state
    expect(state.resolvedLaps).toEqual([5])
    state = recordPressureRecommendation(state, recommendation(6)).state
    expect(recordPressureFinishCrossing(state).announce).toBe(false)
  })

  it('azzera deduplica e crediti quando parte un nuovo stint', () => {
    let state = recordPressureRecommendation(createPressureRecommendationVoiceState(), recommendation(2)).state
    state = recordPressureRecommendation(state, recommendation(3)).state
    state = recordPressureFinishCrossing(state).state
    const reset = recordPressureRecommendation(state, recommendation(0, {
      status: 'waiting_for_laps',
      eligible: false,
      needsAdjustment: false,
      planId: null,
    }))
    expect(reset.state.resolvedLaps).toEqual([0])
    expect(reset.state.pendingFinishCrossings).toBe(0)
  })

  it('costruisce il percorso fisso per entrambe le voci', () => {
    expect(pressureWarningVoicePath('if_sara')).toBe('/voice/qualifying/pressureAdjustmentNeeded-if_sara.wav')
    expect(pressureWarningVoicePath('im_nicola')).toBe('/voice/qualifying/pressureAdjustmentNeeded-im_nicola.wav')
  })
})
