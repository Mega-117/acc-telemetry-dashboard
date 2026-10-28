// Dashboard: the electronics value the driver is changing right now.
//
// ACC Drive shows a pop-up over the gear for 1.5 s whenever TC, TC2, MAP, ABS or BB changes
// (DashboardInfoBoxitem). Racer Core (owner 28/10) highlights the box itself instead: thicker frame
// and filled label for the same 1.5 s. Pure state machine; the composable feeds it and the clock.

export const DASHBOARD_ADJUSTMENT_HOLD_MS = 1500

export type DashboardAdjustableKey = 'tc' | 'tc2' | 'abs' | 'map' | 'bb'

export const DASHBOARD_ADJUSTABLE_KEYS: readonly DashboardAdjustableKey[] = ['tc', 'tc2', 'abs', 'map', 'bb']

export type DashboardAdjustableValues = Readonly<Record<DashboardAdjustableKey, string>>

export interface DashboardAdjustmentMemory {
  previous: DashboardAdjustableValues | null
  key: DashboardAdjustableKey | null
  changedAtMs: number
}

export const EMPTY_DASHBOARD_ADJUSTMENT: DashboardAdjustmentMemory = Object.freeze({
  previous: null,
  key: null,
  changedAtMs: 0,
})

// '-' and '--.-' are the "no data" placeholders: data appearing or vanishing is not an adjustment.
function isPlaceholder(value: string): boolean {
  return !/\d/.test(value)
}

/**
 * Advances the memory with one sample. `enabled` is false for the spectator view and for stale or
 * not-live telemetry: the memory resets, so the first live sample never lights a box. Several
 * values changing in the same sample (car or preset change) light nothing.
 */
export function trackDashboardAdjustment(
  memory: DashboardAdjustmentMemory,
  values: DashboardAdjustableValues,
  enabled: boolean,
  nowMs: number,
): DashboardAdjustmentMemory {
  if (!enabled) return EMPTY_DASHBOARD_ADJUSTMENT
  const previous = memory.previous
  if (previous === null) return { previous: values, key: null, changedAtMs: 0 }
  const changed = DASHBOARD_ADJUSTABLE_KEYS.filter(key => previous[key] !== values[key])
  if (changed.length === 0) return memory
  const key = changed[0] as DashboardAdjustableKey
  const real = changed.length === 1 && !isPlaceholder(previous[key]) && !isPlaceholder(values[key])
  return real
    ? { previous: values, key, changedAtMs: nowMs }
    : { previous: values, key: memory.key, changedAtMs: memory.changedAtMs }
}

/** The highlighted box, or null once the hold time has passed. */
export function activeDashboardAdjustment(
  memory: DashboardAdjustmentMemory,
  nowMs: number,
  holdMs = DASHBOARD_ADJUSTMENT_HOLD_MS,
): DashboardAdjustableKey | null {
  if (memory.key === null) return null
  return nowMs - memory.changedAtMs < holdMs ? memory.key : null
}
