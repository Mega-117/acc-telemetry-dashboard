// ============================================
// useTelemetryData - Load and process session data from Firebase
// ============================================

import { ref, computed } from 'vue'
import { collection, query, orderBy, getDocs as firebaseGetDocs, doc, getDoc as firebaseGetDoc, setDoc as firebaseSetDoc, deleteDoc as firebaseDeleteDoc, DocumentReference, Query } from 'firebase/firestore'
import { db } from '~/config/firebase'

// === FIREBASE OPERATIONS TRACKER ===
// Tracks all Firebase read/write operations for debugging
let firebaseReadCount = 0
let firebaseWriteCount = 0
let currentPageReads = 0
let currentPageWrites = 0

// Reset page counters (call when navigating)
export function resetFirebasePageCounters() {
    currentPageReads = 0
    currentPageWrites = 0
    console.log('%c[FIREBASE] 📊 Page counters reset', 'color: #4CAF50; font-weight: bold')
}

// Get current counts
export function getFirebaseCounts() {
    return {
        totalReads: firebaseReadCount,
        totalWrites: firebaseWriteCount,
        pageReads: currentPageReads,
        pageWrites: currentPageWrites
    }
}

// Print summary
export function printFirebaseSummary() {
    console.log('%c[FIREBASE] ═══════════════════════════════════', 'color: #2196F3; font-weight: bold')
    console.log(`%c[FIREBASE] 📖 THIS PAGE: ${currentPageReads} reads, ${currentPageWrites} writes`, 'color: #2196F3; font-weight: bold')
    console.log(`%c[FIREBASE] 📚 SESSION TOTAL: ${firebaseReadCount} reads, ${firebaseWriteCount} writes`, 'color: #9E9E9E')
    console.log('%c[FIREBASE] ═══════════════════════════════════', 'color: #2196F3; font-weight: bold')
}

// Wrapped getDoc with tracking
async function getDoc(ref: DocumentReference) {
    firebaseReadCount++
    currentPageReads++
    console.log(`%c[FIREBASE] 📖 READ #${currentPageReads}: ${ref.path}`, 'color: #4CAF50')
    return firebaseGetDoc(ref)
}

// Wrapped getDocs with tracking
async function getDocs(q: Query) {
    firebaseReadCount++
    currentPageReads++
    console.log(`%c[FIREBASE] 📖 QUERY #${currentPageReads}: (collection query)`, 'color: #4CAF50')
    const result = await firebaseGetDocs(q)
    console.log(`%c[FIREBASE]    ↳ Returned ${result.docs.length} documents`, 'color: #8BC34A')
    return result
}

// Wrapped setDoc with tracking
async function setDoc(ref: DocumentReference, data: any) {
    firebaseWriteCount++
    currentPageWrites++
    console.log(`%c[FIREBASE] ✏️ WRITE #${currentPageWrites}: ${ref.path}`, 'color: #FF9800')
    return firebaseSetDoc(ref, data)
}
// === TYPES ===

export interface LapData {
    lap_number: number
    lap_time_ms: number
    elapsed_time_ms: number
    fuel_start: number
    fuel_remaining: number
    air_temp: number
    road_temp: number
    rain_intensity: string
    track_grip_status: string
    is_valid: boolean
    is_first_stint_lap: boolean
    has_pit_stop: boolean
    pit_out_lap: boolean
    sectors_reliable: boolean
    sector_times_ms: number[]
}

export interface StintData {
    stint_number: number
    type: string
    fuel_start: number
    avg_clean_lap: number
    stint_drive_time_ms: number
    laps: LapData[]
}

export interface SessionMeta {
    track: string
    car: string
    date_start: string
    date_end: string | null
    session_type: number // 0=Race, 1=Qualify, 2=Practice
    driver: string | null
}

export interface SessionSummary {
    laps: number
    lapsValid: number
    bestLap: number | null
    avgCleanLap: number | null
    totalTime: number
    stintCount: number
    // Optional grip-specific best times (can be null or undefined)
    best_qualy_ms?: number | null
    best_race_ms?: number | null
    best_avg_race_ms?: number | null
    best_qualy_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
    best_race_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
    best_avg_race_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
    best_by_grip?: Record<string, any>
}

export interface SessionDocument {
    sessionId: string
    fileHash: string
    fileName: string
    uploadedAt: any
    meta: SessionMeta
    summary: SessionSummary
    rawChunkCount: number
    rawSizeBytes: number
}

export interface FullSession {
    session_info: {
        track: string
        car: string
        driver: string
        session_type: number
        date_start: string
        date_end: string
        start_air_temp: number
        start_road_temp: number
        start_track_grip: string
        start_weather: string
        session_best_lap: number
        avg_clean_lap: number
        total_drive_time_ms: number
        laps_total: number
        laps_valid: number
        laps_invalid: number
    }
    stints: StintData[]
    ownerId: string
    ownerEmail: string
}

// Session type mapping (ACC game values)
// 0 = Practice, 1 = Qualify, 2 = Race
export const SESSION_TYPES = {
    PRACTICE: 0,
    QUALIFY: 1,
    RACE: 2
} as const

export type SessionType = 'race' | 'qualify' | 'practice'

export function getSessionTypeLabel(type: number): SessionType {
    switch (type) {
        case 0: return 'practice'
        case 1: return 'qualify'
        case 2: return 'race'
        default: return 'practice'
    }
}

export function getSessionTypeDisplay(type: number): string {
    switch (type) {
        case 0: return 'PRACTICE'
        case 1: return 'QUALIFY'
        case 2: return 'RACE'
        default: return 'PRACTICE'
    }
}

// === FORMAT HELPERS ===

export function formatLapTime(ms: number | null | undefined): string {
    if (!ms || ms <= 0) return '--:--.---'
    const msInt = Math.round(ms) // Ensure integer to avoid decimal artifacts
    const minutes = Math.floor(msInt / 60000)
    const seconds = Math.floor((msInt % 60000) / 1000)
    const millis = msInt % 1000
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

export function formatDriveTime(ms: number): string {
    if (!ms || ms <= 0) return '0h 0m'
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    if (hours > 0) {
        return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
}

export function formatCarName(car: string): string {
    if (!car) return 'Unknown'
    // Convert "amr_v8_vantage_gt3" → "AMR V8 Vantage GT3"
    return car
        .split('_')
        .map((word, i) => {
            // Keep GT3, GT4 etc uppercase
            if (word.match(/^gt\d$/i)) return word.toUpperCase()
            // Keep short words like V8 uppercase
            if (word.length <= 2) return word.toUpperCase()
            // Capitalize first letter
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        })
        .join(' ')
}

export function formatTrackName(track: string): string {
    if (!track) return 'Unknown'
    // Capitalize track name and handle underscores
    return track
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
}

export function formatDate(dateStr: string): string {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    const day = date.getDate()
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
    return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`
}

export function formatDateFull(dateStr: string): string {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    const day = date.getDate()
    const months = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
        'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE']
    return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`
}

export function formatTime(dateStr: string): string {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

// === GLOBAL STATE (persists across page navigations) ===
// This singleton pattern ensures sessions are loaded once and reused
const globalSessions = ref<SessionDocument[]>([])
const globalIsLoading = ref(false)
const globalError = ref<string | null>(null)
const globalLastUserId = ref<string | null>(null)  // Track which user's data is loaded
const globalPrefetchComplete = ref(false)  // Track if batch prefetch has completed

// === SESSIONSTORAGE PERSISTENCE ===
// Keys for sessionStorage cache (survives page refresh but not browser close)
const CACHE_KEY_TRACK_BESTS = 'acc_trackBests_cache'
const CACHE_KEY_TRACK_ACTIVITY = 'acc_trackActivity_cache'
const CACHE_KEY_USER_ID = 'acc_cache_userId'

// Helper: Save cache to sessionStorage
function saveCacheToStorage(key: string, data: any, userId: string): void {
    if (typeof window === 'undefined') return
    try {
        const payload = { userId, data, timestamp: Date.now() }
        sessionStorage.setItem(key, JSON.stringify(payload))
        console.log(`[CACHE] 💾 Saved ${key} to sessionStorage`)
    } catch (e) {
        console.warn('[CACHE] Failed to save to sessionStorage:', e)
    }
}

// Helper: Load cache from sessionStorage (returns null if expired or wrong user)
function loadCacheFromStorage(key: string, userId: string): any | null {
    if (typeof window === 'undefined') return null
    try {
        const stored = sessionStorage.getItem(key)
        if (!stored) return null

        const { userId: storedUserId, data, timestamp } = JSON.parse(stored)

        // Invalidate if different user
        if (storedUserId !== userId) {
            console.log(`[CACHE] Different user, invalidating ${key}`)
            sessionStorage.removeItem(key)
            return null
        }

        // Invalidate if older than 1 hour (3600000ms)
        const maxAge = 3600000
        if (Date.now() - timestamp > maxAge) {
            console.log(`[CACHE] Cache expired, invalidating ${key}`)
            sessionStorage.removeItem(key)
            return null
        }

        console.log(`[CACHE] ✅ Loaded ${key} from sessionStorage (age: ${Math.round((Date.now() - timestamp) / 1000)}s)`)
        return data
    } catch (e) {
        console.warn('[CACHE] Failed to load from sessionStorage:', e)
        return null
    }
}

// === COMPOSABLE ===

export function useTelemetryData() {
    // Use global state (shared across all components/pages)
    const sessions = globalSessions
    const isLoading = globalIsLoading
    const error = globalError

    const { currentUser } = useFirebaseAuth()

    // Check if running in Electron
    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        return !!(window as any).electronAPI
    })

    // Helper: Generate session ID from date_start and track
    // IMPORTANT: Must match useElectronSync.generateSessionId for consistency
    function generateSessionId(dateStart: string, track: string): string {
        // Remove microseconds: "2026-01-04T17:11:38.128663" -> "2026-01-04T17:11:38"
        const normalized = dateStart.split('.')[0]
        const base = `${normalized}_${track}`.replace(/[^a-zA-Z0-9]/g, '_')
        return base.substring(0, 100)
    }

    // Helper: Extract metadata from raw session object (reused from useElectronSync logic)
    function extractMetadata(rawObj: any): { meta: SessionMeta; summary: SessionSummary } {
        const sessionInfo = rawObj.session_info || {}
        const stints = rawObj.stints || []

        const meta: SessionMeta = {
            track: sessionInfo.track || rawObj.track || 'Unknown',
            date_start: sessionInfo.date_start || rawObj.date || new Date().toISOString(),
            date_end: sessionInfo.date_end || null,
            car: sessionInfo.car_model || sessionInfo.car || rawObj.car || '',
            session_type: sessionInfo.session_type ?? 0,
            driver: sessionInfo.driver || null
        }

        // Track best times by grip
        const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']
        const bestByGrip: Record<string, any> = {}
        gripConditions.forEach(grip => {
            bestByGrip[grip] = {
                bestQualy: null, bestQualyTemp: null,
                bestRace: null, bestRaceTemp: null,
                bestAvgRace: null, bestAvgRaceTemp: null
            }
        })

        let bestQualyMs: number | null = null
        let bestQualyConditions: any = null
        let bestRaceMs: number | null = null
        let bestRaceConditions: any = null
        let bestAvgRaceMs: number | null = null
        let bestAvgRaceConditions: any = null

        stints.forEach((stint: any) => {
            const isQualy = stint.type === 'Qualify'
            const laps = stint.laps || []

            laps.forEach((lap: any) => {
                if (lap.is_valid && !lap.has_pit_stop && lap.lap_time_ms) {
                    const grip = lap.track_grip_status || 'Unknown'
                    const airTemp = lap.air_temp || 0
                    const conditions = { airTemp, roadTemp: lap.road_temp || 0, grip }

                    if (bestByGrip[grip]) {
                        if (isQualy) {
                            if (!bestByGrip[grip].bestQualy || lap.lap_time_ms < bestByGrip[grip].bestQualy) {
                                bestByGrip[grip].bestQualy = lap.lap_time_ms
                                bestByGrip[grip].bestQualyTemp = airTemp
                            }
                        } else {
                            if (!bestByGrip[grip].bestRace || lap.lap_time_ms < bestByGrip[grip].bestRace) {
                                bestByGrip[grip].bestRace = lap.lap_time_ms
                                bestByGrip[grip].bestRaceTemp = airTemp
                            }
                        }
                    }

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

            // Best avg race from stint - ONLY if 5+ VALID laps
            const validStintLaps = laps.filter((l: any) => l.is_valid && !l.has_pit_stop)
            if (!isQualy && stint.avg_clean_lap && validStintLaps.length >= 5) {
                const firstValidLap = validStintLaps[0]
                const grip = firstValidLap?.track_grip_status || 'Unknown'
                const airTemp = firstValidLap?.air_temp || 0

                if (bestByGrip[grip]) {
                    if (!bestByGrip[grip].bestAvgRace || stint.avg_clean_lap < bestByGrip[grip].bestAvgRace) {
                        bestByGrip[grip].bestAvgRace = stint.avg_clean_lap
                        bestByGrip[grip].bestAvgRaceTemp = airTemp
                    }
                }

                if (!bestAvgRaceMs || stint.avg_clean_lap < bestAvgRaceMs) {
                    bestAvgRaceMs = stint.avg_clean_lap
                    bestAvgRaceConditions = { airTemp, roadTemp: firstValidLap?.road_temp || 0, grip }
                }
            }
        })

        const summary: SessionSummary = {
            laps: sessionInfo.laps_total || rawObj.laps?.length || 0,
            lapsValid: sessionInfo.laps_valid || 0,
            bestLap: sessionInfo.session_best_lap || rawObj.bestLap || null,
            avgCleanLap: sessionInfo.avg_clean_lap || null,
            totalTime: sessionInfo.total_drive_time_ms || 0,
            stintCount: stints.length || 0,
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

    // Load sessions from LOCAL files (Electron only)
    async function loadFromLocalFiles(): Promise<SessionDocument[]> {
        if (!isElectron.value) return []

        const electronAPI = (window as any).electronAPI
        const files = await electronAPI.getTelemetryFiles()

        if (!files || files.length === 0) return []

        const uid = currentUser.value?.uid
        const localSessions: SessionDocument[] = []

        for (const file of files) {
            try {
                const rawObj = await electronAPI.readFile(file.path)
                if (!rawObj) continue

                // Skip files belonging to other users
                if (rawObj.ownerId && rawObj.ownerId !== uid) continue

                const { meta, summary } = extractMetadata(rawObj)
                const sessionId = generateSessionId(meta.date_start, meta.track)

                localSessions.push({
                    sessionId,
                    fileHash: '', // Not needed for display
                    fileName: file.name,
                    uploadedAt: null,
                    meta,
                    summary,
                    rawChunkCount: 0,
                    rawSizeBytes: 0
                })
            } catch (e) {
                console.warn(`[TELEMETRY] Error reading local file ${file.name}:`, e)
            }
        }

        // Sort by date descending
        localSessions.sort((a, b) =>
            (b.meta.date_start || '').localeCompare(a.meta.date_start || '')
        )

        return localSessions
    }

    // Load sessions from Firebase
    async function loadFromFirebase(targetUserId: string): Promise<SessionDocument[]> {
        const sessionsRef = collection(db, `users/${targetUserId}/sessions`)

        let querySnapshot
        try {
            const q = query(sessionsRef, orderBy('uploadedAt', 'desc'))
            querySnapshot = await getDocs(q)
        } catch (orderError) {
            console.warn('[TELEMETRY] orderBy failed, fetching without order')
            querySnapshot = await getDocs(sessionsRef)
        }

        return querySnapshot.docs.map(docSnap => {
            const data = docSnap.data()
            return {
                sessionId: docSnap.id,
                fileHash: data.fileHash || null,
                fileName: data.fileName || null,
                uploadedAt: data.uploadedAt || null,
                meta: data.meta || {},
                summary: data.summary || {},
                rawChunkCount: data.rawChunkCount || 0,
                rawSizeBytes: data.rawSizeBytes || 0
            } as SessionDocument
        })
    }

    // Load session metadata - HYBRID: local files (Electron) or Firebase
    // Added: forceReload parameter to control caching behavior
    async function loadSessions(userId?: string, forceReload: boolean = false): Promise<SessionDocument[]> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) {
            console.warn('[TELEMETRY] No user ID provided')
            return []
        }

        // CACHE: Check if we need to reload due to user change or force reload
        // This prevents duplicate queries when multiple components call loadSessions
        const userChanged = globalLastUserId.value !== targetUserId

        if (!forceReload && !userChanged && sessions.value.length > 0) {
            console.log(`%c[TELEMETRY] ⚡ Using CACHED sessions (${sessions.value.length}), skipping Firebase query`, 'color: #9C27B0')
            return sessions.value
        }

        // Track current user for cache invalidation
        globalLastUserId.value = targetUserId

        isLoading.value = true
        error.value = null

        try {
            // HYBRID APPROACH: Always load from Firebase + merge local files not yet uploaded
            // This ensures we see ALL sessions regardless of local file state
            const isLoadingOwnData = !userId || userId === currentUser.value?.uid

            // 1. Load local files (if Electron and own data)
            let localSessions: SessionDocument[] = []
            if (isElectron.value && isLoadingOwnData) {
                try {
                    localSessions = await loadFromLocalFiles()
                    console.log(`[TELEMETRY] Found ${localSessions.length} local files`)
                } catch (localError) {
                    console.warn('[TELEMETRY] Local load failed:', localError)
                }
            }

            // 2. ALWAYS load from Firebase for complete data
            const firebaseSessions = await loadFromFirebase(targetUserId)

            // DEDUPLICATION: Remove duplicates based on date_start + track (logical key)
            // Sessions with same date_start (ignoring microseconds) and track are duplicates
            const sessionMap = new Map<string, SessionDocument>()
            for (const session of firebaseSessions) {
                // Create logical key from date_start + track (normalized like generateSessionId)
                // Remove microseconds: "2026-01-04T17:11:38.128663" -> "2026-01-04T17:11:38"
                const dateKey = (session.meta.date_start || '').split('.')[0]
                const trackKey = (session.meta.track || '').toLowerCase().replace(/[^a-z0-9]/g, '_')
                const logicalKey = `${dateKey}_${trackKey}`

                const existing = sessionMap.get(logicalKey)
                if (!existing) {
                    sessionMap.set(logicalKey, session)
                } else {
                    // Keep the one with newer uploadedAt (or the existing one if no uploadedAt)
                    const existingTime = existing.uploadedAt?.toMillis?.() || 0
                    const newTime = session.uploadedAt?.toMillis?.() || 0
                    if (newTime > existingTime) {
                        sessionMap.set(logicalKey, session)
                    }
                }
            }

            const deduplicatedCount = firebaseSessions.length - sessionMap.size
            if (deduplicatedCount > 0) {
                console.log(`[TELEMETRY] ⚠️ Removed ${deduplicatedCount} duplicate sessions (same date + track)`)
            }

            // 3. MERGE: Add local sessions that are not yet on Firebase
            let mergedCount = 0
            for (const localSession of localSessions) {
                const dateKey = (localSession.meta.date_start || '').split('.')[0]
                const trackKey = (localSession.meta.track || '').toLowerCase().replace(/[^a-z0-9]/g, '_')
                const logicalKey = `${dateKey}_${trackKey}`

                if (!sessionMap.has(logicalKey)) {
                    sessionMap.set(logicalKey, localSession)
                    mergedCount++
                }
            }

            if (mergedCount > 0) {
                console.log(`[TELEMETRY] 📁 Merged ${mergedCount} local-only sessions (not yet uploaded)`)
            }

            sessions.value = Array.from(sessionMap.values())

            // Sort by date if not already
            sessions.value.sort((a, b) =>
                (b.meta.date_start || '').localeCompare(a.meta.date_start || '')
            )

            console.log(`[TELEMETRY] ⚡ Loaded ${sessions.value.length} sessions (${firebaseSessions.length} Firebase + ${mergedCount} local-only)`)
            return sessions.value
        } catch (e: any) {
            console.error('[TELEMETRY] Error loading sessions:', e)
            error.value = e.message
            return []
        } finally {
            isLoading.value = false
        }
    }

    // Fetch full session with raw data - HYBRID: local file (Electron) or Firebase chunks
    async function fetchSessionFull(sessionId: string, userId?: string): Promise<FullSession | null> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) return null

        const isLoadingOwnData = !userId || userId === currentUser.value?.uid

        // OPTIMIZATION: If in Electron and loading OWN data, read from local file
        if (isElectron.value && isLoadingOwnData) {
            try {
                const electronAPI = (window as any).electronAPI
                const files = await electronAPI.getTelemetryFiles()

                // Find matching file by sessionId pattern
                for (const file of files) {
                    const rawObj = await electronAPI.readFile(file.path)
                    if (!rawObj) continue

                    // Skip files belonging to other users
                    if (rawObj.ownerId && rawObj.ownerId !== targetUserId) continue

                    const sessionInfo = rawObj.session_info || {}
                    const localSessionId = generateSessionId(
                        sessionInfo.date_start || rawObj.date || '',
                        sessionInfo.track || rawObj.track || ''
                    )

                    if (localSessionId === sessionId) {
                        console.log(`[TELEMETRY] ⚡ Loaded full session from LOCAL file (0 Firebase reads)`)
                        return rawObj as FullSession
                    }
                }
            } catch (localError) {
                console.warn('[TELEMETRY] Local fetchSessionFull failed, falling back to Firebase:', localError)
            }
        }

        // FALLBACK: Load from Firebase chunks
        try {
            // Get session document
            const sessionRef = doc(db, `users/${targetUserId}/sessions/${sessionId}`)
            const sessionSnap = await getDoc(sessionRef)

            if (!sessionSnap.exists()) return null

            const sessionData = sessionSnap.data()
            const chunkCount = sessionData.rawChunkCount || 0

            if (chunkCount === 0) return null

            // Fetch and reconstruct chunks
            const chunksRef = collection(db, `users/${targetUserId}/sessions/${sessionId}/rawChunks`)
            const q = query(chunksRef, orderBy('idx', 'asc'))
            const chunksSnap = await getDocs(q)

            const chunks: { idx: number; chunk: string }[] = []
            chunksSnap.forEach(docSnap => {
                const data = docSnap.data()
                chunks.push({ idx: data.idx, chunk: data.chunk })
            })

            // Sort and concatenate
            chunks.sort((a, b) => a.idx - b.idx)
            const rawText = chunks.map(c => c.chunk).join('')

            // Parse JSON
            console.log(`[TELEMETRY] Loaded full session from Firebase chunks`)
            return JSON.parse(rawText) as FullSession
        } catch (e) {
            console.error('[TELEMETRY] Error fetching full session:', e)
            return null
        }
    }

    // === CENTRALIZED BEST TIMES CALCULATION ===
    // Minimum valid laps required for avg race calculation
    const MIN_VALID_LAPS_FOR_AVG = 5

    // Type for grip-specific best times
    type GripBestTimes = {
        bestQualy: number | null
        bestQualyTemp: number | null
        bestQualySessionId: string | null
        bestQualyDate: string | null
        bestRace: number | null
        bestRaceTemp: number | null
        bestRaceSessionId: string | null
        bestRaceDate: string | null
        bestAvgRace: number | null
        bestAvgRaceTemp: number | null
        bestAvgRaceSessionId: string | null
        bestAvgRaceDate: string | null
    }

    /**
     * Calculate ALL best times for a track using session summaries (NO EXTRA QUERIES).
     * Returns best Qualy, Race, and AvgRace for each grip condition.
     * Uses summary.best_by_grip which is already loaded with session metadata.
     * 
     * @param trackId - Track ID to calculate for
     * @param userId - Optional user ID (default: current user)
     * @returns Promise with all bests per grip condition
     */
    async function calculateAllBestTimesForTrack(
        trackId: string,
        userId?: string
    ): Promise<Record<string, GripBestTimes>> {
        const trackIdNorm = trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')

        const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']
        const gripBests: Record<string, GripBestTimes> = {}

        gripConditions.forEach(grip => {
            gripBests[grip] = {
                bestQualy: null, bestQualyTemp: null, bestQualySessionId: null, bestQualyDate: null,
                bestRace: null, bestRaceTemp: null, bestRaceSessionId: null, bestRaceDate: null,
                bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceSessionId: null, bestAvgRaceDate: null
            }
        })

        // Get sessions for this track (already loaded, no query needed)
        const trackSessionsList = sessions.value.filter(s => {
            const sessionTrackId = s.meta.track.toLowerCase().replace(/[^a-z0-9]/g, '_')
            return sessionTrackId.includes(trackIdNorm) || trackIdNorm.includes(sessionTrackId)
        })

        if (trackSessionsList.length === 0) return gripBests

        // Normalize grip helper
        const normalizeGrip = (grip: string) => grip === 'Opt' ? 'Optimum' : grip

        // Process each session's SUMMARY (already loaded, no extra queries!)
        for (const session of trackSessionsList) {
            const sessionDate = session.meta.date_start || null
            const bestByGrip = session.summary?.best_by_grip

            if (!bestByGrip) continue

            // Check each grip condition
            for (const grip of gripConditions) {
                const sessionBest = bestByGrip[grip]
                if (!sessionBest) continue

                // Best Qualy
                if (sessionBest.bestQualy && (!gripBests[grip].bestQualy || sessionBest.bestQualy < gripBests[grip].bestQualy!)) {
                    gripBests[grip].bestQualy = sessionBest.bestQualy
                    gripBests[grip].bestQualyTemp = sessionBest.bestQualyTemp
                    gripBests[grip].bestQualySessionId = session.sessionId
                    gripBests[grip].bestQualyDate = sessionDate
                }

                // Best Race
                if (sessionBest.bestRace && (!gripBests[grip].bestRace || sessionBest.bestRace < gripBests[grip].bestRace!)) {
                    gripBests[grip].bestRace = sessionBest.bestRace
                    gripBests[grip].bestRaceTemp = sessionBest.bestRaceTemp
                    gripBests[grip].bestRaceSessionId = session.sessionId
                    gripBests[grip].bestRaceDate = sessionDate
                }

                // Best Avg Race
                if (sessionBest.bestAvgRace && (!gripBests[grip].bestAvgRace || sessionBest.bestAvgRace < gripBests[grip].bestAvgRace!)) {
                    gripBests[grip].bestAvgRace = sessionBest.bestAvgRace
                    gripBests[grip].bestAvgRaceTemp = sessionBest.bestAvgRaceTemp
                    gripBests[grip].bestAvgRaceSessionId = session.sessionId
                    gripBests[grip].bestAvgRaceDate = sessionDate
                }
            }
        }

        console.log(`[TELEMETRY] ⚡ Calculated trackBests for ${trackIdNorm} from ${trackSessionsList.length} sessions (0 extra queries)`)
        return gripBests
    }

    /**
     * Get best times for a specific grip condition (e.g., 'Optimum')
     */
    async function getBestTimesForGrip(
        trackId: string,
        grip: string = 'Optimum',
        userId?: string
    ): Promise<GripBestTimes> {
        const allBests = await getTrackBests(trackId, userId)
        return allBests[grip] || {
            bestQualy: null, bestQualyTemp: null, bestQualySessionId: null, bestQualyDate: null,
            bestRace: null, bestRaceTemp: null, bestRaceSessionId: null, bestRaceDate: null,
            bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceSessionId: null, bestAvgRaceDate: null
        }
    }

    // Cache for track bests (in-memory for session duration)
    const trackBestsCache = ref<Record<string, Record<string, GripBestTimes>>>({})

    /**
     * Get all best times for a track (all grip conditions).
     * OPTIMIZED: Uses lazy loading with Firebase caching.
     * 1. Check in-memory cache first
     * 2. Try to read from Firebase /trackBests/{trackId}
     * 3. If not found, calculate from sessions and save to Firebase
     * 
     * This reduces reads from ~70 (per track) to 1.
     */
    async function getTrackBests(
        trackId: string,
        userId?: string
    ): Promise<Record<string, GripBestTimes>> {
        const targetUserId = userId || currentUser.value?.uid
        const trackIdNorm = trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const cacheKey = `${trackIdNorm}_${targetUserId || 'anon'}`

        // 1. Check in-memory cache
        if (trackBestsCache.value[cacheKey]) {
            console.log(`[TELEMETRY] trackBests cache HIT for ${trackIdNorm}`)
            return trackBestsCache.value[cacheKey]
        }

        // 2. Try Firebase /trackBests collection (if user is logged in and not Electron)
        if (targetUserId && !isElectron.value) {
            try {
                const docRef = doc(db, `users/${targetUserId}/trackBests/${trackIdNorm}`)
                const docSnap = await getDoc(docRef)

                if (docSnap.exists()) {
                    const data = docSnap.data()
                    console.log(`[TELEMETRY] trackBests Firebase HIT for ${trackIdNorm}`)

                    // Convert to GripBestTimes format
                    // Support both formats: data.bests[grip] (upload format) OR data[grip] (legacy)
                    const result: Record<string, GripBestTimes> = {}
                    const bestsSource = data.bests || data  // Use 'bests' if exists, otherwise root

                    const standardGrips = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']

                    for (const grip of standardGrips) {
                        if (bestsSource[grip]) {
                            result[grip] = bestsSource[grip] as GripBestTimes
                        }
                    }

                    // Handle legacy 'Opt' -> merge into 'Optimum'
                    if (bestsSource['Opt']) {
                        const legacyOpt = bestsSource['Opt'] as GripBestTimes
                        if (!result['Optimum']) {
                            result['Optimum'] = legacyOpt
                        } else {
                            // Merge: keep better values
                            const opt = result['Optimum']
                            if (legacyOpt.bestQualy && (!opt.bestQualy || legacyOpt.bestQualy < opt.bestQualy)) {
                                opt.bestQualy = legacyOpt.bestQualy
                                opt.bestQualyTemp = legacyOpt.bestQualyTemp
                                opt.bestQualySessionId = legacyOpt.bestQualySessionId
                                opt.bestQualyDate = legacyOpt.bestQualyDate
                            }
                            if (legacyOpt.bestRace && (!opt.bestRace || legacyOpt.bestRace < opt.bestRace)) {
                                opt.bestRace = legacyOpt.bestRace
                                opt.bestRaceTemp = legacyOpt.bestRaceTemp
                                opt.bestRaceSessionId = legacyOpt.bestRaceSessionId
                                opt.bestRaceDate = legacyOpt.bestRaceDate
                            }
                            if (legacyOpt.bestAvgRace && (!opt.bestAvgRace || legacyOpt.bestAvgRace < opt.bestAvgRace)) {
                                opt.bestAvgRace = legacyOpt.bestAvgRace
                                opt.bestAvgRaceTemp = legacyOpt.bestAvgRaceTemp
                                opt.bestAvgRaceSessionId = legacyOpt.bestAvgRaceSessionId
                                opt.bestAvgRaceDate = legacyOpt.bestAvgRaceDate
                            }
                        }
                    }

                    // Cache and return
                    trackBestsCache.value[cacheKey] = result
                    return result
                }
            } catch (e) {
                console.warn(`[TELEMETRY] Error reading trackBests from Firebase:`, e)
            }
        }

        // 3. Not found - calculate from sessions
        console.log(`[TELEMETRY] trackBests MISS for ${trackIdNorm}, calculating...`)
        const calculatedBests = await calculateAllBestTimesForTrack(trackId, userId)

        // 4. Save to Firebase for future use (if user logged in and not Electron)
        if (targetUserId && !isElectron.value) {
            try {
                const docRef = doc(db, `users/${targetUserId}/trackBests/${trackIdNorm}`)
                // IMPORTANT: Save with 'bests' wrapper to match useElectronSync format
                await setDoc(docRef, {
                    trackId: trackIdNorm,
                    bests: calculatedBests,
                    lastUpdated: new Date().toISOString()
                })
                console.log(`[TELEMETRY] trackBests SAVED to Firebase for ${trackIdNorm}`)
            } catch (e) {
                console.warn(`[TELEMETRY] Error saving trackBests to Firebase:`, e)
            }
        }

        // Cache and return
        trackBestsCache.value[cacheKey] = calculatedBests
        return calculatedBests
    }

    /**
     * Invalidate trackBests cache for a track (call after new session upload)
     * @param clearFirebase - If true, also deletes from Firebase to force fresh calculation
     */
    async function invalidateTrackBests(trackId: string, userId?: string, clearFirebase: boolean = false) {
        const trackIdNorm = trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const targetUserId = userId || currentUser.value?.uid
        const cacheKey = `${trackIdNorm}_${targetUserId || 'anon'}`

        // Clear in-memory cache
        delete trackBestsCache.value[cacheKey]
        console.log(`[TELEMETRY] trackBests cache INVALIDATED for ${trackIdNorm}`)

        // Optionally clear Firebase to force fresh recalculation
        if (clearFirebase && targetUserId && !isElectron.value) {
            try {
                const docRef = doc(db, `users/${targetUserId}/trackBests/${trackIdNorm}`)
                await firebaseDeleteDoc(docRef)
                console.log(`[TELEMETRY] trackBests DELETED from Firebase for ${trackIdNorm}`)
            } catch (e) {
                console.warn(`[TELEMETRY] Error deleting trackBests from Firebase:`, e)
            }
        }
    }

    /**
     * Force recalculate trackBests by clearing cache + Firebase, then recalculating
     * Use when data seems out of sync
     */
    async function forceRecalculateTrackBests(trackId: string, userId?: string): Promise<Record<string, GripBestTimes>> {
        console.log(`[TELEMETRY] FORCE RECALCULATING trackBests for ${trackId}`)

        // Clear both caches
        await invalidateTrackBests(trackId, userId, true)

        // Recalculate from sessions (this will also save to Firebase)
        return await getTrackBests(trackId, userId)
    }

    /**
     * BATCH PREFETCH: Load ALL trackBests in a single query
     * Call this after login to populate cache for all pages.
     * Reduces N separate reads to just 1 collection query.
     * 
     * @param userId - Optional user ID (default: current user)
     * @returns Number of trackBests loaded
     */
    async function prefetchAllTrackBests(userId?: string): Promise<number> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) {
            console.warn('[PREFETCH] No user ID, skipping prefetch')
            return 0
        }

        // NOTE: Prefetch ora funziona ANCHE in Electron per garantire ottimizzazione query

        // 1. Try loading from sessionStorage first (avoids Firebase call on refresh)
        const storedBests = loadCacheFromStorage(CACHE_KEY_TRACK_BESTS, targetUserId)
        const storedActivity = loadCacheFromStorage(CACHE_KEY_TRACK_ACTIVITY, targetUserId)

        if (storedBests && Object.keys(storedBests).length > 0) {
            console.log(`[PREFETCH] ⚡ Using sessionStorage cache: ${Object.keys(storedBests).length} trackBests`)

            // Restore in-memory caches from sessionStorage
            Object.assign(trackBestsCache.value, storedBests)
            if (storedActivity) {
                Object.assign(trackActivityCache.value, storedActivity)
            }

            globalPrefetchComplete.value = true
            return Object.keys(storedBests).length
        }

        console.log(`[PREFETCH] 🚀 Starting batch prefetch for user ${targetUserId}`)
        const startTime = Date.now()

        try {
            // Single query to get ALL trackBests documents
            const trackBestsRef = collection(db, `users/${targetUserId}/trackBests`)
            const snapshot = await getDocs(query(trackBestsRef))

            let loadedCount = 0
            const standardGrips = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']

            snapshot.forEach(docSnap => {
                const trackIdNorm = docSnap.id
                const data = docSnap.data()
                const cacheKey = `${trackIdNorm}_${targetUserId}`

                // Parse bests data
                const result: Record<string, GripBestTimes> = {}
                const bestsSource = data.bests || data

                for (const grip of standardGrips) {
                    if (bestsSource[grip]) {
                        result[grip] = bestsSource[grip] as GripBestTimes
                    }
                }

                // Handle legacy 'Opt' -> merge into 'Optimum'
                if (bestsSource['Opt']) {
                    const legacyOpt = bestsSource['Opt'] as GripBestTimes
                    if (!result['Optimum']) {
                        result['Optimum'] = legacyOpt
                    } else {
                        const opt = result['Optimum']
                        if (legacyOpt.bestQualy && (!opt.bestQualy || legacyOpt.bestQualy < opt.bestQualy)) {
                            opt.bestQualy = legacyOpt.bestQualy
                            opt.bestQualyTemp = legacyOpt.bestQualyTemp
                            opt.bestQualySessionId = legacyOpt.bestQualySessionId
                            opt.bestQualyDate = legacyOpt.bestQualyDate
                        }
                        if (legacyOpt.bestRace && (!opt.bestRace || legacyOpt.bestRace < opt.bestRace)) {
                            opt.bestRace = legacyOpt.bestRace
                            opt.bestRaceTemp = legacyOpt.bestRaceTemp
                            opt.bestRaceSessionId = legacyOpt.bestRaceSessionId
                            opt.bestRaceDate = legacyOpt.bestRaceDate
                        }
                        if (legacyOpt.bestAvgRace && (!opt.bestAvgRace || legacyOpt.bestAvgRace < opt.bestAvgRace)) {
                            opt.bestAvgRace = legacyOpt.bestAvgRace
                            opt.bestAvgRaceTemp = legacyOpt.bestAvgRaceTemp
                            opt.bestAvgRaceSessionId = legacyOpt.bestAvgRaceSessionId
                            opt.bestAvgRaceDate = legacyOpt.bestAvgRaceDate
                        }
                    }
                }

                // Store in trackBests cache
                trackBestsCache.value[cacheKey] = result

                // Also parse and store activity if present (avoids separate read!)
                if (data.activity) {
                    const activity = data.activity
                    trackActivityCache.value[cacheKey] = {
                        totalLaps: activity.totalLaps || 0,
                        validLaps: activity.validLaps || 0,
                        validPercent: activity.totalLaps > 0
                            ? Math.round((activity.validLaps / activity.totalLaps) * 100)
                            : 0,
                        totalTimeMs: activity.totalTimeMs || 0,
                        totalTimeFormatted: formatDriveTime(activity.totalTimeMs || 0),
                        sessionCount: activity.sessionCount || 0,
                        lastSessionDate: activity.lastSessionDate
                    }
                }

                loadedCount++
            })

            const elapsed = Date.now() - startTime
            console.log(`[PREFETCH] ✅ Loaded ${loadedCount} trackBests in ${elapsed}ms (1 query instead of ${loadedCount})`)

            // Save to sessionStorage for persistence across page refresh
            saveCacheToStorage(CACHE_KEY_TRACK_BESTS, trackBestsCache.value, targetUserId)
            saveCacheToStorage(CACHE_KEY_TRACK_ACTIVITY, trackActivityCache.value, targetUserId)

            // Mark prefetch as complete so other components know cache is warm
            globalPrefetchComplete.value = true

            return loadedCount

        } catch (e) {
            console.error('[PREFETCH] Error during batch prefetch:', e)
            globalPrefetchComplete.value = true  // Mark complete even on error to prevent blocking
            return 0
        }
    }

    // Cache for track activity (populated by prefetch or getTrackActivity)
    const trackActivityCache = ref<Record<string, TrackActivity>>({})

    type TrackActivity = {
        totalLaps: number
        validLaps: number
        validPercent: number
        totalTimeMs: number
        totalTimeFormatted: string
        sessionCount: number
        lastSessionDate?: string
    }

    /**
     * Get activity aggregates for a track (from Firebase trackBests or calculated)
     * Uses cache for performance
     */
    async function getTrackActivity(trackId: string, userId?: string): Promise<TrackActivity> {
        const trackIdNorm = trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const targetUserId = userId || currentUser.value?.uid
        const cacheKey = `${trackIdNorm}_${targetUserId || 'anon'}`

        // Check cache first
        if (trackActivityCache.value[cacheKey]) {
            return trackActivityCache.value[cacheKey]
        }

        // Try Firebase trackBests.activity
        if (targetUserId && !isElectron.value) {
            try {
                const docRef = doc(db, `users/${targetUserId}/trackBests/${trackIdNorm}`)
                const docSnap = await getDoc(docRef)

                if (docSnap.exists()) {
                    const data = docSnap.data()
                    if (data.activity) {
                        const activity = data.activity
                        const result: TrackActivity = {
                            totalLaps: activity.totalLaps || 0,
                            validLaps: activity.validLaps || 0,
                            validPercent: activity.totalLaps > 0
                                ? Math.round((activity.validLaps / activity.totalLaps) * 100)
                                : 0,
                            totalTimeMs: activity.totalTimeMs || 0,
                            totalTimeFormatted: formatDriveTime(activity.totalTimeMs || 0),
                            sessionCount: activity.sessionCount || 0,
                            lastSessionDate: activity.lastSessionDate
                        }
                        trackActivityCache.value[cacheKey] = result
                        console.log(`[TELEMETRY] trackActivity Firebase HIT for ${trackIdNorm}`)
                        return result
                    }
                }
            } catch (e) {
                console.warn(`[TELEMETRY] Error reading trackActivity from Firebase:`, e)
            }
        }

        // Fallback: calculate from sessions
        console.log(`[TELEMETRY] trackActivity MISS for ${trackIdNorm}, calculating...`)
        const calculated = getTrackActivityTotals(trackId)
        trackActivityCache.value[cacheKey] = calculated
        return calculated
    }

    // Type for theoretical times with temp adjustment
    type TheoreticalTimes = {
        theoQualy: number | null
        theoRace: number | null
        theoAvgRace: number | null
        // Historic values for reference
        historicQualy: number | null
        historicQualyTemp: number | null
        historicRace: number | null
        historicRaceTemp: number | null
        historicAvgRace: number | null
        historicAvgRaceTemp: number | null
        // Context
        grip: string
        stintTemp: number
    }

    /**
     * CENTRALIZED THEORETICAL TIMES CALCULATION
     * 
     * Calculates theoretical times for a track/grip combo with temperature adjustment.
     * Uses the centralized getBestTimesForGrip for base values.
     * 
     * Temperature adjustment formula:
     *   Teorico = Storico + (TempStint - TempStorico) × 100ms/°C
     *   - Colder = faster (negative adjustment)
     *   - Hotter = slower (positive adjustment)
     * 
     * @param trackId - Track ID
     * @param grip - Grip condition (e.g., 'Optimum', 'Wet')
     * @param stintTemp - Average temperature of the current stint (in °C)
     * @param userId - Optional user ID
     * @returns Theoretical times with temp adjustment applied
     */
    async function getTheoreticalTimes(
        trackId: string,
        grip: string,
        stintTemp: number,
        userId?: string
    ): Promise<TheoreticalTimes> {
        // Get centralized best times for this grip
        const bests = await getBestTimesForGrip(trackId, grip, userId)

        // Temperature adjustment helper: 100ms per degree difference
        function applyTempAdjustment(historicMs: number | null, historicTemp: number | null): number | null {
            if (!historicMs) return null
            const historicTempRounded = Math.round(historicTemp || stintTemp)
            const tempDiff = stintTemp - historicTempRounded
            const adjustmentMs = tempDiff * 100 // 100ms per degree
            return Math.round(historicMs + adjustmentMs)
        }

        return {
            theoQualy: applyTempAdjustment(bests.bestQualy, bests.bestQualyTemp),
            theoRace: applyTempAdjustment(bests.bestRace, bests.bestRaceTemp),
            theoAvgRace: applyTempAdjustment(bests.bestAvgRace, bests.bestAvgRaceTemp),
            // Include historic values for display/debugging
            historicQualy: bests.bestQualy,
            historicQualyTemp: bests.bestQualyTemp,
            historicRace: bests.bestRace,
            historicRaceTemp: bests.bestRaceTemp,
            historicAvgRace: bests.bestAvgRace,
            historicAvgRaceTemp: bests.bestAvgRaceTemp,
            grip,
            stintTemp
        }
    }

    // Legacy function - kept for backward compatibility
    async function calculateBestAvgRaceForTrack(
        trackId: string,
        userId?: string
    ): Promise<Record<string, { bestAvgRace: number | null, bestAvgRaceTemp: number | null }>> {
        const allBests = await calculateAllBestTimesForTrack(trackId, userId)

        // Extract only avgRace data for backward compatibility
        const result: Record<string, { bestAvgRace: number | null, bestAvgRaceTemp: number | null }> = {}
        for (const [grip, times] of Object.entries(allBests)) {
            result[grip] = { bestAvgRace: times.bestAvgRace, bestAvgRaceTemp: times.bestAvgRaceTemp }
        }
        return result
    }

    /**
     * Get simple best avg race for a track (any grip condition)
     * Returns the best avg race time regardless of grip.
     */
    async function getBestAvgRaceForTrack(trackId: string, userId?: string): Promise<number | null> {
        const allBests = await calculateAllBestTimesForTrack(trackId, userId)

        let best: number | null = null
        for (const grip of Object.keys(allBests)) {
            const gripBests = allBests[grip]
            if (!gripBests) continue
            const val = gripBests.bestAvgRace
            if (val && (!best || val < best)) {
                best = val
            }
        }

        return best
    }

    // === COMPUTED AGGREGATIONS ===

    // Get most recent session
    const lastSession = computed(() => {
        if (sessions.value.length === 0) return null
        return sessions.value[0] // Already sorted by date desc
    })

    // Get last used car
    const lastUsedCar = computed(() => {
        return lastSession.value?.meta.car || null
    })

    // Get last used track
    const lastUsedTrack = computed(() => {
        return lastSession.value?.meta.track || null
    })

    // Get unique tracks with aggregated stats
    const trackStats = computed(() => {
        type Conditions = { airTemp: number, roadTemp: number, grip: string } | null
        type GripBest = {
            bestQualy: number | null
            bestQualyTemp: number | null
            bestRace: number | null
            bestRaceTemp: number | null
            bestAvgRace: number | null
            bestAvgRaceTemp: number | null
        }

        const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']

        const stats: Record<string, {
            track: string
            sessions: number
            lastSession: string
            bestQualy: number | null
            bestQualyConditions: Conditions
            bestRace: number | null
            bestRaceConditions: Conditions
            bestAvgRace: number | null
            bestAvgRaceConditions: Conditions
            bestByGrip: Record<string, GripBest>
        }> = {}

        for (const session of sessions.value) {
            const track = (session.meta.track || 'unknown').toLowerCase()
            const summary = session.summary as any

            if (!stats[track]) {
                // Initialize track stats with empty grip bests
                const emptyGripBests: Record<string, GripBest> = {}
                gripConditions.forEach(grip => {
                    emptyGripBests[grip] = {
                        bestQualy: null, bestQualyTemp: null,
                        bestRace: null, bestRaceTemp: null,
                        bestAvgRace: null, bestAvgRaceTemp: null
                    }
                })

                stats[track] = {
                    track: session.meta.track,
                    sessions: 0,
                    lastSession: session.meta.date_start,
                    bestQualy: null,
                    bestQualyConditions: null,
                    bestRace: null,
                    bestRaceConditions: null,
                    bestAvgRace: null,
                    bestAvgRaceConditions: null,
                    bestByGrip: emptyGripBests
                }
            }

            stats[track].sessions++

            // Update last session date
            if (session.meta.date_start > stats[track].lastSession) {
                stats[track].lastSession = session.meta.date_start
            }

            // Aggregate best_by_grip from this session
            const sessionGripBests = summary?.best_by_grip
            if (sessionGripBests) {
                // Normalize grip names (handle legacy 'Opt' -> 'Optimum')
                const normalizeGrip = (grip: string) => grip === 'Opt' ? 'Optimum' : grip

                // Process ALL grips in session data (including legacy 'Opt')
                for (const rawGrip in sessionGripBests) {
                    const grip = normalizeGrip(rawGrip)
                    if (!gripConditions.includes(grip)) continue

                    const sessionGrip = sessionGripBests[rawGrip]
                    if (!sessionGrip) continue

                    const trackGrip = stats[track].bestByGrip[grip]
                    if (!trackGrip) continue

                    // Update best qualy for this grip
                    if (sessionGrip.bestQualy) {
                        if (!trackGrip.bestQualy || sessionGrip.bestQualy < trackGrip.bestQualy) {
                            trackGrip.bestQualy = sessionGrip.bestQualy
                            trackGrip.bestQualyTemp = sessionGrip.bestQualyTemp
                        }
                    }

                    // Update best race for this grip
                    if (sessionGrip.bestRace) {
                        if (!trackGrip.bestRace || sessionGrip.bestRace < trackGrip.bestRace) {
                            trackGrip.bestRace = sessionGrip.bestRace
                            trackGrip.bestRaceTemp = sessionGrip.bestRaceTemp
                        }
                    }

                    // Update best avg race for this grip
                    if (sessionGrip.bestAvgRace) {
                        if (!trackGrip.bestAvgRace || sessionGrip.bestAvgRace < trackGrip.bestAvgRace) {
                            trackGrip.bestAvgRace = sessionGrip.bestAvgRace
                            trackGrip.bestAvgRaceTemp = sessionGrip.bestAvgRaceTemp
                        }
                    }
                }
            }

            // Update overall bests (backward compatibility)
            const bestQualyMs = summary?.best_qualy_ms
            if (bestQualyMs) {
                if (!stats[track].bestQualy || bestQualyMs < stats[track].bestQualy!) {
                    stats[track].bestQualy = bestQualyMs
                    stats[track].bestQualyConditions = summary.best_qualy_conditions || null
                }
            } else if (session.meta.session_type === SESSION_TYPES.QUALIFY && summary?.bestLap) {
                if (!stats[track].bestQualy || summary.bestLap < stats[track].bestQualy!) {
                    stats[track].bestQualy = summary.bestLap
                    stats[track].bestQualyConditions = null
                }
            }

            const bestRaceMs = summary?.best_race_ms
            if (bestRaceMs) {
                if (!stats[track].bestRace || bestRaceMs < stats[track].bestRace!) {
                    stats[track].bestRace = bestRaceMs
                    stats[track].bestRaceConditions = summary.best_race_conditions || null
                }
            } else if (session.meta.session_type === SESSION_TYPES.RACE && summary?.bestLap) {
                if (!stats[track].bestRace || summary.bestLap < stats[track].bestRace!) {
                    stats[track].bestRace = summary.bestLap
                    stats[track].bestRaceConditions = null
                }
            }

            const bestAvgRaceMs = summary?.best_avg_race_ms
            if (bestAvgRaceMs) {
                if (!stats[track].bestAvgRace || bestAvgRaceMs < stats[track].bestAvgRace!) {
                    stats[track].bestAvgRace = bestAvgRaceMs
                    stats[track].bestAvgRaceConditions = summary.best_avg_race_conditions || null
                }
            }
        }

        return Object.values(stats).sort((a, b) =>
            (b.lastSession || '').localeCompare(a.lastSession || '')
        )
    })

    // Get sessions for a specific track
    function getSessionsForTrack(trackId: string): SessionDocument[] {
        return sessions.value.filter(
            s => (s.meta.track || '').toLowerCase() === trackId.toLowerCase()
        )
    }

    // Get session by ID
    function getSession(sessionId: string): SessionDocument | undefined {
        return sessions.value.find(s => s.sessionId === sessionId)
    }

    // Get activity totals for a specific track (for Track Detail page)
    function getTrackActivityTotals(trackId: string) {
        const trackSessions = getSessionsForTrack(trackId)

        let totalLaps = 0
        let validLaps = 0
        let totalTimeMs = 0

        for (const session of trackSessions) {
            totalLaps += session.summary?.laps || 0
            validLaps += session.summary?.lapsValid || 0
            totalTimeMs += session.summary?.totalTime || 0
        }

        return {
            totalLaps,
            validLaps,
            validPercent: totalLaps > 0 ? Math.round((validLaps / totalLaps) * 100) : 0,
            totalTimeMs,
            totalTimeFormatted: formatDriveTime(totalTimeMs),
            sessionCount: trackSessions.length
        }
    }

    // Get historical best times for a track (for chart)
    function getHistoricalBestTimes(trackId: string, grip?: string) {
        const trackSessions = getSessionsForTrack(trackId)
            .sort((a, b) => (a.meta.date_start || '').localeCompare(b.meta.date_start || ''))

        return trackSessions
            .map(s => {
                const summary = s.summary
                let bestQualy: number | null = null
                let bestRace: number | null = null

                // If grip specified, get from best_by_grip
                if (grip && summary?.best_by_grip?.[grip]) {
                    bestQualy = summary.best_by_grip[grip].bestQualy
                    bestRace = summary.best_by_grip[grip].bestRace
                } else {
                    // Otherwise use overall bests
                    bestQualy = summary?.best_qualy_ms || null
                    bestRace = summary?.best_race_ms || null
                }

                return {
                    date: s.meta.date_start,
                    sessionId: s.sessionId,
                    bestQualy,
                    bestRace,
                    sessionType: s.meta.session_type
                }
            })
            .filter(t => t.bestQualy || t.bestRace)
    }

    // Get activity data for last N days (real data from sessions)
    function getActivityData(days: number = 7) {
        const now = new Date()
        const dayLabels: string[] = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
        const activity: { day: string; practice: number; qualify: number; race: number }[] = []

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
            const dateStr = date.toISOString().split('T')[0] || ''

            const daySessions = sessions.value.filter(s =>
                s.meta.date_start?.startsWith(dateStr)
            )

            // Sum actual minutes from totalTime (ms -> minutes)
            let practiceMinutes = 0
            let qualifyMinutes = 0
            let raceMinutes = 0

            for (const session of daySessions) {
                const totalMs = session.summary?.totalTime || 0
                const minutes = Math.round(totalMs / 60000)

                switch (session.meta.session_type) {
                    case SESSION_TYPES.PRACTICE:
                        practiceMinutes += minutes
                        break
                    case SESSION_TYPES.QUALIFY:
                        qualifyMinutes += minutes
                        break
                    case SESSION_TYPES.RACE:
                        raceMinutes += minutes
                        break
                }
            }

            activity.push({
                day: dayLabels[date.getDay()] || 'N/A',
                practice: practiceMinutes,
                qualify: qualifyMinutes,
                race: raceMinutes
            })
        }

        return activity
    }

    // Calculate totals for activity summary (real durations)
    const activityTotals = computed(() => {
        const now = new Date()
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

        let practiceMinutes = 0, practiceCount = 0
        let qualifyMinutes = 0, qualifyCount = 0
        let raceMinutes = 0, raceCount = 0

        for (const session of sessions.value) {
            const sessionDate = new Date(session.meta.date_start)
            if (sessionDate < sevenDaysAgo) continue

            const totalMs = session.summary?.totalTime || 0
            const minutes = Math.round(totalMs / 60000)

            switch (session.meta.session_type) {
                case SESSION_TYPES.PRACTICE:
                    practiceMinutes += minutes
                    practiceCount++
                    break
                case SESSION_TYPES.QUALIFY:
                    qualifyMinutes += minutes
                    qualifyCount++
                    break
                case SESSION_TYPES.RACE:
                    raceMinutes += minutes
                    raceCount++
                    break
            }
        }

        return {
            practice: { minutes: practiceMinutes, sessions: practiceCount },
            qualify: { minutes: qualifyMinutes, sessions: qualifyCount },
            race: { minutes: raceMinutes, sessions: raceCount }
        }
    })

    return {
        // State
        sessions,
        isLoading,
        error,

        // Actions
        loadSessions,
        fetchSessionFull,
        getSessionsForTrack,
        getSession,
        getActivityData,
        // Track activity totals (for track detail page)
        getTrackActivityTotals,
        getHistoricalBestTimes,
        // Centralized best times calculation
        calculateAllBestTimesForTrack,
        calculateBestAvgRaceForTrack,
        getBestAvgRaceForTrack,
        getBestTimesForGrip,
        getTheoreticalTimes,
        // Optimized track bests (with lazy caching)
        getTrackBests,
        invalidateTrackBests,
        forceRecalculateTrackBests,
        // BATCH PREFETCH - Call after login to load all trackBests in 1 query
        prefetchAllTrackBests,
        // Flag to check if prefetch is complete (components should wait for this)
        isPrefetchComplete: computed(() => globalPrefetchComplete.value),
        // Track activity from Firebase (with fallback to calculated)
        getTrackActivity,

        // Computed
        lastSession,
        lastUsedCar,
        lastUsedTrack,
        trackStats,
        activityTotals
    }
}
