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
import { collection, doc } from 'firebase/firestore'
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
import {
    setupAutoSyncController,
    type CloudOwnerLease
} from '~/services/sync/autoSyncController'
import { createSyncScanService, type PendingSyncFile, type TelemetryFileDescriptor, type SyncScanResult } from '~/services/sync/syncScanService'
import { createSyncQueueService } from '~/services/sync/syncQueueService'
import { createSyncMaintenanceService } from '~/services/sync/syncMaintenanceService'
import { refreshSyncProjections } from '~/services/sync/syncProjectionRefreshService'
import type { UserProjectionDelta } from '~/services/sync/syncUserProjectionDeltaService'
import { resolveSyncTriggerAction, type SyncTrigger } from '~/services/sync/syncTriggerPolicy'
import { createOwnerOperationTracker } from '~/services/sync/ownerOperationTracker'
import { useOwnerDataMaintenance } from './useOwnerDataMaintenance'
import { getRecentActivityDateKeys, getTelemetryActivityDateKey } from '~/services/telemetry/activityProjectionService'
import { invalidateTelemetryCaches } from '~/services/cache/telemetryCacheInvalidationService'
import { createRuntimeBootstrapCoordinator } from '~/services/runtime/runtimeBootstrapCoordinator'
import {
    buildRendererBootstrapContext,
    cacheRendererMaintenanceCompatibility,
    canRunBootstrapSync,
    recordRendererBootstrapEvent,
    resolveMaintenanceMigrationResult,
    resolveRendererUpdateResult
} from '~/services/runtime/rendererRuntimeBootstrapAdapter'
import {
    OWNER_DATA_MIGRATION_VERSION,
    type OwnerDataMaintenanceReport
} from '~/services/sync/ownerDataMaintenanceService'
import {
    isRuntimeWindowOwner,
    requestRuntimeWindowManualSync
} from '~/services/runtime/runtimeWindowBridge'

const SYNC_CALLER = 'ElectronSync'
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
async function getDoc(ref: any) { return trackedGetDoc(ref, SYNC_CALLER) }
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
async function getDocs(q: any) { return trackedGetDocs(q, SYNC_CALLER) }
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
async function setDoc(ref: any, data: any, options?: any) {
    if (options) return trackedSetDoc(ref, data, options, SYNC_CALLER)
    return trackedSetDoc(ref, data, SYNC_CALLER)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
async function deleteDoc(ref: any) { return trackedDeleteDoc(ref, SYNC_CALLER) }

const CHUNK_SIZE = 400000
const SYNCED_FILES_RETENTION_DAYS = 30

let localRegistryCache: Record<string, RegistryCacheEntry> | null = null
let deferredChangedFiles: TelemetryFileDescriptor[] = []
let lastFullAutoScanCompletedAt = 0
const runtimeBootstrapCoordinator = createRuntimeBootstrapCoordinator()

const FULL_AUTO_SCAN_DEDUPE_MS = 5000
type LeaseGuard = () => boolean

function assertLeaseCurrent(isCurrent?: LeaseGuard) {
    if (isCurrent && !isCurrent()) throw new Error('cloud_owner_lease_stale')
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function getTrackIdFromRaw(rawObj: any): string | null {
    return rawObj?.session_info?.track || rawObj?.track || null
}

function getSessionIdActivityDateKey(sessionId: string | null | undefined): string | null {
    if (!sessionId) return null
    const match = String(sessionId).match(/^(\d{4})_(\d{2})_(\d{2})T/)
    if (!match) return null
    return `${match[1]}-${match[2]}-${match[3]}`
}

function getSyncResultActivityDateKey(result: SyncResult): string | null {
    return getSessionIdActivityDateKey(result.sessionId) || getTelemetryActivityDateKey(result.projectionDelta?.dateStart)
}

async function findMissingRecentSessionIndexIds(
    uid: string,
    results: SyncResult[],
    isCurrent?: LeaseGuard
): Promise<string[]> {
    const recentDateKeys = new Set(getRecentActivityDateKeys(7))
    const candidateIds = Array.from(new Set(
        results
            .filter((result) => result.status === 'unchanged' && !!result.sessionId)
            .filter((result) => {
                const dateKey = getSyncResultActivityDateKey(result)
                return !!dateKey && recentDateKeys.has(dateKey)
            })
            .map((result) => result.sessionId as string)
    ))

    if (candidateIds.length === 0) return []

    assertLeaseCurrent(isCurrent)
    const userSnap = await getDoc(doc(db, `users/${uid}`))
    assertLeaseCurrent(isCurrent)
    if (!userSnap.exists()) return candidateIds

    const sessionIndexList = userSnap.data()?.sessionIndex?.sessionsList
    const indexedIds = new Set(
        (Array.isArray(sessionIndexList) ? sessionIndexList : [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
            .map((entry: any) => String(entry?.id || ''))
            .filter(Boolean)
    )
    return candidateIds.filter((sessionId) => !indexedIds.has(sessionId))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function getElectronApi(): any | null {
    if (typeof window === 'undefined') return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    return (window as any).electronAPI || null
}

export function useElectronSync() {
    const { currentUser, canEnterApp } = useFirebaseAuth()
    const { loadSessions, resetAllTrackBests, clearTrackDerivedCaches } = useTelemetryData()
    const ownerDataMaintenance = useOwnerDataMaintenance()

    const isSyncing = ref(false)
    const syncProgress = ref(0)
    const syncResults = ref<SyncResult[]>([])
    const lastSyncTime = ref<Date | null>(null)
    const pendingNotification = ref<SyncResult[] | null>(null)
    const runtimeBootstrapState = ref(runtimeBootstrapCoordinator.getSnapshot())
    let activeCoordinatorKey: string | null = null
    const ownerOperations = createOwnerOperationTracker()

    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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
        hashes: { fileHash: string; rawDataHash: string; summaryHash: string },
        uid: string
    ): boolean {
        const entry = registry[fileName]
        if (!entry) return false
        return entry.fileHash === hashes.fileHash
            && entry.uploadedBy === uid
            && Number(entry.bestRulesVersion || 0) >= BEST_RULES_VERSION
            && (!entry.rawDataHash || entry.rawDataHash === hashes.rawDataHash)
            && (!entry.summaryHash || entry.summaryHash === hashes.summaryHash)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    async function canonicalizeSummaryFromLocalDomain(rawObj: any): Promise<any | null> {
        try {
            const result = await canonicalizeTelemetryPayload(rawObj)
            if (!result?.ok || !result?.summary) {
                console.warn('[SYNC] Local-domain canonicalization failed:', result?.error || 'missing summary')
                return null
            }
            return result.summary
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        } catch (e: any) {
            console.warn('[SYNC] Local-domain canonicalization threw:', e.message)
            return null
        }
    }

    function getUploadService(isCurrent?: LeaseGuard) {
        return createSessionUploadService({
            db,
            chunkSize: CHUNK_SIZE,
            getExistingSession,
            loadRegistryCache,
            canSkipViaRegistry,
            listExistingChunks: async (uid, sessionId) => {
                assertLeaseCurrent(isCurrent)
                const snapshot = await getDocs(collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`))
                assertLeaseCurrent(isCurrent)
                return snapshot.docs.map((chunkDoc: any) => ({ id: chunkDoc.id, ref: chunkDoc.ref }))
            },
            assertActive: () => assertLeaseCurrent(isCurrent)
        })
    }

    function getScanService() {
        return createSyncScanService({
            electronAPI: getElectronApi(),
            loadRegistryCache,
            calculateContentHash
        })
    }

    function getMaintenanceService(isCurrent?: LeaseGuard) {
        return createSyncMaintenanceService({
            electronAPI: getElectronApi(),
            updateSuiteVersion: async () => false,
            canonicalizeSummary: canonicalizeSummaryFromLocalDomain,
            getDocsFn: async (query) => {
                assertLeaseCurrent(isCurrent)
                const result = await getDocs(query)
                assertLeaseCurrent(isCurrent)
                return result
            },
            setDocFn: async (ref, data, options) => {
                assertLeaseCurrent(isCurrent)
                const result = await setDoc(ref, data, options)
                assertLeaseCurrent(isCurrent)
                return result
            },
            deleteDocFn: async (ref) => {
                assertLeaseCurrent(isCurrent)
                const result = await deleteDoc(ref)
                assertLeaseCurrent(isCurrent)
                return result
            },
            db,
            bestRulesVersion: BEST_RULES_VERSION,
            syncedFilesRetentionDays: SYNCED_FILES_RETENTION_DAYS
        })
    }

    async function persistRegistryEntry(
        uid: string,
        item: PendingSyncFile,
        result: SyncResult,
        isCurrent?: LeaseGuard
    ) {
        const electronAPI = getElectronApi()
        if (!electronAPI?.updateRegistry) return
        const entry: RegistryCacheEntry = {
            uploadedBy: uid,
            fileHash: item.fileHash,
            rawDataHash: item.rawDataHash,
            summaryHash: item.summaryHash,
            sessionId: result.sessionId || item.sessionId,
            uploadedAt: new Date().toISOString(),
            mtime: item.file.mtime,
            size: item.file.size,
            bestRulesVersion: BEST_RULES_VERSION
        }
        assertLeaseCurrent(isCurrent)
        await electronAPI.updateRegistry(item.fileName, entry)
        assertLeaseCurrent(isCurrent)
        if (localRegistryCache) {
            localRegistryCache[item.fileName] = entry
        }
    }

    async function processPendingFiles(
        uid: string,
        pendingFiles: PendingSyncFile[],
        isCurrent?: LeaseGuard
    ): Promise<{
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

        assertLeaseCurrent(isCurrent)
        await ensureLocalTelemetrySummariesCanonical({
            filePaths: pendingFiles.map((file) => file.filePath)
        })
        assertLeaseCurrent(isCurrent)

        const rescanned = await getScanService().scanPendingFiles({
            ownerId: uid,
            files: pendingFiles.map((file) => file.file)
        })
        assertLeaseCurrent(isCurrent)

        const preResults: SyncResult[] = [
            ...rescanned.unchangedFiles.map(mapUnchangedScanResult),
            ...rescanned.skippedFiles.map(mapSkippedScanResult)
        ]

        queueService.enqueue(rescanned.pendingFiles)
        const totalToUpload = Math.max(1, queueService.size())
        let processed = 0
        const uploadService = getUploadService(isCurrent)

        const drainResult = await queueService.drain<SyncResult>(async (item) => {
            assertLeaseCurrent(isCurrent)
            syncProgress.value = Math.round((processed / totalToUpload) * 100)
            const result = await uploadService.uploadOrUpdateSession(
                item.rawObj,
                item.rawText,
                item.fileName,
                uid,
                { precomputedHash: item.fileHash }
            )
            assertLeaseCurrent(isCurrent)
            if (shouldPersistRegistry(result)) {
                await persistRegistryEntry(uid, item, result, isCurrent)
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

    async function executeSyncTrigger(
        trigger: SyncTrigger,
        payload?: {
            files?: TelemetryFileDescriptor[]
            uid?: string
        },
        shouldCompleteMaintenanceAfterLocalSync = false,
        isCurrent?: LeaseGuard
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
        if (!canEnterApp.value) {
            console.log('[SYNC] Email not verified, skipping sync trigger:', trigger)
            return []
        }
        assertLeaseCurrent(isCurrent)

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

        if (action.scanMode === 'none') {
            console.log('[SYNC] Lightweight trigger acknowledged without scan:', trigger)
            return []
        }

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

        try {
            if (trigger === 'filesChanged') {
                localRegistryCache = null
            }

            queueService.setStatus('scanning')
            const scanResult = await getScanService().scanPendingFiles({
                ownerId: uid,
                files: action.scanMode === 'changed' ? (payload?.files || []) : undefined
            })
            assertLeaseCurrent(isCurrent)

            if (trigger === 'authReady' || trigger === 'initialFiles' || trigger === 'windowFocused') {
                lastFullAutoScanCompletedAt = Date.now()
            }

            allResults.push(
                ...scanResult.unchangedFiles.map(mapUnchangedScanResult),
                ...scanResult.skippedFiles.map(mapSkippedScanResult)
            )

            if (action.processPending) {
                const pendingOutcome = await processPendingFiles(uid, scanResult.pendingFiles, isCurrent)
                allResults.push(...pendingOutcome.results)
                changedCount += pendingOutcome.changedCount
                trackBestDeltas = [...trackBestDeltas, ...pendingOutcome.trackBestDeltas]
                userProjectionDeltas = [...userProjectionDeltas, ...pendingOutcome.userProjectionDeltas]
            }

            if (trigger === 'manualForceSync' && action.runMaintenance) {
                queueService.setStatus('maintaining')
                assertLeaseCurrent(isCurrent)
                const maintenance = await getMaintenanceService(isCurrent).runMaintenance({
                    uid,
                    interactive: true,
                    runLegacyMigration: false,
                    runZeroLapCleanup: true,
                    runRetentionCleanup: true,
                    updateVersion: false
                })
                assertLeaseCurrent(isCurrent)
                needsTrackBestsRebuild = needsTrackBestsRebuild || maintenance.needsTrackBestsRebuild
                changedCount += maintenance.needsProjectionRefresh ? 1 : 0
            }

            const missingRecentIndexedIds = await findMissingRecentSessionIndexIds(uid, allResults, isCurrent)
            if (missingRecentIndexedIds.length > 0) {
                changedCount += 1
                userProjectionDeltas = []
                console.warn(`[SYNC] SessionIndex stale: ${missingRecentIndexedIds.length} recent uploaded sessions missing, forcing user projection rebuild`)
            }

            queueService.setStatus('reconciling')
            const guardedSetDoc = async (ref: any, data: any, options?: any) => {
                assertLeaseCurrent(isCurrent)
                const result = await setDoc(ref, data, options)
                assertLeaseCurrent(isCurrent)
                return result
            }
            assertLeaseCurrent(isCurrent)
            await refreshSyncProjections({
                db,
                uid,
                changedCount,
                loadSessions,
                clearTrackDerivedCaches,
                resetAllTrackBests,
                getDocFn: getDoc,
                setDocFn: guardedSetDoc,
                bestRulesVersion: BEST_RULES_VERSION,
                reason: `${reasonPrefix}_projection_refresh`,
                rebuildTrackBests: needsTrackBestsRebuild,
                trackBestDeltas,
                userProjectionDeltas
            })
            assertLeaseCurrent(isCurrent)

            if (shouldCompleteMaintenanceAfterLocalSync) {
                queueService.setStatus('maintaining')
                assertLeaseCurrent(isCurrent)
                await ownerDataMaintenance.completeAfterLocalSync(uid, {
                    assertActive: () => assertLeaseCurrent(isCurrent)
                })
                assertLeaseCurrent(isCurrent)
                invalidateTelemetryCaches({ uid, scope: 'sync' })
            }

            syncResults.value = allResults
            lastSyncTime.value = new Date()

            if (changedCount > 0) {
                invalidateTelemetryCaches({ uid, scope: 'sync' })
            }

            const created = allResults.filter((r) => r.status === 'created').length
            const updated = allResults.filter((r) => r.status === 'updated').length
            const unchanged = allResults.filter((r) => r.status === 'unchanged').length
            const skipped = allResults.filter((r) => r.status === 'skipped').length
            const errors = allResults.filter((r) => r.status === 'error').length
            console.log(`[SYNC] Trigger ${trigger} complete: ${created} created, ${updated} updated, ${unchanged} unchanged, ${skipped} skipped, ${errors} errors`)

            return allResults
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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

            if ((!isCurrent || isCurrent()) && deferredChangedFiles.length > 0) {
                const files = deferredChangedFiles
                deferredChangedFiles = []
                const followUp = new Promise<void>((resolve) => {
                    window.setTimeout(async () => {
                        try {
                            if (isCurrent && !isCurrent()) return
                            const results = await executeTrigger('filesChanged', { files, uid }, isCurrent)
                            notifyIfChanged(results)
                        } catch (error) {
                            if (!isCurrent || isCurrent()) {
                                console.warn('[SYNC] Deferred filesChanged failed:', error)
                            }
                        } finally {
                            resolve()
                        }
                    }, 0)
                })
                void ownerOperations.track(followUp)
            }
        }
    }

    async function executeRuntimeBootstrap(
        payload?: { uid?: string },
        isCurrent?: LeaseGuard
    ): Promise<SyncResult[]> {
        const electronAPI = getElectronApi()
        const context = await buildRendererBootstrapContext({
            electronAPI,
            uid: payload?.uid,
            canEnterApp: canEnterApp.value,
            isOnline: typeof navigator === 'undefined' || navigator.onLine !== false,
            targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
            targetBestRulesVersion: BEST_RULES_VERSION,
            compatibilityStorage: typeof window === 'undefined' ? null : window.localStorage
        })
        assertLeaseCurrent(isCurrent)
        activeCoordinatorKey = context.coordinatorKey
        const result = await runtimeBootstrapCoordinator.run(context, {
            checkUpdate: async () => resolveRendererUpdateResult(
                await electronAPI?.getSuiteVersion?.()
            ),
            migrate: async (publishProgress) => {
                assertLeaseCurrent(isCurrent)
                queueService.setStatus('maintaining')
                const report = await ownerDataMaintenance.runGate(payload!.uid!, {
                    electronAPI,
                    assertActive: () => assertLeaseCurrent(isCurrent),
                    onProgress: (progress) => {
                        void publishProgress({
                            phase: progress.phase === 'final_audit'
                                ? 'final_verification'
                                : progress.phase,
                            progress: progress.progress,
                            status: progress.status,
                            code: progress.error || null,
                            resumedFrom: progress.resumedFrom || null
                        })
                    }
                })
                assertLeaseCurrent(isCurrent)
                cacheRendererMaintenanceCompatibility({
                    storage: typeof window === 'undefined' ? null : window.localStorage,
                    uid: payload!.uid!,
                    report,
                    targetMigrationVersion: OWNER_DATA_MIGRATION_VERSION,
                    targetBestRulesVersion: BEST_RULES_VERSION
                })
                return resolveMaintenanceMigrationResult(report as OwnerDataMaintenanceReport)
            },
            sync: async () => {
                assertLeaseCurrent(isCurrent)
                const results = await executeSyncTrigger('authReady', payload, false, isCurrent)
                if (results.some((item) => item.status === 'error')) {
                    throw new Error('sync_results_contain_errors')
                }
                return results
            },
            onEvent: async (event) => {
                if (isCurrent && !isCurrent()) return
                runtimeBootstrapState.value = runtimeBootstrapCoordinator.getSnapshot()
                await recordRendererBootstrapEvent(electronAPI, event)
            }
        })

        assertLeaseCurrent(isCurrent)
        runtimeBootstrapState.value = result
        return Array.isArray(result.syncResult) ? result.syncResult : []
    }

    async function executeTrigger(
        trigger: SyncTrigger,
        payload?: { files?: TelemetryFileDescriptor[]; uid?: string },
        isCurrent?: LeaseGuard
    ): Promise<SyncResult[]> {
        assertLeaseCurrent(isCurrent)
        if (trigger === 'authReady') return executeRuntimeBootstrap(payload, isCurrent)
        if (!canRunBootstrapSync(runtimeBootstrapState.value)) {
            if (trigger === 'filesChanged' && payload?.files?.length) {
                deferredChangedFiles.push(...payload.files)
            }
            console.log('[SYNC] Runtime bootstrap cloud capability pending, deferring trigger:', trigger)
            return []
        }
        return executeSyncTrigger(trigger, payload, false, isCurrent)
    }

    async function syncTelemetryFiles(specificFiles?: TelemetryFileDescriptor[]): Promise<SyncResult[]> {
        const electronAPI = getElectronApi()
        const response = await requestRuntimeWindowManualSync(electronAPI)
        if (response) {
            return [{
                status: 'skipped',
                fileName: specificFiles?.length ? 'filesChanged' : 'manualForceSync',
                reason: `primary_owner_${response.status}`
            }]
        }
        return []
    }

    function notifyIfChanged(results: SyncResult[]) {
        const synced = results.filter((r) => r.status === 'created' || r.status === 'updated')
        if (synced.length > 0) {
            console.log(`[SYNC] Auto-sync completed: ${synced.length} files synced to Firebase`)
            pendingNotification.value = results
        }
    }

    function setupAutoSync(options: {
        lease: CloudOwnerLease
        isLeaseCurrent: (lease: CloudOwnerLease) => boolean
    }): () => void {
        if (!isElectron.value) return () => {}

        const electronAPI = getElectronApi()
        if (!electronAPI || !isRuntimeWindowOwner(electronAPI)) return () => {}

        const isCurrent = () => options.isLeaseCurrent(options.lease)

        const disposeController = setupAutoSyncController({
            isElectron: isElectron.value,
            electronAPI,
            lease: options.lease,
            isLeaseCurrent: options.isLeaseCurrent,
            handleTrigger: async (trigger, payload) => {
                const results = await ownerOperations.track(executeTrigger(trigger, payload, isCurrent))
                notifyIfChanged(results)
                if (
                    trigger === 'authReady'
                    && (runtimeBootstrapState.value.phase !== 'ready' || results.some((item) => item.status === 'error'))
                ) {
                    throw new Error(`auth_ready_${runtimeBootstrapState.value.phase}`)
                }
            },
            onInitialRegistry: (data) => {
                localRegistryCache = data?.registry && typeof data.registry === 'object'
                    ? data.registry as Record<string, RegistryCacheEntry>
                    : {}
                console.log(`[SYNC] Initial files: ${Array.isArray(data?.files) ? data.files.length : 0}`)
            }
        })

        console.log(`[SYNC] Primary cloud owner setup complete generation=${options.lease.generation}`)
        return () => {
            disposeController()
            if (activeCoordinatorKey) runtimeBootstrapCoordinator.invalidate(activeCoordinatorKey)
            queueService.clear()
            deferredChangedFiles = []
        }
    }

    async function waitForOwnerIdle() {
        await ownerOperations.drain()
    }

    return {
        isElectron,
        isSyncing,
        syncProgress,
        syncResults,
        lastSyncTime,
        pendingNotification,
        runtimeBootstrapState,
        dataMaintenance: ownerDataMaintenance,
        syncTelemetryFiles,
        setupAutoSync,
        waitForOwnerIdle
    }
}
