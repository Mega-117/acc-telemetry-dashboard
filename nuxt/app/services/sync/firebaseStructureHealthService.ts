import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import {
  trackedGetDoc,
  trackedRunTransaction,
  trackedSetDoc
} from '~/composables/useFirebaseTracker'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'

const CALLER = 'FirebaseStructureHealth'

export const FIREBASE_STRUCTURE_HEALTH_SCHEMA_VERSION = 1
export const FIREBASE_STRUCTURE_HEALTH_TTL_MS = 24 * 60 * 60 * 1000
export const FIREBASE_STRUCTURE_LEASE_MS = 10 * 60 * 1000

export type FirebaseStructureHealthStatus =
  | 'unknown'
  | 'healthy'
  | 'repairing'
  | 'partial'
  | 'blocked'
  | 'future_schema'

export interface FirebaseStructureHealthLease {
  id?: string | null
  acquiredAt?: string | null
  expiresAt?: string | null
}

export interface FirebaseStructureHealthState {
  schemaVersion?: number
  migrationVersion?: number
  bestRulesVersion?: number
  status?: FirebaseStructureHealthStatus
  checkedAt?: string | null
  updatedAt?: string | null
  code?: string | null
  issues?: string[]
  lease?: FirebaseStructureHealthLease | null
}

export interface CanonicalMigrationState {
  version?: number
  bestRulesVersion?: number
  status?: string
}

export type FirebaseStructureHealthAction =
  | 'skip_healthy'
  | 'skip_partial'
  | 'verify_current'
  | 'migrate'
  | 'wait_for_lease'
  | 'future_schema'
  | 'blocked_schema'

export interface FirebaseStructureHealthDecision {
  action: FirebaseStructureHealthAction
  code: string
}

function parseOptionalVersion(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return Number.NaN
  return parsed
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function hasActiveLease(
  health: FirebaseStructureHealthState | null | undefined,
  nowMs: number
): boolean {
  if (health?.status !== 'repairing') return false
  const expiresAt = parseTime(health.lease?.expiresAt)
  return expiresAt !== null && expiresAt > nowMs
}

function isFreshTerminalHealth(
  health: FirebaseStructureHealthState | null | undefined,
  targetMigrationVersion: number,
  targetBestRulesVersion: number,
  nowMs: number,
  ttlMs: number
): boolean {
  if (health?.status !== 'healthy' && health?.status !== 'partial') return false
  if (Number(health.schemaVersion) !== FIREBASE_STRUCTURE_HEALTH_SCHEMA_VERSION) return false
  if (Number(health.migrationVersion) !== targetMigrationVersion) return false
  if (Number(health.bestRulesVersion) < targetBestRulesVersion) return false
  const checkedAt = parseTime(health.checkedAt)
  return checkedAt !== null && nowMs - checkedAt <= ttlMs
}

export function inspectFirebaseStructureState(input: {
  migration: CanonicalMigrationState | null | undefined
  health: FirebaseStructureHealthState | null | undefined
  targetMigrationVersion: number
  targetBestRulesVersion: number
  nowMs?: number
  ttlMs?: number
  force?: boolean
}): FirebaseStructureHealthDecision {
  const nowMs = input.nowMs ?? Date.now()
  const ttlMs = input.ttlMs ?? FIREBASE_STRUCTURE_HEALTH_TTL_MS
  const migrationVersion = parseOptionalVersion(input.migration?.version)
  const bestRulesVersion = parseOptionalVersion(input.migration?.bestRulesVersion)

  if (Number.isNaN(migrationVersion) || Number.isNaN(bestRulesVersion)) {
    return { action: 'blocked_schema', code: 'invalid_migration_version' }
  }

  if (
    (migrationVersion !== null && migrationVersion > input.targetMigrationVersion)
    || (bestRulesVersion !== null && bestRulesVersion > input.targetBestRulesVersion)
  ) {
    return { action: 'future_schema', code: 'future_schema_detected' }
  }

  if (hasActiveLease(input.health, nowMs)) {
    return { action: 'wait_for_lease', code: 'repair_already_running' }
  }

  const migrationIsCurrent = input.migration?.status === 'completed'
    && migrationVersion === input.targetMigrationVersion
    && (bestRulesVersion || 0) >= input.targetBestRulesVersion

  if (input.force) {
    return { action: 'migrate', code: 'forced_repair' }
  }

  if (!migrationIsCurrent) {
    return { action: 'migrate', code: 'migration_required' }
  }

  if (isFreshTerminalHealth(
    input.health,
    input.targetMigrationVersion,
    input.targetBestRulesVersion,
    nowMs,
    ttlMs
  )) {
    return input.health?.status === 'partial'
      ? { action: 'skip_partial', code: input.health.code || 'partial_recently_verified' }
      : { action: 'skip_healthy', code: 'healthy_recently_verified' }
  }

  return { action: 'verify_current', code: 'health_verification_required' }
}

export function createFirebaseStructureLeaseId(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${Date.now().toString(36)}-${random}`
}

function buildHealthDocument(input: {
  status: FirebaseStructureHealthStatus
  migrationVersion: number
  bestRulesVersion: number
  code: string
  issues?: string[]
  checkedAt?: string | null
  updatedAt: string
  lease?: FirebaseStructureHealthLease | null
}): FirebaseStructureHealthState {
  return {
    schemaVersion: FIREBASE_STRUCTURE_HEALTH_SCHEMA_VERSION,
    migrationVersion: input.migrationVersion,
    bestRulesVersion: input.bestRulesVersion,
    status: input.status,
    checkedAt: input.checkedAt ?? null,
    updatedAt: input.updatedAt,
    code: input.code,
    issues: (input.issues || []).slice(0, 20),
    lease: input.lease || null
  }
}

function buildPilotDirectorySummary(health: FirebaseStructureHealthState) {
  return {
    firebaseHealthStatus: health.status || 'unknown',
    firebaseHealthMigrationVersion: health.migrationVersion || null,
    firebaseHealthCheckedAt: health.checkedAt || null,
    firebaseHealthCode: health.code || null
  }
}

export async function claimFirebaseStructureLease(input: {
  uid: string
  leaseId: string
  targetMigrationVersion: number
  targetBestRulesVersion: number
  nowIso?: string
  leaseMs?: number
}): Promise<boolean> {
  const userRef = doc(db, `users/${input.uid}`)

  const updatedAt = input.nowIso || new Date().toISOString()
  const nowMs = Date.parse(updatedAt)
  const expiresAt = new Date(nowMs + (input.leaseMs ?? FIREBASE_STRUCTURE_LEASE_MS)).toISOString()

  return trackedRunTransaction(db, CALLER, userRef, async (transaction) => {
    const snap = await transaction.get(userRef)
    const current = (snap.data()?.maintenance?.firebaseStructureHealth || null) as FirebaseStructureHealthState | null
    if (hasActiveLease(current, nowMs) && current?.lease?.id !== input.leaseId) {
      return false
    }

    const health = buildHealthDocument({
      status: 'repairing',
      migrationVersion: input.targetMigrationVersion,
      bestRulesVersion: input.targetBestRulesVersion,
      code: 'repair_in_progress',
      updatedAt,
      lease: {
        id: input.leaseId,
        acquiredAt: updatedAt,
        expiresAt
      }
    })

    transaction.set(userRef, sanitizeForFirestore({
      maintenance: {
        firebaseStructureHealth: health
      }
    }), { merge: true })
    return true
  }, { reads: 1, writes: 1 })
}

export async function publishFirebaseStructureHealth(input: {
  uid: string
  status: Exclude<FirebaseStructureHealthStatus, 'unknown' | 'repairing'>
  targetMigrationVersion: number
  targetBestRulesVersion: number
  code: string
  issues?: string[]
  checkedAt?: string
}) {
  const updatedAt = input.checkedAt || new Date().toISOString()
  const health = buildHealthDocument({
    status: input.status,
    migrationVersion: input.targetMigrationVersion,
    bestRulesVersion: input.targetBestRulesVersion,
    code: input.code,
    issues: input.issues,
    checkedAt: updatedAt,
    updatedAt,
    lease: null
  })
  await trackedSetDoc(doc(db, `users/${input.uid}`), sanitizeForFirestore({
    maintenance: {
      firebaseStructureHealth: health
    }
  }), { merge: true }, CALLER)

  const directoryRef = doc(db, `pilotDirectory/${input.uid}`)
  const directorySnap = await trackedGetDoc(directoryRef, CALLER)
  if (directorySnap.exists()) {
    await trackedSetDoc(
      directoryRef,
      sanitizeForFirestore(buildPilotDirectorySummary(health)),
      { merge: true },
      CALLER
    )
  }
}

export function classifyFirebaseStructureError(error: unknown): string {
  const code = String((error as any)?.code || '').toLowerCase()
  const message = String((error as any)?.message || '').toLowerCase()
  if (code.includes('permission-denied') || message.includes('permission')) return 'permission_denied'
  if (
    code.includes('unavailable')
    || code.includes('deadline-exceeded')
    || message.includes('network')
    || message.includes('offline')
  ) return 'network_transient'
  if (message.includes('verifica') || message.includes('verification')) return 'verification_failed'
  return 'unknown_error'
}

export function classifyFirebaseStructureOutcome(input: {
  incompleteCloudOnly?: number
  skippedNoRaw?: number
}): {
  status: 'healthy' | 'partial'
  code: string
  issues: string[]
} {
  const issues: string[] = []
  if (Number(input.incompleteCloudOnly || 0) > 0) issues.push('incomplete_cloud_only')
  if (Number(input.skippedNoRaw || 0) > 0) issues.push('raw_data_unavailable')
  return issues.length > 0
    ? { status: 'partial', code: 'repair_completed_with_limits', issues }
    : { status: 'healthy', code: 'structure_verified', issues: [] }
}