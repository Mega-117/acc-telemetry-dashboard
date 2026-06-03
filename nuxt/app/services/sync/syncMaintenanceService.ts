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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  electronAPI: any
  updateSuiteVersion: (uid: string) => Promise<boolean>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  canonicalizeSummary: (rawObj: any) => Promise<any | null>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  getDocsFn: (queryRef: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  deleteDocFn: (ref: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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
      runLegacyMigration = false,
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
      console.warn('[SYNC] Legacy cloud summary migration is disabled in the normal sync flow.')
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
