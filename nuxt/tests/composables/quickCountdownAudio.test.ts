// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQualifyingVoice } from '~/composables/useQualifyingVoice'

describe('timer completion audio', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('primes and emits exactly three beeps independently of training mute; preserves training default', async () => {
    const start = vi.fn(); const resume = vi.fn().mockResolvedValue(undefined)
    const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })
    vi.stubGlobal('AudioContext', class {
      currentTime = 0; state = 'suspended'; destination = {}; resume = resume
      createOscillator() { return { frequency: param(), connect: vi.fn(), start, stop: vi.fn(), type: '' } }
      createGain() { return { gain: param(), connect: vi.fn() } }
    })
    const voice = useQualifyingVoice(p => p, () => 'alessandro' as any, () => false, () => 'test')
    await voice.primeStepAudio(); voice.playStepDoneSound(); expect(start).not.toHaveBeenCalled()
    await voice.primeStepAudio(true); voice.playStepDoneSound(1, true)
    expect(resume).toHaveBeenCalled(); expect(start).toHaveBeenCalledTimes(3)
    start.mockClear(); voice.soundEnabled.value = true; voice.playStepDoneSound()
    expect(start).toHaveBeenCalledTimes(9)
  })
})
