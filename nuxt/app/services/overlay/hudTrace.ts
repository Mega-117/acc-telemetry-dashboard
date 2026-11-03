/**
 * PIP-704: HUD traces for the program's diary, so HUD behaviour can be checked from normal
 * driving (R2 packages) instead of dedicated test sessions. The HUD window only sends small,
 * already-summarised facts; the main process validates every field (runtime/hudTraceReport.js)
 * and rate-limits the window. Outside the desktop app there is no diary and nothing is sent.
 *
 * Events (one line each in the diary):
 * - `ctrlk.context`: Ctrl+K switches between Guida (compact) and Pausa (full) and why;
 * - `hud.shift`: every 10 upshifts, where the shift flash started and where the driver shifted;
 * - `hud.sector_state`: end-of-lap colours of the sectors HUD checked against the rules;
 * - `hud.value_episode`: a shown value that went blank for a moment while its data was there.
 */
export type HudTraceEvent = 'ctrlk.context' | 'hud.shift' | 'hud.shift_health' | 'hud.sector_state' | 'hud.value_episode'
export type HudTraceFields = Record<string, string | number | boolean | null | Array<string | number | null>>

type HudTraceApi = { reportHudTrace?: (event: HudTraceEvent, fields: HudTraceFields) => Promise<unknown> }

export function reportHudTrace(event: HudTraceEvent, fields: HudTraceFields): void {
  if (typeof window === 'undefined') return
  const report = (window as unknown as { electronAPI?: HudTraceApi }).electronAPI?.reportHudTrace
  if (typeof report !== 'function') return
  // Never on the render path: the diary waits for the next microtask and never throws here.
  void Promise.resolve().then(() => report(event, fields)).catch(() => {})
}
