import { describe, expect, it, vi } from 'vitest'
import {
  createVoicePlaybackQueue,
  type VoicePlaybackQueueEvent,
} from '~/services/audio/voicePlaybackQueue'
import type { AudioPlaybackOutcome, PlayableAudio } from '~/services/audio/audioPlayback'

function fakeAudio(): PlayableAudio {
  return {
    duration: 1,
    play: () => Promise.resolve(),
    pause: vi.fn(),
    onended: null,
    onerror: null,
    ondurationchange: null,
  }
}

describe('VoicePlaybackQueue', () => {
  it('riproduce in FIFO e pubblica un outcome terminale per cue', async () => {
    const events: VoicePlaybackQueueEvent[] = []
    const started: string[] = []
    const resolvers: Array<(outcome: AudioPlaybackOutcome) => void> = []
    const queue = createVoicePlaybackQueue({
      createAudio: fakeAudio,
      play: (_audio, label) => new Promise(resolve => {
        started.push(label)
        resolvers.push(resolve)
      }),
      onEvent: event => events.push(event),
    })

    expect(queue.enqueue({ id: 'lap-3', path: '/lap.wav', source: 'lap-time' })).toBe(true)
    expect(queue.enqueue({ id: 'pressure-3', path: '/pressure.wav', source: 'pressure-warning' })).toBe(true)
    await Promise.resolve()
    expect(started).toEqual(['/lap.wav'])
    resolvers[0]?.('ended')
    await vi.waitFor(() => {
      expect(started).toEqual(['/lap.wav', '/pressure.wav'])
    })
    resolvers[1]?.('ended')
    await queue.drain()

    expect(events.map(event => `${event.kind}:${event.cue.id}`)).toEqual([
      'queued:lap-3',
      'queued:pressure-3',
      'playback_started:lap-3',
      'playback_ended:lap-3',
      'playback_started:pressure-3',
      'playback_ended:pressure-3',
    ])
  })

  it('deduplica per cue id e conserva il fallback coach su errore', async () => {
    const events: VoicePlaybackQueueEvent[] = []
    const paths: string[] = []
    const queue = createVoicePlaybackQueue({
      createAudio: fakeAudio,
      play: async (_audio, path) => {
        paths.push(path)
        return path === '/coach.wav' ? 'error' : 'ended'
      },
      onEvent: event => events.push(event),
    })
    const cue = {
      id: 'coach-1',
      path: '/coach.wav',
      fallbackPath: '/reference.wav',
      source: 'coach' as const,
    }
    expect(queue.enqueue(cue)).toBe(true)
    expect(queue.enqueue(cue)).toBe(false)
    await queue.drain()

    expect(paths).toEqual(['/coach.wav', '/reference.wav'])
    expect(events).toContainEqual(expect.objectContaining({
      kind: 'skipped',
      reason: 'duplicate_cue',
    }))
    expect(events).toContainEqual(expect.objectContaining({
      kind: 'playback_ended',
      pathRole: 'fallback',
    }))
  })

  it('un errore della factory non spezza le cue successive', async () => {
    const terminal: string[] = []
    const queue = createVoicePlaybackQueue({
      createAudio: path => {
        if (path === '/broken.wav') throw new Error('broken')
        return fakeAudio()
      },
      play: async () => 'ended',
      onEvent: event => {
        if (event.kind === 'playback_error' || event.kind === 'playback_ended') {
          terminal.push(`${event.cue.id}:${event.kind}`)
        }
      },
    })
    queue.enqueue({ id: 'broken', path: '/broken.wav', source: 'lap-time' })
    queue.enqueue({ id: 'next', path: '/next.wav', source: 'pressure-warning' })
    await queue.drain()
    expect(terminal).toEqual(['broken:playback_error', 'next:playback_ended'])
  })
})
