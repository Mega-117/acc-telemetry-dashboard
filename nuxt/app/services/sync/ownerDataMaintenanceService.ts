import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedSetDoc, withFirebaseScenario } from '~/composables/useFirebaseTracker'
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
  type FirebaseStructureHealthState
} from './firebaseStructureHealthService'

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
}

export interface OwnerDataMaintenanceProgress {
  status: OwnerDataMaintenanceStatus
  phase: OwnerDataMaintenancePhase
  progress: number
  message: string
  report?: OwnerDataMaintenanceReport | null
  error?: string | null
}

export interface OwnerDataMaintenanceRunOptions {
  uid: string
  electronAPI?: any
  force?: boolean
  onProgress?: (progress: OwnerDataMaintenanceProgress) => void
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

async function writeStoredState(uid: string, state: OwnerDataMaintenanceStoredState) {
  await trackedSetDoc(doc(db, `users/${uid}`), sanitizeForFirestore({
    maintenance: {
      canonicalDataMigration: {
        version: OWNER_DATA_MIGRATION_VERSION,
        bestRulesVersion: BEST_RULES_VERSION,
        updatedAt: nowIso(),
        ...state
      }
    }
  }), { merge: true }, CALLER)
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
    ...params
  }
}

async function publishHealthOutcome(
  uid: string,
  input: { incompleteCloudOnly?: number; skippedNoRaw?: number } = {},
  leaseId?: string
) {
  const outcome = classifyFirebaseStructureOutcome(input)
  const published = await withFirebaseStructureRetry(() => publishFirebaseStructureHealth({
    uid,
    status: outcome.status,
    targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
    targetBestRulesVersion: BEST_RULES_VERSION,
    code: outcome.code,
    issues: outcome.issues,
    leaseId
  }))
  if (!published) throw createLeaseLostError()
}

function createLeaseLostError(): Error & { code: string } {
  const error = new Error('Lease struttura Firebase perso durante la migrazione.') as Error & { code: string }
  error.code = 'structure-lease-lost'
  return error
}

async function ensureActiveLease(uid: string, leaseId: string): Promise<void> {
  const renewed = await withFirebaseStructureRetry(() => renewFirebaseStructureLease({
    uid,
    leaseId
  }))
  if (!renewed) throw createLeaseLostError()
}

async function publishBlockedHealth(uid: string, error: unknown, leaseId: string) {
  const published = await withFirebaseStructureRetry(() => publishFirebaseStructureHealth({
    uid,
    status: 'blocked',
    targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
    targetBestRulesVersion: BEST_RULES_VERSION,
    code: classifyFirebaseStructureError(error),
    issues: [],
    leaseId
  }))
  if (!published) throw createLeaseLostError()
}

function skippedReport(
  uid: string,
  startedAt: string,
  message: string
): OwnerDataMaintenanceReport {
  return buildReport({
    uid,
    status: 'skipped',
    phase: 'skipped',
    message,
    startedAt,
    completedAt: nowIso()
  })
}

async function markCompleted(uid: string, report: OwnerDataMaintenanceReport) {
  await writeStoredState(uid, {
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
  })
}

export async function runOwnerDataMaintenanceGate(
  options: OwnerDataMaintenanceRunOptions
): Promise<OwnerDataMaintenanceReport> {
  const { uid, force = false, onProgress } = options
  const startedAt = nowIso()
  const leaseId = createFirebaseStructureLeaseId()
  let leaseAcquired = false

  return withFirebaseScenario('maintenance.ownerData.gate', { uid, force }, async () => {
    emit(onProgress, {
      status: 'checking',
      phase: 'checking_status',
      progress: 5,
      message: 'Controllo struttura dati pilota...'
    })

    const stored = await withFirebaseStructureRetry(() => readStoredState(uid))
    const storedState = stored.migration
    const healthDecision = inspectFirebaseStructureState({
      migration: storedState,
      health: stored.health,
      targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
      targetBestRulesVersion: BEST_RULES_VERSION,
      force
    })

    if (healthDecision.action === 'future_schema' || healthDecision.action === 'blocked_schema') {
      const status = healthDecision.action === 'future_schema' ? 'future_schema' : 'blocked'
      await withFirebaseStructureRetry(() => publishFirebaseStructureHealth({
        uid,
        status,
        targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
        targetBestRulesVersion: BEST_RULES_VERSION,
        code: healthDecision.code,
        issues: []
      }))
      const report = skippedReport(
        uid,
        startedAt,
        healthDecision.action === 'future_schema'
          ? 'Struttura dati creata da una versione piu recente: nessun downgrade eseguito.'
          : 'Versione struttura dati non valida: riparazione automatica bloccata.'
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
      || healthDecision.action === 'skip_partial'
      || healthDecision.action === 'wait_for_lease'
    ) {
      const message = healthDecision.action === 'wait_for_lease'
        ? 'Controllo struttura gia in corso su un altro client.'
        : healthDecision.action === 'skip_partial'
          ? 'Struttura dati verificata con limiti noti.'
          : 'Struttura dati gia verificata.'
      const report = skippedReport(uid, startedAt, message)
      emit(onProgress, {
        status: 'skipped',
        phase: 'skipped',
        progress: 100,
        message,
        report
      })
      return report
    }

    leaseAcquired = await withFirebaseStructureRetry(() => claimFirebaseStructureLease({
      uid,
      leaseId,
      targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
      targetBestRulesVersion: BEST_RULES_VERSION
    }))
    if (!leaseAcquired) {
      const report = skippedReport(uid, startedAt, 'Controllo struttura gia in corso su un altro client.')
      emit(onProgress, {
        status: 'skipped',
        phase: 'skipped',
        progress: 100,
        message: report.message,
        report
      })
      return report
    }

    let lightweightVerificationFailed = false
    if (healthDecision.action === 'verify_current' && stored.health?.status !== 'partial') {
      await ensureActiveLease(uid, leaseId)
      const verification = await withFirebaseStructureRetry(() => verifyOwnerMigrationLightweight(uid))
      if (verification.ok) {
        await publishHealthOutcome(uid, {}, leaseId)
        const report = skippedReport(uid, startedAt, 'Struttura dati verificata.')
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
      await ensureActiveLease(uid, leaseId)
      await withFirebaseStructureRetry(() => writeStoredState(uid, {
        status: 'running',
        startedAt,
        completedAt: null,
        lastError: null,
        report: null
      }))

      emit(onProgress, {
        status: 'running',
        phase: 'rebuild',
        progress: 70,
        message: 'Preparo lista sessioni ottimizzata...'
      })
      const sessionListRebuild = await withFirebaseStructureRetry(
        () => rebuildOwnerSessionListProjection(uid)
      )

      emit(onProgress, {
        status: 'running',
        phase: 'final_audit',
        progress: 90,
        message: 'Verifico lista sessioni...'
      })
      await ensureActiveLease(uid, leaseId)
      const finalVerification = await withFirebaseStructureRetry(() => verifyOwnerMigrationLightweight(uid))
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
      await ensureActiveLease(uid, leaseId)
      await withFirebaseStructureRetry(() => markCompleted(uid, report))
      await publishHealthOutcome(uid, {}, leaseId)
      emit(onProgress, {
        status: 'completed',
        phase: 'completed',
        progress: 100,
        message: report.message,
        report
      })
      return report
    }

    await ensureActiveLease(uid, leaseId)
    await withFirebaseStructureRetry(() => writeStoredState(uid, {
      status: 'running',
      startedAt,
      completedAt: null,
      lastError: null,
      report: null
    }))

    emit(onProgress, {
      status: 'checking',
      phase: 'audit',
      progress: 15,
      message: 'Controllo coerenza dati cloud...'
    })

    const audit = await withFirebaseStructureRetry(() => auditOwnerData(uid))
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
      await ensureActiveLease(uid, leaseId)
      await withFirebaseStructureRetry(() => markCompleted(uid, report))
      await publishHealthOutcome(uid, {
        incompleteCloudOnly: audit.sessions.incompleteCloudOnly
      }, leaseId)
      emit(onProgress, {
        status: 'completed',
        phase: 'completed',
        progress: 100,
        message: report.message,
        report
      })
      return report
    }

    const shouldReprocessCloudRaw = force || versionedRawReprocess || needsSummaryMigration(audit)
    let cloudReprocess: OwnerCloudSummaryReprocessReport | null = null
    if (shouldReprocessCloudRaw) {
      emit(onProgress, {
        status: 'running',
        phase: 'cloud_reprocess',
        progress: 40,
        message: 'Aggiorno Best/AVG dai dati cloud...'
      })
      cloudReprocess = await withFirebaseStructureRetry(
        () => reprocessOwnerCloudRawSummaries(uid, { forceAll: force || versionedRawReprocess })
      )
      if (cloudReprocess.failedSessions > 0) {
        throw new Error(`Reprocess cloud incompleto: ${cloudReprocess.failedSessions} sessioni fallite.`)
      }
    }

    emit(onProgress, {
      status: 'running',
      phase: 'rebuild',
      progress: 70,
      message: 'Ricostruisco riferimenti storici...'
    })
    const rebuild = await withFirebaseStructureRetry(() => rebuildOwnerProjections(uid))

    emit(onProgress, {
      status: 'running',
      phase: 'final_audit',
      progress: 90,
      message: 'Verifico aggiornamento dati...'
    })
    await ensureActiveLease(uid, leaseId)
    const finalVerification = await withFirebaseStructureRetry(() => verifyOwnerMigrationLightweight(uid))
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
    await ensureActiveLease(uid, leaseId)
    await withFirebaseStructureRetry(() => markCompleted(uid, report))
    await publishHealthOutcome(uid, {
      incompleteCloudOnly: audit.sessions.incompleteCloudOnly,
      skippedNoRaw: cloudReprocess?.skippedNoRaw
    }, leaseId)
    emit(onProgress, {
      status: 'completed',
      phase: 'completed',
      progress: 100,
      message: report.message,
      report
    })
    return report
  }).catch(async (error: any) => {
    const message = error?.message || 'Migrazione dati owner fallita.'
    if (leaseAcquired) {
      try {
        await ensureActiveLease(uid, leaseId)
        await withFirebaseStructureRetry(() => writeStoredState(uid, {
          status: 'failed',
          startedAt,
          completedAt: null,
          lastError: message,
          report: null
        }))
        await publishBlockedHealth(uid, error, leaseId)
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
  const { uid, onProgress } = options
  const startedAt = nowIso()

  return withFirebaseScenario('maintenance.ownerData.completeAfterLocalSync', { uid }, async () => {
    emit(onProgress, {
      status: 'running',
      phase: 'rebuild',
      progress: 70,
      message: 'Ricostruisco riferimenti storici...'
    })
    const rebuild = await rebuildOwnerProjections(uid)

    emit(onProgress, {
      status: 'running',
      phase: 'final_audit',
      progress: 90,
      message: 'Verifico aggiornamento dati...'
    })
    const finalVerification = await verifyOwnerMigrationLightweight(uid)
    if (!finalVerification.ok) {
      throw new Error(`Verifica finale dopo sync locale non pulita: ${finalVerification.issues.join(', ')}`)
    }

    const report = buildReport({
      uid,
      status: 'completed',
      phase: 'completed',
      message: 'Aggiornamento dati completato.',
      rebuild,
      startedAt,
      completedAt: nowIso()
    })
    await markCompleted(uid, report)
    emit(onProgress, {
      status: 'completed',
      phase: 'completed',
      progress: 100,
      message: report.message,
      report
    })
    return report
  }).catch(async (error: any) => {
    const message = error?.message || 'Chiusura migrazione dopo sync locale fallita.'
    await writeStoredState(uid, {
      status: 'failed',
      startedAt,
      completedAt: null,
      lastError: message,
      report: null
    })
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

