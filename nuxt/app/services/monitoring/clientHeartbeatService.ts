export const CLIENT_HEARTBEAT_SCHEMA_VERSION = 1
export const CLIENT_HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000
export const CLIENT_HEARTBEAT_RECENT_MS = 24 * 60 * 60 * 1000

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

export interface ClientHeartbeatPayload {
  suiteVersion: string | null
  suiteVersionDetail: SuiteVersionInfo
  suiteVersionUpdatedAt: string
  clientRuntime: {
    schemaVersion: number
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

export function buildClientHeartbeatPayload(
  versionInput: SuiteVersionInfo,
  heartbeatAt: string
): ClientHeartbeatPayload | null {
  const version = normalizeSuiteVersionInfo(versionInput)
  if (!version) return null

  return {
    suiteVersion: version.suite || null,
    suiteVersionDetail: version,
    suiteVersionUpdatedAt: heartbeatAt,
    clientRuntime: {
      schemaVersion: CLIENT_HEARTBEAT_SCHEMA_VERSION,
      suiteVersion: version.suite || null,
      channel: version.channel || null,
      updateState: version.updateState || 'current',
      lastHeartbeatAt: heartbeatAt,
      lastCheckAt: version.lastCheckAt || null,
      components: {
        launcher: version.launcher || null,
        logger: version.logger || null,
        webapp: version.webapp || null,
        kokoroRuntime: version.kokoroRuntime || null
      }
    }
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
