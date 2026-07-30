export const CANONICAL_MIGRATION_CHECKPOINT_SCHEMA_VERSION = 1

export type CanonicalMigrationCheckpointPhase =
  | 'checking_status'
  | 'audit'
  | 'cloud_reprocess'
  | 'rebuild'
  | 'final_verification'
  | 'partial'
  | 'blocked'
  | 'completed'

const PHASE_SEQUENCE: Record<CanonicalMigrationCheckpointPhase, number> = {
  checking_status: 10,
  audit: 20,
  cloud_reprocess: 40,
  rebuild: 60,
  final_verification: 80,
  partial: 90,
  blocked: 95,
  completed: 100
}

export interface CanonicalMigrationCheckpoint {
  schemaVersion: 1
  attempt: number
  phase: CanonicalMigrationCheckpointPhase
  sequence: number
  targetMigrationVersion: number
  targetBestRulesVersion: number
  updatedAt: string
  resumedFrom?: string | null
}

interface CanonicalMigrationDocument {
  maintenance?: {
    firebaseStructureHealth?: {
      status?: string
      lease?: { id?: string | null } | null
    }
    canonicalDataMigration?: Record<string, unknown> & {
      checkpoint?: CanonicalMigrationCheckpoint
    }
  }
}

interface TransactionSnapshotLike {
  data(): CanonicalMigrationDocument | undefined
}

interface TransactionLike {
  get(ref: unknown): Promise<TransactionSnapshotLike>
  set(ref: unknown, data: Record<string, unknown>, options: { merge: true }): void
}

export type CanonicalMigrationTransactionRunner = <T>(
  callback: (transaction: TransactionLike) => Promise<T>
) => Promise<T>

export type CanonicalMigrationCheckpointAdvanceResult =
  | 'advanced'
  | 'idempotent'
  | 'stale_lease'
  | 'regression_rejected'

export function nextCanonicalMigrationAttempt(
  checkpoint: CanonicalMigrationCheckpoint | null | undefined
): number {
  const previous = Number(checkpoint?.attempt || 0)
  return Number.isInteger(previous) && previous >= 0 ? previous + 1 : 1
}

export function buildCanonicalMigrationCheckpoint(input: {
  attempt: number
  phase: CanonicalMigrationCheckpointPhase
  targetMigrationVersion: number
  targetBestRulesVersion: number
  updatedAt?: string
  resumedFrom?: string | null
}): CanonicalMigrationCheckpoint {
  return {
    schemaVersion: CANONICAL_MIGRATION_CHECKPOINT_SCHEMA_VERSION,
    attempt: Math.max(1, Math.trunc(input.attempt)),
    phase: input.phase,
    sequence: (Math.max(1, Math.trunc(input.attempt)) * 1000) + PHASE_SEQUENCE[input.phase],
    targetMigrationVersion: input.targetMigrationVersion,
    targetBestRulesVersion: input.targetBestRulesVersion,
    updatedAt: input.updatedAt || new Date().toISOString(),
    resumedFrom: input.resumedFrom ? input.resumedFrom.slice(0, 80) : null
  }
}

export async function advanceCanonicalMigrationCheckpoint(input: {
  runTransaction: CanonicalMigrationTransactionRunner
  userRef: unknown
  leaseId: string
  checkpoint: CanonicalMigrationCheckpoint
  migrationPatch?: Record<string, unknown>
}): Promise<CanonicalMigrationCheckpointAdvanceResult> {
  return input.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(input.userRef)
    const maintenance = snapshot.data()?.maintenance || {}
    const health = maintenance.firebaseStructureHealth || {}
    if (health.status !== 'repairing' || health.lease?.id !== input.leaseId) {
      return 'stale_lease'
    }

    const migration = maintenance.canonicalDataMigration || {}
    const current = migration.checkpoint
    if (current?.schemaVersion === CANONICAL_MIGRATION_CHECKPOINT_SCHEMA_VERSION) {
      if (Number(current.sequence) > input.checkpoint.sequence) return 'regression_rejected'
      if (Number(current.sequence) === input.checkpoint.sequence) return 'idempotent'
    }

    transaction.set(input.userRef, {
      maintenance: {
        canonicalDataMigration: {
          ...migration,
          version: input.checkpoint.targetMigrationVersion,
          bestRulesVersion: input.checkpoint.targetBestRulesVersion,
          ...(input.migrationPatch || {}),
          checkpoint: input.checkpoint,
          updatedAt: input.checkpoint.updatedAt
        }
      }
    }, { merge: true })
    return 'advanced'
  })
}

export function isCompletedCanonicalMigrationCheckpoint(input: {
  checkpoint: unknown
  targetMigrationVersion: number
  targetBestRulesVersion: number
}): boolean {
  const checkpoint = input.checkpoint as Partial<CanonicalMigrationCheckpoint> | null
  return checkpoint?.schemaVersion === CANONICAL_MIGRATION_CHECKPOINT_SCHEMA_VERSION
    && checkpoint.phase === 'completed'
    && checkpoint.targetMigrationVersion === input.targetMigrationVersion
    && Number(checkpoint.targetBestRulesVersion) >= input.targetBestRulesVersion
}
