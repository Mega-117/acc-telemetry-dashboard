// PIP-556: Control K shows one status line of fixed height. Every source
// proposes at most one message; the most important one wins, the rest waits
// (errors stay readable in Notifiche). Same priority on screen and in tests.

export type ControlKStatusTone = 'error' | 'progress' | 'ok' | 'hint'

export interface ControlKStatusMessage {
  tone: ControlKStatusTone
  text: string
}

const PRIORITY: Record<ControlKStatusTone, number> = { error: 0, progress: 1, ok: 2, hint: 3 }

export function pickControlKStatus(candidates: Array<ControlKStatusMessage | null | undefined | false>): ControlKStatusMessage | null {
  let best: ControlKStatusMessage | null = null
  for (const candidate of candidates) {
    if (!candidate || !candidate.text?.trim()) continue
    if (!best || PRIORITY[candidate.tone] < PRIORITY[best.tone]) best = candidate
  }
  return best
}

// ─── Notifications ──────────────────────────────────────────────────────────

/** In pause a new error may open Notifiche by itself, at most once in this window. */
export const CONTROL_K_AUTO_OPEN_INTERVAL_MS = 30_000

export interface ControlKAutoOpenInput {
  /** Number of errors now visible in Notifiche and before this change. */
  errors: number
  previousErrors: number
  context: 'pause' | 'drive'
  /** Another view (editor, timer, voice alerts) is open: never steal it. */
  otherViewOpen: boolean
  lastAutoOpenAt: number | null
  now: number
}

/**
 * Driving never opens Notifiche (only the bell badge changes); in pause a new
 * error opens it unless the driver is busy in another view or it already
 * opened by itself within the last 30 s (no bombardment).
 */
export function shouldAutoOpenNotifications(input: ControlKAutoOpenInput): boolean {
  if (input.errors <= input.previousErrors) return false
  if (input.context !== 'pause' || input.otherViewOpen) return false
  return input.lastAutoOpenAt === null || input.now - input.lastAutoOpenAt >= CONTROL_K_AUTO_OPEN_INTERVAL_MS
}
