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
