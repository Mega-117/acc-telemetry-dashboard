import { cleanupZeroLapSessions } from './ghostCleanupService'

const retentionCleanupRun = new Set<string>()
export const SYNC_DESTRUCTIVE_MAINTENANCE_CONFIRMATION = 'DELETE_SYNC_MAINTENANCE_DATA'
const LOCAL_CLEANUP_CONFIRMATION = 'DELETE_SYNCED_LOCAL_SESSION_FILES'

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
    getDocsFn,
    deleteDocFn,
    db,
    syncedFilesRetentionDays
  } = params

  async function runMaintenance(params: {
    uid: string
    interactive?: boolean
    runLegacyMigration?: boolean
    runZeroLapCleanup?: boolean
    runRetentionCleanup?: boolean
    updateVersion?: boolean
    destructiveConfirmation?: string
  }): Promise<SyncMaintenanceResult> {
    const {
      uid,
      interactive = false,
      runLegacyMigration = false,
      runZeroLapCleanup = false,
      runRetentionCleanup = false,
      updateVersion = true,
      destructiveConfirmation = ''
    } = params

    if (
      (runZeroLapCleanup || runRetentionCleanup)
      && destructiveConfirmation !== SYNC_DESTRUCTIVE_MAINTENANCE_CONFIRMATION
    ) {
      throw new Error('destructive-maintenance-confirmation-required')
    }

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
        await electronAPI.cleanupSyncedFiles({
          retentionDays: syncedFilesRetentionDays,
          confirmation: LOCAL_CLEANUP_CONFIRMATION
        })
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
