import type { VoiceCue } from '../audio/voicePlaybackQueue'

/** Live completion from the local executor only; never feed recovered outcomes here. */
export function pitStrategyAppliedCue(event: unknown, voice: string): VoiceCue | null {
  if (!event || typeof event !== 'object') return null
  const value = event as { orderId?: unknown, operation?: unknown, outcome?: { method?: unknown, status?: unknown } }
  if (value.operation !== 'strategy' || value.outcome?.method !== 'mfd-v4' || value.outcome.status !== 'applied'
    || typeof value.orderId !== 'string' || !value.orderId.trim() || value.orderId.length > 96
    || !['if_sara', 'im_nicola'].includes(voice)) return null
  return {
    id: `pitStrategyApplied:${value.orderId}`,
    path: `/voice/qualifying/pitStrategyApplied-${voice}.wav`,
    source: 'pit-strategy',
    correlationId: value.orderId,
    scenarioId: 'pitStrategyApplied',
  }
}
