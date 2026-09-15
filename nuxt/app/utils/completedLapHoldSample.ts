import type { FastOverlayState } from '~/composables/useFastStatePoller'
import type { CompletedLapHoldSample } from './completedLapHold'

function contextKey(state: FastOverlayState): string | null {
  const context = state.context
  if (!context) return null
  return JSON.stringify([
    context.track,
    context.car,
    context.sessionType,
    context.sessionIndex,
    context.sessionUid,
    context.serverId,
  ])
}

export function completedLapHoldSample(state: FastOverlayState): CompletedLapHoldSample {
  const info = state.info
  return {
    ready: state.isFresh && info !== null,
    contextKey: contextKey(state),
    lapsCompleted: info?.lapsCompleted ?? 0,
    lastLapTimeMs: info?.lastLapTimeMs ?? null,
    lastLapValid: info?.lastLapValid ?? null,
  }
}
