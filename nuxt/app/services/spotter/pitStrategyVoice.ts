import type { VoiceCue } from '../audio/voicePlaybackQueue'

/** Live completion from the local executor only; never feed recovered outcomes here. */
export function pitStrategyAppliedCue(event: unknown, voice: string): VoiceCue | null {
  if (!event || typeof event !== 'object') return null
  const value = event as { orderId?: unknown, operation?: unknown, outcome?: { method?: unknown, status?: unknown } }
  if (!['strategy', 'preset'].includes(String(value.operation)) || value.outcome?.method !== 'mfd-v4' || value.outcome.status !== 'applied'
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

/** Live Setup completion only. Both fuel modes share the same Voice Lab phrase. */
export function setupAutomationCompletedCue(event: unknown, voice: string): VoiceCue | null {
  if (!event || typeof event !== 'object' || !['if_sara', 'im_nicola'].includes(voice)) return null
  const value = event as { requestId?: unknown, operation?: unknown, status?: unknown }
  if (value.status !== 'completed' || typeof value.requestId !== 'string' || !value.requestId.trim() || value.requestId.length > 96) return null
  const scenarioId = value.operation === 'pressures' ? 'setupPressuresCompleted'
    : ['fuel-session', 'fuel-minutes'].includes(String(value.operation)) ? 'setupFuelCompleted' : null
  if (!scenarioId) return null
  return { id: `setup:${value.requestId}`, path: `/voice/qualifying/${scenarioId}-${voice}.wav`,
    source: 'setup-automation', correlationId: value.requestId, scenarioId }
}
