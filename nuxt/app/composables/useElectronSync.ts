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
    function generateSessionId(dateStart: string, track: string): string {
        const base = `${dateStart}_${track}`.replace(/[^a-zA-Z0-9]/g, '_')
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

    // Extract metadata from raw JSON object
    function extractMetadata(rawObj: any) {
        const sessionInfo = rawObj.session_info || {}

        const meta = {
            track: sessionInfo.track || rawObj.track || 'Unknown',
            date_start: sessionInfo.date_start || rawObj.date || new Date().toISOString(),
            date_end: sessionInfo.date_end || null,
            car: sessionInfo.car_model || sessionInfo.car || rawObj.car || null,
            session_type: sessionInfo.session_type ?? null,
            driver: sessionInfo.driver || null
        }

        const summary = {
            laps: sessionInfo.laps_total || rawObj.laps?.length || 0,
            lapsValid: sessionInfo.laps_valid || 0,
            bestLap: sessionInfo.session_best_lap || rawObj.bestLap || null,
            avgCleanLap: sessionInfo.avg_clean_lap || null,
            totalTime: sessionInfo.total_drive_time_ms || 0,
            stintCount: rawObj.stints?.length || 0
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
            if (existing) {
                if ((existing as any).fileHash === fileHash) {
                    return { status: 'unchanged', fileName, sessionId }
                }
                isUpdate = true
                await deleteOldChunks(uid, sessionId)
            }

            const chunks = splitIntoChunks(rawText, CHUNK_SIZE)

            // Upload session document
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

            // Upload chunks
            for (let idx = 0; idx < chunks.length; idx++) {
                const chunkRef = doc(db, `users/${uid}/sessions/${sessionId}/rawChunks/${idx}`)
                await setDoc(chunkRef, { idx, chunk: chunks[idx] })
            }

            console.log(`[SYNC] ${isUpdate ? 'Updated' : 'Created'}: ${fileName} -> ${sessionId}`)

            return {
                status: isUpdate ? 'updated' : 'created',
                fileName,
                sessionId
            }

        } catch (error: any) {
            console.error('[SYNC] Error:', error)
            return { status: 'error', fileName, error: error.message }
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
