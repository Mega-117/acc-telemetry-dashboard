// ============================================
// useElectronSync - Telemetry file sync to Firebase
// ============================================
// Public Electron sync facade used by the desktop UI.
// Internally this now separates:
// - scan (detect pending files)
// - queue (upload only pending files)
// - projection refresh (only after real changes)
// - maintenance (legacy migration / cleanup / retention / version update)

import { ref, computed } from 'vue'
import { doc, collection } from 'firebase/firestore'
import { useFirebaseAuth } from './useFirebaseAuth'
import { useTelemetryData } from './useTelemetryData'
import { endFirebaseScenario, startFirebaseScenario, trackedGetDoc, trackedGetDocs, trackedSetDoc, trackedDeleteDoc } from './useFirebaseTracker'
import { db } from '~/config/firebase'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { ensureLocalTelemetrySummariesCanonical } from '~/utils/localCanonicalSummary'
import {
    createSessionUploadService,
    calculateContentHash,
    type RegistryCacheEntry
} from '~/services/sync/sessionUploadService'
import { canonicalizeTelemetryPayload } from '~/services/sync/canonicalSummaryBridge'
import type { TrackBestProjectionDelta } from '~/services/sync/trackBestsProjectionService'
import { setupAutoSyncController } from '~/services/sync/autoSyncController'
import { createSyncScanService, type PendingSyncFile, type TelemetryFileDescriptor, type SyncScanResult } from '~/services/sync/syncScanService'
import { createSyncQueueService } from '~/services/sync/syncQueueService'
import { createSyncMaintenanceService } from '~/services/sync/syncMaintenanceService'
import { refreshSyncProjections } from '~/services/sync/syncProjectionRefreshService'
import type { UserProjectionDelta } from '~/services/sync/syncUserProjectionDeltaService'
import { resolveSyncTriggerAction, type SyncTrigger } from '~/services/sync/syncTriggerPolicy'
import { PILOT_DIRECTORY_SCHEMA_VERSION } from '~/utils/pilotDirectoryFields'
import { useOwnerDataMaintenance } from './useOwnerDataMaintenance'

const SYNC_CALLER = 'ElectronSync'
async function getDoc(ref: any) { return trackedGetDoc(ref, SYNC_CALLER) }
async function getDocs(q: any) { return trackedGetDocs(q, SYNC_CALLER) }
async function setDoc(ref: any, data: any, options?: any) {
    if (options) return trackedSetDoc(ref, data, options, SYNC_CALLER)
    return trackedSetDoc(ref, data, SYNC_CALLER)
}
async function deleteDoc(ref: any) { return trackedDeleteDoc(ref, SYNC_CALLER) }

const CHUNK_SIZE = 400000
const SYNCED_FILES_RETENTION_DAYS = 30

let localRegistryCache: Record<string, RegistryCacheEntry> | null = null
let autoSyncInitialized = false
let deferredChangedFiles: TelemetryFileDescriptor[] = []
let lastFullAutoScanCompletedAt = 0

const FULL_AUTO_SCAN_DEDUPE_MS = 5000

interface SyncResult {
    status: 'created' | 'updated' | 'unchanged' | 'skipped' | 'error'
    fileName: string
    reason?: string
    error?: string
    sessionId?: string
    projectionDelta?: TrackBestProjectionDelta
}

function mapUnchangedScanResult(file: SyncScanResult['unchangedFiles'][number]): SyncResult {
    return {
        status: 'unchanged',
        fileName: file.fileName,
        sessionId: file.sessionId,
        reason: 'registry_cache_hit'
    }
}

function mapSkippedScanResult(file: SyncScanResult['skippedFiles'][number]): SyncResult {
    if (file.reason === 'read_error') {
        return {
            status: 'error',
            fileName: file.fileName,
            error: file.error || 'read_error'
        }
    }

    return {
        status: 'skipped',
        fileName: file.fileName,
        reason: file.reason
    }
}

function shouldPersistRegistry(result: SyncResult): boolean {
    return result.status === 'created'
        || result.status === 'updated'
        || (result.status === 'unchanged' && result.reason !== 'registry_cache_hit')
}

function getTrackIdFromRaw(rawObj: any): string | null {
    return rawObj?.session_info?.track || rawObj?.track || null
}

function getElectronApi(): any | null {
    if (typeof window === 'undefined') return null
    return (window as any).electronAPI || null
}

async function updateSuiteVersion(uid: string): Promise<boolean> {
    try {
        const electronAPI = getElectronApi()
        if (!electronAPI?.getSuiteVersion) return false
        const version = await electronAPI.getSuiteVersion()
        if (!version) return false

        const userRef = doc(db, `users/${uid}`)
        const directoryRef = doc(db, `pilotDirectory/${uid}`)
        const suiteVersion = version.launcher || version.webapp || null
        const suiteVersionUpdatedAt = new Date().toISOString()
        await setDoc(userRef, {
            suiteVersion,
            suiteVersionDetail: version,
            suiteVersionUpdatedAt
        }, { merge: true })
        await setDoc(directoryRef, {
            schemaVersion: PILOT_DIRECTORY_SCHEMA_VERSION,
            uid,
            suiteVersion,
            suiteVersionUpdatedAt
        }, { merge: true })
        console.log(`[SYNC] Suite version updated: ${version.launcher}`)
        return true
    } catch (versionError: any) {
        console.warn('[SYNC] Could not update suite version:', versionError.message)
        return false
    }
}

export function useElectronSync() {
    const { currentUser } = useFirebaseAuth()
    const { loadSessions, resetAllTrackBests, clearTrackDerivedCaches } = useTelemetryData()
    const ownerDataMaintenance = useOwnerDataMaintenance()

    const isSyncing = ref(false)
    const syncProgress = ref(0)
    const syncResults = ref<SyncResult[]>([])
    const lastSyncTime = ref<Date | null>(null)
    const pendingNotification = ref<SyncResult[] | null>(null)

    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        return !!(window as any).electronAPI
    })

    const queueService = createSyncQueueService()

    async function getExistingSession(uid: string, sessionId: string) {
        const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`)
        const snap = await getDoc(sessionRef)
        return snap.exists() ? { id: sessionId, ...snap.data() } : null
    }

    async function loadRegistryCache(): Promise<Record<string, RegistryCacheEntry>> {
        if (localRegistryCache) return localRegistryCache
        try {
            const electronAPI = getElectronApi()
            if (electronAPI?.getRegistry) {
                localRegistryCache = await electronAPI.getRegistry() || {}
            } else {
                localRegistryCache = {}
            }
        } catch {
            localRegistryCache = {}
        }
        return localRegistryCache!
    }

    function canSkipViaRegistry(
        registry: Record<string, RegistryCacheEntry>,
        fileName: string,
        fileHash: string,
        uid: string
    ): boolean {
        const entry = registry[fileName]
        if (!entry) return false
        return entry.fileHash === fileHash
            && entry.uploadedBy === uid
            && Number(entry.bestRulesVersion || 0) >= BEST_RULES_VERSION
    }

    async function deleteOldChunks(uid: string, sessionId: string) {
        try {
            const chunksRef = collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`)
            const snapshot = await getDocs(chunksRef)
            await Promise.all(snapshot.docs.map((chunkDoc: any) => deleteDoc(chunkDoc.ref)))
        } catch (e: any) {
            console.warn('[SYNC] Error deleting old chunks:', e.message)
        }
    }

    async function canonicalizeSummaryFromLocalDomain(rawObj: any): Promise<any | null> {
        try {
            const result = await canonicalizeTelemetryPayload(rawObj)
            if (!result?.ok || !result?.summary) {
                console.warn('[SYNC] Local-domain canonicalization failed:', result?.error || 'missing summary')
                return null
            }
            return result.summary
        } catch (e: any) {
            console.warn('[SYNC] Local-domain canonicalization threw:', e.message)
            return null
        }
    }

    const uploadService = createSessionUploadService({
        db,
        chunkSize: CHUNK_SIZE,
        getExistingSession,
        loadRegistryCache,
        canSkipViaRegistry,
        deleteOldChunks
    })

    function getScanService() {
        return createSyncScanService({
            electronAPI: getElectronApi(),
            loadRegistryCache,
            calculateContentHash
        })
    }

    function getMaintenanceService() {
        return createSyncMaintenanceService({
            electronAPI: getElectronApi(),
            updateSuiteVersion,
            canonicalizeSummary: canonicalizeSummaryFromLocalDomain,
            getDocsFn: getDocs,
            setDocFn: setDoc,
            deleteDocFn: deleteDoc,
            db,
            bestRulesVersion: BEST_RULES_VERSION,
            syncedFilesRetentionDays: SYNCED_FILES_RETENTION_DAYS
        })
    }

    async function persistRegistryEntry(uid: string, item: PendingSyncFile, result: SyncResult) {
        const electronAPI = getElectronApi()
        if (!electronAPI?.updateRegistry) return
        const entry: RegistryCacheEntry = {
            uploadedBy: uid,
            fileHash: item.fileHash,
            sessionId: result.sessionId || item.sessionId,
            uploadedAt: new Date().toISOString(),
            mtime: item.file.mtime,
            size: item.file.size,
            bestRulesVersion: BEST_RULES_VERSION
        }
        await electronAPI.updateRegistry(item.fileName, entry)
        if (localRegistryCache) {
            localRegistryCache[item.fileName] = entry
        }
    }

    async function processPendingFiles(uid: string, pendingFiles: PendingSyncFile[]): Promise<{
        results: SyncResult[]
        changedCount: number
        dirtySessionIds: string[]
        dirtyTracks: string[]
        trackBestDeltas: TrackBestProjectionDelta[]
        userProjectionDeltas: UserProjectionDelta[]
    }> {
        if (pendingFiles.length === 0) {
            syncProgress.value = 100
            return {
                results: [],
                changedCount: 0,
                dirtySessionIds: [],
                dirtyTracks: [],
                trackBestDeltas: [],
                userProjectionDeltas: []
            }
        }

        await ensureLocalTelemetrySummariesCanonical({
            filePaths: pendingFiles.map((file) => file.filePath)
        })

        const rescanned = await getScanService().scanPendingFiles({
            ownerId: uid,
            files: pendingFiles.map((file) => file.file)
        })

        const preResults: SyncResult[] = [
            ...rescanned.unchangedFiles.map(mapUnchangedScanResult),
            ...rescanned.skippedFiles.map(mapSkippedScanResult)
        ]

        queueService.enqueue(rescanned.pendingFiles)
        const totalToUpload = Math.max(1, queueService.size())
        let processed = 0

        const drainResult = await queueService.drain<SyncResult>(async (item) => {
            syncProgress.value = Math.round((processed / totalToUpload) * 100)
            const result = await uploadService.uploadOrUpdateSession(
                item.rawObj,
                item.rawText,
                item.fileName,
                uid,
                { precomputedHash: item.fileHash }
            )
            if (shouldPersistRegistry(result)) {
                await persistRegistryEntry(uid, item, result)
            }
            processed++
            syncProgress.value = Math.round((processed / totalToUpload) * 100)

            return {
                result,
                didChange: result.status === 'created' || result.status === 'updated',
                dirtySessionId: result.sessionId || item.sessionId,
                dirtyTrack: result.projectionDelta?.trackId || getTrackIdFromRaw(item.rawObj)
            }
        })

        const trackBestDeltas = drainResult.results
            .map((result) => result.projectionDelta)
            .filter((delta): delta is TrackBestProjectionDelta => !!delta)
        const userProjectionDeltas: UserProjectionDelta[] = drainResult.results
            .filter((result) => (result.status === 'created' || result.status === 'updated') && !!result.projectionDelta)
            .map((result) => ({
                ...result.projectionDelta!,
                status: result.status as 'created' | 'updated'
            }))

        syncProgress.value = 100
        return {
            results: [...preResults, ...drainResult.results],
            changedCount: drainResult.changedCount,
            dirtySessionIds: drainResult.dirtySessionIds,
            dirtyTracks: drainResult.dirtyTracks,
            trackBestDeltas,
            userProjectionDeltas
        }
    }

    async function executeTrigger(
        trigger: SyncTrigger,
        payload?: {
            files?: TelemetryFileDescriptor[]
            uid?: string
        }
    ): Promise<SyncResult[]> {
        if (!isElectron.value) {
            console.log('[SYNC] Not running in Electron, skipping sync trigger:', trigger)
            return []
        }

        const uid = payload?.uid || currentUser.value?.uid
        if (!uid) {
            console.log('[SYNC] No user logged in, skipping sync trigger:', trigger)
            return []
        }

        if (
            (trigger === 'windowFocused' || trigger === 'initialFiles')
            && Date.now() - lastFullAutoScanCompletedAt < FULL_AUTO_SCAN_DEDUPE_MS
        ) {
            console.log('[SYNC] Full auto scan recently completed, skipping duplicate trigger:', trigger)
            return []
        }

        if (ownerDataMaintenance.blocksSync.value && trigger !== 'authReady' && trigger !== 'manualForceSync') {
            if (trigger === 'filesChanged' && payload?.files?.length) {
                deferredChangedFiles.push(...payload.files)
            }
            console.log('[SYNC] Data maintenance is running, deferring trigger:', trigger)
            return []
        }

        if (isSyncing.value) {
            if (trigger === 'filesChanged' && payload?.files?.length) {
                deferredChangedFiles.push(...payload.files)
            }
            console.log('[SYNC] Already syncing, skipping trigger:', trigger)
            return []
        }

        const action = resolveSyncTriggerAction(trigger)
        const reasonPrefix = `sync_${trigger}`
        const scenarioId = startFirebaseScenario(`sync.${trigger}`, {
            trigger,
            pendingCount: payload?.files?.length ?? null,
            interactive: action.interactive
        })

        isSyncing.value = true
        syncProgress.value = 0
        syncResults.value = []
        queueService.setStatus('idle')

        const allResults: SyncResult[] = []
        let changedCount = 0
        let needsTrackBestsRebuild = false
        let trackBestDeltas: TrackBestProjectionDelta[] = []
        let userProjectionDeltas: UserProjectionDelta[] = []
        let shouldCompleteMaintenanceAfterLocalSync = false

        try {
            if (trigger === 'filesChanged') {
                localRegistryCache = null
            }

            if (trigger === 'authReady') {
                queueService.setStatus('maintaining')
                const maintenanceGate = await ownerDataMaintenance.runGate(uid, {
                    electronAPI: getElectronApi()
                })
                shouldCompleteMaintenanceAfterLocalSync = maintenanceGate.needsSyncBeforeCompletion
            }

            queueService.setStatus('scanning')
            const scanResult = await getScanService().scanPendingFiles({
                ownerId: uid,
                files: action.scanMode === 'changed' ? payload?.files : undefined
            })

            if (trigger === 'authReady' || trigger === 'initialFiles' || trigger === 'windowFocused') {
                lastFullAutoScanCompletedAt = Date.now()
            }

            allResults.push(
                ...scanResult.unchangedFiles.map(mapUnchangedScanResult),
                ...scanResult.skippedFiles.map(mapSkippedScanResult)
            )

            if (action.processPending) {
                const pendingOutcome = await processPendingFiles(uid, scanResult.pendingFiles)
                allResults.push(...pendingOutcome.results)
                changedCount += pendingOutcome.changedCount
                trackBestDeltas = [...trackBestDeltas, ...pendingOutcome.trackBestDeltas]
                userProjectionDeltas = [...userProjectionDeltas, ...pendingOutcome.userProjectionDeltas]
            }

            if (trigger === 'manualForceSync' && action.runMaintenance) {
                queueService.setStatus('maintaining')
                const maintenance = await getMaintenanceService().runMaintenance({
                    uid,
                    interactive: true,
                    runLegacyMigration: true,
                    runZeroLapCleanup: true,
                    runRetentionCleanup: true,
                    updateVersion: true
                })
                needsTrackBestsRebuild = needsTrackBestsRebuild || maintenance.needsTrackBestsRebuild
                changedCount += maintenance.needsProjectionRefresh ? 1 : 0
            }

            queueService.setStatus('reconciling')
            await refreshSyncProjections({
                db,
                uid,
                changedCount,
                loadSessions,
                clearTrackDerivedCaches,
                resetAllTrackBests,
                getDocFn: getDoc,
                setDocFn: setDoc,
                bestRulesVersion: BEST_RULES_VERSION,
                reason: `${reasonPrefix}_projection_refresh`,
                rebuildTrackBests: needsTrackBestsRebuild,
                trackBestDeltas,
                userProjectionDeltas
            })

            if (shouldCompleteMaintenanceAfterLocalSync) {
                queueService.setStatus('maintaining')
                await ownerDataMaintenance.completeAfterLocalSync(uid)
            }

            syncResults.value = allResults
            lastSyncTime.value = new Date()

            const created = allResults.filter((r) => r.status === 'created').length
            const updated = allResults.filter((r) => r.status === 'updated').length
            const unchanged = allResults.filter((r) => r.status === 'unchanged').length
            const skipped = allResults.filter((r) => r.status === 'skipped').length
            const errors = allResults.filter((r) => r.status === 'error').length
            console.log(`[SYNC] Trigger ${trigger} complete: ${created} created, ${updated} updated, ${unchanged} unchanged, ${skipped} skipped, ${errors} errors`)

            return allResults
        } catch (error: any) {
            queueService.setStatus('error')
            console.error(`[SYNC] Trigger ${trigger} failed:`, error)
            const result = [{ status: 'error' as const, fileName: trigger, error: error?.message || 'sync_trigger_failed' }]
            syncResults.value = result
            return result
        } finally {
            queueService.setStatus('idle')
            syncProgress.value = 100
            isSyncing.value = false
            endFirebaseScenario(scenarioId)

            if (deferredChangedFiles.length > 0) {
                const files = deferredChangedFiles
                deferredChangedFiles = []
                window.setTimeout(async () => {
                    const results = await executeTrigger('filesChanged', { files })
                    notifyIfChanged(results)
                }, 0)
            }
        }
    }

    async function syncTelemetryFiles(specificFiles?: TelemetryFileDescriptor[]): Promise<SyncResult[]> {
        return executeTrigger(
            specificFiles && specificFiles.length > 0 ? 'filesChanged' : 'manualForceSync',
            specificFiles && specificFiles.length > 0 ? { files: specificFiles } : undefined
        )
    }

    function notifyIfChanged(results: SyncResult[]) {
        const synced = results.filter((r) => r.status === 'created' || r.status === 'updated')
        if (synced.length > 0) {
            console.log(`[SYNC] Auto-sync completed: ${synced.length} files synced to Firebase`)
            pendingNotification.value = results
        }
    }

    function setupAutoSync() {
        if (!isElectron.value || autoSyncInitialized) return

        const electronAPI = getElectronApi()
        if (!electronAPI) return

        autoSyncInitialized = true
        setupAutoSyncController({
            isElectron: isElectron.value,
            electronAPI,
            currentUser,
            handleTrigger: async (trigger, payload) => {
                const results = await executeTrigger(trigger, payload)
                notifyIfChanged(results)
            },
            onInitialRegistry: (data) => {
                localRegistryCache = data?.registry || {}
                console.log(`[SYNC] Initial files: ${Array.isArray(data?.files) ? data.files.length : 0}`)
            }
        })

        console.log('[SYNC] Auto-sync setup complete (scan/queue/maintenance split)')
    }

    return {
        isElectron,
        isSyncing,
        syncProgress,
        syncResults,
        lastSyncTime,
        pendingNotification,
        dataMaintenance: ownerDataMaintenance,
        syncTelemetryFiles,
        setupAutoSync
    }
}
