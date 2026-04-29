import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedSetDoc, withFirebaseScenario } from '~/composables/useFirebaseTracker'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'
import {
  auditOwnerData,
  rebuildOwnerProjections,
  reprocessOwnerCloudRawSummaries,
  type OwnerCloudSummaryReprocessReport,
  type OwnerDataAuditReport,
  type OwnerProjectionRebuildReport
} from './ownerDataRepairService'

const CALLER = 'OwnerDataMaintenance'
export const OWNER_DATA_MIGRATION_VERSION = 1

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
  | 'local_reprocess'
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
    || audit.projections.missingTrackBests.length > 0
    || audit.projections.oldTrackBests.length > 0
    || audit.projections.missingTrackDetailProjections.length > 0
    || audit.projections.oldTrackDetailProjections.length > 0
}

function needsMaintenance(audit: OwnerDataAuditReport): boolean {
  return needsSummaryMigration(audit) || needsProjectionRebuild(audit)
}

function isStoredStateCurrent(state: OwnerDataMaintenanceStoredState | null | undefined): boolean {
  return state?.status === 'completed'
    && Number(state?.version || 0) >= OWNER_DATA_MIGRATION_VERSION
    && Number(state?.bestRulesVersion || 0) >= BEST_RULES_VERSION
}

async function readStoredState(uid: string): Promise<OwnerDataMaintenanceStoredState | null> {
  const snap = await trackedGetDoc(doc(db, `users/${uid}`), CALLER)
  if (!snap.exists()) return null
  return (snap.data()?.maintenance?.canonicalDataMigration || null) as OwnerDataMaintenanceStoredState | null
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

async function hasLocalTelemetryFiles(electronAPI: any): Promise<boolean> {
  if (!electronAPI?.getTelemetryFiles) return false
  try {
    const files = await electronAPI.getTelemetryFiles()
    return Array.isArray(files) && files.length > 0
  } catch {
    return false
  }
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
    localReprocessStarted: false,
    needsSyncBeforeCompletion: false,
    completedAt: null,
    error: null,
    ...params
  }
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
      } : null
    }
  })
}

export async function runOwnerDataMaintenanceGate(
  options: OwnerDataMaintenanceRunOptions
): Promise<OwnerDataMaintenanceReport> {
  const { uid, electronAPI, force = false, onProgress } = options
  const startedAt = nowIso()

  return withFirebaseScenario('maintenance.ownerData.gate', { uid, force }, async () => {
    emit(onProgress, {
      status: 'checking',
      phase: 'checking_status',
      progress: 5,
      message: 'Controllo stato migrazione dati...'
    })

    const storedState = await readStoredState(uid)
    if (!force && isStoredStateCurrent(storedState)) {
      const report = buildReport({
        uid,
        status: 'skipped',
        phase: 'skipped',
        message: 'Migrazione dati gia completata.',
        startedAt,
        completedAt: nowIso()
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

    await writeStoredState(uid, {
      status: 'running',
      startedAt,
      completedAt: null,
      lastError: null,
      report: null
    })

    emit(onProgress, {
      status: 'checking',
      phase: 'audit',
      progress: 15,
      message: 'Audit dati cloud in corso...'
    })

    const audit = await auditOwnerData(uid)
    if (hasPermissionBlocker(audit)) {
      throw new Error('Permessi insufficienti per completare la migrazione dati owner.')
    }

    if (!force && !needsMaintenance(audit)) {
      const report = buildReport({
        uid,
        status: 'completed',
        phase: 'completed',
        message: 'Dati owner gia coerenti. Stato migrazione salvato.',
        audit,
        finalAudit: audit,
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
    }

    const canUseLocalReprocess = needsSummaryMigration(audit)
      && !!electronAPI?.reprocessTelemetrySummaries
      && await hasLocalTelemetryFiles(electronAPI)

    if (canUseLocalReprocess) {
      emit(onProgress, {
        status: 'running',
        phase: 'local_reprocess',
        progress: 35,
        message: 'Reprocess locale dei file telemetria in corso...'
      })
      const localReprocess = await electronAPI.reprocessTelemetrySummaries({})
      const report = buildReport({
        uid,
        status: 'sync_pending',
        phase: 'sync_pending',
        message: 'Reprocess locale completato. Sync file locali richiesto prima della chiusura migrazione.',
        audit,
        localReprocess,
        localReprocessStarted: true,
        needsSyncBeforeCompletion: true,
        startedAt
      })
      await writeStoredState(uid, {
        status: 'sync_pending',
        startedAt,
        completedAt: null,
        lastError: null,
        report: {
          audit: summarizeAudit(audit),
          localReprocessStarted: true
        }
      })
      emit(onProgress, {
        status: 'sync_pending',
        phase: 'sync_pending',
        progress: 55,
        message: report.message,
        report
      })
      return report
    }

    let cloudReprocess: OwnerCloudSummaryReprocessReport | null = null
    if (needsSummaryMigration(audit)) {
      emit(onProgress, {
        status: 'running',
        phase: 'cloud_reprocess',
        progress: 40,
        message: 'Reprocess dei rawChunks cloud in corso...'
      })
      cloudReprocess = await reprocessOwnerCloudRawSummaries(uid, { forceAll: false })
      if (cloudReprocess.failedSessions > 0) {
        throw new Error(`Reprocess cloud incompleto: ${cloudReprocess.failedSessions} sessioni fallite.`)
      }
    }

    emit(onProgress, {
      status: 'running',
      phase: 'rebuild',
      progress: 70,
      message: 'Ricostruzione projection owner in corso...'
    })
    const rebuild = await rebuildOwnerProjections(uid)

    emit(onProgress, {
      status: 'running',
      phase: 'final_audit',
      progress: 90,
      message: 'Audit finale migrazione dati...'
    })
    const finalAudit = await auditOwnerData(uid)
    if (hasPermissionBlocker(finalAudit) || needsMaintenance(finalAudit)) {
      throw new Error('Audit finale non pulito: migrazione dati non completata.')
    }

    const report = buildReport({
      uid,
      status: 'completed',
      phase: 'completed',
      message: 'Migrazione dati owner completata.',
      audit,
      finalAudit,
      cloudReprocess,
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
    const message = error?.message || 'Migrazione dati owner fallita.'
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
      message: 'Chiusura migrazione dopo sync locale: rebuild projection...'
    })
    const rebuild = await rebuildOwnerProjections(uid)

    emit(onProgress, {
      status: 'running',
      phase: 'final_audit',
      progress: 90,
      message: 'Audit finale dopo sync locale...'
    })
    const finalAudit = await auditOwnerData(uid)
    if (hasPermissionBlocker(finalAudit) || needsMaintenance(finalAudit)) {
      throw new Error('Audit finale dopo sync locale non pulito.')
    }

    const report = buildReport({
      uid,
      status: 'completed',
      phase: 'completed',
      message: 'Migrazione dati owner completata dopo sync locale.',
      finalAudit,
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
