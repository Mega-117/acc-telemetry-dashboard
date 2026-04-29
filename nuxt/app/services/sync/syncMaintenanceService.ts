import { migrateLegacyCloudSummaries } from './legacySummaryMigrationService'
import { cleanupZeroLapSessions } from './ghostCleanupService'

const retentionCleanupRun = new Set<string>()

export interface SyncMaintenanceResult {
  cloudMigrated: number
  cleanedZeroLap: number
  retentionRan: boolean
  suiteVersionUpdated: boolean
  needsProjectionRefresh: boolean
  needsTrackBestsRebuild: boolean
}

export function createSyncMaintenanceService(params: {
  electronAPI: any
  updateSuiteVersion: (uid: string) => Promise<boolean>
  canonicalizeSummary: (rawObj: any) => Promise<any | null>
  getDocsFn: (queryRef: any) => Promise<any>
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  deleteDocFn: (ref: any) => Promise<any>
  db: any
  bestRulesVersion: number
  syncedFilesRetentionDays: number
}) {
  const {
    electronAPI,
    updateSuiteVersion,
    canonicalizeSummary,
    getDocsFn,
    setDocFn,
    deleteDocFn,
    db,
    bestRulesVersion,
    syncedFilesRetentionDays
  } = params

  async function runMaintenance(params: {
    uid: string
    interactive?: boolean
    runLegacyMigration?: boolean
    runZeroLapCleanup?: boolean
    runRetentionCleanup?: boolean
    updateVersion?: boolean
  }): Promise<SyncMaintenanceResult> {
    const {
      uid,
      interactive = false,
      runLegacyMigration = true,
      runZeroLapCleanup = true,
      runRetentionCleanup = interactive,
      updateVersion = true
    } = params

    let cloudMigrated = 0
    let cleanedZeroLap = 0
    let retentionRan = false
    let suiteVersionUpdated = false

    if (runZeroLapCleanup) {
      cleanedZeroLap = await cleanupZeroLapSessions({
        db,
        uid,
        getDocsFn,
        deleteDocFn
      })
    }

    if (runLegacyMigration) {
      cloudMigrated = await migrateLegacyCloudSummaries({
        uid,
        bestRulesVersion,
        getDocsFn,
        setDocFn,
        canonicalizeSummary
      })
    }

    if (runRetentionCleanup && electronAPI?.cleanupSyncedFiles) {
      const retentionKey = `${uid}:${interactive ? 'interactive' : 'auto'}`
      if (interactive || !retentionCleanupRun.has(retentionKey)) {
        await electronAPI.cleanupSyncedFiles(syncedFilesRetentionDays, uid)
        retentionCleanupRun.add(retentionKey)
        retentionRan = true
      }
    }

    if (updateVersion) {
      suiteVersionUpdated = await updateSuiteVersion(uid)
    }

    return {
      cloudMigrated,
      cleanedZeroLap,
      retentionRan,
      suiteVersionUpdated,
      needsProjectionRefresh: cloudMigrated > 0 || cleanedZeroLap > 0,
      needsTrackBestsRebuild: cloudMigrated > 0 || cleanedZeroLap > 0
    }
  }

  return {
    runMaintenance
  }
}
