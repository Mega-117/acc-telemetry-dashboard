import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import {
  trackedGetDoc,
  trackedRunTransaction,
  withFirebaseScenario
} from '~/composables/useFirebaseTracker'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'
import {
  auditOwnerData,
  rebuildOwnerProjections,
  rebuildOwnerSessionListProjection,
  reprocessOwnerCloudRawSummaries,
  verifyOwnerMigrationLightweight,
  type OwnerCloudSummaryReprocessReport,
  type OwnerDataAuditReport,
  type OwnerProjectionRebuildReport,
  type OwnerSessionListProjectionRebuildReport
} from './ownerDataRepairService'
import {
  claimFirebaseStructureLease,
  classifyFirebaseStructureError,
  classifyFirebaseStructureOutcome,
  createFirebaseStructureLeaseId,
  inspectFirebaseStructureState,
  publishFirebaseStructureHealth,
  renewFirebaseStructureLease,
  withFirebaseStructureRetry,
  type FirebaseStructureHealthState,
  type FirebaseStructureHealthStatus
} from './firebaseStructureHealthService'
import {
  advanceCanonicalMigrationCheckpoint,
  buildCanonicalMigrationCheckpoint,
  nextCanonicalMigrationAttempt,
  type CanonicalMigrationCheckpoint,
  type CanonicalMigrationCheckpointPhase
} from './canonicalMigrationCheckpoint'

const CALLER = 'OwnerDataMaintenance'
export const OWNER_DATA_MIGRATION_VERSION = 5
const SESSION_LIST_ONLY_MIGRATION_VERSION = 2

export type OwnerDataMaintenanceStatus =
  | 'idle'
  | 'checking'
  | 'running'
  | 'sync_pending'
  | 'completed'
  | 'failed'
  | 'skipped'

export type OwnerDataMaintenancePhase =
  | 'idle'
  | 'checking_status'
  | 'audit'
  | 'cloud_reprocess'
  | 'sync_pending'
  | 'rebuild'
  | 'final_audit'
  | 'completed'
  | 'failed'
  | 'skipped'

export interface OwnerDataMaintenanceStoredState {
  version?: number
  bestRulesVersion?: number
  status?: OwnerDataMaintenanceStatus
  startedAt?: string | null
  completedAt?: string | null
  updatedAt?: string | null
  lastError?: string | null
  report?: Record<string, unknown> | null
  checkpoint?: CanonicalMigrationCheckpoint | null
}

interface OwnerDataMaintenanceEnvelope {
  migration: OwnerDataMaintenanceStoredState | null
  health: FirebaseStructureHealthState | null
}

export interface OwnerDataMaintenanceReport {
  uid: string
  version: number
  status: OwnerDataMaintenanceStatus
  phase: OwnerDataMaintenancePhase
  message: string
  audit?: OwnerDataAuditReport | null
  finalAudit?: OwnerDataAuditReport | null
  cloudReprocess?: OwnerCloudSummaryReprocessReport | null
  rebuild?: OwnerProjectionRebuildReport | null
  sessionListRebuild?: OwnerSessionListProjectionRebuildReport | null
  localReprocess?: unknown
  localReprocessStarted: boolean
  needsSyncBeforeCompletion: boolean
  startedAt: string
  completedAt?: string | null
  error?: string | null
  healthStatus?: FirebaseStructureHealthStatus
  healthIssues?: string[]
  healthCheckedAt?: string | null
  resumedFrom?: string | null
}

export interface OwnerDataMaintenanceProgress {
  status: OwnerDataMaintenanceStatus
  phase: OwnerDataMaintenancePhase
  progress: number
  message: string
  report?: OwnerDataMaintenanceReport | null
  error?: string | null
  resumedFrom?: string | null
}

export interface OwnerDataMaintenanceRunOptions {
  uid: string
  electronAPI?: any
  force?: boolean
  onProgress?: (progress: OwnerDataMaintenanceProgress) => void
  assertActive?: () => void
}

function nowIso(): string {
  return new Date().toISOString()
}

function summarizeAudit(audit: OwnerDataAuditReport | null | undefined) {
  if (!audit) return null
  return {
    generatedAt: audit.generatedAt,
    sessions: audit.sessions,
    rawChunks: audit.rawChunks,
    projections: {
      statsSchemaVersion: audit.projections.statsSchemaVersion,
      sessionIndexSchemaVersion: audit.projections.sessionIndexSchemaVersion,
      expectedStatsSchemaVersion: audit.projections.expectedStatsSchemaVersion,
      expectedSessionIndexSchemaVersion: audit.projections.expectedSessionIndexSchemaVersion,
      sessionListSchemaVersion: audit.projections.sessionListSchemaVersion,
      expectedSessionListSchemaVersion: audit.projections.expectedSessionListSchemaVersion,
      sessionListPageDocs: audit.projections.sessionListPageDocs,
      expectedSessionListPageDocs: audit.projections.expectedSessionListPageDocs,
      trackBestsDocs: audit.projections.trackBestsDocs,
      trackDetailProjectionDocs: audit.projections.trackDetailProjectionDocs,
      missingTrackBests: audit.projections.missingTrackBests.length,
      oldTrackBests: audit.projections.oldTrackBests.length,
      missingTrackDetailProjections: audit.projections.missingTrackDetailProjections.length,
      oldTrackDetailProjections: audit.projections.oldTrackDetailProjections.length
    },
    permissions: audit.permissions,
    issueCodes: audit.issues.map((item) => item.code)
  }
}

function hasPermissionBlocker(audit: OwnerDataAuditReport): boolean {
  return Object.values(audit.permissions).some((status) => status === 'denied')
}

function needsSummaryMigration(audit: OwnerDataAuditReport): boolean {
  return audit.sessions.legacy > 0 || audit.sessions.missingCanonical > 0
}

function needsProjectionRebuild(audit: OwnerDataAuditReport): boolean {
  return audit.projections.statsSchemaVersion !== audit.projections.expectedStatsSchemaVersion
    || audit.projections.sessionIndexSchemaVersion !== audit.projections.expectedSessionIndexSchemaVersion
    || audit.projections.sessionListSchemaVersion !== audit.projections.expectedSessionListSchemaVersion
    || audit.projections.sessionListPageDocs < audit.projections.expectedSessionListPageDocs
    || audit.projections.sessionListTotalSessions !== audit.sessions.total
    || audit.projections.missingTrackBests.length > 0
    || audit.projections.oldTrackBests.length > 0
    || audit.projections.missingTrackDetailProjections.length > 0
    || audit.projections.oldTrackDetailProjections.length > 0
}

function needsMaintenance(audit: OwnerDataAuditReport): boolean {
  return needsSummaryMigration(audit) || needsProjectionRebuild(audit)
}

function needsVersionedRawReprocess(state: OwnerDataMaintenanceStoredState | null | undefined): boolean {
  return Number(state?.version || 0) < OWNER_DATA_MIGRATION_VERSION
}


function isStoredStateReadyForSessionListUpgrade(state: OwnerDataMaintenanceStoredState | null | undefined): boolean {
  return state?.status === 'completed'
    && Number(state?.version || 0) >= 1
    && Number(state?.version || 0) < SESSION_LIST_ONLY_MIGRATION_VERSION
    && Number(state?.bestRulesVersion || 0) >= BEST_RULES_VERSION
}

async function readStoredState(uid: string): Promise<OwnerDataMaintenanceEnvelope> {
  const snap = await trackedGetDoc(doc(db, `users/${uid}`), CALLER)
  const maintenance = snap.exists() ? (snap.data()?.maintenance || {}) : {}
  return {
    migration: (maintenance.canonicalDataMigration || null) as OwnerDataMaintenanceStoredState | null,
    health: (maintenance.firebaseStructureHealth || null) as FirebaseStructureHealthState | null
  }
}

async function persistMigrationCheckpoint(input: {
  uid: string
  leaseId: string
  attempt: number
  phase: CanonicalMigrationCheckpointPhase
  resumedFrom?: string | null
  migrationPatch?: Record<string, unknown>
  assertActive?: () => void
}): Promise<CanonicalMigrationCheckpoint> {
  const assertActive = input.assertActive || (() => {})
  assertActive()
  const checkpoint = buildCanonicalMigrationCheckpoint({
    attempt: input.attempt,
    phase: input.phase,
    targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
    targetBestRulesVersion: BEST_RULES_VERSION,
    resumedFrom: input.resumedFrom
  })
  const userRef = doc(db, `users/${input.uid}`)
  const result = await advanceCanonicalMigrationCheckpoint({
    userRef,
    leaseId: input.leaseId,
    checkpoint,
    migrationPatch: sanitizeForFirestore(input.migrationPatch || {}),
    runTransaction: async (callback) => {
      assertActive()
      const result = await trackedRunTransaction(
        db,
        CALLER,
        userRef,
        async (transaction) => {
          assertActive()
          const transactionResult = await callback(transaction)
          assertActive()
          return transactionResult
        },
        { reads: 1, writes: 1 }
      )
      assertActive()
      return result
    }
  })
  assertActive()
  if (result === 'stale_lease') throw createLeaseLostError()
  if (result === 'regression_rejected') {
    throw new Error('Regressione checkpoint migration rifiutata.')
  }
  return checkpoint
}

function emit(
  onProgress: OwnerDataMaintenanceRunOptions['onProgress'],
  progress: OwnerDataMaintenanceProgress
) {
  onProgress?.(progress)
}

function buildReport(params: Partial<OwnerDataMaintenanceReport> & {
  uid: string
  status: OwnerDataMaintenanceStatus
  phase: OwnerDataMaintenancePhase
  message: string
  startedAt: string
}): OwnerDataMaintenanceReport {
  return {
    version: OWNER_DATA_MIGRATION_VERSION,
    audit: null,
    finalAudit: null,
    cloudReprocess: null,
    rebuild: null,
    sessionListRebuild: null,
    localReprocessStarted: false,
    needsSyncBeforeCompletion: false,
    completedAt: null,
    error: null,
    healthIssues: [],
    healthCheckedAt: null,
    ...params
  }
}

async function publishHealthOutcome(
  uid: string,
  input: { incompleteCloudOnly?: number; skippedNoRaw?: number } = {},
  leaseId?: string,
  assertActive: () => void = () => {}
) {
  const outcome = classifyFirebaseStructureOutcome(input)
  const checkedAt = nowIso()
  const published = await withFirebaseStructureRetry(async () => {
    assertActive()
    const result = await publishFirebaseStructureHealth({
      uid,
      status: outcome.status,
      targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
      targetBestRulesVersion: BEST_RULES_VERSION,
      code: outcome.code,
      issues: outcome.issues,
      checkedAt,
      leaseId,
      assertActive
    })
    assertActive()
    return result
  })
  if (!published) throw createLeaseLostError()
  return { ...outcome, checkedAt }
}

function createLeaseLostError(): Error & { code: string } {
  const error = new Error('Lease struttura Firebase perso durante la migrazione.') as Error & { code: string }
  error.code = 'structure-lease-lost'
  return error
}

async function ensureActiveLease(
  uid: string,
  leaseId: string,
  assertActive: () => void = () => {}
): Promise<void> {
  const renewed = await withFirebaseStructureRetry(async () => {
    assertActive()
    const result = await renewFirebaseStructureLease({ uid, leaseId, assertActive })
    assertActive()
    return result
  })
  if (!renewed) throw createLeaseLostError()
}

async function publishBlockedHealth(
  uid: string,
  error: unknown,
  leaseId: string,
  assertActive: () => void = () => {}
) {
  const published = await withFirebaseStructureRetry(async () => {
    assertActive()
    const result = await publishFirebaseStructureHealth({
      uid,
      status: 'blocked',
      targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
      targetBestRulesVersion: BEST_RULES_VERSION,
      code: classifyFirebaseStructureError(error),
      issues: [],
      leaseId,
      assertActive
    })
    assertActive()
    return result
  })
  if (!published) throw createLeaseLostError()
}

function skippedReport(
  uid: string,
  startedAt: string,
  message: string,
  healthStatus: FirebaseStructureHealthStatus
): OwnerDataMaintenanceReport {
  return buildReport({
    uid,
    status: 'skipped',
    phase: 'skipped',
    message,
    healthStatus,
    startedAt,
    completedAt: nowIso()
  })
}

async function markCompleted(input: {
  uid: string
  leaseId: string
  attempt: number
  resumedFrom?: string | null
  report: OwnerDataMaintenanceReport
  assertActive?: () => void
}) {
  const { uid, report } = input
  await persistMigrationCheckpoint({
    uid,
    leaseId: input.leaseId,
    attempt: input.attempt,
    phase: 'completed',
    resumedFrom: input.resumedFrom,
    migrationPatch: {
    status: 'completed',
    startedAt: report.startedAt,
    completedAt: report.completedAt || nowIso(),
    lastError: null,
    report: {
      status: report.status,
      phase: report.phase,
      message: report.message,
      audit: summarizeAudit(report.finalAudit || report.audit),
      cloudReprocess: report.cloudReprocess ? {
        scannedSessions: report.cloudReprocess.scannedSessions,
        eligibleSessions: report.cloudReprocess.eligibleSessions,
        updatedSessions: report.cloudReprocess.updatedSessions,
        failedSessions: report.cloudReprocess.failedSessions,
        skippedNoRaw: report.cloudReprocess.skippedNoRaw
      } : null,
      rebuild: report.rebuild ? {
        sessionCount: report.rebuild.sessionCount,
        trackCount: report.rebuild.trackCount,
        updatedTrackBests: report.rebuild.updatedTrackBests.length
      } : null,
      sessionListRebuild: report.sessionListRebuild ? {
        sessionCount: report.sessionListRebuild.sessionCount,
        pageCount: report.sessionListRebuild.pageCount,
        pageSize: report.sessionListRebuild.pageSize
      } : null
    }
    },
    assertActive: input.assertActive
  })
}

async function finalizeMaintenanceOutcome(input: {
  uid: string
  leaseId: string
  attempt: number
  resumedFrom?: string | null
  report: OwnerDataMaintenanceReport
  incompleteCloudOnly?: number
  skippedNoRaw?: number
  assertActive?: () => void
}): Promise<void> {
  const assertActive = input.assertActive || (() => {})
  assertActive()
  const outcome = classifyFirebaseStructureOutcome({
    incompleteCloudOnly: input.incompleteCloudOnly,
    skippedNoRaw: input.skippedNoRaw
  })
  if (outcome.status === 'healthy') {
    await markCompleted(input)
  } else {
    await persistMigrationCheckpoint({
      uid: input.uid,
      leaseId: input.leaseId,
      attempt: input.attempt,
      phase: 'partial',
      resumedFrom: input.resumedFrom,
      migrationPatch: {
        status: 'sync_pending',
        startedAt: input.report.startedAt,
        completedAt: null,
        lastError: null,
        report: {
          status: 'partial',
          issueCodes: outcome.issues
        }
      },
      assertActive
    })
    input.report.status = 'sync_pending'
    input.report.phase = 'sync_pending'
    input.report.needsSyncBeforeCompletion = true
  }
  const published = await publishHealthOutcome(input.uid, {
    incompleteCloudOnly: input.incompleteCloudOnly,
    skippedNoRaw: input.skippedNoRaw
  }, input.leaseId, assertActive)
  assertActive()
  input.report.healthStatus = published.status
  input.report.healthIssues = published.issues
  input.report.healthCheckedAt = published.checkedAt
}

export async function runOwnerDataMaintenanceGate(
  options: OwnerDataMaintenanceRunOptions
): Promise<OwnerDataMaintenanceReport> {
  const { uid, force = false, onProgress, assertActive = () => {} } = options
  const startedAt = nowIso()
  const leaseId = createFirebaseStructureLeaseId()
  let leaseAcquired = false
  let checkpointAttempt = 1
  let resumedFrom: string | null = null
  const retryActive = <T>(operation: () => Promise<T>) => withFirebaseStructureRetry(async () => {
    assertActive()
    const result = await operation()
    assertActive()
    return result
  })

  return withFirebaseScenario('maintenance.ownerData.gate', { uid, force }, async () => {
    assertActive()
    emit(onProgress, {
      status: 'checking',
      phase: 'checking_status',
      progress: 5,
      message: 'Controllo struttura dati pilota...'
    })

    const stored = await retryActive(() => readStoredState(uid))
    const storedState = stored.migration
    checkpointAttempt = nextCanonicalMigrationAttempt(storedState?.checkpoint)
    resumedFrom = storedState?.checkpoint?.phase || null
    const healthDecision = inspectFirebaseStructureState({
      migration: storedState,
      health: stored.health,
      targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
      targetBestRulesVersion: BEST_RULES_VERSION,
      force
    })

    if (healthDecision.action === 'future_schema' || healthDecision.action === 'blocked_schema') {
      const status = healthDecision.action === 'future_schema' ? 'future_schema' : 'blocked'
      await retryActive(() => publishFirebaseStructureHealth({
        uid,
        status,
        targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
        targetBestRulesVersion: BEST_RULES_VERSION,
        code: healthDecision.code,
        issues: [],
        assertActive
      }))
      const report = skippedReport(
        uid,
        startedAt,
        healthDecision.action === 'future_schema'
          ? 'Struttura dati creata da una versione piu recente: nessun downgrade eseguito.'
          : 'Versione struttura dati non valida: riparazione automatica bloccata.',
        status
      )
      emit(onProgress, {
        status: 'skipped',
        phase: 'skipped',
        progress: 100,
        message: report.message,
        report
      })
      return report
    }

    if (
      healthDecision.action === 'skip_healthy'
      || healthDecision.action === 'wait_for_lease'
    ) {
      const message = healthDecision.action === 'wait_for_lease'
        ? 'Controllo struttura gia in corso su un altro client.'
        : 'Struttura dati gia verificata.'
      const healthStatus = healthDecision.action === 'skip_healthy'
        ? 'healthy'
        : 'repairing'
      const report = skippedReport(uid, startedAt, message, healthStatus)
      report.healthIssues = (stored.health?.issues || []).slice(0, 20)
      report.healthCheckedAt = stored.health?.checkedAt || null
      report.resumedFrom = resumedFrom
      emit(onProgress, {
        status: 'skipped',
        phase: 'skipped',
        progress: 100,
        message,
        report
      })
      return report
    }

    leaseAcquired = await retryActive(() => claimFirebaseStructureLease({
      uid,
      leaseId,
      targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
      targetBestRulesVersion: BEST_RULES_VERSION,
      assertActive
    }))
    if (!leaseAcquired) {
      const report = skippedReport(
        uid,
        startedAt,
        'Controllo struttura gia in corso su un altro client.',
        'repairing'
      )
      emit(onProgress, {
        status: 'skipped',
        phase: 'skipped',
        progress: 100,
        message: report.message,
        report
      })
      return report
    }

    await persistMigrationCheckpoint({
      uid,
      leaseId,
      attempt: checkpointAttempt,
      phase: 'checking_status',
      resumedFrom,
      migrationPatch: {
        status: 'running',
        startedAt,
        completedAt: null,
        lastError: null,
        report: null
      },
      assertActive
    })

    let lightweightVerificationFailed = false
    if (healthDecision.action === 'verify_current' && stored.health?.status !== 'partial') {
      await ensureActiveLease(uid, leaseId, assertActive)
      const verification = await retryActive(() => verifyOwnerMigrationLightweight(uid))
      if (verification.ok) {
        const report = skippedReport(uid, startedAt, 'Struttura dati verificata.', 'healthy')
        report.resumedFrom = resumedFrom
        await finalizeMaintenanceOutcome({
          uid,
          leaseId,
          attempt: checkpointAttempt,
          resumedFrom,
          report,
          assertActive
        })
        emit(onProgress, {
          status: 'skipped',
          phase: 'skipped',
          progress: 100,
          message: report.message,
          report
        })
        return report
      }
      lightweightVerificationFailed = true
    }

    if (!force && isStoredStateReadyForSessionListUpgrade(storedState)) {
      await ensureActiveLease(uid, leaseId, assertActive)
      await persistMigrationCheckpoint({
        uid,
        leaseId,
        attempt: checkpointAttempt,
        phase: 'rebuild',
        resumedFrom,
        assertActive
      })

      emit(onProgress, {
        status: 'running',
        phase: 'rebuild',
        progress: 70,
        message: 'Preparo lista sessioni ottimizzata...',
        resumedFrom
      })
      const sessionListRebuild = await retryActive(
        () => rebuildOwnerSessionListProjection(uid, { assertActive })
      )

      emit(onProgress, {
        status: 'running',
        phase: 'final_audit',
        progress: 90,
        message: 'Verifico lista sessioni...'
      })
      await ensureActiveLease(uid, leaseId, assertActive)
      await persistMigrationCheckpoint({
        uid,
        leaseId,
        attempt: checkpointAttempt,
        phase: 'final_verification',
        resumedFrom,
        assertActive
      })
      const finalVerification = await retryActive(() => verifyOwnerMigrationLightweight(uid))
      if (!finalVerification.ok) {
        throw new Error(`Verifica lista sessioni non pulita: ${finalVerification.issues.join(', ')}`)
      }

      const report = buildReport({
        uid,
        status: 'completed',
        phase: 'completed',
        message: 'Lista sessioni ottimizzata completata.',
        sessionListRebuild,
        startedAt,
        completedAt: nowIso()
      })
      await ensureActiveLease(uid, leaseId, assertActive)
      await finalizeMaintenanceOutcome({
        uid,
        leaseId,
        attempt: checkpointAttempt,
        resumedFrom,
        report,
        assertActive
      })
      emit(onProgress, {
        status: report.status,
        phase: report.phase,
        progress: 100,
        message: report.message,
        report
      })
      return report
    }

    await ensureActiveLease(uid, leaseId, assertActive)
    await persistMigrationCheckpoint({
      uid,
      leaseId,
      attempt: checkpointAttempt,
      phase: 'audit',
      resumedFrom,
      assertActive
    })

    emit(onProgress, {
      status: 'checking',
      phase: 'audit',
      progress: 15,
      message: 'Controllo coerenza dati cloud...',
      resumedFrom
    })

    const audit = await retryActive(() => auditOwnerData(uid))
    if (hasPermissionBlocker(audit)) {
      throw new Error('Permessi insufficienti per completare la migrazione dati owner.')
    }

    const versionedRawReprocess = needsVersionedRawReprocess(storedState)
    if (!force && !versionedRawReprocess && !needsMaintenance(audit) && !lightweightVerificationFailed) {
      const report = buildReport({
        uid,
        status: 'completed',
        phase: 'completed',
        message: 'Dati pilota gia coerenti. Stato aggiornamento salvato.',
        audit,
        finalAudit: audit,
        startedAt,
        completedAt: nowIso()
      })
      await ensureActiveLease(uid, leaseId, assertActive)
      await finalizeMaintenanceOutcome({
        uid,
        leaseId,
        attempt: checkpointAttempt,
        resumedFrom,
        report,
        incompleteCloudOnly: audit.sessions.incompleteCloudOnly,
        assertActive
      })
      emit(onProgress, {
        status: report.status,
        phase: report.phase,
        progress: 100,
        message: report.message,
        report
      })
      return report
    }

    const shouldReprocessCloudRaw = force || versionedRawReprocess || needsSummaryMigration(audit)
    let cloudReprocess: OwnerCloudSummaryReprocessReport | null = null
    if (shouldReprocessCloudRaw) {
      await ensureActiveLease(uid, leaseId, assertActive)
      await persistMigrationCheckpoint({
        uid,
        leaseId,
        attempt: checkpointAttempt,
        phase: 'cloud_reprocess',
        resumedFrom,
        assertActive
      })
      emit(onProgress, {
        status: 'running',
        phase: 'cloud_reprocess',
        progress: 40,
        message: 'Aggiorno Best/AVG dai dati cloud...'
      })
      cloudReprocess = await retryActive(
        () => reprocessOwnerCloudRawSummaries(uid, {
          forceAll: force || versionedRawReprocess,
          assertActive
        })
      )
      if (cloudReprocess.failedSessions > 0) {
        throw new Error(`Reprocess cloud incompleto: ${cloudReprocess.failedSessions} sessioni fallite.`)
      }
    }

    await ensureActiveLease(uid, leaseId, assertActive)
    await persistMigrationCheckpoint({
      uid,
      leaseId,
      attempt: checkpointAttempt,
      phase: 'rebuild',
      resumedFrom,
      assertActive
    })
    emit(onProgress, {
      status: 'running',
      phase: 'rebuild',
      progress: 70,
      message: 'Ricostruisco riferimenti storici...'
    })
    const rebuild = await retryActive(() => rebuildOwnerProjections(uid, { assertActive }))

    emit(onProgress, {
      status: 'running',
      phase: 'final_audit',
      progress: 90,
      message: 'Verifico aggiornamento dati...'
    })
    await ensureActiveLease(uid, leaseId, assertActive)
    await persistMigrationCheckpoint({
      uid,
      leaseId,
      attempt: checkpointAttempt,
      phase: 'final_verification',
      resumedFrom,
      assertActive
    })
    const finalVerification = await retryActive(() => verifyOwnerMigrationLightweight(uid))
    if (!finalVerification.ok) {
      throw new Error(`Verifica finale non pulita: ${finalVerification.issues.join(', ')}`)
    }

    const report = buildReport({
      uid,
      status: 'completed',
      phase: 'completed',
      message: 'Aggiornamento dati completato.',
      audit,
      cloudReprocess,
      rebuild,
      startedAt,
      completedAt: nowIso()
    })
    await ensureActiveLease(uid, leaseId, assertActive)
    await finalizeMaintenanceOutcome({
      uid,
      leaseId,
      attempt: checkpointAttempt,
      resumedFrom,
      report,
      incompleteCloudOnly: audit.sessions.incompleteCloudOnly,
      skippedNoRaw: cloudReprocess?.skippedNoRaw,
      assertActive
    })
    emit(onProgress, {
      status: report.status,
      phase: report.phase,
      progress: 100,
      message: report.message,
      report
    })
    return report
  }).catch(async (error: any) => {
    if (error?.message === 'cloud_owner_lease_stale') throw error
    const message = error?.message || 'Migrazione dati owner fallita.'
    if (leaseAcquired) {
      try {
        await ensureActiveLease(uid, leaseId, assertActive)
        await persistMigrationCheckpoint({
          uid,
          leaseId,
          attempt: checkpointAttempt,
          phase: 'blocked',
          resumedFrom,
          migrationPatch: {
            status: 'failed',
            startedAt,
            completedAt: null,
            lastError: message,
            report: null
          },
          assertActive
        })
        await publishBlockedHealth(uid, error, leaseId, assertActive)
      } catch {
        // A stale client must not overwrite the state owned by a newer lease.
      }
    }
    emit(onProgress, {
      status: 'failed',
      phase: 'failed',
      progress: 100,
      message,
      error: message
    })
    throw error
  })
}
export async function completeOwnerDataMaintenanceAfterLocalSync(
  options: OwnerDataMaintenanceRunOptions
): Promise<OwnerDataMaintenanceReport> {
  // The post-sync verification is a new lease-scoped attempt, never an
  // unguarded continuation of a lease that may have expired during uploads.
  return runOwnerDataMaintenanceGate({ ...options, force: true })
}

