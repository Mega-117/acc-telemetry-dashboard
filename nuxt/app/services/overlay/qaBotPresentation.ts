export type QaBotState = 'OFF' | 'CHECKING' | 'ACTIVE' | 'STOPPING' | 'BLOCKED' | 'FAULT'

export interface QaBotSnapshot {
  state: QaBotState
  reason: string
  runId: string | null
  pid: number | null
  dryRun: boolean
  driverState: string | null
  lapsCompleted: number
  lapsValid: number
  speedKmh: number | null
  automaticGearbox: boolean
}

const STATES = new Set<QaBotState>(['OFF', 'CHECKING', 'ACTIVE', 'STOPPING', 'BLOCKED', 'FAULT'])

const REASONS: Record<string, string> = {
  bot_off: 'Spento.',
  checking_preconditions: 'Verifica ACC, sessione, auto, pista e riferimento…',
  bot_active: 'Controllo attivo. Cambio gestito da ACC.',
  user_stop: 'Arrestato e comandi neutralizzati.',
  app_quit: 'Arrestato con ACC Suite.',
  bot_already_running: 'Il bot è già in esecuzione.',
  bot_state_stale: 'Stato del bot non aggiornato: arresto di sicurezza.',
  startup_timeout: 'Avvio non confermato entro il tempo di sicurezza.',
  qa_bot_runtime_missing: 'Runtime bot non disponibile in questa build.',
  qa_bot_python_missing: 'Runtime Python del bot non disponibile.',
  qa_bot_python_dependencies_missing: 'Dipendenze Python del bot non disponibili.',
  gamepad_virtuale_non_disponibile: 'Controller Xbox virtuale non disponibile.',
  acc_shared_memory_non_disponibile: 'ACC o shared memory non disponibili.',
  sessione_non_supportata: 'Apri Practice o Hotlap single-player.',
  sessione_non_vuota: 'La prima versione richiede una sessione con una sola vettura.',
  condizioni_non_asciutte: 'La prima versione richiede pista asciutta.',
  danni_non_disabilitati: 'Disabilita i danni prima di attivare il bot.',
  consumi_non_disabilitati: 'Disabilita consumo carburante e gomme.',
  fuori_corridoio_sicurezza: 'Fuori dal corridoio sicuro: input neutralizzati.',
  orientamento_fuori_sicurezza: 'Direzione non sicura: input neutralizzati.',
  shared_memory_congelata: 'Telemetria ACC congelata: input neutralizzati.',
  macchina_bloccata: 'Vettura ferma troppo a lungo: input neutralizzati.',
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeQaBotSnapshot(value: unknown): QaBotSnapshot {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const state = STATES.has(input.state as QaBotState) ? input.state as QaBotState : 'BLOCKED'
  return {
    state,
    reason: typeof input.reason === 'string' && input.reason ? input.reason : 'qa_bot_state_unavailable',
    runId: typeof input.runId === 'string' ? input.runId : null,
    pid: finiteNumber(input.pid),
    dryRun: input.dryRun === true,
    driverState: typeof input.driverState === 'string' ? input.driverState : null,
    lapsCompleted: finiteNumber(input.lapsCompleted) ?? 0,
    lapsValid: finiteNumber(input.lapsValid) ?? 0,
    speedKmh: finiteNumber(input.speedKmh),
    automaticGearbox: input.automaticGearbox === true,
  }
}

export function qaBotPresentation(snapshot: QaBotSnapshot) {
  const active = snapshot.state === 'ACTIVE'
  const pending = snapshot.state === 'CHECKING' || snapshot.state === 'STOPPING'
  const action = pending ? 'none' : active ? 'stop' : 'start'
  const label = snapshot.state === 'CHECKING'
    ? 'Verifica bot…'
    : snapshot.state === 'STOPPING'
      ? 'Arresto bot…'
      : active
        ? 'Disattiva bot'
        : 'Attiva bot'
  const stateLabel: Record<QaBotState, string> = {
    OFF: 'Spento',
    CHECKING: 'Verifica',
    ACTIVE: snapshot.dryRun ? 'Attivo — prova senza input' : 'Attivo',
    STOPPING: 'Arresto',
    BLOCKED: 'Bloccato',
    FAULT: 'Errore',
  }
  const directReason = REASONS[snapshot.reason]
  const reason = directReason
    || (snapshot.reason.startsWith('pista_non_supportata') ? 'Seleziona Spa.' : null)
    || (snapshot.reason.startsWith('auto_non_supportata') ? 'Seleziona Mercedes-AMG GT3 Evo.' : null)
    || snapshot.reason.replaceAll('_', ' ')
  return {
    action,
    label,
    stateLabel: stateLabel[snapshot.state],
    reason,
    active,
    pending,
  } as const
}
