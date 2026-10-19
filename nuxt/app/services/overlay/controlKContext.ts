// PIP-556: ACC Control K has one layout with two contexts.
// "pause": stopped in the pit box, in the pit lane, on the setup screen or on
// the grid before the start -> every command in a fixed grid.
// "drive": everything else, including a car stopped on track -> compact row.

export type ControlKContext = 'pause' | 'drive'

export interface ControlKContextInput {
  /** Fresh live telemetry; without it the driver is in the menus, not driving. */
  isLive: boolean
  speedKmh: number | null
  isInPitBox?: boolean
  isInPitLane: boolean
  isSetupMenuVisible?: boolean
  isEngineRunning: boolean
  sessionType: number | null
  lapsCompleted: number | null
}

/** ACC graphics.session: 2 = race. */
const ACC_RACE_SESSION = 2
/** Stopped means at most 0,5 km/h, the same threshold as Setup entry. */
export const CONTROL_K_STOPPED_KMH = 0.5
/** Once in pause, small creeping (pushing in the box) does not flip the layout. */
export const CONTROL_K_LEAVE_PAUSE_KMH = 3

/**
 * The grid has no dedicated flag in ACC shared memory: a race not started yet
 * (no lap completed) with the engine off is the grid with the ESC menu open.
 */
function onGridBeforeStart(input: ControlKContextInput): boolean {
  return input.sessionType === ACC_RACE_SESSION && (input.lapsCompleted ?? 0) === 0 && !input.isEngineRunning
}

function inPauseLocation(input: ControlKContextInput): boolean {
  return input.isInPitBox === true || input.isInPitLane || input.isSetupMenuVisible === true || onGridBeforeStart(input)
}

export function resolveControlKContext(input: ControlKContextInput, previous: ControlKContext | null = null): ControlKContext {
  if (!input.isLive) return 'pause'
  if (input.speedKmh === null || !Number.isFinite(input.speedKmh)) return previous ?? 'drive'
  const speed = Math.abs(input.speedKmh)
  const threshold = previous === 'pause' ? CONTROL_K_LEAVE_PAUSE_KMH : CONTROL_K_STOPPED_KMH
  return speed <= threshold && inPauseLocation(input) ? 'pause' : 'drive'
}
