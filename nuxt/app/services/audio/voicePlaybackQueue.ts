import {
  playAudioWithWatchdog,
  type AudioPlaybackOutcome,
  type PlayableAudio,
} from './audioPlayback'

export type VoiceCueSource = 'lap-time' | 'pressure-warning' | 'track-reference' | 'coach'
export type VoiceCuePathRole = 'primary' | 'fallback'

export interface VoiceCue {
  id: string
  path: string
  source: VoiceCueSource
  correlationId?: string
  scenarioId?: string
  fallbackPath?: string
}

export type VoicePlaybackQueueEventKind =
  | 'queued'
  | 'playback_started'
  | 'playback_ended'
  | 'playback_error'
  | 'playback_timeout'
  | 'skipped'
  | 'cancelled'

export interface VoicePlaybackQueueEvent {
  kind: VoicePlaybackQueueEventKind
  cue: VoiceCue
  pathRole: VoiceCuePathRole
  reason?: string
}

export interface VoicePlaybackQueue {
  enqueue: (cue: VoiceCue) => boolean
  cancelAll: (reason?: string) => void
  drain: () => Promise<void>
}

interface StoppableAudio extends PlayableAudio {
  currentTime?: number
}

export interface VoicePlaybackQueueOptions {
  createAudio: (path: string) => StoppableAudio
  play?: (audio: PlayableAudio, label: string) => Promise<AudioPlaybackOutcome>
  onEvent?: (event: VoicePlaybackQueueEvent) => void
  maxRememberedCueIds?: number
}

function normalizeCue(cue: VoiceCue): VoiceCue | null {
  const id = String(cue?.id || '').trim().slice(0, 120)
  const path = String(cue?.path || '').trim()
  if (!id || !path) return null
  return {
    id,
    path,
    source: cue.source,
    correlationId: cue.correlationId ? String(cue.correlationId).slice(0, 120) : undefined,
    scenarioId: cue.scenarioId ? String(cue.scenarioId).slice(0, 120) : undefined,
    fallbackPath: cue.fallbackPath ? String(cue.fallbackPath).trim() : undefined,
  }
}

export function createVoicePlaybackQueue(options: VoicePlaybackQueueOptions): VoicePlaybackQueue {
  const play = options.play ?? ((audio, label) => playAudioWithWatchdog(audio, { label }))
  const publish = options.onEvent ?? (() => {})
  const maxRememberedCueIds = Math.max(16, options.maxRememberedCueIds ?? 256)
  const rememberedCueIds = new Set<string>()
  let tail = Promise.resolve()
  let generation = 0
  let currentAudio: StoppableAudio | null = null
  let currentCue: VoiceCue | null = null

  function remember(cueId: string) {
    rememberedCueIds.add(cueId)
    while (rememberedCueIds.size > maxRememberedCueIds) {
      const oldest = rememberedCueIds.values().next().value
      if (typeof oldest !== 'string') break
      rememberedCueIds.delete(oldest)
    }
  }

  function emit(
    kind: VoicePlaybackQueueEventKind,
    cue: VoiceCue,
    pathRole: VoiceCuePathRole = 'primary',
    reason?: string,
  ) {
    publish({ kind, cue, pathRole, reason })
  }

  async function playPath(
    cue: VoiceCue,
    path: string,
    pathRole: VoiceCuePathRole,
    queuedGeneration: number,
  ): Promise<AudioPlaybackOutcome | 'cancelled'> {
    if (queuedGeneration !== generation) {
      emit('cancelled', cue, pathRole, 'generation_changed')
      return 'cancelled'
    }
    let audio: StoppableAudio
    try {
      audio = options.createAudio(path)
    } catch {
      emit('playback_error', cue, pathRole, 'audio_factory_failed')
      return 'error'
    }
    currentAudio = audio
    currentCue = cue
    emit('playback_started', cue, pathRole)
    const outcome = await play(audio, path).catch(() => 'error' as const)
    if (currentAudio === audio) currentAudio = null
    if (currentCue?.id === cue.id) currentCue = null
    if (queuedGeneration !== generation) {
      emit('cancelled', cue, pathRole, 'generation_changed')
      return 'cancelled'
    }
    emit(`playback_${outcome}` as VoicePlaybackQueueEventKind, cue, pathRole)
    return outcome
  }

  function enqueue(input: VoiceCue): boolean {
    const cue = normalizeCue(input)
    if (!cue) return false
    if (rememberedCueIds.has(cue.id)) {
      emit('skipped', cue, 'primary', 'duplicate_cue')
      return false
    }
    remember(cue.id)
    const queuedGeneration = generation
    emit('queued', cue)
    tail = tail.then(async () => {
      const outcome = await playPath(cue, cue.path, 'primary', queuedGeneration)
      if (
        outcome === 'error'
        && cue.fallbackPath
        && cue.fallbackPath !== cue.path
      ) {
        await playPath(cue, cue.fallbackPath, 'fallback', queuedGeneration)
      }
    }).catch(() => {
      emit('playback_error', cue, 'primary', 'queue_task_failed')
    })
    return true
  }

  function cancelAll(reason = 'runtime_stopped') {
    generation += 1
    if (currentAudio) {
      try {
        currentAudio.pause()
        if (typeof currentAudio.currentTime === 'number') currentAudio.currentTime = 0
      } catch {
        // Best effort: il cambio generazione impedisce comunque nuovi avvii.
      }
    }
    if (currentCue) emit('cancelled', currentCue, 'primary', reason)
    currentAudio = null
    currentCue = null
    tail = Promise.resolve()
  }

  return {
    enqueue,
    cancelAll,
    drain: () => tail,
  }
}
