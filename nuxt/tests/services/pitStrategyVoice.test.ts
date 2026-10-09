import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pitStrategyAppliedCue } from '../../app/services/spotter/pitStrategyVoice'
import { createVoicePlaybackQueue } from '../../app/services/audio/voicePlaybackQueue'
import { voiceScript } from '../../app/config/voiceScript'

const event = { orderId: 'order-1', operation: 'strategy', outcome: { method: 'mfd-v4', status: 'applied' } }
describe('pit strategy completion voice', () => {
  it.each(['if_sara', 'im_nicola'])('ships playable %s WAV matching the catalog', voice => {
    const cue = pitStrategyAppliedCue(event, voice)!
    expect(cue.path).toBe(`/voice/qualifying/pitStrategyApplied-${voice}.wav`)
    const wav = readFileSync(resolve('public', cue.path.slice(1)))
    expect(wav.subarray(0, 4).toString()).toBe('RIFF')
    expect(wav.subarray(8, 12).toString()).toBe('WAVE')
    expect(wav.length).toBeGreaterThan(24000)
    expect(voiceScript.scenarios.find(s => s.id === cue.scenarioId)?.text).toBe('strategia pit stop applicata.')
  })
  it.each([null, {}, { ...event, operation: 'other' }, { ...event, outcome: { method: 'mfd-v4', status: 'partial' } },
    { ...event, outcome: { status: 'applied' } }, { ...event, orderId: '' }, { ...event, orderId: 'x'.repeat(97) }])('rejects incomplete or non-success event %j', value => {
    expect(pitStrategyAppliedCue(value, 'if_sara')).toBeNull()
  })
  it('does not guess an unsupported voice', () => expect(pitStrategyAppliedCue(event, 'unknown')).toBeNull())
  it.each(['if_sara', 'im_nicola'])('reuses %s for verified presets only', voice => {
    expect(pitStrategyAppliedCue({ ...event, operation: 'preset' }, voice)).toEqual(pitStrategyAppliedCue(event, voice))
    expect(pitStrategyAppliedCue({ ...event, operation: 'preset', outcome: { method: 'mfd-v4', status: 'partial' } }, voice)).toBeNull()
  })
  it('uses the shared queue to deduplicate a completion, even after a voice change', async () => {
    const play = vi.fn(async () => 'ended' as const)
    const queue = createVoicePlaybackQueue({ createAudio: () => ({} as any), play })
    expect(queue.enqueue(pitStrategyAppliedCue(event, 'if_sara')!)).toBe(true)
    expect(queue.enqueue(pitStrategyAppliedCue(event, 'im_nicola')!)).toBe(false)
    await queue.drain()
    expect(play).toHaveBeenCalledTimes(1)
  })
  it('subscribes only to live IPC and removes the listener at unmount', () => {
    const page = readFileSync(resolve('app/pages/spotter-audio-runtime.vue'), 'utf8')
    expect(page).toContain('onPitwallOrderOutcome?.')
    expect(page).toContain('removePitStrategyListener?.()')
    expect(page).not.toContain('pitwallPendingOutcomes')
  })
})
