import type { VoiceCueSource, VoicePlaybackQueueEventKind } from '../audio/voicePlaybackQueue'

export const VOICE_RUNTIME_DIAGNOSTICS_KEY = 'acc.voice-runtime-diagnostics.v1'
export const VOICE_RUNTIME_DIAGNOSTICS_LIMIT = 128

export type VoiceRuntimeDiagnosticKind =
  | 'runtime_authorized'
  | 'runtime_denied'
  | 'recommendation_received'
  | 'finish_crossing_received'
  | 'cue_created'
  | VoicePlaybackQueueEventKind

export interface VoiceRuntimeDiagnosticInput {
  kind: VoiceRuntimeDiagnosticKind
  cueId?: string
  correlationId?: string
  scenarioId?: string
  source?: VoiceCueSource
  outcome?: string
  reason?: string
}

export interface VoiceRuntimeDiagnosticEvent extends VoiceRuntimeDiagnosticInput {
  schemaVersion: 1
  sequence: number
  occurredAt: string
}

interface VoiceRuntimeStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface VoiceRuntimeDiagnostics {
  record: (input: VoiceRuntimeDiagnosticInput) => VoiceRuntimeDiagnosticEvent
  list: () => VoiceRuntimeDiagnosticEvent[]
  clear: () => void
}

function safeToken(value: unknown, limit = 120): string | undefined {
  const normalized = String(value || '')
    .replace(/[^a-zA-Z0-9_.:-]/g, '_')
    .slice(0, limit)
  return normalized || undefined
}

function resolveDefaultStorage(): VoiceRuntimeStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function createVoiceRuntimeDiagnostics(options: {
  storage?: VoiceRuntimeStorage | null
  now?: () => Date
  maxEvents?: number
} = {}): VoiceRuntimeDiagnostics {
  const storage = options.storage === undefined
    ? resolveDefaultStorage()
    : options.storage
  const now = options.now ?? (() => new Date())
  const maxEvents = Math.max(16, options.maxEvents ?? VOICE_RUNTIME_DIAGNOSTICS_LIMIT)
  let memory: VoiceRuntimeDiagnosticEvent[] = []

  function read(): VoiceRuntimeDiagnosticEvent[] {
    if (!storage) return [...memory]
    try {
      const parsed = JSON.parse(storage.getItem(VOICE_RUNTIME_DIAGNOSTICS_KEY) || '[]')
      if (Array.isArray(parsed)) return parsed.slice(-maxEvents)
    } catch {
      // Diagnostica corrotta o storage indisponibile: degrada sulla memoria.
    }
    return [...memory]
  }

  function write(events: VoiceRuntimeDiagnosticEvent[]) {
    memory = events.slice(-maxEvents)
    try {
      storage?.setItem(VOICE_RUNTIME_DIAGNOSTICS_KEY, JSON.stringify(memory))
    } catch {
      // La diagnostica non deve mai bloccare la voce.
    }
  }

  function record(input: VoiceRuntimeDiagnosticInput): VoiceRuntimeDiagnosticEvent {
    const previous = read()
    const event: VoiceRuntimeDiagnosticEvent = {
      schemaVersion: 1,
      sequence: (previous.at(-1)?.sequence || 0) + 1,
      occurredAt: now().toISOString(),
      kind: input.kind,
      cueId: safeToken(input.cueId),
      correlationId: safeToken(input.correlationId),
      scenarioId: safeToken(input.scenarioId),
      source: input.source,
      outcome: safeToken(input.outcome),
      reason: safeToken(input.reason, 160),
    }
    write([...previous, event])
    return event
  }

  return {
    record,
    list: read,
    clear: () => write([]),
  }
}
