// ============================================
// useElectronSync - Telemetry file sync to Firebase
// ============================================
// Handles reading files from Electron, validating ownership,
// uploading to Firebase, and refreshing the dashboard

import { ref, computed, watch } from 'vue'
import { useFirebaseAuth } from './useFirebaseAuth'
import { useTelemetryData, getCarCategory, CAR_CATEGORIES, type CarCategory } from './useTelemetryData'
import {
    doc,
    collection,
    serverTimestamp,
    writeBatch
} from 'firebase/firestore'
import { trackedGetDoc, trackedGetDocs, trackedSetDoc, trackedDeleteDoc } from './useFirebaseTracker'
import { db } from '~/config/firebase'

// Local wrappers auto-tagged with caller name
const SYNC_CALLER = 'ElectronSync'
async function getDoc(ref: any) { return trackedGetDoc(ref, SYNC_CALLER) }
async function getDocs(q: any) { return trackedGetDocs(q, SYNC_CALLER) }
async function setDoc(ref: any, data: any, options?: any) {
    if (options) return trackedSetDoc(ref, data, options, SYNC_CALLER)
    return trackedSetDoc(ref, data, SYNC_CALLER)
}
async function deleteDoc(ref: any) { return trackedDeleteDoc(ref, SYNC_CALLER) }

// Constants
const CHUNK_SIZE = 400000

// === LOCAL REGISTRY CACHE ===
// Cached registry to avoid Firebase reads for already-uploaded files
interface RegistryCacheEntry {
    fileHash: string
    mtime: number
    size: number
    uploadedBy: string
    sessionId: string
    uploadedAt: string
}
let localRegistryCache: Record<string, RegistryCacheEntry> | null = null

// Types
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

export function useElectronSync() {
    const { currentUser } = useFirebaseAuth()
    const { loadSessions } = useTelemetryData()

    const isSyncing = ref(false)
    const syncProgress = ref(0)
    const syncResults = ref<SyncResult[]>([])
    const lastSyncTime = ref<Date | null>(null)
    // Auto-sync notification: set when auto-sync produces actual changes
    const pendingNotification = ref<SyncResult[] | null>(null)

    // Check if running in Electron
    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        return !!(window as any).electronAPI
    })

    // Calculate SHA-256 hash
    async function calculateHash(input: string): Promise<string> {
        const data = new TextEncoder().encode(input)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    }

    // Generate stable session ID from date_start and track
    // Normalize: remove microseconds for consistent IDs
    function generateSessionId(dateStart: string, track: string): string {
        // Remove microseconds: "2026-01-04T17:11:38.128663" -> "2026-01-04T17:11:38"
        const normalized = dateStart.split('.')[0]
        const base = `${normalized}_${track}`.replace(/[^a-zA-Z0-9]/g, '_')
        return base.substring(0, 100)
    }

    // Check if session exists (only called when registry cache misses)
    async function getExistingSession(uid: string, sessionId: string) {
        const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`)
        const snap = await getDoc(sessionRef)
        return snap.exists() ? { id: sessionId, ...snap.data() } : null
    }

    // Load local registry cache from Electron
    async function loadRegistryCache(): Promise<Record<string, RegistryCacheEntry>> {
        if (localRegistryCache) return localRegistryCache
        try {
            const electronAPI = (window as any).electronAPI
            if (electronAPI) {
                localRegistryCache = await electronAPI.getRegistry() || {}
            } else {
                localRegistryCache = {}
            }
        } catch {
            localRegistryCache = {}
        }
        return localRegistryCache!
    }

    // Check if file can be skipped via local registry (0 Firebase reads)
    function canSkipViaRegistry(
        registry: Record<string, RegistryCacheEntry>,
        fileName: string,
        fileHash: string,
        uid: string
    ): boolean {
        const entry = registry[fileName]
        if (!entry) return false
        // Skip if same hash AND same user uploaded it
        return entry.fileHash === fileHash && entry.uploadedBy === uid
    }

    // Delete old chunks before re-upload
    async function deleteOldChunks(uid: string, sessionId: string) {
        try {
            const chunksRef = collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`)
            const snapshot = await getDocs(chunksRef)
            const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref))
            await Promise.all(deletePromises)
        } catch (e: any) {
            console.warn('[SYNC] Error deleting old chunks:', e.message)
        }
    }

    // Extract metadata from raw JSON object (matches dev-upload.vue logic)
    function extractMetadata(rawObj: any) {
        const sessionInfo = rawObj.session_info || {}
        const stints = rawObj.stints || []

        const meta = {
            track: sessionInfo.track || rawObj.track || 'Unknown',
            date_start: sessionInfo.date_start || rawObj.date || new Date().toISOString(),
            date_end: sessionInfo.date_end || null,
            car: sessionInfo.car_model || sessionInfo.car || rawObj.car || null,
            session_type: sessionInfo.session_type ?? null,
            driver: sessionInfo.driver || null
        }

        // Track best times by grip
        type GripBest = {
            bestQualy: number | null
            bestQualyTemp: number | null
            bestRace: number | null
            bestRaceTemp: number | null
            bestAvgRace: number | null
            bestAvgRaceTemp: number | null
        }

        const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']
        const bestByGrip: Record<string, GripBest> = {}

        gripConditions.forEach(grip => {
            bestByGrip[grip] = {
                bestQualy: null, bestQualyTemp: null,
                bestRace: null, bestRaceTemp: null,
                bestAvgRace: null, bestAvgRaceTemp: null
            }
        })

        // Normalize grip values (handle abbreviations from logger)
        const normalizeGrip = (grip: string) => {
            if (grip === 'Opt') return 'Optimum'
            return grip
        }

        // Track overall bests
        let bestQualyMs: number | null = null
        let bestQualyConditions: { airTemp: number, roadTemp: number, grip: string } | null = null
        let bestRaceMs: number | null = null
        let bestRaceConditions: { airTemp: number, roadTemp: number, grip: string } | null = null
        let bestAvgRaceMs: number | null = null
        let bestAvgRaceConditions: { airTemp: number, roadTemp: number, grip: string } | null = null

        // Detect if this is a Qualify session (session_type 1 = Qualify, 2 = Race)
        // Note: Logger may incorrectly set stint.type='Race' even for Qualify sessions
        const isQualySession = sessionInfo.session_type === 1

        stints.forEach((stint: any) => {
            // Use session-level type OR stint-level type for Qualy detection
            const isQualy = isQualySession || stint.type === 'Qualify'
            const laps = stint.laps || []

            laps.forEach((lap: any) => {
                if (lap.is_valid && !lap.has_pit_stop && lap.lap_time_ms) {
                    const grip = normalizeGrip(lap.track_grip_status || 'Unknown')
                    const airTemp = lap.air_temp || 0
                    const conditions = { airTemp, roadTemp: lap.road_temp || 0, grip }

                    // Update grip-specific bests
                    if (bestByGrip[grip]) {
                        if (isQualy) {
                            if (!bestByGrip[grip].bestQualy || lap.lap_time_ms < bestByGrip[grip].bestQualy!) {
                                bestByGrip[grip].bestQualy = lap.lap_time_ms
                                bestByGrip[grip].bestQualyTemp = airTemp
                            }
                        } else {
                            if (!bestByGrip[grip].bestRace || lap.lap_time_ms < bestByGrip[grip].bestRace!) {
                                bestByGrip[grip].bestRace = lap.lap_time_ms
                                bestByGrip[grip].bestRaceTemp = airTemp
                            }
                        }
                    }

                    // Update overall bests
                    if (isQualy) {
                        if (!bestQualyMs || lap.lap_time_ms < bestQualyMs) {
                            bestQualyMs = lap.lap_time_ms
                            bestQualyConditions = conditions
                        }
                    } else {
                        if (!bestRaceMs || lap.lap_time_ms < bestRaceMs) {
                            bestRaceMs = lap.lap_time_ms
                            bestRaceConditions = conditions
                        }
                    }
                }
            })

            // Best avg race: use stint.avg_clean_lap (only for race stints with >= 5 laps)
            if (!isQualy && stint.avg_clean_lap && laps.length >= 5) {
                const firstValidLap = laps.find((l: any) => l.is_valid && !l.has_pit_stop)
                const rawGrip = firstValidLap?.track_grip_status || laps[0]?.track_grip_status || 'Unknown'
                const grip = normalizeGrip(rawGrip)
                const airTemp = firstValidLap?.air_temp || laps[0]?.air_temp || 0

                if (bestByGrip[grip]) {
                    if (!bestByGrip[grip].bestAvgRace || stint.avg_clean_lap < bestByGrip[grip].bestAvgRace!) {
                        bestByGrip[grip].bestAvgRace = stint.avg_clean_lap
                        bestByGrip[grip].bestAvgRaceTemp = airTemp
                    }
                }

                if (!bestAvgRaceMs || stint.avg_clean_lap < bestAvgRaceMs) {
                    bestAvgRaceMs = stint.avg_clean_lap
                    bestAvgRaceConditions = {
                        airTemp,
                        roadTemp: firstValidLap?.road_temp || 0,
                        grip
                    }
                }
            }
        })

        const summary = {
            laps: sessionInfo.laps_total || rawObj.laps?.length || 0,
            lapsValid: sessionInfo.laps_valid || 0,
            bestLap: sessionInfo.session_best_lap || rawObj.bestLap || null,
            avgCleanLap: sessionInfo.avg_clean_lap || null,
            totalTime: sessionInfo.total_drive_time_ms || 0,
            stintCount: stints.length || 0,
            // Best times from stint types
            best_qualy_ms: bestQualyMs,
            best_qualy_conditions: bestQualyConditions,
            best_race_ms: bestRaceMs,
            best_race_conditions: bestRaceConditions,
            best_avg_race_ms: bestAvgRaceMs,
            best_avg_race_conditions: bestAvgRaceConditions,
            best_by_grip: bestByGrip
        }

        return { meta, summary }
    }

    // Split string into chunks
    function splitIntoChunks(str: string, size: number): string[] {
        const chunks: string[] = []
        for (let i = 0; i < str.length; i += size) {
            chunks.push(str.slice(i, i + size))
        }
        return chunks
    }

    // Upload or update session (UPSERT)
    async function uploadOrUpdateSession(
        rawObj: any,
        rawText: string,
        fileName: string,
        uid: string
    ): Promise<SyncResult> {
        try {
            // Zero-lap guard: skip sessions with no completed laps
            const totalLaps = rawObj.session_info?.laps_total || 0
            if (totalLaps === 0) {
                console.log(`[SYNC] Skipped ${fileName}: zero laps (empty session)`)
                return { status: 'skipped', fileName, reason: 'zero_laps' }
            }

            // Owner validation
            const fileOwnerId = rawObj.ownerId || null

            // Skip if file belongs to different user
            if (fileOwnerId && fileOwnerId !== uid) {
                console.log(`[SYNC] Skipped ${fileName}: owner mismatch (file: ${fileOwnerId}, current: ${uid})`)
                return {
                    status: 'skipped',
                    fileName,
                    reason: 'owner_mismatch'
                }
            }

            // Warn if no owner (pre-login session)
            if (!fileOwnerId) {
                console.log(`[SYNC] Warning: ${fileName} has no ownerId (pre-login session)`)
            }

            const { meta, summary } = extractMetadata(rawObj)
            const sessionId = generateSessionId(meta.date_start, meta.track)
            const fileHash = await calculateHash(rawText)

            // === REGISTRY CACHE CHECK (0 Firebase reads) ===
            const registry = await loadRegistryCache()
            if (canSkipViaRegistry(registry, fileName, fileHash, uid)) {
                return { status: 'unchanged', fileName, sessionId, reason: 'registry_cache_hit' }
            }

            // Registry miss — check Firebase
            const existing = await getExistingSession(uid, sessionId)

            let isUpdate = false
            let chunksNeedUpdate = true

            if (existing) {
                isUpdate = true
                if ((existing as any).fileHash === fileHash) {
                    // === IDENTICAL FILE ALREADY ON FIREBASE → skip entirely (0 writes) ===
                    console.log(`[SYNC] unchanged: ${fileName} -> ${sessionId} (Q: ${summary.best_qualy_ms}, R: ${summary.best_race_ms})`)
                    return {
                        status: 'unchanged',
                        fileName,
                        sessionId,
                        reason: 'firebase_hash_match'
                    }
                } else {
                    await deleteOldChunks(uid, sessionId)
                }
            }

            const chunks = splitIntoChunks(rawText, CHUNK_SIZE)

            // === ATOMIC BATCH WRITE (1 operation instead of N) ===
            const batch = writeBatch(db)

            // Session document
            const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`)
            batch.set(sessionRef, {
                fileHash,
                fileName,
                uploadedAt: serverTimestamp(),
                meta,
                summary,
                rawChunkCount: chunks.length,
                rawSizeBytes: rawText.length,
                rawEncoding: 'json-string',
                version: ((existing as any)?.version || 0) + 1
            })

            // Upload tracking
            const uploadRef = doc(db, `users/${uid}/uploads/${fileHash}`)
            batch.set(uploadRef, { fileName, uploadedAt: serverTimestamp(), sessionId })

            // Chunks (parallel in batch, not sequential setDoc)
            for (let idx = 0; idx < chunks.length; idx++) {
                const chunkRef = doc(db, `users/${uid}/sessions/${sessionId}/rawChunks/${idx}`)
                batch.set(chunkRef, { idx, chunk: chunks[idx] })
            }

            // Commit all at once
            await batch.commit()

            // Update trackBests ONLY for new/updated sessions (not unchanged)
            await updateTrackBests(uid, meta.track, sessionId, meta.date_start, summary, meta.car)

            // NOTE: findAndDeleteOldFormatDuplicates removed — migration completed

            const status: 'created' | 'updated' = isUpdate ? 'updated' : 'created'

            console.log(`[SYNC] ${status}: ${fileName} -> ${sessionId} (Q: ${summary.best_qualy_ms}, R: ${summary.best_race_ms})`)

            return {
                status,
                fileName,
                sessionId
            }

        } catch (error: any) {
            console.error('[SYNC] Error:', error)
            return { status: 'error', fileName, error: error.message }
        }
    }


    // Update trackBests collection with new best times from session (V2 - with categories)
    // Schema version: 2 - bests organized by category then grip
    const TRACK_BESTS_SCHEMA_VERSION = 2

    async function updateTrackBests(
        uid: string,
        trackId: string,
        sessionId: string,
        dateStart: string,
        summary: any,
        car?: string
    ) {
        const trackIdNorm = trackId.toLowerCase().replace(/\s+/g, '_')
        const trackBestsRef = doc(db, `users/${uid}/trackBests/${trackIdNorm}`)

        // Determine category from car model
        const category = getCarCategory(car || '')

        try {
            // Get existing trackBests
            const existingSnap = await getDoc(trackBestsRef)
            const existing = existingSnap.exists() ? existingSnap.data() : null
            const existingVersion = existing?.version || 1

            const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']

            // Initialize V2 structure (Category -> Grip -> Bests)
            type GripBest = {
                bestQualy: number | null, bestQualyTemp: number | null, bestQualySessionId: string | null, bestQualyDate: string | null,
                bestRace: number | null, bestRaceTemp: number | null, bestRaceSessionId: string | null, bestRaceDate: string | null,
                bestAvgRace: number | null, bestAvgRaceTemp: number | null, bestAvgRaceSessionId: string | null, bestAvgRaceDate: string | null
            }

            const emptyGripBests = (): GripBest => ({
                bestQualy: null, bestQualyTemp: null, bestQualySessionId: null, bestQualyDate: null,
                bestRace: null, bestRaceTemp: null, bestRaceSessionId: null, bestRaceDate: null,
                bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceSessionId: null, bestAvgRaceDate: null
            })

            // Get or create V2 bests structure
            let newBests: Record<CarCategory, Record<string, GripBest>> = {} as any

            if (existingVersion >= TRACK_BESTS_SCHEMA_VERSION && existing?.bests) {
                // Already V2 - copy existing
                for (const cat of CAR_CATEGORIES) {
                    newBests[cat] = existing.bests[cat] || {}
                }
            } else if (existing?.bests || existing) {
                // V1 -> migrate to V2 (all old data goes to GT3)
                const legacyBests = existing.bests ||
                    Object.fromEntries(gripConditions.filter(g => existing[g]).map(g => [g, existing[g]]))

                for (const cat of CAR_CATEGORIES) {
                    newBests[cat] = {}
                    for (const grip of gripConditions) {
                        // Put legacy data in GT3, empty in others
                        newBests[cat][grip] = cat === 'GT3' && legacyBests[grip]
                            ? legacyBests[grip]
                            : emptyGripBests()
                    }
                }
                console.log(`[SYNC] Migrating trackBests V1 -> V2 for ${trackIdNorm}`)
            } else {
                // New - initialize empty
                for (const cat of CAR_CATEGORIES) {
                    newBests[cat] = {}
                    for (const grip of gripConditions) {
                        newBests[cat][grip] = emptyGripBests()
                    }
                }
            }

            let hasUpdates = false

            // Check each grip condition for improvements (update only the current category)
            gripConditions.forEach(grip => {
                const sessionBest = summary.best_by_grip?.[grip]
                if (!sessionBest) return

                if (!newBests[category][grip]) {
                    newBests[category][grip] = emptyGripBests()
                }

                const catGrip = newBests[category][grip]

                // Check if new session has better qualy time
                if (sessionBest.bestQualy && (!catGrip.bestQualy || sessionBest.bestQualy < catGrip.bestQualy)) {
                    catGrip.bestQualy = sessionBest.bestQualy
                    catGrip.bestQualyTemp = sessionBest.bestQualyTemp
                    catGrip.bestQualySessionId = sessionId
                    catGrip.bestQualyDate = dateStart
                    hasUpdates = true
                }

                // Check if new session has better race time
                if (sessionBest.bestRace && (!catGrip.bestRace || sessionBest.bestRace < catGrip.bestRace)) {
                    catGrip.bestRace = sessionBest.bestRace
                    catGrip.bestRaceTemp = sessionBest.bestRaceTemp
                    catGrip.bestRaceSessionId = sessionId
                    catGrip.bestRaceDate = dateStart
                    hasUpdates = true
                }

                // Check if new session has better avg race time
                if (sessionBest.bestAvgRace && (!catGrip.bestAvgRace || sessionBest.bestAvgRace < catGrip.bestAvgRace)) {
                    catGrip.bestAvgRace = sessionBest.bestAvgRace
                    catGrip.bestAvgRaceTemp = sessionBest.bestAvgRaceTemp
                    catGrip.bestAvgRaceSessionId = sessionId
                    catGrip.bestAvgRaceDate = dateStart
                    hasUpdates = true
                }
            })

            // === ACTIVITY AGGREGATES ===
            // Always update activity on every session sync (not just when bests improve)
            const existingActivity = existing?.activity || {
                totalLaps: 0,
                validLaps: 0,
                totalTimeMs: 0,
                sessionCount: 0
            }

            // Check if this session was already counted (by tracking last synced session)
            const lastSyncedSessions = existing?.syncedSessionIds || []
            const alreadyCounted = lastSyncedSessions.includes(sessionId)

            // Only add to activity if this is a new session (not a re-sync)
            const sessionLaps = summary.laps || 0
            const sessionValidLaps = summary.lapsValid || 0
            const sessionTimeMs = summary.totalTime || 0

            const newActivity = alreadyCounted ? existingActivity : {
                totalLaps: existingActivity.totalLaps + sessionLaps,
                validLaps: existingActivity.validLaps + sessionValidLaps,
                totalTimeMs: existingActivity.totalTimeMs + sessionTimeMs,
                sessionCount: existingActivity.sessionCount + 1,
                lastSessionDate: dateStart
            }

            // Track synced sessions to avoid double-counting
            const newSyncedSessions = alreadyCounted
                ? lastSyncedSessions
                : [...lastSyncedSessions, sessionId].slice(-100) // Keep last 100

            // Always save (V2 structure with version)
            await setDoc(trackBestsRef, {
                version: TRACK_BESTS_SCHEMA_VERSION,
                trackId: trackIdNorm,
                bests: newBests,
                activity: newActivity,
                syncedSessionIds: newSyncedSessions,
                lastSessionDate: dateStart,
                lastUpdated: serverTimestamp()
            })

            if (hasUpdates) {
                console.log(`[SYNC] ✅ Updated trackBests V2 for ${trackIdNorm} (${category}) (bests + activity)`)
            } else if (!alreadyCounted) {
                console.log(`[SYNC] ✅ Updated trackBests activity for ${trackIdNorm}`)
            } else {
                console.log(`[SYNC] ℹ️ No trackBests changes for ${trackIdNorm}`)
            }

            return hasUpdates || !alreadyCounted
        } catch (e: any) {
            console.warn(`[SYNC] ⚠️ Error updating trackBests for ${trackIdNorm}:`, e.message)
            return false
        }
    }

    // Main sync function — accepts optional specific files for incremental sync
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
            // INCREMENTAL: use specific files if provided, otherwise scan all
            const files: TelemetryFile[] = specificFiles || await electronAPI.getTelemetryFiles()
            const mode = specificFiles ? 'incremental' : 'full'
            console.log(`[SYNC] ${mode} sync: ${files.length} files to process`)

            if (files.length === 0) {
                isSyncing.value = false
                return []
            }

            // Process each file
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                if (!file) continue
                syncProgress.value = Math.round((i / files.length) * 100)

                try {
                    // Read file content
                    const rawObj = await electronAPI.readFile(file.path)
                    if (!rawObj) {
                        results.push({ status: 'error', fileName: file.name, error: 'Could not read file' })
                        continue
                    }

                    // Upload to Firebase
                    const rawText = JSON.stringify(rawObj)
                    const result = await uploadOrUpdateSession(rawObj, rawText, file.name, uid)
                    results.push(result)

                    // Update registry with fileHash for cache (so next sync skips this file)
                    if (result.status === 'created' || result.status === 'updated') {
                        const fileHash = await calculateHash(rawText)
                        await electronAPI.updateRegistry(file.name, {
                            uploadedBy: uid,
                            fileHash,
                            sessionId: result.sessionId,
                            uploadedAt: new Date().toISOString(),
                            mtime: file.mtime,
                            size: file.size
                        })
                        // Update in-memory cache too
                        if (localRegistryCache) {
                            localRegistryCache[file.name] = {
                                uploadedBy: uid,
                                fileHash,
                                sessionId: result.sessionId || '',
                                uploadedAt: new Date().toISOString(),
                                mtime: file.mtime,
                                size: file.size
                            }
                        }
                    }

                    // ALSO populate registry for unchanged files (migration from old registry format)
                    if (result.status === 'unchanged' && result.reason !== 'registry_cache_hit') {
                        const fileHash = await calculateHash(rawText)
                        await electronAPI.updateRegistry(file.name, {
                            uploadedBy: uid,
                            fileHash,
                            sessionId: result.sessionId,
                            uploadedAt: new Date().toISOString(),
                            mtime: file.mtime,
                            size: file.size
                        })
                        if (localRegistryCache) {
                            localRegistryCache[file.name] = {
                                uploadedBy: uid,
                                fileHash,
                                sessionId: result.sessionId || '',
                                uploadedAt: new Date().toISOString(),
                                mtime: file.mtime,
                                size: file.size
                            }
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

            // Count results
            const created = results.filter(r => r.status === 'created').length
            const updated = results.filter(r => r.status === 'updated').length
            const unchanged = results.filter(r => r.status === 'unchanged').length
            const skipped = results.filter(r => r.status === 'skipped').length
            const errors = results.filter(r => r.status === 'error').length

            console.log(`[SYNC] Complete: ${created} created, ${updated} updated, ${unchanged} unchanged, ${skipped} skipped, ${errors} errors`)

            // Refresh data if something changed
            if (created > 0 || updated > 0) {
                console.log('[SYNC] Refreshing dashboard data...')
                await loadSessions()
            }

            // Update Suite version in user profile (1 write per sync)
            try {
                const electronAPI = (window as any).electronAPI
                if (electronAPI?.getSuiteVersion) {
                    const version = await electronAPI.getSuiteVersion()
                    if (version) {
                        const userRef = doc(db, `users/${uid}`)
                        await setDoc(userRef, {
                            suiteVersion: version.launcher || version.webapp || null,
                            suiteVersionDetail: version,
                            suiteVersionUpdatedAt: new Date().toISOString()
                        }, { merge: true })
                        console.log(`[SYNC] Suite version updated: ${version.launcher}`)
                    }
                }
            } catch (versionError: any) {
                console.warn('[SYNC] Could not update suite version:', versionError.message)
            }

            // Update user stats + sessionIndex (for browser clients & admin dashboard)
            // This single doc write eliminates ~254 reads on browser login!
            try {
                const allSessions = await loadSessions() || []
                const now = new Date()
                const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                const sevenDaysAgoStr = sevenDaysAgo.toISOString()

                // --- Stats (for admin/coach dashboard) ---
                let lastSessionDate: string | null = null
                let sessionsLast7Days = 0

                // --- Activity 7d (for panoramica chart) ---
                let practiceMinutes = 0, practiceCount = 0
                let qualifyMinutes = 0, qualifyCount = 0
                let raceMinutes = 0, raceCount = 0
                const activityByDay: Record<string, { P: number; Q: number; R: number }> = {}

                // --- Tracks summary (for piste page) ---
                const tracksMap: Record<string, { track: string; sessions: number; lastPlayed: string }> = {}

                // --- Sessions list (compact, for sessioni page) ---
                const sessionsList: Array<{
                    id: string; date: string; track: string; car: string;
                    type: number; laps: number; lapsValid: number; bestLap: number | null;
                    totalTime: number; stintCount: number;
                    bestQualyMs: number | null; bestRaceMs: number | null;
                    grip?: string
                }> = []

                for (const session of allSessions) {
                    const dateStart = session.meta?.date_start || ''
                    const track = session.meta?.track || ''
                    const trackKey = track.toLowerCase()

                    // Last session date
                    if (dateStart && (!lastSessionDate || dateStart > lastSessionDate)) {
                        lastSessionDate = dateStart
                    }

                    // Activity 7d
                    if (dateStart >= sevenDaysAgoStr) {
                        sessionsLast7Days++
                        const totalMs = session.summary?.totalTime || 0
                        const minutes = Math.round(totalMs / 60000)
                        const dayKey = dateStart.substring(0, 10) // "2026-03-28"

                        if (!activityByDay[dayKey]) activityByDay[dayKey] = { P: 0, Q: 0, R: 0 }

                        switch (session.meta?.session_type) {
                            case 0: practiceMinutes += minutes; practiceCount++; activityByDay[dayKey].P++; break
                            case 1: qualifyMinutes += minutes; qualifyCount++; activityByDay[dayKey].Q++; break
                            case 2: raceMinutes += minutes; raceCount++; activityByDay[dayKey].R++; break
                        }
                    }

                    // Tracks summary
                    if (trackKey) {
                        if (!tracksMap[trackKey]) {
                            tracksMap[trackKey] = { track, sessions: 0, lastPlayed: dateStart }
                        }
                        tracksMap[trackKey].sessions++
                        if (dateStart > tracksMap[trackKey].lastPlayed) {
                            tracksMap[trackKey].lastPlayed = dateStart
                        }
                    }

                    // Sessions list (compact entry)
                    sessionsList.push({
                        id: session.sessionId,
                        date: dateStart,
                        track,
                        car: session.meta?.car || '',
                        type: session.meta?.session_type ?? 0,
                        laps: session.summary?.laps || 0,
                        lapsValid: session.summary?.lapsValid || 0,
                        bestLap: session.summary?.bestLap || null,
                        totalTime: session.summary?.totalTime || 0,
                        stintCount: session.summary?.stintCount || 0,
                        bestQualyMs: session.summary?.best_qualy_ms || null,
                        bestRaceMs: session.summary?.best_race_ms || null,
                        grip: session.summary?.best_race_conditions?.grip || session.summary?.best_qualy_conditions?.grip || undefined
                    })
                }

                // Sort sessions list by date descending
                sessionsList.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

                const statsRef = doc(db, `users/${uid}`)
                await setDoc(statsRef, {
                    stats: {
                        totalSessions: allSessions.length,
                        sessionsLast7Days,
                        lastSessionDate,
                        tracksCount: Object.keys(tracksMap).length,
                        updatedAt: new Date().toISOString()
                    },
                    sessionIndex: {
                        sessionsList,
                        activity7d: {
                            practice: { minutes: practiceMinutes, sessions: practiceCount },
                            qualify: { minutes: qualifyMinutes, sessions: qualifyCount },
                            race: { minutes: raceMinutes, sessions: raceCount },
                            byDay: Object.entries(activityByDay).map(([date, counts]) => ({ date, ...counts }))
                        },
                        tracksSummary: Object.values(tracksMap),
                        updatedAt: new Date().toISOString()
                    }
                }, { merge: true })
                console.log(`[SYNC] UserIndex updated: ${sessionsList.length} sessions, ${sessionsLast7Days} last 7d, ${Object.keys(tracksMap).length} tracks`)
            } catch (statsError: any) {
                console.warn('[SYNC] Could not update userIndex:', statsError.message)
            }

            return results

        } catch (error: any) {
            console.error('[SYNC] Sync failed:', error)
            return [{ status: 'error', fileName: 'sync', error: error.message }]
        } finally {
            isSyncing.value = false
        }
    }

    // Helper: check results and notify if actual changes were synced
    function notifyIfChanged(results: SyncResult[]) {
        const synced = results.filter(r => r.status === 'created' || r.status === 'updated')
        if (synced.length > 0) {
            console.log(`[SYNC] Auto-sync completed: ${synced.length} files synced to Firebase`)
            pendingNotification.value = results
        }
    }

    // One-time cleanup: delete zero-lap sessions from Firebase
    // Runs once per user (localStorage flag prevents re-execution)
    async function cleanupZeroLapSessions(uid: string): Promise<number> {
        const CLEANUP_KEY = `zero_lap_cleanup_done_${uid}`

        // Skip if already done for this user
        if (typeof window !== 'undefined' && localStorage.getItem(CLEANUP_KEY)) {
            return 0
        }

        console.log('[CLEANUP] Checking for zero-lap sessions to remove...')

        try {
            const sessionsRef = collection(db, `users/${uid}/sessions`)
            const snapshot = await getDocs(sessionsRef)

            const toDelete: string[] = []
            snapshot.forEach(docSnap => {
                const data = docSnap.data()
                const laps = data.summary?.laps || 0
                if (laps === 0) {
                    toDelete.push(docSnap.id)
                }
            })

            if (toDelete.length === 0) {
                console.log('[CLEANUP] No zero-lap sessions found')
                if (typeof window !== 'undefined') {
                    localStorage.setItem(CLEANUP_KEY, new Date().toISOString())
                }
                return 0
            }

            console.log(`[CLEANUP] Found ${toDelete.length} zero-lap sessions, deleting...`)

            // Delete in batches of 10 to avoid overwhelming Firestore
            for (let i = 0; i < toDelete.length; i++) {
                const sessionId = toDelete[i]
                try {
                    // Delete rawChunks subcollection first
                    const chunksRef = collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`)
                    const chunksSnap = await getDocs(chunksRef)
                    for (const chunk of chunksSnap.docs) {
                        await deleteDoc(chunk.ref)
                    }
                    // Delete session document
                    await deleteDoc(doc(db, `users/${uid}/sessions/${sessionId}`))
                } catch (e: any) {
                    console.warn(`[CLEANUP] Error deleting ${sessionId}:`, e.message)
                }
            }

            console.log(`[CLEANUP] ✅ Deleted ${toDelete.length} zero-lap sessions`)

            // Mark as done
            if (typeof window !== 'undefined') {
                localStorage.setItem(CLEANUP_KEY, new Date().toISOString())
            }

            return toDelete.length
        } catch (e: any) {
            console.error('[CLEANUP] Error during cleanup:', e.message)
            return 0
        }
    }

    // Setup auto-sync on file changes + window focus
    function setupAutoSync() {
        if (!isElectron.value) return

        const electronAPI = (window as any).electronAPI

        // TRIGGER 1 (PRIMARY): File-ready — sync only changed files
        electronAPI.onFilesChanged(async (data: { new: TelemetryFile[], modified: TelemetryFile[] }) => {
            const changedFiles = [...data.new, ...data.modified]
            if (changedFiles.length > 0) {
                console.log(`[SYNC] File-ready trigger: ${data.new.length} new, ${data.modified.length} modified`)
                // Invalidate registry cache to pick up new files
                localRegistryCache = null
                // INCREMENTAL: sync only the changed files
                const results = await syncTelemetryFiles(changedFiles)
                notifyIfChanged(results)
            }
        })

        // TRIGGER 2 (SAFETY NET): Window focus — check for any missed files
        if (electronAPI.onWindowFocused) {
            electronAPI.onWindowFocused(async () => {
                console.log('[SYNC] Window focus trigger: checking for pending files')
                // Full scan but registry cache makes it near-instant for already-synced files
                const results = await syncTelemetryFiles()
                notifyIfChanged(results)
            })
        }

        // TRIGGER 3 (RECOVERY): Initial load — sync anything missed
        electronAPI.onInitialFiles(async (data: { files: TelemetryFile[], registry: any }) => {
            console.log(`[SYNC] Initial files: ${data.files.length}`)
            // Cache the registry from initial data
            localRegistryCache = data.registry || {}
            // Trigger initial sync (registry cache will skip already-uploaded files)
            const results = await syncTelemetryFiles()
            notifyIfChanged(results)
        })

        // TRIGGER 4 (AUTH-READY): Sync when Firebase auth resolves
        // Fixes race condition: initial-files fires ~200ms after load,
        // but Firebase auth takes ~1-3s. Without this, the first sync
        // exits early with "No user logged in" and never retries.
        watch(currentUser, async (user) => {
            if (user) {
                console.log(`[SYNC] Auth-ready trigger: user ${user.email} logged in, starting sync`)
                // One-time cleanup of zero-lap ghost sessions
                const cleaned = await cleanupZeroLapSessions(user.uid)
                if (cleaned > 0) {
                    console.log(`[SYNC] Cleaned ${cleaned} zero-lap sessions, refreshing data...`)
                    await loadSessions()
                }
                const results = await syncTelemetryFiles()
                notifyIfChanged(results)
            }
        }, { once: true })

        console.log('[SYNC] Auto-sync setup complete (file-ready + focus + initial + auth-ready + cleanup)')
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
