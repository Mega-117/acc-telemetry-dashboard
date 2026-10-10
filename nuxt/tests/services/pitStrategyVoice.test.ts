import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pitStrategyAppliedCue, setupAutomationCompletedCue } from '../../app/services/spotter/pitStrategyVoice'
import { createSurfaceRegionBridge } from '../../app/services/overlay/surfaceRegionBridge'
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
    expect(voiceScript.scenarios.find(s => s.id === cue.scenarioId)?.text.trim()).toBeTruthy()
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

describe('Setup automation completion voice', () => {
  it.each(['pressures', 'fuel-session', 'fuel-minutes'])('ships both selected voices for %s', operation => {
    for (const voice of ['if_sara', 'im_nicola']) {
      const cue = setupAutomationCompletedCue({ requestId: 'run-1', operation, status: 'completed' }, voice)!
      const scenario = operation === 'pressures' ? 'setupPressuresCompleted' : 'setupFuelCompleted'
      expect(cue.scenarioId).toBe(scenario)
      expect(voiceScript.scenarios.find(s => s.id === scenario)?.text).toBe(operation === 'pressures' ? 'regolazioni pressioni completate.' : 'rifornimento completato.')
      const wav = readFileSync(resolve('public', cue.path.slice(1)))
      expect(wav.subarray(0, 4).toString()).toBe('RIFF')
      expect(wav.subarray(8, 12).toString()).toBe('WAVE')
      expect(wav.length).toBeGreaterThan(24000)
    }
  })
  it.each([null, {}, {requestId:'run',operation:'unknown',status:'completed'},
    {requestId:'run',operation:'pressures',status:'stopped'}, {requestId:'',operation:'pressures',status:'completed'},
    {requestId:'x'.repeat(97),operation:'pressures',status:'completed'}])('keeps invalid outcomes silent %j', event => {
    expect(setupAutomationCompletedCue(event, 'if_sara')).toBeNull()
  })
  it('rejects unsupported voices and deduplicates across voice changes', async () => {
    const event = {requestId:'run',operation:'fuel-minutes',status:'completed'}
    expect(setupAutomationCompletedCue(event, 'unknown')).toBeNull()
    const play = vi.fn(async () => 'ended' as const)
    const queue = createVoicePlaybackQueue({ createAudio: () => ({} as any), play })
    expect(queue.enqueue(setupAutomationCompletedCue(event, 'if_sara')!)).toBe(true)
    expect(queue.enqueue(setupAutomationCompletedCue(event, 'im_nicola')!)).toBe(false)
    await queue.drain()
    expect(play).toHaveBeenCalledTimes(1)
  })
  it('relays completion to its audio region only and unsubscribes', () => {
    let receive: (event:any)=>void = () => {}
    const off = vi.fn(), callback = vi.fn()
    const bridge = createSurfaceRegionBridge({ onOverlaySurfaceEvent: (fn:any) => { receive=fn; return off } }, 'audio')
    const remove = bridge.onSetupAutomationCompleted(callback)
    receive({id:'other',channel:'setup:automation-completed',payload:'wrong'})
    receive({id:'audio',channel:'setup:automation-completed',payload:'right'})
    expect(callback).toHaveBeenCalledExactlyOnceWith('right')
    remove()
    expect(off).toHaveBeenCalledOnce()
    const page = readFileSync(resolve('app/pages/spotter-audio-runtime.vue'), 'utf8')
    expect(page).toContain('onSetupAutomationCompleted?.')
    expect(page).toContain('removeSetupCompletionListener?.()')
  })
})
