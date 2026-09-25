// PIP-437: mentre l'auto e' in pista la sync cloud aspetta. Il logger ha gia' salvato
// tutto in locale: caricare a ogni giro non serve al pilota e moltiplica le operazioni
// Firebase.
// PIP-443: si carica una volta sola per stint/sessione. Una sosta breve ai box (pit
// stop di gara, rientro per cambiare setup) non rilascia: il ciclo parte solo quando la
// sessione finisce (menu, uscita dal server, ACC chiuso, telemetria ferma) o quando la
// sosta dura almeno PIT_STOP_RELEASE_MS senza tornare in pista.
import type { TelemetryFileDescriptor } from './syncScanService'

export const DRIVING_HOLD_POLL_MS = 5_000
/** Oltre questa eta' il live_state non descrive piu' una guida in corso. */
export const LIVE_STATE_STALE_MS = 15_000
/** Sosta continua ai box/garage oltre la quale i file trattenuti vengono caricati. */
export const PIT_STOP_RELEASE_MS = 3 * 60_000

export type SyncReleaseReason = 'session-end' | 'telemetry-stale' | 'pit-timeout' | 'live-unreadable'

/** Memoria del reducer fra un controllo e l'altro: solo l'inizio della sosta corrente. */
export interface DrivingHoldState {
  /** Istante (ms) in cui la sosta ai box e' stata vista per la prima volta; null se non in sosta. */
  stoppedSinceMs: number | null
}

export const INITIAL_DRIVING_HOLD_STATE: Readonly<DrivingHoldState> = Object.freeze({ stoppedSinceMs: null })

export type DrivingHoldDecision =
  | { action: 'hold', state: DrivingHoldState }
  | { action: 'release', reason: SyncReleaseReason, state: DrivingHoldState }

/** Lettura del gate live: cosa sta facendo l'auto secondo l'ultimo live_state. */
export type LiveGateStatus = 'unreadable' | 'not-live' | 'stale' | 'stopped' | 'on-track'

interface LiveGate {
  live?: unknown
  paused?: unknown
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

/**
 * Classifica il live_state grezzo (testo JSON dal bridge Electron o oggetto).
 * `unreadable` = nessun dato o non interpretabile; `not-live` = sessione non in corso
 * (menu, replay, ACC chiuso); `stale` = nessun dato fresco entro LIVE_STATE_STALE_MS;
 * `stopped` = pausa / pit lane / box / garage; `on-track` = in pista.
 */
export function classifyLiveState(rawLiveState: unknown, nowMs: number): LiveGateStatus {
  let liveState = rawLiveState
  if (typeof liveState === 'string') {
    try { liveState = JSON.parse(liveState) } catch { return 'unreadable' }
  }
  if (!liveState || typeof liveState !== 'object') return 'unreadable'
  const state = liveState as { ts?: unknown, dryPressureLiveGate?: LiveGate }
  const gate = state.dryPressureLiveGate
  if (!gate || typeof gate !== 'object' || (gate.live !== true && gate.paused !== true)) return 'not-live'
  const freshAt = parseLoggerTimestamp(gate.freshAt ?? state.ts)
  if (freshAt === null || nowMs - freshAt > LIVE_STATE_STALE_MS) return 'stale'
  if (gate.paused === true || gate.inPit === true || gate.inPitLane === true || gate.stationaryGarage === true) return 'stopped'
  return 'on-track'
}

/** Auto in pista = sessione in corso (non pausa/replay), fuori dalla pit lane, telemetria fresca. */
export function isCarOnTrack(rawLiveState: unknown, nowMs: number): boolean {
  return classifyLiveState(rawLiveState, nowMs) === 'on-track'
}

/**
 * Reducer puro della trattenuta: dato lo stato precedente e il live_state di adesso
 * decide se continuare a trattenere o rilasciare, e restituisce lo stato successivo.
 * Il timer della sosta si azzera appena l'auto torna in pista e dopo ogni rilascio.
 */
export function decideDrivingHold(
  previous: Readonly<DrivingHoldState>,
  rawLiveState: unknown,
  nowMs: number
): DrivingHoldDecision {
  const status = classifyLiveState(rawLiveState, nowMs)
  const reset = { stoppedSinceMs: null }
  switch (status) {
    case 'on-track':
      return { action: 'hold', state: reset }
    case 'stopped': {
      const stoppedSinceMs = previous.stoppedSinceMs ?? nowMs
      if (nowMs - stoppedSinceMs >= PIT_STOP_RELEASE_MS) return { action: 'release', reason: 'pit-timeout', state: reset }
      return { action: 'hold', state: { stoppedSinceMs } }
    }
    case 'not-live':
      return { action: 'release', reason: 'session-end', state: reset }
    case 'stale':
      return { action: 'release', reason: 'telemetry-stale', state: reset }
    case 'unreadable':
    default:
      return { action: 'release', reason: 'live-unreadable', state: reset }
  }
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
