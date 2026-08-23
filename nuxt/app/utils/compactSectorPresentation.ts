import type { FastOverlayState } from '~/composables/useFastStatePoller'

export interface CompactLapPair {
  timeMs: number | null
  valid: boolean | null
}

export interface CompactHeldLap {
  timeMs: number
  valid: boolean
  startedAtMs: number
}

export interface CompactSectorPresentation {
  displayLap: CompactLapPair
  heldLap: CompactHeldLap | null
}

export function resolveLocalCompactPresentation(
  state: FastOverlayState,
): CompactSectorPresentation {
  const hud = state.sectorHud
  if (!hud) {
    return {
      displayLap: {
        timeMs: state.info?.currentLapTimeMs ?? null,
        valid: state.info?.lapValid ?? null,
      },
      heldLap: null,
    }
  }

  const holding = hud.mode === 'last_lap'
  const timeMs = holding ? hud.lastLapTimeMs : hud.currentLapTimeMs
  const displayLap = { timeMs, valid: hud.lapValid }
  if (!holding || timeMs === null || typeof hud.lapValid !== 'boolean') {
    return { displayLap, heldLap: null }
  }

  const stableHoldToken = hud.holdUntilTs ?? hud.lap ?? timeMs
  return {
    displayLap,
    heldLap: {
      timeMs,
      valid: hud.lapValid,
      startedAtMs: stableHoldToken * 1000,
    },
  }
}
