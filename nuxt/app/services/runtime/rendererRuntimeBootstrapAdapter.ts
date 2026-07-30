import type {
  RuntimeBootstrapContext,
  RuntimeBootstrapEvent,
  RuntimeMigrationResult,
  RuntimeUpdateResult
} from './runtimeBootstrapCoordinator'

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
  if (report.healthStatus === 'healthy') return { status: 'healthy' }
  if (report.healthStatus === 'partial') return { status: 'partial' }
  if (report.healthStatus === 'repairing') return { status: 'waiting_for_lease' }
  if (report.healthStatus === 'future_schema') return { status: 'future_schema' }
  if (report.healthStatus === 'blocked') {
    return { status: 'blocked', persistent: true, errorCode: report.error || 'blocked' }
  }
  if (report.status === 'completed') return { status: 'healthy' }
  return { status: 'partial', errorCode: 'health_status_unknown' }
}

export async function buildRendererBootstrapContext(input: {
  electronAPI: any
  uid: string | null | undefined
  canEnterApp: boolean
  isOnline: boolean
}): Promise<RuntimeBootstrapContext> {
  const identity = await input.electronAPI?.getRuntimeIdentity?.()
  return {
    coordinatorKey: String(identity?.coordinatorKey || 'renderer-runtime-fallback'),
    network: input.isOnline ? 'online' : 'offline',
    auth: input.uid && input.canEnterApp ? 'ready' : 'pending',
    health: 'unknown',
    // OWNER_DATA_MIGRATION_VERSION=5 is read-compatible and write-critical.
    compatibility: 'write_critical'
  }
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
