import { describe, expect, it } from 'vitest'
import { createVoicePlaybackQueue } from '~/services/audio/voicePlaybackQueue'
import type { PressureRecommendationViewModel } from '~/services/overlay/tyreSetupViewModel'
import { createPressureRecommendationVoiceRuntime } from '~/services/spotter/pressureRecommendationVoiceRuntime'
import { isSpotterFeatureAllowed, type SpotterSessionMode } from '~/services/spotter/spotterSessionPolicy'

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
    sessionId: 'session-a',
    stintNumber: 1,
    sourceCompletedLaps: completedLaps,
    planId: `plan-${completedLaps}`,
    ...overrides,
  }
}

describe('pressureRecommendationVoiceRuntime deterministic replay', () => {
  it('does not rearm a consumed stint after an audio reconnect', () => {
    const queued: string[] = []
    const runtime = createPressureRecommendationVoiceRuntime({
      getVoice: () => 'if_sara',
      enqueue: cue => { queued.push(cue.id); return true },
    })
    runtime.recordRecommendation(recommendation(2))
    runtime.recordFinishCrossing(3)
    runtime.recordRecommendation(recommendation(3))
    runtime.reset()
    runtime.recordRecommendation(recommendation(3))
    runtime.recordFinishCrossing(4)
    runtime.recordRecommendation(recommendation(4))
    expect(queued).toHaveLength(1)
  })

  for (const enabled of [true, false]) {
    for (const selected of ['practice', 'qualify', 'race'] as SpotterSessionMode[]) {
      it(`filters pressure cues for master=${enabled}, selection=${selected}`, () => {
        for (const [session, mode] of [[0, 'practice'], [3, 'practice'], [4, 'practice'], [7, 'practice'], [1, 'qualify'], [8, 'qualify'], [2, 'race'], [null, null], [99, null]] as const) {
          const queued: string[] = []
          const runtime = createPressureRecommendationVoiceRuntime({
            getVoice: () => 'if_sara',
            canAnnounce: () => isSpotterFeatureAllowed(enabled, [selected], session),
            enqueue: cue => { queued.push(cue.id); return true },
          })
          runtime.recordRecommendation(recommendation(2))
          runtime.recordFinishCrossing(3)
          runtime.recordRecommendation(recommendation(3))
          expect(queued).toHaveLength(enabled && mode === selected ? 1 : 0)
        }
      })
    }
  }

  it('checks the current filter on delayed recommendations and never replays a muted lap', () => {
    let allowed = true
    const queued: string[] = []
    const runtime = createPressureRecommendationVoiceRuntime({
      getVoice: () => 'if_sara',
      canAnnounce: () => allowed,
      enqueue: cue => { queued.push(cue.id); return true },
    })
    runtime.recordRecommendation(recommendation(2))
    runtime.recordFinishCrossing(3)
    allowed = false
    runtime.recordRecommendation(recommendation(3))
    allowed = true
    runtime.recordRecommendation(recommendation(3))
    expect(queued).toEqual([])
    runtime.recordFinishCrossing(4)
    runtime.recordRecommendation(recommendation(4))
    runtime.recordRecommendation(recommendation(4))
    expect(queued).toHaveLength(0) // Muted opportunity is consumed, not replayed later.
  })

  it('accoda la pressione dopo il tempo giro senza Control K e con correlazione completa', async () => {
    const trace: string[] = []
    const queue = createVoicePlaybackQueue({
      createAudio: () => ({
        duration: 1,
        play: () => Promise.resolve(),
        pause: () => {},
        onended: null,
        onerror: null,
        ondurationchange: null,
      }),
      play: async (_audio, path) => {
        trace.push(`played:${path}`)
        return 'ended'
      },
      onEvent: event => trace.push(`${event.kind}:${event.cue.id}`),
    })
    const runtime = createPressureRecommendationVoiceRuntime({
      getVoice: () => 'if_sara',
      enqueue: queue.enqueue,
      onEvent: event => trace.push(`${event.kind}:${event.correlationId}`),
    })

    runtime.recordRecommendation(recommendation(2, {
      status: 'waiting_for_laps',
      eligible: false,
      needsAdjustment: false,
      planId: null,
    }))
    queue.enqueue({ id: 'lap-time-3', path: '/lap-time.wav', source: 'lap-time' })
    runtime.recordFinishCrossing(3)
    runtime.recordRecommendation(recommendation(3))
    await queue.drain()

    expect(trace.indexOf('queued:lap-time-3')).toBeLessThan(
      trace.indexOf('queued:pressureAdjustmentNeeded-session-session-a-stint-1-lap-3'),
    )
    expect(trace).toContain('recommendation_received:pressure-lap-3')
    expect(trace).toContain('finish_crossing_received:pressure-lap-3')
    expect(trace).toContain('cue_created:pressure-lap-3')
    expect(trace).toContain('played:/voice/qualifying/pressureAdjustmentNeeded-if_sara.wav')
    expect(trace).toContain('playback_ended:pressureAdjustmentNeeded-session-session-a-stint-1-lap-3')
  })

  it('non crea cue per dati entro tolleranza e resetta lo stint', () => {
    const queued: string[] = []
    const runtime = createPressureRecommendationVoiceRuntime({
      getVoice: () => 'im_nicola',
      enqueue: cue => { queued.push(cue.id); return true },
    })
    runtime.recordRecommendation(recommendation(2))
    runtime.recordFinishCrossing(3)
    runtime.recordRecommendation(recommendation(3, {
      status: 'within_tolerance',
      needsAdjustment: false,
    }))
    runtime.reset()
    runtime.recordRecommendation(recommendation(5))
    expect(queued).toEqual([])
  })

  it('assegna identita diverse allo stesso giro di stint successivi', () => {
    const queued: string[] = []
    const runtime = createPressureRecommendationVoiceRuntime({
      getVoice: () => 'if_sara',
      enqueue: cue => { queued.push(cue.id); return true },
    })
    for (let stint = 0; stint < 2; stint += 1) {
      runtime.recordRecommendation(recommendation(2, {
        status: 'waiting_for_laps',
        eligible: false,
        needsAdjustment: false,
        sessionId: stint === 0 ? 'session-a' : 'session-b',
      }))
      runtime.recordFinishCrossing(3)
      runtime.recordRecommendation(recommendation(3, { sessionId: stint === 0 ? 'session-a' : 'session-b' }))
      runtime.reset()
    }
    expect(queued).toEqual([
      'pressureAdjustmentNeeded-session-session-a-stint-1-lap-3',
      'pressureAdjustmentNeeded-session-session-b-stint-1-lap-3',
    ])
  })
})
