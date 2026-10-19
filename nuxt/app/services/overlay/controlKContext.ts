// PIP-556: ACC Control K has one layout with two contexts, following where the
// driver is, not where the car is.
// "drive": in the cockpit (even stopped in the box with the engine off) -> compact row.
// "pause": in a menu (ESC pause, setup screen, menus without live data) -> full grid.

export type ControlKContext = 'pause' | 'drive'

export interface ControlKContextInput {
  /** Fresh live telemetry; without it ACC is paused offline or in the menus. */
  isLive: boolean
  speedKmh: number | null
  isSetupMenuVisible?: boolean
  isEngineRunning: boolean
  /** Force feedback signal: ACC zeroes it in the ESC menu, also online (PIP-177). */
  finalFf?: number | null
  /** Common live `hud_driving` (logger cockpit heuristic), used when force feedback is unknown. */
  hudDriving?: boolean | null
}

/** Same force threshold as `logger_core/simulators/acc_hud.py`. */
export const CONTROL_K_FORCE_ACTIVE = 1e-4
/** Moving faster than this is always the cockpit. */
export const CONTROL_K_MOVING_KMH = 3

export function inCockpit(input: ControlKContextInput): boolean | null {
  if (!input.isLive || input.isSetupMenuVisible === true) return false
  if (input.speedKmh !== null && Number.isFinite(input.speedKmh) && Math.abs(input.speedKmh) > CONTROL_K_MOVING_KMH) return true
  if (input.isEngineRunning) return true
  if (typeof input.finalFf === 'number' && Number.isFinite(input.finalFf)) return Math.abs(input.finalFf) > CONTROL_K_FORCE_ACTIVE
  return input.hudDriving ?? null
}

/** Unknown evidence keeps the previous context, so the panel never flickers on a gap. */
export function resolveControlKContext(input: ControlKContextInput, previous: ControlKContext | null = null): ControlKContext {
  const cockpit = inCockpit(input)
  if (cockpit === null) return previous ?? 'pause'
  return cockpit ? 'drive' : 'pause'
}
