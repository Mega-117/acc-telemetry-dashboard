// ============================================
// useElectronSync - Telemetry file sync to Firebase
// ============================================
// Handles reading files from Electron, validating ownership,
// uploading to Firebase, and refreshing the dashboard.
// The composable now acts as a thin facade over dedicated sync services.

import { ref, computed } from 'vue'
import { useFirebaseAuth } from './useFirebaseAuth'
import { useTelemetryData } from './useTelemetryData'
import { doc, collection } from 'firebase/firestore'
import { trackedGetDoc, trackedGetDocs, trackedSetDoc, trackedDeleteDoc } from './useFirebaseTracker'
import { db } from '~/config/firebase'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { ensureLocalTelemetrySummariesCanonical } from '~/utils/localCanonicalSummary'
import {
    createSessionUploadService,
    calculateContentHash,
    type RegistryCacheEntry
} from '~/services/sync/sessionUploadService'
import {
    canonicalizeTelemetryPayload
} from '~/services/sync/canonicalSummaryBridge'
import { migrateLegacyCloudSummaries } from '~/services/sync/legacySummaryMigrationService'
import { updateTrackBestsProjection } from '~/services/sync/trackBestsProjectionService'
import {
    rebuildTrackBestsProjection,
    writeUserProjectionDocuments
} from '~/services/sync/projectionRebuildService'
import { cleanupZeroLapSessions as cleanupZeroLapGhosts } from '~/services/sync/ghostCleanupService'
import { setupAutoSyncController } from '~/services/sync/autoSyncController'

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

interface TelemetryFile {
    name: string
    path: string
    mtime: number
    size: number
}

interface SyncResult {
    status: 'created' | 'updated' | 'unchanged' | 'skipped' | 'error'
    fileName: string
    reason?: string
    error?: string
    sessionId?: string
}

async function updateSuiteVersion(uid: string) {
    try {
        const electronAPI = (window as any).electronAPI
        if (!electronAPI?.getSuiteVersion) return
        const version = await electronAPI.getSuiteVersion()
        if (!version) return

        const userRef = doc(db, `users/${uid}`)
        await setDoc(userRef, {
            suiteVersion: version.launcher || version.webapp || null,
            suiteVersionDetail: version,
            suiteVersionUpdatedAt: new Date().toISOString()
        }, { merge: true })
        console.log(`[SYNC] Suite version updated: ${version.launcher}`)
    } catch (versionError: any) {
        console.warn('[SYNC] Could not update suite version:', versionError.message)
    }
}

export function useElectronSync() {
    const { currentUser } = useFirebaseAuth()
    const { loadSessions, resetAllTrackBests, clearTrackDerivedCaches } = useTelemetryData()

    const isSyncing = ref(false)
    const syncProgress = ref(0)
    const syncResults = ref<SyncResult[]>([])
    const lastSyncTime = ref<Date | null>(null)
    const pendingNotification = ref<SyncResult[] | null>(null)

    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        return !!(window as any).electronAPI
    })

    async function getExistingSession(uid: string, sessionId: string) {
        const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`)
        const snap = await getDoc(sessionRef)
        return snap.exists() ? { id: sessionId, ...snap.data() } : null
    }

    async function loadRegistryCache(): Promise<Record<string, RegistryCacheEntry>> {
        if (localRegistryCache) return localRegistryCache
        try {
            const electronAPI = (window as any).electronAPI
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
        return entry.fileHash === fileHash && entry.uploadedBy === uid
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

    async function updateTrackBests(
        uid: string,
        trackId: string,
        sessionId: string,
        dateStart: string,
        summary: any,
        car?: string
    ) {
        return updateTrackBestsProjection({
            db,
            uid,
            trackId,
            sessionId,
            dateStart,
            summary,
            car,
            getDocFn: getDoc,
            setDocFn: setDoc,
            bestRulesVersion: BEST_RULES_VERSION
        })
    }

    const uploadService = createSessionUploadService({
        db,
        chunkSize: CHUNK_SIZE,
        getExistingSession,
        loadRegistryCache,
        canSkipViaRegistry,
        deleteOldChunks,
        updateTrackBests
    })

    async function syncTelemetryFiles(specificFiles?: TelemetryFile[]): Promise<SyncResult[]> {
        if (!isElectron.value) {
            console.log('[SYNC] Not running in Electron, skipping sync')
            return []
        }

        if (!currentUser.value) {
            console.log('[SYNC] No user logged in, skipping sync')
            return []
        }

        if (isSyncing.value) {
            console.log('[SYNC] Already syncing, skipping')
            return []
        }

        isSyncing.value = true
        syncProgress.value = 0
        syncResults.value = []

        const uid = currentUser.value.uid
        const electronAPI = (window as any).electronAPI
        const results: SyncResult[] = []

        try {
            const files: TelemetryFile[] = specificFiles || await electronAPI.getTelemetryFiles()
            const mode = specificFiles ? 'incremental' : 'full'
            console.log(`[SYNC] ${mode} sync: ${files.length} files to process`)

            if (files.length === 0) {
                return []
            }

            await ensureLocalTelemetrySummariesCanonical({
                filePaths: files.map((file) => file.path)
            })

            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                if (!file) continue
                syncProgress.value = Math.round((i / files.length) * 100)

                try {
                    const rawObj = await electronAPI.readFile(file.path)
                    if (!rawObj) {
                        results.push({ status: 'error', fileName: file.name, error: 'Could not read file' })
                        continue
                    }

                    const rawText = JSON.stringify(rawObj)
                    const result = await uploadService.uploadOrUpdateSession(rawObj, rawText, file.name, uid)
                    results.push(result)

                    if (result.status === 'created' || result.status === 'updated' || (result.status === 'unchanged' && result.reason !== 'registry_cache_hit')) {
                        const fileHash = await calculateContentHash(rawText)
                        const entry: RegistryCacheEntry = {
                            uploadedBy: uid,
                            fileHash,
                            sessionId: result.sessionId || '',
                            uploadedAt: new Date().toISOString(),
                            mtime: file.mtime,
                            size: file.size
                        }
                        await electronAPI.updateRegistry?.(file.name, entry)
                        if (localRegistryCache) {
                            localRegistryCache[file.name] = entry
                        }
                    }
                } catch (error: any) {
                    console.error(`[SYNC] Error processing ${file.name}:`, error)
                    results.push({ status: 'error', fileName: file.name, error: error.message })
                }
            }

            syncProgress.value = 100
            syncResults.value = results
            lastSyncTime.value = new Date()

            const created = results.filter((r) => r.status === 'created').length
            const updated = results.filter((r) => r.status === 'updated').length
            const unchanged = results.filter((r) => r.status === 'unchanged').length
            const skipped = results.filter((r) => r.status === 'skipped').length
            const errors = results.filter((r) => r.status === 'error').length
            const migrated = results.filter((r) => r.reason === 'summary_rules_migration').length
            const cloudMigrated = await migrateLegacyCloudSummaries({
                uid,
                bestRulesVersion: BEST_RULES_VERSION,
                getDocsFn: getDocs,
                setDocFn: setDoc,
                canonicalizeSummary: canonicalizeSummaryFromLocalDomain
            })
            const totalMigrations = migrated + cloudMigrated

            console.log(`[SYNC] Complete: ${created} created, ${updated} updated, ${unchanged} unchanged, ${skipped} skipped, ${errors} errors (${totalMigrations} summary migrations)`)

            let freshSessions: Awaited<ReturnType<typeof loadSessions>> | null = null
            if (created > 0 || updated > 0 || totalMigrations > 0) {
                clearTrackDerivedCaches()
                freshSessions = await loadSessions(undefined, true, {
                    sourceMode: 'cloud_fresh',
                    context: totalMigrations > 0 ? 'sync_post_migration_refresh' : 'sync_post_apply_refresh'
                })
            }

            if (totalMigrations > 0) {
                console.log(`[SYNC] Rebuilding trackBests after ${totalMigrations} summary migrations...`)
                try {
                    await rebuildTrackBestsProjection({
                        db,
                        uid,
                        sessions: freshSessions || await loadSessions(undefined, true, {
                            sourceMode: 'cloud_fresh',
                            context: 'sync_rebuild_trackBests'
                        }),
                        resetAllTrackBests,
                        getDocFn: getDoc,
                        setDocFn: setDoc,
                        bestRulesVersion: BEST_RULES_VERSION
                    })
                    clearTrackDerivedCaches()
                } catch (rebuildError: any) {
                    console.warn('[SYNC] trackBests rebuild after migration failed:', rebuildError.message)
                }
            }

            await updateSuiteVersion(uid)

            try {
                const allSessions = freshSessions || await loadSessions(undefined, true, {
                    sourceMode: 'cloud_fresh',
                    context: 'sync_user_projection_rebuild'
                }) || []
                await writeUserProjectionDocuments({
                    db,
                    uid,
                    sessions: allSessions,
                    setDocFn: setDoc
                })
                console.log(`[SYNC] User projections updated from ${allSessions.length} sessions`)
            } catch (projectionError: any) {
                console.warn('[SYNC] Could not update user projections:', projectionError.message)
            }

            try {
                if (electronAPI?.cleanupSyncedFiles && uid) {
                    const cleanup = await electronAPI.cleanupSyncedFiles(SYNCED_FILES_RETENTION_DAYS, uid)
                    console.log(`[SYNC] Local retention cleanup: deleted=${cleanup?.deleted ?? 0}, checked=${cleanup?.checked ?? 0}`)
                }
            } catch (cleanupError: any) {
                console.warn('[SYNC] Local retention cleanup failed:', cleanupError.message)
            }

            return results
        } catch (error: any) {
            console.error('[SYNC] Sync failed:', error)
            return [{ status: 'error', fileName: 'sync', error: error.message }]
        } finally {
            isSyncing.value = false
        }
    }

    function notifyIfChanged(results: SyncResult[]) {
        const synced = results.filter((r) => r.status === 'created' || r.status === 'updated')
        if (synced.length > 0) {
            console.log(`[SYNC] Auto-sync completed: ${synced.length} files synced to Firebase`)
            pendingNotification.value = results
        }
    }

    async function cleanupZeroLapSessions(uid: string): Promise<number> {
        return cleanupZeroLapGhosts({
            db,
            uid,
            getDocsFn: getDocs,
            deleteDocFn: deleteDoc
        })
    }

    function setupAutoSync() {
        if (!isElectron.value || autoSyncInitialized) return

        const electronAPI = (window as any).electronAPI
        if (!electronAPI) return

        autoSyncInitialized = true
        setupAutoSyncController({
            isElectron: isElectron.value,
            electronAPI,
            currentUser,
            syncTelemetryFiles,
            onNotify: notifyIfChanged,
            onFilesDetected: () => {
                localRegistryCache = null
            },
            onInitialRegistry: (data) => {
                localRegistryCache = data?.registry || {}
                console.log(`[SYNC] Initial files: ${Array.isArray(data?.files) ? data.files.length : 0}`)
            },
            onBeforeAuthReady: async (uid) => {
                const cleaned = await cleanupZeroLapSessions(uid)
                if (cleaned > 0) {
                    clearTrackDerivedCaches()
                    console.log(`[SYNC] Cleaned ${cleaned} zero-lap sessions, refreshing data...`)
                    await loadSessions(undefined, true, {
                        sourceMode: 'cloud_fresh',
                        context: 'sync_cleanup_refresh'
                    })
                }
            }
        })

        console.log('[SYNC] Auto-sync setup complete (service-based)')
    }

    return {
        isElectron,
        isSyncing,
        syncProgress,
        syncResults,
        lastSyncTime,
        pendingNotification,
        syncTelemetryFiles,
        setupAutoSync
    }
}
