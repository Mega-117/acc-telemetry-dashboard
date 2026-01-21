// ============================================
// useElectronSync - Telemetry file sync to Firebase
// ============================================
// Handles reading files from Electron, validating ownership,
// uploading to Firebase, and refreshing the dashboard

import { ref, computed } from 'vue'
import { useFirebaseAuth } from './useFirebaseAuth'
import { useTelemetryData } from './useTelemetryData'
import {
    doc,
    setDoc,
    getDoc,
    getDocs,
    collection,
    deleteDoc,
    serverTimestamp
} from 'firebase/firestore'
import { db } from '~/config/firebase'

// Constants
const CHUNK_SIZE = 400000

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

    // Check if session exists
    async function getExistingSession(uid: string, sessionId: string) {
        const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`)
        const snap = await getDoc(sessionRef)
        return snap.exists() ? { id: sessionId, ...snap.data() } : null
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
            const existing = await getExistingSession(uid, sessionId)

            let isUpdate = false
            let chunksNeedUpdate = true

            if (existing) {
                isUpdate = true
                // Only rewrite chunks if content actually changed
                if ((existing as any).fileHash === fileHash) {
                    chunksNeedUpdate = false
                } else {
                    await deleteOldChunks(uid, sessionId)
                }
            }

            const chunks = splitIntoChunks(rawText, CHUNK_SIZE)

            // Upload session document (always, to refresh summary)
            const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`)
            await setDoc(sessionRef, {
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

            // Track upload
            const uploadRef = doc(db, `users/${uid}/uploads/${fileHash}`)
            await setDoc(uploadRef, { fileName, uploadedAt: serverTimestamp(), sessionId })

            // Upload chunks only if content changed
            if (chunksNeedUpdate) {
                for (let idx = 0; idx < chunks.length; idx++) {
                    const chunkRef = doc(db, `users/${uid}/sessions/${sessionId}/rawChunks/${idx}`)
                    await setDoc(chunkRef, { idx, chunk: chunks[idx] })
                }
            }

            // Update trackBests with any new best times
            await updateTrackBests(uid, meta.track, sessionId, meta.date_start, summary)

            // Auto-cleanup: find and delete any old format duplicates of this session
            const cleanedCount = await findAndDeleteOldFormatDuplicates(uid, meta.track, meta.date_start, sessionId)

            // Determine status: created, updated (new content), or refreshed (just summary update)
            let status: 'created' | 'updated' | 'refreshed' = 'created'
            if (isUpdate) {
                status = chunksNeedUpdate ? 'updated' : 'refreshed'
            }

            console.log(`[SYNC] ${status}: ${fileName} -> ${sessionId} (Q: ${summary.best_qualy_ms}, R: ${summary.best_race_ms})${cleanedCount > 0 ? ` [cleaned ${cleanedCount} old duplicate(s)]` : ''}`)

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

    // Find and delete old format duplicate sessions (automatic cleanup)
    // Called after uploading a session with new format to remove any legacy duplicates
    async function findAndDeleteOldFormatDuplicates(
        uid: string,
        track: string,
        dateStart: string,
        newSessionId: string
    ): Promise<number> {
        try {
            // Get all sessions for this user
            const sessionsRef = collection(db, `users/${uid}/sessions`)
            const snapshot = await getDocs(sessionsRef)

            // Normalize track and date for comparison
            const trackNorm = track.toLowerCase().replace(/\s+/g, '_')
            const dateNormalized = dateStart.split('.')[0] // Remove microseconds
            const datePrefix = dateNormalized.split(':').slice(0, 2).join(':') // YYYY-MM-DDTHH:MM

            let deletedCount = 0

            for (const docSnap of snapshot.docs) {
                const sessionId = docSnap.id
                const data = docSnap.data()

                // Skip if this is the new session we just uploaded
                if (sessionId === newSessionId) continue

                // Check if old format: starts with Unix timestamp (13 digits)
                const isOldFormat = /^\d{13}_/.test(sessionId)
                if (!isOldFormat) continue

                // Check if same track
                const sessionTrack = (data.meta?.track || '').toLowerCase().replace(/\s+/g, '_')
                if (sessionTrack !== trackNorm) continue

                // Check if same date (minute precision)
                const sessionDate = data.meta?.date_start || ''
                const sessionDatePrefix = sessionDate.split(':').slice(0, 2).join(':')
                if (sessionDatePrefix !== datePrefix) continue

                // This is an old format duplicate - delete it
                console.log(`[SYNC] 🗑️ Auto-deleting old format duplicate: ${sessionId}`)

                // Delete rawChunks subcollection first
                const chunksRef = collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`)
                const chunksSnap = await getDocs(chunksRef)
                for (const chunk of chunksSnap.docs) {
                    await deleteDoc(chunk.ref)
                }

                // Delete session document
                await deleteDoc(docSnap.ref)
                deletedCount++
            }

            if (deletedCount > 0) {
                console.log(`[SYNC] ✅ Auto-cleaned ${deletedCount} old format duplicate(s) for ${track}`)
            }

            return deletedCount
        } catch (e: any) {
            console.warn(`[SYNC] ⚠️ Error during auto-cleanup:`, e.message)
            return 0
        }
    }

    // Update trackBests collection with new best times from session
    async function updateTrackBests(
        uid: string,
        trackId: string,
        sessionId: string,
        dateStart: string,
        summary: any
    ) {
        const trackIdNorm = trackId.toLowerCase().replace(/\s+/g, '_')
        const trackBestsRef = doc(db, `users/${uid}/trackBests/${trackIdNorm}`)

        try {
            // Get existing trackBests
            const existingSnap = await getDoc(trackBestsRef)
            const existing = existingSnap.exists() ? existingSnap.data() : null

            const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']
            // Support both formats: existing.bests (new) OR existing at root (legacy)
            const newBests: Record<string, any> = existing?.bests ||
                (existing ? Object.fromEntries(gripConditions.filter(g => existing[g]).map(g => [g, existing[g]])) : {})
            let hasUpdates = false

            // Check each grip condition for improvements
            gripConditions.forEach(grip => {
                const sessionBest = summary.best_by_grip?.[grip]
                if (!sessionBest) return

                if (!newBests[grip]) {
                    newBests[grip] = {
                        bestQualy: null, bestQualyTemp: null, bestQualySessionId: null, bestQualyDate: null,
                        bestRace: null, bestRaceTemp: null, bestRaceSessionId: null, bestRaceDate: null,
                        bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceSessionId: null, bestAvgRaceDate: null
                    }
                }

                // Check if new session has better qualy time
                if (sessionBest.bestQualy && (!newBests[grip].bestQualy || sessionBest.bestQualy < newBests[grip].bestQualy)) {
                    newBests[grip].bestQualy = sessionBest.bestQualy
                    newBests[grip].bestQualyTemp = sessionBest.bestQualyTemp
                    newBests[grip].bestQualySessionId = sessionId
                    newBests[grip].bestQualyDate = dateStart
                    hasUpdates = true
                }

                // Check if new session has better race time
                if (sessionBest.bestRace && (!newBests[grip].bestRace || sessionBest.bestRace < newBests[grip].bestRace)) {
                    newBests[grip].bestRace = sessionBest.bestRace
                    newBests[grip].bestRaceTemp = sessionBest.bestRaceTemp
                    newBests[grip].bestRaceSessionId = sessionId
                    newBests[grip].bestRaceDate = dateStart
                    hasUpdates = true
                }

                // Check if new session has better avg race time
                if (sessionBest.bestAvgRace && (!newBests[grip].bestAvgRace || sessionBest.bestAvgRace < newBests[grip].bestAvgRace)) {
                    newBests[grip].bestAvgRace = sessionBest.bestAvgRace
                    newBests[grip].bestAvgRaceTemp = sessionBest.bestAvgRaceTemp
                    newBests[grip].bestAvgRaceSessionId = sessionId
                    newBests[grip].bestAvgRaceDate = dateStart
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

            // Always save (bests + activity updates)
            await setDoc(trackBestsRef, {
                trackId: trackIdNorm,
                bests: newBests,
                activity: newActivity,
                syncedSessionIds: newSyncedSessions,
                lastUpdated: serverTimestamp()
            })

            if (hasUpdates) {
                console.log(`[SYNC] ✅ Updated trackBests for ${trackIdNorm} (bests + activity)`)
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

    // Main sync function
    async function syncTelemetryFiles(): Promise<SyncResult[]> {
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
            // Get telemetry files from Electron
            const files: TelemetryFile[] = await electronAPI.getTelemetryFiles()
            console.log(`[SYNC] Found ${files.length} files to process`)

            if (files.length === 0) {
                isSyncing.value = false
                return []
            }

            // Process each file
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
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

                    // Update registry if successful
                    if (result.status === 'created' || result.status === 'updated') {
                        await electronAPI.updateRegistry(file.name, {
                            uploadedBy: uid,
                            sessionId: result.sessionId,
                            uploadedAt: new Date().toISOString()
                        })
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

            return results

        } catch (error: any) {
            console.error('[SYNC] Sync failed:', error)
            return [{ status: 'error', fileName: 'sync', error: error.message }]
        } finally {
            isSyncing.value = false
        }
    }

    // Setup auto-sync on file changes
    function setupAutoSync() {
        if (!isElectron.value) return

        const electronAPI = (window as any).electronAPI

        // Listen for file changes from Electron
        electronAPI.onFilesChanged((data: { new: TelemetryFile[], modified: TelemetryFile[] }) => {
            if (data.new.length > 0 || data.modified.length > 0) {
                console.log(`[SYNC] Files changed: ${data.new.length} new, ${data.modified.length} modified`)
                // Auto-sync when files change
                syncTelemetryFiles()
            }
        })

        // Sync on initial load
        electronAPI.onInitialFiles((data: { files: TelemetryFile[], registry: any }) => {
            console.log(`[SYNC] Initial files: ${data.files.length}`)
            // Could trigger initial sync here if needed
        })

        console.log('[SYNC] Auto-sync setup complete')
    }

    return {
        isElectron,
        isSyncing,
        syncProgress,
        syncResults,
        lastSyncTime,
        syncTelemetryFiles,
        setupAutoSync
    }
}
