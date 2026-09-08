import { describe, expect, it } from 'vitest'
import { createPressureRecommendationVoiceState, pressureWarningVoicePath, recordPressureFinishCrossing, recordPressureRecommendation } from '~/services/spotter/pressureRecommendationVoice'
import type { PressureRecommendationViewModel } from '~/services/overlay/tyreSetupViewModel'

function rec(lap: number, stint = 1, source = lap, extra: Partial<PressureRecommendationViewModel> = {}): PressureRecommendationViewModel {
  return { status: 'ready', eligible: true, needsAdjustment: true, completedLaps: lap,
    requiredCompletedLaps: 3, planId: `plan-${source}`, sessionId: 'session-a', stintNumber: stint,
    sourceCompletedLaps: source, ...extra }
}

describe('pressure voice physical stint cycle', () => {
  it('warns once at stint 1 lap 3, once at stint 2 lap 5, never in stint 3, irrespective of applications', () => {
    let state = recordPressureRecommendation(createPressureRecommendationVoiceState(), rec(0)).state
    const heard: string[] = []
    let source = 0
    for (const stint of [1, 2, 3]) {
      state = recordPressureRecommendation(state, rec(0, stint, source)).state
      for (let lap = 1; lap <= 20; lap++) {
        source++
        state = recordPressureFinishCrossing(state, source).state
        const result = recordPressureRecommendation(state, rec(lap, stint, source))
        state = result.state
        if (result.announce) heard.push(`${stint}:${lap}`)
        expect(recordPressureFinishCrossing(state, source).announce).toBe(false)
      }
    }
    expect(heard).toEqual(['1:3', '2:5'])
  })

  it('waits for the matching lap in either arrival order, never the previous recommendation', () => {
    for (const first of ['finish', 'plan']) {
      let state = recordPressureRecommendation(createPressureRecommendationVoiceState(), rec(2)).state
      if (first === 'finish') {
        const pending = recordPressureFinishCrossing(state, 3)
        expect(pending.announce).toBe(false)
        expect(recordPressureRecommendation(pending.state, rec(3)).announce).toBe(true)
      } else {
        state = recordPressureRecommendation(state, rec(3)).state
        expect(recordPressureFinishCrossing(state, 3).announce).toBe(true)
      }
    }
  })

  it('defers unstable data and remains available after a within-tolerance lap', () => {
    let state = recordPressureRecommendation(createPressureRecommendationVoiceState(), rec(2)).state
    for (const [lap, status] of [[3, 'waiting_for_stable_pressure'], [4, 'within_tolerance'], [5, 'ready']] as const) {
      state = recordPressureFinishCrossing(state, lap).state
      const result = recordPressureRecommendation(state, rec(lap, 1, lap, { status, needsAdjustment: status !== 'within_tolerance', eligible: status !== 'waiting_for_stable_pressure' }))
      expect(result.announce).toBe(lap === 5)
      state = result.state
    }
  })

  it('resets for an explicit new session even with the same session type and lap counts', () => {
    let state = recordPressureRecommendation(createPressureRecommendationVoiceState(), rec(2)).state
    state = recordPressureFinishCrossing(state, 3).state
    state = recordPressureRecommendation(state, rec(3)).state
    state = recordPressureRecommendation(state, rec(2, 1, 2, { sessionId: 'session-b' })).state
    state = recordPressureFinishCrossing(state, 3).state
    expect(recordPressureRecommendation(state, rec(3, 1, 3, { sessionId: 'session-b' })).announce).toBe(true)
  })

  it('does not reset the cycle when stint laps reset after a tyre change', () => {
    let state = recordPressureRecommendation(createPressureRecommendationVoiceState(), rec(2)).state
    state = recordPressureFinishCrossing(state, 3).state
    state = recordPressureRecommendation(state, rec(3)).state
    state = recordPressureRecommendation(state, rec(0, 1, 3)).state
    state = recordPressureFinishCrossing(state, 6).state
    expect(recordPressureRecommendation(state, rec(3, 1, 6)).announce).toBe(false)
  })

  it('ignores stale startup, missing identity and invalid finish inputs', () => {
    let state = recordPressureRecommendation(createPressureRecommendationVoiceState(), rec(20)).state
    expect(recordPressureFinishCrossing(state, 20).announce).toBe(false)
    expect(recordPressureFinishCrossing(state, NaN).announce).toBe(false)
    state = recordPressureFinishCrossing(state, 21).state
    expect(recordPressureRecommendation(state, rec(21, 1, 21, { sessionId: null })).announce).toBe(false)
    expect(recordPressureRecommendation(state, null).announce).toBe(false)
  })

  it('retains the existing voice assets', () => {
    expect(pressureWarningVoicePath('if_sara')).toBe('/voice/qualifying/pressureAdjustmentNeeded-if_sara.wav')
    expect(pressureWarningVoicePath('im_nicola')).toBe('/voice/qualifying/pressureAdjustmentNeeded-im_nicola.wav')
  })
})
