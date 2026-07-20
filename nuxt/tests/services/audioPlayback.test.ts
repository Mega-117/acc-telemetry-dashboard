import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUDIO_WATCHDOG_FALLBACK_S,
  AUDIO_WATCHDOG_MARGIN_S,
  playAudioWithWatchdog,
  type PlayableAudio,
} from '~/services/audio/audioPlayback'

class FakeAudio implements PlayableAudio {
  duration = Number.NaN
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  ondurationchange: (() => void) | null = null
  paused = false
  playRejects = false

  play(): Promise<void> {
    return this.playRejects ? Promise.reject(new Error('nope')) : Promise.resolve()
  }

  pause(): void {
    this.paused = true
  }

  setDuration(seconds: number) {
    this.duration = seconds
    this.ondurationchange?.()
  }
}

describe('playAudioWithWatchdog (PIP-254)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('risolve "ended" alla fine naturale della traccia', async () => {
    const el = new FakeAudio()
    const done = playAudioWithWatchdog(el)
    el.onended?.()
    await expect(done).resolves.toBe('ended')
    expect(el.paused).toBe(false)
  })

  it('risolve "error" su onerror', async () => {
    const el = new FakeAudio()
    const done = playAudioWithWatchdog(el)
    el.onerror?.()
    await expect(done).resolves.toBe('error')
  })

  it('risolve "error" se play() viene rifiutato', async () => {
    const el = new FakeAudio()
    el.playRejects = true
    await expect(playAudioWithWatchdog(el)).resolves.toBe('error')
  })

  it('senza durata nota scatta il fallback assoluto e mette in pausa', async () => {
    const warn = vi.fn()
    const el = new FakeAudio()
    const done = playAudioWithWatchdog(el, { label: 'x.wav', warn })
    await vi.advanceTimersByTimeAsync(AUDIO_WATCHDOG_FALLBACK_S * 1000 - 1)
    expect(warn).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    await expect(done).resolves.toBe('timeout')
    expect(el.paused).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('x.wav')
  })

  it('con durata nota il watchdog si tara su durata + margine', async () => {
    const el = new FakeAudio()
    const done = playAudioWithWatchdog(el, { warn: vi.fn() })
    el.setDuration(2)
    // a durata+margine - epsilon non e' ancora scattato
    await vi.advanceTimersByTimeAsync((2 + AUDIO_WATCHDOG_MARGIN_S) * 1000 - 5)
    let resolved = false
    void done.then(() => { resolved = true })
    await Promise.resolve()
    expect(resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(10)
    await expect(done).resolves.toBe('timeout')
  })

  it('una traccia che finisce prima del watchdog non produce warn dopo', async () => {
    const warn = vi.fn()
    const el = new FakeAudio()
    const done = playAudioWithWatchdog(el, { warn })
    el.setDuration(1)
    el.onended?.()
    await expect(done).resolves.toBe('ended')
    await vi.advanceTimersByTimeAsync((1 + AUDIO_WATCHDOG_MARGIN_S) * 1000 + 100)
    expect(warn).not.toHaveBeenCalled()
    expect(el.paused).toBe(false)
  })

  it('la coda a valle prosegue dopo un timeout (scenario bug 2026-07-08c)', async () => {
    const stuck = new FakeAudio()
    const next = new FakeAudio()
    const order: string[] = []
    let queue = Promise.resolve()
    queue = queue.then(() => playAudioWithWatchdog(stuck, { warn: vi.fn() }).then(() => { order.push('stuck') }))
    queue = queue.then(() => playAudioWithWatchdog(next, { warn: vi.fn() }).then(() => { order.push('next') }))
    await vi.advanceTimersByTimeAsync(AUDIO_WATCHDOG_FALLBACK_S * 1000 + 10)
    next.onended?.()
    await queue
    expect(order).toEqual(['stuck', 'next'])
  })
})
