import type { RuntimeBootstrapResult } from '~/services/runtime/runtimeBootstrapCoordinator'

export const CLIENT_HEARTBEAT_SCHEMA_VERSION = 2
export const CLIENT_HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000
export const CLIENT_HEARTBEAT_RECENT_MS = 60 * 60 * 1000

const MAX_VERSION_LENGTH = 80
const MAX_REASON_CODE_LENGTH = 80

export interface SuiteVersionInfo {
  suite?: string | null
  baseVersion?: string | null
  channel?: string | null
  candidateRevision?: number | null
  launcher?: string | null
  logger?: string | null
  webapp?: string | null
  kokoroRuntime?: string | null
  updateState?: string | null
  lastCheckAt?: string | null
}

export interface RuntimeInstallationIdentity {
  installationId?: string | null
  createdAt?: string | null
  fallback?: boolean
}

export interface RuntimeInstallationHeartbeat {
  schemaVersion: 2
  installationId: string
  startedAt: string
  lastContactAt: string
  suiteVersion: string | null
  channel: string | null
  updateState: string
  lastCheckAt: string | null
  components: {
    launcher: string | null
    logger: string | null
    webapp: string | null
    kokoroRuntime: string | null
  }
  health: {
    status: string
    phase: string
    reasonCode: string | null
  }
  migration: {
    status: string
    phase: string
    progress: number
    code: string | null
    resumedFrom: string | null
  }
}

export interface ClientHeartbeatPayload {
  suiteVersion: string | null
  suiteVersionDetail: SuiteVersionInfo
  suiteVersionUpdatedAt: string
  clientRuntime: {
    schemaVersion: number
    installationId: string
    suiteVersion: string | null
    channel: string | null
    updateState: string
    lastHeartbeatAt: string
    lastCheckAt: string | null
    components: {
      launcher: string | null
      logger: string | null
      webapp: string | null
      kokoroRuntime: string | null
    }
  }
  installationRuntime: RuntimeInstallationHeartbeat
}

export type ClientHeartbeatStatus = 'recent' | 'stale' | 'unknown'

export function normalizeSuiteVersionInfo(input: SuiteVersionInfo | null | undefined): SuiteVersionInfo | null {
  if (!input) return null
  const suite = input.suite || input.launcher || input.webapp || null
  if (!suite) return null

  return {
    suite,
    baseVersion: input.baseVersion || suite,
    channel: input.channel || null,
    candidateRevision: input.candidateRevision ?? null,
    launcher: input.launcher || null,
    logger: input.logger || null,
    webapp: input.webapp || null,
    kokoroRuntime: input.kokoroRuntime || null,
    updateState: input.updateState === 'pending' ? 'pending' : 'current',
    lastCheckAt: input.lastCheckAt || null
  }
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function buildRuntimeSummary(state: RuntimeBootstrapResult<unknown> | null | undefined) {
  const phase = boundedString(state?.phase, 40) || 'unknown'
  const lastEvent = state?.events?.[state.events.length - 1]
  const progress = state?.migrationProgress
  const healthStatus = phase === 'ready'
    ? 'healthy'
    : phase === 'migrating'
      ? boundedString(progress?.status, 40) || 'repairing'
      : phase === 'degraded'
        ? 'degraded'
        : 'unknown'

  return {
    health: {
      status: healthStatus,
      phase,
      reasonCode: boundedString(lastEvent?.code, MAX_REASON_CODE_LENGTH)
    },
    migration: {
      status: boundedString(progress?.status, 40) || 'unknown',
      phase: boundedString(progress?.phase, 80) || 'unknown',
      progress: Math.min(100, Math.max(0, Number(progress?.progress) || 0)),
      code: boundedString(progress?.code, MAX_REASON_CODE_LENGTH),
      resumedFrom: boundedString(progress?.resumedFrom, MAX_REASON_CODE_LENGTH)
    }
  }
}

export function buildClientHeartbeatPayload(
  versionInput: SuiteVersionInfo,
  heartbeatAt: string,
  context: {
    identity: RuntimeInstallationIdentity
    runtimeState?: RuntimeBootstrapResult<unknown> | null
  }
): ClientHeartbeatPayload | null {
  const version = normalizeSuiteVersionInfo(versionInput)
  const installationId = boundedString(context.identity.installationId, 80)
  const startedAt = boundedString(context.identity.createdAt, 40)
  if (!version || !installationId || !startedAt || context.identity.fallback === true) return null

  const components = {
    launcher: boundedString(version.launcher, MAX_VERSION_LENGTH),
    logger: boundedString(version.logger, MAX_VERSION_LENGTH),
    webapp: boundedString(version.webapp, MAX_VERSION_LENGTH),
    kokoroRuntime: boundedString(version.kokoroRuntime, MAX_VERSION_LENGTH)
  }
  const runtimeSummary = buildRuntimeSummary(context.runtimeState)
  const installationRuntime: RuntimeInstallationHeartbeat = {
    schemaVersion: CLIENT_HEARTBEAT_SCHEMA_VERSION,
    installationId,
    startedAt,
    lastContactAt: heartbeatAt,
    suiteVersion: boundedString(version.suite, MAX_VERSION_LENGTH),
    channel: boundedString(version.channel, 24),
    updateState: version.updateState || 'current',
    lastCheckAt: boundedString(version.lastCheckAt, 40),
    components,
    ...runtimeSummary
  }

  return {
    suiteVersion: version.suite || null,
    suiteVersionDetail: version,
    suiteVersionUpdatedAt: heartbeatAt,
    clientRuntime: {
      schemaVersion: CLIENT_HEARTBEAT_SCHEMA_VERSION,
      installationId,
      suiteVersion: version.suite || null,
      channel: version.channel || null,
      updateState: version.updateState || 'current',
      lastHeartbeatAt: heartbeatAt,
      lastCheckAt: version.lastCheckAt || null,
      components
    },
    installationRuntime
  }
}

export function shouldSendClientHeartbeat(
  lastSuccessfulHeartbeatAt: string | null | undefined,
  nowMs: number,
  intervalMs = CLIENT_HEARTBEAT_INTERVAL_MS
): boolean {
  if (!lastSuccessfulHeartbeatAt) return true
  const lastMs = Date.parse(lastSuccessfulHeartbeatAt)
  return !Number.isFinite(lastMs) || nowMs - lastMs >= intervalMs
}

export function getClientHeartbeatStatus(
  heartbeatAt: string | null | undefined,
  nowMs = Date.now()
): ClientHeartbeatStatus {
  if (!heartbeatAt) return 'unknown'
  const heartbeatMs = Date.parse(heartbeatAt)
  if (!Number.isFinite(heartbeatMs)) return 'unknown'
  return nowMs - heartbeatMs <= CLIENT_HEARTBEAT_RECENT_MS ? 'recent' : 'stale'
}
