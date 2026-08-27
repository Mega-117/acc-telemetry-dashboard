import { describe, expect, it } from 'vitest'
import { createVoicePlaybackQueue } from '~/services/audio/voicePlaybackQueue'
import type { PressureRecommendationViewModel } from '~/services/overlay/tyreSetupViewModel'
import { createPressureRecommendationVoiceRuntime } from '~/services/spotter/pressureRecommendationVoiceRuntime'

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

describe('pressureRecommendationVoiceRuntime deterministic replay', () => {
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
      trace.indexOf('queued:pressureAdjustmentNeeded-stint-0-lap-3'),
    )
    expect(trace).toContain('recommendation_received:pressure-lap-3')
    expect(trace).toContain('finish_crossing_received:pressure-lap-3')
    expect(trace).toContain('cue_created:pressure-lap-3')
    expect(trace).toContain('played:/voice/qualifying/pressureAdjustmentNeeded-if_sara.wav')
    expect(trace).toContain('playback_ended:pressureAdjustmentNeeded-stint-0-lap-3')
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
      }))
      runtime.recordFinishCrossing(3)
      runtime.recordRecommendation(recommendation(3))
      runtime.reset()
    }
    expect(queued).toEqual([
      'pressureAdjustmentNeeded-stint-0-lap-3',
      'pressureAdjustmentNeeded-stint-1-lap-3',
    ])
  })
})
