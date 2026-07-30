import type {
  RuntimeHealthState,
  RuntimeMigrationCompatibilityProfile
} from './runtimeBootstrapPolicy'

export const RUNTIME_COMPATIBILITY_CACHE_SCHEMA_VERSION = 1
export const RUNTIME_COMPATIBILITY_POLICY_VERSION = 1
export const RUNTIME_COMPATIBILITY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const CACHE_KEY_PREFIX = 'acc-suite:runtime-compatibility:v1:'

export interface RuntimeCompatibilityCacheRecord {
  schemaVersion: 1
  policyVersion: 1
  uid: string
  migrationVersion: number
  bestRulesVersion: number
  health: Extract<RuntimeHealthState, 'healthy' | 'partial'>
  mode: 'read_compatible' | 'write_critical'
  issues: string[]
  checkedAt: string
}

export interface RuntimeCompatibilityStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function cacheKey(uid: string): string {
  return `${CACHE_KEY_PREFIX}${encodeURIComponent(uid)}`
}

function isBoundedIssueList(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 20
    && value.every((item) => typeof item === 'string' && item.length <= 80)
}

export function readTrustedRuntimeCompatibility(input: {
  storage: RuntimeCompatibilityStorage | null | undefined
  uid: string | null | undefined
  targetMigrationVersion: number
  targetBestRulesVersion: number
  nowMs?: number
  maxAgeMs?: number
}): {
  health: 'healthy' | 'partial'
  compatibility: RuntimeMigrationCompatibilityProfile
} | null {
  if (!input.storage || !input.uid) return null
  try {
    const raw = input.storage.getItem(cacheKey(input.uid))
    if (!raw) return null
    const record = JSON.parse(raw) as Partial<RuntimeCompatibilityCacheRecord>
    const checkedAt = Date.parse(String(record.checkedAt || ''))
    const ageMs = (input.nowMs ?? Date.now()) - checkedAt
    const valid = record.schemaVersion === RUNTIME_COMPATIBILITY_CACHE_SCHEMA_VERSION
      && record.policyVersion === RUNTIME_COMPATIBILITY_POLICY_VERSION
      && record.uid === input.uid
      && record.migrationVersion === input.targetMigrationVersion
      && Number(record.bestRulesVersion) >= input.targetBestRulesVersion
      && (record.health === 'healthy' || record.health === 'partial')
      && (record.mode === 'read_compatible' || record.mode === 'write_critical')
      && isBoundedIssueList(record.issues)
      && Number.isFinite(checkedAt)
      && ageMs >= 0
      && ageMs <= (
        input.maxAgeMs ?? RUNTIME_COMPATIBILITY_CACHE_MAX_AGE_MS
      )
    if (!valid) return null
    return {
      health: record.health!,
      compatibility: {
        mode: record.mode!,
        trusted: true,
        issues: record.issues!,
        offlineCachedRead: true
      }
    }
  } catch {
    return null
  }
}

export function writeTrustedRuntimeCompatibility(input: {
  storage: RuntimeCompatibilityStorage | null | undefined
  record: RuntimeCompatibilityCacheRecord
}): boolean {
  if (!input.storage) return false
  try {
    input.storage.setItem(cacheKey(input.record.uid), JSON.stringify({
      ...input.record,
      issues: input.record.issues.slice(0, 20)
    }))
    return true
  } catch {
    return false
  }
}

export function clearTrustedRuntimeCompatibility(
  storage: RuntimeCompatibilityStorage | null | undefined,
  uid: string | null | undefined
): void {
  if (!storage || !uid) return
  try {
    storage.removeItem(cacheKey(uid))
  } catch {
    // A derived cache is always best-effort and must fail closed.
  }
}
