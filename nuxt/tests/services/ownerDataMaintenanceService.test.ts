import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('~/services/sync/firebaseStructureHealthService', async (importOriginal) => ({
  ...await importOriginal<typeof import('~/services/sync/firebaseStructureHealthService')>(),
  createFirebaseStructureLeaseId: () => 'lease-1',
  inspectFirebaseStructureState: inspectFirebaseStructureStateMock,
  claimFirebaseStructureLease: claimFirebaseStructureLeaseMock,
  renewFirebaseStructureLease: renewFirebaseStructureLeaseMock,
  publishFirebaseStructureHealth: publishFirebaseStructureHealthMock,
  classifyFirebaseStructureOutcome: classifyFirebaseStructureOutcomeMock,
  classifyFirebaseStructureError: classifyFirebaseStructureErrorMock,
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
  afterEach(() => vi.useRealTimers())
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
    expect(rebuildOwnerProjectionsMock).toHaveBeenCalledWith('uid-1', {
      assertActive: expect.any(Function)
    })
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
    expect(reprocessOwnerCloudRawSummariesMock).toHaveBeenCalledWith('uid-1', {
      forceAll: true,
      assertActive: expect.any(Function)
    })
    expect(rebuildOwnerProjectionsMock).toHaveBeenCalledWith('uid-1', {
      assertActive: expect.any(Function)
    })
  })

  it.each(['quota_exceeded', 'permission_denied', 'network_transient', 'unknown_error'])('notifica %s senza write né dettagli privati', async (reason) => {
    classifyFirebaseStructureErrorMock.mockReturnValue(reason)
    const failure = new Error('private backend details')
    getDocMock.mockRejectedValueOnce(failure)
    const onProgress = vi.fn()
    const { runOwnerDataMaintenanceGate } = await import('~/services/sync/ownerDataMaintenanceService')
    await expect(runOwnerDataMaintenanceGate({ uid: 'uid-1', onProgress })).rejects.toBe(failure)
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', progress: 0, reason }))
    expect(JSON.stringify(onProgress.mock.calls)).not.toContain('private backend details')
    expect(claimFirebaseStructureLeaseMock).not.toHaveBeenCalled()
    expect(publishFirebaseStructureHealthMock).not.toHaveBeenCalled()
    expect(advanceCheckpointMock).not.toHaveBeenCalled()
  })

  it.each(['resolve', 'reject'])('scade a 15s e ignora read tardivo %s senza migrare', async (settlement) => {
    const { runOwnerDataMaintenanceGate } = await import('~/services/sync/ownerDataMaintenanceService')
    vi.useFakeTimers()
    let resolveRead!: (value: unknown) => void
    let rejectRead!: (error: unknown) => void
    getDocMock.mockImplementationOnce(() => new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject }))
    const onProgress = vi.fn()
    const attempt = runOwnerDataMaintenanceGate({ uid: 'uid-1', onProgress })
    const rejected = expect(attempt).rejects.toMatchObject({ code: 'maintenance_read_timeout' })
    await vi.advanceTimersByTimeAsync(14_999)
    expect(onProgress).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await rejected
    if (settlement === 'resolve') resolveRead({ exists: () => false })
    else rejectRead({ code: 'firestore/unavailable' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(claimFirebaseStructureLeaseMock).not.toHaveBeenCalled()
    expect(publishFirebaseStructureHealthMock).not.toHaveBeenCalled()
    expect(advanceCheckpointMock).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('integra gate reale e adapter browser: quota contenuta, nessun healthy, retry riuscito', async () => {
    const { useOwnerDataMaintenance } = await import('~/composables/useOwnerDataMaintenance')
    const maintenance = useOwnerDataMaintenance()
    maintenance.setBrowserOwner('qa-integration')
    classifyFirebaseStructureErrorMock.mockReturnValue('quota_exceeded')
    getDocMock.mockRejectedValueOnce({ code: 'firestore/resource-exhausted', message: 'Quota exceeded.' })
    await expect(maintenance.runBrowserGate('qa-integration')).resolves.toBeNull()
    expect(maintenance.status.value).toBe('failed')
    expect(getDocMock).toHaveBeenCalledOnce()
    expect(publishFirebaseStructureHealthMock).not.toHaveBeenCalled()
    expect(claimFirebaseStructureLeaseMock).not.toHaveBeenCalled()
    getDocMock.mockResolvedValueOnce({ exists: () => true, data: () => ({ maintenance: { canonicalDataMigration: migration } }) })
    inspectFirebaseStructureStateMock.mockReturnValue({ action: 'skip_healthy' })
    await expect(maintenance.runBrowserGate('qa-integration')).resolves.toMatchObject({ status: 'skipped' })
    expect(maintenance.status.value).toBe('skipped')
    expect(maintenance.error.value).toBeNull()
    maintenance.setBrowserOwner(null)
  })

  it('il timeout iniziale non interrompe una verifica già avviata sotto lease', async () => {
    const { runOwnerDataMaintenanceGate } = await import('~/services/sync/ownerDataMaintenanceService')
    vi.useFakeTimers()
    getDocMock.mockResolvedValueOnce({ exists: () => true, data: () => ({ maintenance: { canonicalDataMigration: migration } }) })
    inspectFirebaseStructureStateMock.mockReturnValue({ action: 'verify_current' })
    let finishVerification!: (result: unknown) => void
    verifyOwnerMigrationLightweightMock.mockImplementationOnce(() => new Promise(resolve => { finishVerification = resolve }))
    const attempt = runOwnerDataMaintenanceGate({ uid: 'uid-1' })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(claimFirebaseStructureLeaseMock).toHaveBeenCalledOnce()
    finishVerification({ ok: true, issues: [] })
    await expect(attempt).resolves.toMatchObject({ status: 'skipped' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('interrompe il vecchio owner dopo revoke senza checkpoint blocked o write successive', async () => {
    let active = true
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
    reprocessOwnerCloudRawSummariesMock.mockImplementation(async (_uid, options) => {
      expect(options.assertActive).toEqual(expect.any(Function))
      active = false
      return {
        scannedSessions: 1,
        eligibleSessions: 1,
        processedSessions: 1,
        updatedSessions: 1,
        failedSessions: 0,
        skippedNoRaw: 0
      }
    })
    const assertActive = () => {
      if (!active) throw new Error('cloud_owner_lease_stale')
    }

    const { runOwnerDataMaintenanceGate } = await import('~/services/sync/ownerDataMaintenanceService')
    await expect(runOwnerDataMaintenanceGate({ uid: 'uid-1', assertActive }))
      .rejects.toThrow('cloud_owner_lease_stale')

    expect(rebuildOwnerProjectionsMock).not.toHaveBeenCalled()
    expect(verifyOwnerMigrationLightweightMock).not.toHaveBeenCalled()
    expect(publishFirebaseStructureHealthMock).not.toHaveBeenCalled()
    expect(advanceCheckpointMock.mock.calls.some(([input]) => input.checkpoint?.phase === 'blocked')).toBe(false)
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
