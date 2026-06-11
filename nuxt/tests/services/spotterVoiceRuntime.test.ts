import { describe, expect, it, vi } from 'vitest'
import { speakSpotterText } from '~/services/spotter/spotterVoiceRuntime'

describe('spotterVoiceRuntime', () => {
  it('usa Kokoro quando fetch risponde OK', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['audio']),
    } as Response))

    const engine = await speakSpotterText('Davanti, guadagni due decimi.', { fetchImpl })

    expect(engine).toBe('kokoro')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('fa fallback a Web Speech se Kokoro fallisce', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline')
    })
    const speak = vi.fn()
    const cancel = vi.fn()
    class MockUtterance {
      text: string
      lang = ''
      rate = 1
      constructor(text: string) {
        this.text = text
      }
    }

    const engine = await speakSpotterText('Gap stabile davanti.', {
      fetchImpl,
      speechSynthesis: { speak, cancel } as any,
      utteranceCtor: MockUtterance as any,
    })

    expect(engine).toBe('web-speech')
    expect(cancel).toHaveBeenCalledOnce()
    expect(speak).toHaveBeenCalledOnce()
  })

  it('non parla testo vuoto', async () => {
    await expect(speakSpotterText('   ')).resolves.toBe('none')
  })
})
