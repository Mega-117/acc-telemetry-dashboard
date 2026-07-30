import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDocMock = vi.hoisted(() => vi.fn())
const setDocMock = vi.hoisted(() => vi.fn())
const auditOwnerDataMock = vi.hoisted(() => vi.fn())
const rebuildOwnerProjectionsMock = vi.hoisted(() => vi.fn())
const rebuildOwnerSessionListProjectionMock = vi.hoisted(() => vi.fn())
const reprocessOwnerCloudRawSummariesMock = vi.hoisted(() => vi.fn())
const verifyOwnerMigrationLightweightMock = vi.hoisted(() => vi.fn())
const inspectFirebaseStructureStateMock = vi.hoisted(() => vi.fn())
const claimFirebaseStructureLeaseMock = vi.hoisted(() => vi.fn())
const renewFirebaseStructureLeaseMock = vi.hoisted(() => vi.fn())
const publishFirebaseStructureHealthMock = vi.hoisted(() => vi.fn())
const classifyFirebaseStructureOutcomeMock = vi.hoisted(() => vi.fn())
const classifyFirebaseStructureErrorMock = vi.hoisted(() => vi.fn())
const advanceCheckpointMock = vi.hoisted(() => vi.fn())

vi.mock('firebase/firestore', () => ({
  doc: (...parts: string[]) => ({ path: parts.join('/') })
}))

vi.mock('~/config/firebase', () => ({ db: {} }))

vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: getDocMock,
  trackedRunTransaction: vi.fn(),
  trackedSetDoc: setDocMock,
  withFirebaseScenario: (_name: string, _meta: unknown, fn: () => Promise<unknown>) => fn()
}))

vi.mock('~/services/sync/canonicalMigrationCheckpoint', () => ({
  nextCanonicalMigrationAttempt: (checkpoint: { attempt?: number } | null) => Number(checkpoint?.attempt || 0) + 1,
  buildCanonicalMigrationCheckpoint: (input: Record<string, unknown>) => ({
    schemaVersion: 1,
    sequence: (Number(input.attempt) * 1000) + 10,
    ...input
  }),
  advanceCanonicalMigrationCheckpoint: advanceCheckpointMock
}))

vi.mock('~/services/sync/firebaseStructureHealthService', () => ({
  createFirebaseStructureLeaseId: () => 'lease-1',
  inspectFirebaseStructureState: inspectFirebaseStructureStateMock,
  claimFirebaseStructureLease: claimFirebaseStructureLeaseMock,
  renewFirebaseStructureLease: renewFirebaseStructureLeaseMock,
  publishFirebaseStructureHealth: publishFirebaseStructureHealthMock,
  classifyFirebaseStructureOutcome: classifyFirebaseStructureOutcomeMock,
  classifyFirebaseStructureError: classifyFirebaseStructureErrorMock,
  withFirebaseStructureRetry: (operation: () => Promise<unknown>) => operation()
}))

vi.mock('~/services/sync/ownerDataRepairService', () => ({
  auditOwnerData: auditOwnerDataMock,
  rebuildOwnerProjections: rebuildOwnerProjectionsMock,
  rebuildOwnerSessionListProjection: rebuildOwnerSessionListProjectionMock,
  reprocessOwnerCloudRawSummaries: reprocessOwnerCloudRawSummariesMock,
  verifyOwnerMigrationLightweight: verifyOwnerMigrationLightweightMock
}))

const migration = {
  version: 5,
  bestRulesVersion: 5,
  status: 'completed'
}

function cleanAudit() {
  return {
    generatedAt: '2026-06-21T00:00:00.000Z',
    uid: 'uid-1',
    sessions: {
      total: 1,
      canonical: 1,
      legacy: 0,
      missingCanonical: 0,
      incompleteCloudOnly: 0,
      zeroLaps: 0
    },
    rawChunks: { present: 1, missing: 0, unknown: 0, probed: 1 },
    projections: {
      statsSchemaVersion: 1,
      expectedStatsSchemaVersion: 1,
      sessionIndexSchemaVersion: 2,
      expectedSessionIndexSchemaVersion: 2,
      sessionListSchemaVersion: 1,
      expectedSessionListSchemaVersion: 1,
      sessionListTotalSessions: 1,
      sessionListPageDocs: 1,
      expectedSessionListPageDocs: 1,
      trackBestsDocs: 1,
      trackDetailProjectionDocs: 1,
      missingTrackBests: [],
      oldTrackBests: [],
      missingTrackDetailProjections: [],
      oldTrackDetailProjections: []
    },
    permissions: {
      user: 'ok',
      sessions: 'ok',
      rawChunks: 'ok',
      trackBests: 'ok',
      trackDetailProjections: 'ok',
      sessionListProjection: 'ok'
    },
    issues: [],
    canRebuildProjections: true,
    canReprocessFromCloudRaw: true
  }
}

describe('runOwnerDataMaintenanceGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setDocMock.mockResolvedValue(undefined)
    auditOwnerDataMock.mockResolvedValue(cleanAudit())
    reprocessOwnerCloudRawSummariesMock.mockResolvedValue({
      scannedSessions: 1,
      eligibleSessions: 1,
      processedSessions: 1,
      updatedSessions: 1,
      failedSessions: 0,
      skippedNoRaw: 0
    })
    rebuildOwnerProjectionsMock.mockResolvedValue({ sessionCount: 1, trackCount: 1, updatedTrackBests: ['watkins_glen'] })
    rebuildOwnerSessionListProjectionMock.mockResolvedValue({ sessionCount: 1, pageCount: 1, pageSize: 100 })
    verifyOwnerMigrationLightweightMock.mockResolvedValue({ ok: true, issues: [] })
    inspectFirebaseStructureStateMock.mockReturnValue({ action: 'migrate', code: 'migration_required' })
    claimFirebaseStructureLeaseMock.mockResolvedValue(true)
    renewFirebaseStructureLeaseMock.mockResolvedValue(true)
    publishFirebaseStructureHealthMock.mockResolvedValue(true)
    classifyFirebaseStructureOutcomeMock.mockReturnValue({
      status: 'healthy',
      code: 'structure_verified',
      issues: []
    })
    classifyFirebaseStructureErrorMock.mockReturnValue('unknown_error')
    advanceCheckpointMock.mockResolvedValue('advanced')
  })

  it('salta audit e repair quando lo stato health recente e sano', async () => {
    inspectFirebaseStructureStateMock.mockReturnValue({
      action: 'skip_healthy',
      code: 'healthy_recently_verified'
    })
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        maintenance: {
          canonicalDataMigration: migration
        }
      })
    })

    const { runOwnerDataMaintenanceGate } = await import('~/services/sync/ownerDataMaintenanceService')
    const report = await runOwnerDataMaintenanceGate({ uid: 'uid-1' })

    expect(report.status).toBe('skipped')
    expect(claimFirebaseStructureLeaseMock).not.toHaveBeenCalled()
    expect(auditOwnerDataMock).not.toHaveBeenCalled()
  })

  it('non esegue downgrade quando incontra una struttura futura', async () => {
    inspectFirebaseStructureStateMock.mockReturnValue({
      action: 'future_schema',
      code: 'future_schema_detected'
    })
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ maintenance: { canonicalDataMigration: { ...migration, version: 6 } } })
    })

    const { runOwnerDataMaintenanceGate } = await import('~/services/sync/ownerDataMaintenanceService')
    const report = await runOwnerDataMaintenanceGate({ uid: 'uid-1' })

    expect(report.status).toBe('skipped')
    expect(publishFirebaseStructureHealthMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'future_schema' })
    )
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('verifica in modo leggero una migrazione corrente con health scaduto', async () => {
    inspectFirebaseStructureStateMock.mockReturnValue({
      action: 'verify_current',
      code: 'health_verification_required'
    })
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ maintenance: { canonicalDataMigration: migration } })
    })

    const { runOwnerDataMaintenanceGate } = await import('~/services/sync/ownerDataMaintenanceService')
    const report = await runOwnerDataMaintenanceGate({ uid: 'uid-1' })

    expect(report.status).toBe('skipped')
    expect(claimFirebaseStructureLeaseMock).toHaveBeenCalledOnce()
    expect(verifyOwnerMigrationLightweightMock).toHaveBeenCalledWith('uid-1')
    expect(auditOwnerDataMock).not.toHaveBeenCalled()
  })

  it('forza il rebuild quando la verifica leggera fallisce anche se audit e pulito', async () => {
    inspectFirebaseStructureStateMock.mockReturnValue({
      action: 'verify_current',
      code: 'health_verification_required'
    })
    verifyOwnerMigrationLightweightMock
      .mockResolvedValueOnce({ ok: false, issues: ['pilot_directory_missing_or_invalid'] })
      .mockResolvedValueOnce({ ok: true, issues: [] })
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ maintenance: { canonicalDataMigration: migration } })
    })

    const { runOwnerDataMaintenanceGate } = await import('~/services/sync/ownerDataMaintenanceService')
    const report = await runOwnerDataMaintenanceGate({ uid: 'uid-1' })

    expect(report.status).toBe('completed')
    expect(auditOwnerDataMock).toHaveBeenCalledWith('uid-1')
    expect(rebuildOwnerProjectionsMock).toHaveBeenCalledWith('uid-1')
  })

  it('riesegue audit completo per uno stato partial scaduto', async () => {
    inspectFirebaseStructureStateMock.mockReturnValue({
      action: 'verify_current',
      code: 'health_verification_required'
    })
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        maintenance: {
          canonicalDataMigration: migration,
          firebaseStructureHealth: { status: 'partial' }
        }
      })
    })

    const { runOwnerDataMaintenanceGate } = await import('~/services/sync/ownerDataMaintenanceService')
    const report = await runOwnerDataMaintenanceGate({ uid: 'uid-1' })

    expect(report.status).toBe('completed')
    expect(auditOwnerDataMock).toHaveBeenCalledWith('uid-1')
  })

  it('forza reprocess raw completo quando la versione migration sale anche se audit e projection sono puliti', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        maintenance: {
          canonicalDataMigration: {
            version: 4,
            bestRulesVersion: 5,
            status: 'completed'
          }
        }
      })
    })

    const { runOwnerDataMaintenanceGate } = await import('~/services/sync/ownerDataMaintenanceService')

    const report = await runOwnerDataMaintenanceGate({ uid: 'uid-1' })

    expect(report.status).toBe('completed')
    expect(reprocessOwnerCloudRawSummariesMock).toHaveBeenCalledWith('uid-1', { forceAll: true })
    expect(rebuildOwnerProjectionsMock).toHaveBeenCalledWith('uid-1')
  })

  it('mantiene partial recuperabile e abilita il normale sync per nuovi raw', async () => {
    const audit = cleanAudit()
    audit.sessions.incompleteCloudOnly = 1
    audit.sessions.legacy = 1
    audit.sessions.canonical = 0
    auditOwnerDataMock.mockResolvedValue(audit)
    reprocessOwnerCloudRawSummariesMock.mockResolvedValue({
      scannedSessions: 1,
      eligibleSessions: 1,
      processedSessions: 0,
      updatedSessions: 0,
      failedSessions: 0,
      skippedNoRaw: 1
    })
    classifyFirebaseStructureOutcomeMock.mockReturnValue({
      status: 'partial',
      code: 'repair_completed_with_limits',
      issues: ['incomplete_cloud_only', 'raw_data_unavailable']
    })
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ maintenance: { canonicalDataMigration: migration } })
    })

    const { runOwnerDataMaintenanceGate } = await import('~/services/sync/ownerDataMaintenanceService')
    const report = await runOwnerDataMaintenanceGate({ uid: 'uid-1' })

    expect(report).toMatchObject({
      status: 'sync_pending',
      phase: 'sync_pending',
      needsSyncBeforeCompletion: true,
      healthStatus: 'partial',
      healthIssues: ['incomplete_cloud_only', 'raw_data_unavailable']
    })
    expect(advanceCheckpointMock).toHaveBeenCalledWith(expect.objectContaining({
      checkpoint: expect.objectContaining({ phase: 'partial' })
    }))
  })
})
