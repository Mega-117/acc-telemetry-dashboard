import type {
  RuntimeBootstrapContext,
  RuntimeBootstrapEvent,
  RuntimeMigrationResult,
  RuntimeUpdateResult
} from './runtimeBootstrapCoordinator'
import {
  clearTrustedRuntimeCompatibility,
  readTrustedRuntimeCompatibility,
  writeTrustedRuntimeCompatibility,
  type RuntimeCompatibilityStorage
} from './runtimeCompatibilityCache'

interface SuiteVersionState {
  updateState?: string | null
  bootstrapUpdate?: {
    status?: string | null
    failure?: { phase?: string | null; errorType?: string | null } | null
  } | null
}

interface MaintenanceReport {
  status?: string | null
  healthStatus?: string | null
  error?: string | null
  healthIssues?: string[] | null
  healthCheckedAt?: string | null
}

export type RuntimeUiCapabilityName =
  | 'localRead'
  | 'localWrite'
  | 'localProcessing'
  | 'cloudRead'
  | 'cloudWrite'
  | 'sync'
  | 'migrate'
  | 'remoteHealth'

export type RuntimeUiStatus = 'ready' | 'running' | 'partial' | 'blocked' | 'future' | 'offline'
export type RuntimeUiCapabilityState = 'allowed' | 'pending' | 'blocked' | 'not_required'

export interface RuntimeUiCapabilityGate {
  name: RuntimeUiCapabilityName
  allowed: boolean
  state: RuntimeUiCapabilityState
  reason: string
  message: string
}

export interface RuntimeUiModel {
  source: 'electron' | 'browser'
  status: RuntimeUiStatus
  visible: boolean
  tone: 'info' | 'warning' | 'danger'
  title: string
  message: string
  recovery: string | null
  progress: number | null
  phase: string | null
  gates: Record<RuntimeUiCapabilityName, RuntimeUiCapabilityGate>
}

interface RuntimeUiSnapshot {
  lifecycle?: string | null
  phase?: string | null
  reasonCode?: string | null
  capabilities?: Record<string, unknown> | null
  lastEvent?: { code?: string | null; phase?: string | null } | null
  migrationProgress?: {
    phase?: string | null
    progress?: number | null
    status?: string | null
    code?: string | null
  } | null
}

const CAPABILITY_NAMES: RuntimeUiCapabilityName[] = [
  'localRead',
  'localWrite',
  'localProcessing',
  'cloudRead',
  'cloudWrite',
  'sync',
  'migrate',
  'remoteHealth'
]

function capabilityMessage(state: RuntimeUiCapabilityState, reason: string): string {
  if (state === 'allowed' || state === 'not_required') return 'Disponibile.'
  if (reason.includes('offline')) return 'In attesa della connessione. Riprenderà automaticamente online.'
  if (reason.includes('future')) return 'Richiede una versione compatibile prima di usare questa funzione cloud.'
  if (reason.includes('persistent') || state === 'blocked') {
    return 'Funzione cloud sospesa finché il problema non viene risolto.'
  }
  if (reason.includes('lease')) return 'Un aggiornamento dati è già in corso. La funzione riprenderà al termine.'
  if (reason.includes('partial')) return 'Dati parziali: la funzione riprenderà dal checkpoint disponibile.'
  if (reason.includes('auth')) return 'In attesa dell’accesso al cloud.'
  return 'Temporaneamente non disponibile. Il runtime riproverà automaticamente.'
}

function normalizeCapability(
  name: RuntimeUiCapabilityName,
  value: unknown,
  source: RuntimeUiModel['source']
): RuntimeUiCapabilityGate {
  if (source === 'browser') {
    return {
      name,
      allowed: true,
      state: 'allowed',
      reason: 'browser_runtime_unmanaged',
      message: 'Disponibile.'
    }
  }

  if (typeof value === 'boolean') {
    const state = value ? 'allowed' : 'pending'
    const reason = value ? 'legacy_allowed' : 'runtime_state_pending'
    return { name, allowed: value, state, reason, message: capabilityMessage(state, reason) }
  }

  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as { state?: unknown; reason?: unknown; allowed?: unknown }
    : {}
  const rawState = typeof input.state === 'string' ? input.state : ''
  const state: RuntimeUiCapabilityState = (
    rawState === 'allowed'
    || rawState === 'pending'
    || rawState === 'blocked'
    || rawState === 'not_required'
  ) ? rawState : input.allowed === true ? 'allowed' : 'pending'
  const reason = typeof input.reason === 'string' && input.reason
    ? input.reason
    : state === 'allowed' ? 'runtime_allowed' : 'runtime_state_pending'
  return {
    name,
    allowed: state === 'allowed' || state === 'not_required',
    state,
    reason,
    message: capabilityMessage(state, reason)
  }
}

function resolveUiStatus(snapshot: RuntimeUiSnapshot | null, gates: RuntimeUiModel['gates']): RuntimeUiStatus {
  const lifecycle = snapshot?.lifecycle || 'starting'
  const tokens = [
    snapshot?.phase,
    snapshot?.reasonCode,
    snapshot?.lastEvent?.code,
    snapshot?.lastEvent?.phase,
    snapshot?.migrationProgress?.status,
    snapshot?.migrationProgress?.code,
    ...Object.entries(gates)
      .filter(([name]) => !name.startsWith('local'))
      .map(([, gate]) => gate.reason)
  ].filter(Boolean).join(' ').toLowerCase()

  if (tokens.includes('offline')) return 'offline'
  if (tokens.includes('future')) return 'future'
  if (lifecycle === 'degraded' || lifecycle === 'stopped' || Object.values(gates).some((gate) => gate.state === 'blocked')) {
    return 'blocked'
  }
  if (tokens.includes('partial')) return 'partial'
  if (
    lifecycle === 'starting'
    || snapshot?.migrationProgress?.status === 'running'
    || Object.values(gates).some((gate) => gate.state === 'pending')
  ) return 'running'
  return 'ready'
}

export function deriveRuntimeUiModel(
  snapshot: RuntimeUiSnapshot | null,
  source: RuntimeUiModel['source']
): RuntimeUiModel {
  const capabilities = snapshot?.capabilities || {}
  const gates = Object.fromEntries(CAPABILITY_NAMES.map((name) => [
    name,
    normalizeCapability(name, capabilities[name], source)
  ])) as RuntimeUiModel['gates']

  if (source === 'browser') {
    return {
      source,
      status: 'ready',
      visible: false,
      tone: 'info',
      title: 'Runtime browser',
      message: 'Le capability Electron non sono gestite in questa sessione browser.',
      recovery: null,
      progress: null,
      phase: null,
      gates
    }
  }

  const status = resolveUiStatus(snapshot, gates)
  const copy: Record<RuntimeUiStatus, Pick<RuntimeUiModel, 'title' | 'message' | 'recovery' | 'tone'>> = {
    ready: {
      title: 'Servizi dati pronti',
      message: 'Le capability cloud sono disponibili.',
      recovery: null,
      tone: 'info'
    },
    running: {
      title: 'Aggiornamento dati in corso',
      message: 'Puoi continuare a usare le funzioni locali. Le sole azioni coinvolte sono in attesa.',
      recovery: 'La procedura continua anche se cambi pagina o aggiorni la dashboard.',
      tone: 'info'
    },
    partial: {
      title: 'Dati cloud parzialmente disponibili',
      message: 'Le funzioni compatibili restano disponibili; le altre riprenderanno dal checkpoint.',
      recovery: 'Il runtime ritenterà automaticamente senza interrompere i dati locali.',
      tone: 'warning'
    },
    blocked: {
      title: 'Alcune funzioni cloud sono sospese',
      message: 'Il runtime locale continua normalmente. Sono bloccate solo le azioni cloud incompatibili.',
      recovery: 'Il runtime riproverà dopo il prossimo aggiornamento o quando il problema sarà risolto.',
      tone: 'danger'
    },
    future: {
      title: 'Dati cloud di una versione più recente',
      message: 'Le funzioni cloud non compatibili sono protette; telemetria e dati locali restano operativi.',
      recovery: 'La compatibilità verrà rivalutata dopo l’aggiornamento della suite.',
      tone: 'danger'
    },
    offline: {
      title: 'Modalità offline',
      message: gates.cloudRead.allowed
        ? 'Dati cloud già verificati disponibili in sola lettura; scritture e sync sono in attesa.'
        : 'Telemetria, salvataggio ed elaborazione locali restano operativi.',
      recovery: 'Le funzioni cloud riprenderanno automaticamente alla riconnessione.',
      tone: 'warning'
    }
  }
  const progressValue = Number(snapshot?.migrationProgress?.progress)
  return {
    source,
    status,
    visible: status !== 'ready',
    ...copy[status],
    progress: Number.isFinite(progressValue)
      ? Math.max(0, Math.min(100, Math.round(progressValue)))
      : null,
    phase: snapshot?.migrationProgress?.phase || snapshot?.phase || null,
    gates
  }
}

export function canRunBootstrapSync(input: {
  capabilities?: { sync?: { state?: string | null } | null } | null
}): boolean {
  return input.capabilities?.sync?.state === 'allowed'
}

export function resolveRendererUpdateResult(state: SuiteVersionState | null): RuntimeUpdateResult {
  if (state?.updateState === 'pending' || state?.bootstrapUpdate?.status === 'restart_required') {
    return { status: 'updated_restart_required' }
  }
  if (state?.bootstrapUpdate?.status === 'failed') {
    return {
      status: 'failed',
      errorCode: `${state.bootstrapUpdate.failure?.phase || 'update'}:${state.bootstrapUpdate.failure?.errorType || 'unknown'}`
    }
  }
  return { status: 'current' }
}

export function resolveMaintenanceMigrationResult(report: MaintenanceReport): RuntimeMigrationResult {
  const issues = (report.healthIssues || []).slice(0, 20)
  if (report.healthStatus === 'healthy') {
    return {
      status: 'healthy',
      issues: [],
      compatibility: { mode: 'write_critical', trusted: true, issues: [] }
    }
  }
  if (report.healthStatus === 'partial') {
    return {
      status: 'partial',
      issues,
      compatibility: { mode: 'write_critical', trusted: true, issues }
    }
  }
  if (report.healthStatus === 'repairing') {
    return {
      status: 'waiting_for_lease',
      issues,
      compatibility: {
        mode: 'write_critical', trusted: true, issues, activity: 'other_lease'
      }
    }
  }
  if (report.healthStatus === 'future_schema') {
    return {
      status: 'future_schema',
      compatibility: { mode: 'read_write_critical', trusted: false, issues }
    }
  }
  if (report.healthStatus === 'blocked') {
    return {
      status: 'blocked',
      persistent: true,
      errorCode: report.error || 'blocked',
      issues,
      compatibility: { mode: 'write_critical', trusted: true, issues }
    }
  }
  return {
    status: 'partial',
    errorCode: 'health_status_unknown',
    issues: ['health_status_unknown'],
    compatibility: {
      mode: 'write_critical', trusted: true, issues: ['health_status_unknown']
    }
  }
}

export async function buildRendererBootstrapContext(input: {
  electronAPI: any
  uid: string | null | undefined
  canEnterApp: boolean
  isOnline: boolean
  targetMigrationVersion?: number
  targetBestRulesVersion?: number
  compatibilityStorage?: RuntimeCompatibilityStorage | null
}): Promise<RuntimeBootstrapContext> {
  const identity = await input.electronAPI?.getRuntimeIdentity?.()
  const cached = input.isOnline ? null : readTrustedRuntimeCompatibility({
    storage: input.compatibilityStorage,
    uid: input.uid,
    targetMigrationVersion: input.targetMigrationVersion ?? 5,
    targetBestRulesVersion: input.targetBestRulesVersion ?? 5
  })
  return {
    coordinatorKey: String(identity?.coordinatorKey || 'renderer-runtime-fallback'),
    network: input.isOnline ? 'online' : 'offline',
    auth: input.uid && input.canEnterApp ? 'ready' : 'pending',
    health: cached?.health || 'unknown',
    // OWNER_DATA_MIGRATION_VERSION=5 is read-compatible and write-critical.
    compatibility: cached?.compatibility || {
      mode: 'write_critical', trusted: true, issues: []
    }
  }
}

export function cacheRendererMaintenanceCompatibility(input: {
  storage: RuntimeCompatibilityStorage | null | undefined
  uid: string
  report: MaintenanceReport
  targetMigrationVersion: number
  targetBestRulesVersion: number
}): boolean {
  if (input.report.healthStatus !== 'healthy' && input.report.healthStatus !== 'partial') {
    clearTrustedRuntimeCompatibility(input.storage, input.uid)
    return false
  }
  return writeTrustedRuntimeCompatibility({
    storage: input.storage,
    record: {
      schemaVersion: 1,
      policyVersion: 1,
      uid: input.uid,
      migrationVersion: input.targetMigrationVersion,
      bestRulesVersion: input.targetBestRulesVersion,
      health: input.report.healthStatus,
      mode: 'write_critical',
      issues: (input.report.healthIssues || []).slice(0, 20),
      checkedAt: input.report.healthCheckedAt || new Date().toISOString()
    }
  })
}

export async function recordRendererBootstrapEvent(
  electronAPI: any,
  event: RuntimeBootstrapEvent
): Promise<void> {
  if (event.kind === 'progress' || !electronAPI?.captureDiagnostic) return
  await electronAPI.captureDiagnostic({
    component: 'runtime-bootstrap',
    severity: event.notifyNative ? 'error' : 'warning',
    code: `bootstrap.${event.code}`,
    message: event.code,
    context: {
      schemaVersion: event.schemaVersion,
      phase: event.phase,
      notifyNative: event.notifyNative,
      openUi: false,
      details: event.details || null
    }
  })
}
