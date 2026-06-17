import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQualifyingVoice } from '~/composables/useQualifyingVoice'

async function flushAudioQueue() {
  for (let i = 0; i < 8; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

function installAudioMock(options: { failFullLapAudio?: boolean } = {}) {
  const played: string[] = []

  class MockAudio {
    src: string
    currentTime = 0
    onended: (() => void) | null = null
    onerror: (() => void) | null = null

    constructor(src: string) {
      this.src = src
      played.push(src)
    }

    play() {
      setTimeout(() => {
        if (options.failFullLapAudio && this.src.includes('/lap-time-')) {
          this.onerror?.()
          return
        }
        this.onended?.()
      }, 0)
      return Promise.resolve()
    }

    pause() {}
    load() {}
  }

  vi.stubGlobal('window', {})
  vi.stubGlobal('Audio', MockAudio)
  return played
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useQualifyingVoice lap time announcements (PIP-155)', () => {
  it('usa il WAV intero pre-generato quando il tempo e valido e nel range', async () => {
    const played = installAudioMock()
    const voice = useQualifyingVoice(path => path, () => 'if_sara', () => true, () => 'qualifying')

    voice.announceLap(1, 90_999, true)
    await flushAudioQueue()

    expect(played).toEqual(['/voice/qualifying/lap-time-0909-if_sara.wav'])
  })

  it('resta silenzioso quando il WAV intero manca', async () => {
    const played = installAudioMock({ failFullLapAudio: true })
    const voice = useQualifyingVoice(path => path, () => 'im_nicola', () => true, () => 'qualifying')

    voice.announceLap(1, 90_999, true)
    await flushAudioQueue()

    expect(played).toEqual(['/voice/qualifying/lap-time-0909-im_nicola.wav'])
  })

  it('resta silenzioso se il giro non e valido', async () => {
    const played = installAudioMock()
    const voice = useQualifyingVoice(path => path, () => 'if_sara', () => true, () => 'qualifying')

    voice.announceLap(1, 90_320, false)
    await flushAudioQueue()

    expect(played).toEqual([])
  })

  it('resta silenzioso se il tempo e fuori range pre-generato', async () => {
    const played = installAudioMock()
    const voice = useQualifyingVoice(path => path, () => 'if_sara', () => true, () => 'qualifying')

    voice.announceLap(1, 151_000, true)
    await flushAudioQueue()

    expect(played).toEqual([])
  })
})
