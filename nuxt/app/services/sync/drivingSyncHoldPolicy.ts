// PIP-437: mentre l'auto e' in pista la sync cloud aspetta. Il logger ha gia' salvato
// tutto in locale: caricare a ogni giro non serve al pilota e moltiplica le operazioni
// Firebase. Si carica una volta sola quando l'auto e' ai box/garage, il gioco e' in
// pausa/menu o la telemetria si ferma (uscita dal server, ACC chiuso).
import type { TelemetryFileDescriptor } from './syncScanService'

export const DRIVING_HOLD_POLL_MS = 5_000
/** Oltre questa eta' il live_state non descrive piu' una guida in corso. */
export const LIVE_STATE_STALE_MS = 15_000

interface LiveGate {
  live?: unknown
  inPit?: unknown
  inPitLane?: unknown
  stationaryGarage?: unknown
  freshAt?: unknown
}

/** Il logger scrive ora locale senza fuso e con microsecondi: millisecondi, ora locale. */
function parseLoggerTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/(\.\d{3})\d+$/, '$1')
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** Auto in pista = sessione in corso (non pausa/replay), fuori dalla pit lane, telemetria fresca. */
export function isCarOnTrack(rawLiveState: unknown, nowMs: number): boolean {
  // Il bridge Electron restituisce il contenuto del file come testo JSON.
  let liveState = rawLiveState
  if (typeof liveState === 'string') {
    try { liveState = JSON.parse(liveState) } catch { return false }
  }
  if (!liveState || typeof liveState !== 'object') return false
  const state = liveState as { ts?: unknown, dryPressureLiveGate?: LiveGate }
  const gate = state.dryPressureLiveGate
  if (!gate || gate.live !== true) return false
  if (gate.inPit === true || gate.inPitLane === true || gate.stationaryGarage === true) return false
  const freshAt = parseLoggerTimestamp(gate.freshAt ?? state.ts)
  return freshAt !== null && nowMs - freshAt <= LIVE_STATE_STALE_MS
}

/** Un solo descrittore per file (l'ultimo): lo stesso file cambia a ogni giro. */
export function mergeHeldFiles(
  held: TelemetryFileDescriptor[],
  incoming: TelemetryFileDescriptor[]
): TelemetryFileDescriptor[] {
  const byName = new Map<string, TelemetryFileDescriptor>()
  for (const file of [...held, ...incoming]) {
    const name = String(file?.name || '')
    if (!name) continue
    byName.delete(name)
    byName.set(name, file)
  }
  return Array.from(byName.values())
}
