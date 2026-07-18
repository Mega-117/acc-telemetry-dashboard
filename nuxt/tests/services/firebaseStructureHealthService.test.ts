import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackedGetDocMock = vi.hoisted(() => vi.fn())
const trackedRunTransactionMock = vi.hoisted(() => vi.fn())
const trackedSetDocMock = vi.hoisted(() => vi.fn())

vi.mock('firebase/firestore', () => ({
  doc: (...parts: string[]) => ({ path: parts.join('/') })
}))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: trackedGetDocMock,
  trackedRunTransaction: trackedRunTransactionMock,
  trackedSetDoc: trackedSetDocMock
}))

import {
  FIREBASE_STRUCTURE_HEALTH_SCHEMA_VERSION,
  claimFirebaseStructureLease,
  classifyFirebaseStructureError,
  classifyFirebaseStructureOutcome,
  inspectFirebaseStructureState,
  publishFirebaseStructureHealth,
  renewFirebaseStructureLease,
  withFirebaseStructureRetry
} from '~/services/sync/firebaseStructureHealthService'

const NOW = Date.parse('2026-07-17T12:00:00.000Z')
beforeEach(() => {
  vi.clearAllMocks()
  trackedSetDocMock.mockResolvedValue(undefined)
})

const migration = {
  version: 5,
  bestRulesVersion: 5,
  status: 'completed'
}

describe('firebase structure writes', () => {
  it('acquisisce il lease senza creare una pilotDirectory parziale', async () => {
    const transaction = {
      get: vi.fn().mockResolvedValue({ data: () => ({ maintenance: {} }) }),
      set: vi.fn()
    }
    trackedRunTransactionMock.mockImplementation(
      async (_db: unknown, _caller: string, _target: unknown, callback: (tx: typeof transaction) => Promise<boolean>) => callback(transaction)
    )

    const acquired = await claimFirebaseStructureLease({
      uid: 'uid-1',
      leaseId: 'lease-1',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowIso: '2026-07-17T12:00:00.000Z'
    })

    expect(acquired).toBe(true)
    expect(transaction.set).toHaveBeenCalledOnce()
    expect(transaction.set.mock.calls[0][0]).toEqual(expect.objectContaining({ path: expect.stringContaining('users/uid-1') }))
  })

  it('non crea il mirror admin quando pilotDirectory non esiste', async () => {
    trackedGetDocMock.mockResolvedValue({ exists: () => false })

    await publishFirebaseStructureHealth({
      uid: 'uid-1',
      status: 'healthy',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      code: 'structure_verified'
    })

    expect(trackedSetDocMock).toHaveBeenCalledOnce()
    expect(trackedSetDocMock.mock.calls[0][0]).toEqual(expect.objectContaining({ path: expect.stringContaining('users/uid-1') }))
  })

  it('rinnova soltanto il lease posseduto dal client corrente', async () => {
    const transaction = {
      get: vi.fn().mockResolvedValue({
        data: () => ({
          maintenance: {
            firebaseStructureHealth: {
              status: 'repairing',
              lease: { id: 'lease-1', acquiredAt: '2026-07-17T11:55:00.000Z' }
            }
          }
        })
      }),
      set: vi.fn()
    }
    trackedRunTransactionMock.mockImplementation(
      async (_db: unknown, _caller: string, _target: unknown, callback: (tx: typeof transaction) => Promise<boolean>) => callback(transaction)
    )

    await expect(renewFirebaseStructureLease({
      uid: 'uid-1',
      leaseId: 'lease-1',
      nowIso: '2026-07-17T12:00:00.000Z'
    })).resolves.toBe(true)
    expect(transaction.set).toHaveBeenCalledOnce()

    transaction.get.mockResolvedValueOnce({
      data: () => ({
        maintenance: {
          firebaseStructureHealth: {
            status: 'repairing',
            lease: { id: 'newer-lease' }
          }
        }
      })
    })
    await expect(renewFirebaseStructureLease({
      uid: 'uid-1',
      leaseId: 'lease-1',
      nowIso: '2026-07-17T12:01:00.000Z'
    })).resolves.toBe(false)
  })

  it('impedisce a un lease obsoleto di pubblicare lo stato finale', async () => {
    const transaction = {
      get: vi.fn().mockResolvedValue({
        data: () => ({
          maintenance: {
            firebaseStructureHealth: {
              status: 'repairing',
              lease: { id: 'newer-lease' }
            }
          }
        })
      }),
      set: vi.fn()
    }
    trackedRunTransactionMock.mockImplementation(
      async (_db: unknown, _caller: string, _target: unknown, callback: (tx: typeof transaction) => Promise<boolean>) => callback(transaction)
    )

    await expect(publishFirebaseStructureHealth({
      uid: 'uid-1',
      status: 'healthy',
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      code: 'structure_verified',
      leaseId: 'stale-lease'
    })).resolves.toBe(false)
    expect(transaction.set).not.toHaveBeenCalled()
    expect(trackedGetDocMock).not.toHaveBeenCalled()
  })
})

describe('inspectFirebaseStructureState', () => {
  it('salta un health check recente e coerente', () => {
    const result = inspectFirebaseStructureState({
      migration,
      health: {
        schemaVersion: FIREBASE_STRUCTURE_HEALTH_SCHEMA_VERSION,
        migrationVersion: 5,
        bestRulesVersion: 5,
        status: 'healthy',
        checkedAt: '2026-07-17T11:00:00.000Z'
      },
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowMs: NOW
    })
    expect(result.action).toBe('skip_healthy')
  })

  it('riverifica una struttura corrente quando il health check e scaduto', () => {
    const result = inspectFirebaseStructureState({
      migration,
      health: {
        schemaVersion: FIREBASE_STRUCTURE_HEALTH_SCHEMA_VERSION,
        migrationVersion: 5,
        bestRulesVersion: 5,
        status: 'healthy',
        checkedAt: '2026-07-15T11:00:00.000Z'
      },
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowMs: NOW
    })
    expect(result.action).toBe('verify_current')
  })

  it('richiede la migrazione per una versione precedente', () => {
    const result = inspectFirebaseStructureState({
      migration: { ...migration, version: 4 },
      health: null,
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowMs: NOW
    })
    expect(result.action).toBe('migrate')
  })

  it('inizializza una struttura mancante e riprende una migrazione interrotta', () => {
    expect(inspectFirebaseStructureState({
      migration: null,
      health: null,
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowMs: NOW
    }).action).toBe('migrate')

    expect(inspectFirebaseStructureState({
      migration: {
        version: 5,
        bestRulesVersion: 5,
        status: 'running'
      },
      health: {
        status: 'repairing',
        lease: { id: 'expired', expiresAt: '2026-07-17T11:00:00.000Z' }
      },
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowMs: NOW
    }).action).toBe('migrate')
  })

  it('non esegue downgrade su una versione futura', () => {
    const result = inspectFirebaseStructureState({
      migration: { ...migration, version: 6 },
      health: null,
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowMs: NOW
    })
    expect(result.action).toBe('future_schema')
  })

  it('blocca una versione corrotta senza inventare dati', () => {
    const result = inspectFirebaseStructureState({
      migration: { ...migration, version: Number.NaN },
      health: null,
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowMs: NOW
    })
    expect(result.action).toBe('blocked_schema')
  })

  it('attende un lease concorrente ancora valido', () => {
    const result = inspectFirebaseStructureState({
      migration,
      health: {
        status: 'repairing',
        lease: { id: 'other', expiresAt: '2026-07-17T12:05:00.000Z' }
      },
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowMs: NOW
    })
    expect(result.action).toBe('wait_for_lease')
  })

  it('riprende dopo un lease scaduto', () => {
    const result = inspectFirebaseStructureState({
      migration,
      health: {
        status: 'repairing',
        lease: { id: 'old', expiresAt: '2026-07-17T11:55:00.000Z' }
      },
      targetMigrationVersion: 5,
      targetBestRulesVersion: 5,
      nowMs: NOW
    })
    expect(result.action).toBe('verify_current')
  })
})

describe('classifyFirebaseStructureOutcome', () => {
  it('mantiene lo stato parziale quando mancano raw cloud', () => {
    expect(classifyFirebaseStructureOutcome({ skippedNoRaw: 2 })).toEqual({
      status: 'partial',
      code: 'repair_completed_with_limits',
      issues: ['raw_data_unavailable']
    })
  })

  it('dichiara healthy solo senza limiti noti', () => {
    expect(classifyFirebaseStructureOutcome({})).toEqual({
      status: 'healthy',
      code: 'structure_verified',
      issues: []
    })
  })
})
describe('firebase structure transient retry', () => {
  it('ripete con backoff gli errori transitori e poi restituisce il risultato', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ code: 'firestore/unavailable' })
      .mockRejectedValueOnce({ code: 'firestore/resource-exhausted' })
      .mockResolvedValueOnce('ok')
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(withFirebaseStructureRetry(operation, {
      attempts: 3,
      baseDelayMs: 10,
      sleep
    })).resolves.toBe('ok')

    expect(operation).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[10], [20]])
  })

  it('non ripete errori permanenti', async () => {
    const operation = vi.fn().mockRejectedValue({ code: 'firestore/permission-denied' })
    const sleep = vi.fn()

    await expect(withFirebaseStructureRetry(operation, {
      attempts: 3,
      sleep
    })).rejects.toMatchObject({ code: 'firestore/permission-denied' })
    expect(operation).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })

  it('classifica quota e concorrenza come transitori, permessi come permanenti', () => {
    expect(classifyFirebaseStructureError({
      code: 'firestore/resource-exhausted'
    })).toBe('network_transient')
    expect(classifyFirebaseStructureError({
      code: 'firestore/aborted'
    })).toBe('network_transient')
    expect(classifyFirebaseStructureError({
      code: 'firestore/permission-denied'
    })).toBe('permission_denied')
  })
})
