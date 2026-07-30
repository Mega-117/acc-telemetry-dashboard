import { describe, expect, it } from 'vitest'
import {
  advanceCanonicalMigrationCheckpoint,
  buildCanonicalMigrationCheckpoint,
  isCompletedCanonicalMigrationCheckpoint,
  nextCanonicalMigrationAttempt
} from '~/services/sync/canonicalMigrationCheckpoint'

function transactionHarness(initial: Record<string, unknown>) {
  let state = initial
  return {
    get state() { return state },
    runTransaction: async <T>(callback: (transaction: {
      get: () => Promise<{ data: () => Record<string, unknown> }>
      set: (_ref: unknown, patch: Record<string, any>) => void
    }) => Promise<T>) => callback({
      get: async () => ({ data: () => state }),
      set: (_ref, patch) => {
        const maintenance = (patch.maintenance || {}) as Record<string, unknown>
        state = {
          ...state,
          maintenance: {
            ...((state.maintenance || {}) as Record<string, unknown>),
            ...maintenance
          }
        }
      }
    })
  }
}

describe('canonicalMigrationCheckpoint', () => {
  it('avanza in modo monotono e idempotente sotto il lease posseduto', async () => {
    const harness = transactionHarness({
      maintenance: {
        firebaseStructureHealth: { status: 'repairing', lease: { id: 'lease-1' } },
        canonicalDataMigration: {}
      }
    })
    const audit = buildCanonicalMigrationCheckpoint({
      attempt: 1,
      phase: 'audit',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      updatedAt: '2026-07-30T18:00:00.000Z'
    })
    expect(await advanceCanonicalMigrationCheckpoint({
      runTransaction: harness.runTransaction as never,
      userRef: {},
      leaseId: 'lease-1',
      checkpoint: audit
    })).toBe('advanced')
    expect(await advanceCanonicalMigrationCheckpoint({
      runTransaction: harness.runTransaction as never,
      userRef: {},
      leaseId: 'lease-1',
      checkpoint: audit
    })).toBe('idempotent')

    const checking = buildCanonicalMigrationCheckpoint({
      attempt: 1,
      phase: 'checking_status',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5
    })
    expect(await advanceCanonicalMigrationCheckpoint({
      runTransaction: harness.runTransaction as never,
      userRef: {},
      leaseId: 'lease-1',
      checkpoint: checking
    })).toBe('regression_rejected')
  })

  it('rifiuta writer stale e consente un nuovo tentativo di resume', async () => {
    const harness = transactionHarness({
      maintenance: {
        firebaseStructureHealth: { status: 'repairing', lease: { id: 'lease-2' } },
        canonicalDataMigration: {
          checkpoint: buildCanonicalMigrationCheckpoint({
            attempt: 1,
            phase: 'partial',
            targetMigrationVersion: 5,
            targetBestRulesVersion: 5
          })
        }
      }
    })
    const current = ((harness.state.maintenance as any).canonicalDataMigration.checkpoint)
    expect(nextCanonicalMigrationAttempt(current)).toBe(2)
    const resumed = buildCanonicalMigrationCheckpoint({
      attempt: 2,
      phase: 'checking_status',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      resumedFrom: 'partial'
    })
    expect(await advanceCanonicalMigrationCheckpoint({
      runTransaction: harness.runTransaction as never,
      userRef: {},
      leaseId: 'lease-1',
      checkpoint: resumed
    })).toBe('stale_lease')
    expect(await advanceCanonicalMigrationCheckpoint({
      runTransaction: harness.runTransaction as never,
      userRef: {},
      leaseId: 'lease-2',
      checkpoint: resumed
    })).toBe('advanced')
  })

  it('riconosce completed solo per target coerente', () => {
    const checkpoint = buildCanonicalMigrationCheckpoint({
      attempt: 1,
      phase: 'completed',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5
    })
    expect(isCompletedCanonicalMigrationCheckpoint({
      checkpoint,
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5
    })).toBe(true)
    expect(isCompletedCanonicalMigrationCheckpoint({
      checkpoint,
      targetMigrationVersion: 6,
      targetBestRulesVersion: 5
    })).toBe(false)
  })
})
