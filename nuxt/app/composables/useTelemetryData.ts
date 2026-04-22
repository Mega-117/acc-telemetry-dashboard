import { ref, computed } from 'vue'
import { collection, query, orderBy, doc, writeBatch, where, limit, DocumentReference, Query } from 'firebase/firestore'
import { trackedGetDoc, trackedGetDocs, trackedSetDoc, trackedDeleteDoc, trackedUpdateDoc } from './useFirebaseTracker'
import { db } from '~/config/firebase'
import { extractMetadata, generateSessionId } from '~/utils/sessionParser'

// Local wrappers auto-tagged with caller name
const CALLER = 'TelemetryData'
async function getDoc(ref: DocumentReference) { return trackedGetDoc(ref, CALLER) }
async function getDocs(q: Query) { return trackedGetDocs(q, CALLER) }
async function setDoc(ref: DocumentReference, data: any) { return trackedSetDoc(ref, data, CALLER) }
async function deleteDoc(ref: DocumentReference) { return trackedDeleteDoc(ref, CALLER) }
async function updateDoc(ref: DocumentReference, data: any) { return trackedUpdateDoc(ref, data, CALLER) }


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
    best_race_ms?: number | null         // backward compat: best of sprint/endurance
    best_avg_race_ms?: number | null     // backward compat: best of sprint/endurance avg
    best_qualy_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
    best_race_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
    best_avg_race_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
    // Fuel-band specific (new)
    best_race_sprint_ms?: number | null
    best_race_sprint_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
    best_race_endurance_ms?: number | null
    best_race_endurance_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
    best_avg_sprint_ms?: number | null
    best_avg_sprint_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
    best_avg_endurance_ms?: number | null
    best_avg_endurance_conditions?: { airTemp: number; roadTemp: number; grip: string } | null
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
    source?: 'cloud' | 'local'
    syncState?: 'synced' | 'pending_sync' | 'local_only' | 'sync_failed'
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

// === CAR CATEGORIES ===
// ACC Car categories for separating historical bests
export const CAR_CATEGORIES = ['GT3', 'GT4', 'CUP', 'GT2', 'ST', 'TCX'] as const
export type CarCategory = typeof CAR_CATEGORIES[number]

// Current schema version for trackBests documents (v2: category-based, fuel fields added gracefully)
export const TRACK_BESTS_SCHEMA_VERSION = 2

/**
 * Get car category from car model name
 * Uses pattern matching on the car string suffix
 */
export function getCarCategory(car: string): CarCategory {
    if (!car) return 'GT3'
    const lower = car.toLowerCase()

    // GT4 - production-based
    if (lower.includes('gt4')) return 'GT4'

    // CUP - Porsche Cup cars
    if (lower.includes('cup')) return 'CUP'

    // GT2 - GT2 class cars
    if (lower.includes('gt2') || lower.includes('935')) return 'GT2'

    // ST - Lamborghini Super Trofeo
    if (lower.includes('_st') || lower.includes('supertrofeo') || lower.includes('super_trofeo')) return 'ST'

    // TCX - Mercedes AMG GT2 (special class)
    if (lower.includes('tcx')) return 'TCX'

    // Default: GT3 (most common)
    return 'GT3'
}

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

// Maximum reasonable lap time (10 minutes). Values above this (e.g. INT_MAX from ACC shared memory) are treated as invalid.
export const MAX_REASONABLE_LAP_MS = 600000

export function formatLapTime(ms: number | null | undefined): string {
    if (!ms || ms <= 0 || ms > MAX_REASONABLE_LAP_MS) return '--:--.---'
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
const FIREBASE_SESSIONS_FALLBACK_LIMIT = 200

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


    // Load sessions from LOCAL files (Electron only)
    // Uses upload registry to classify sync state without extra Firebase reads.
    async function loadFromLocalFiles(ownerId?: string): Promise<SessionDocument[]> {
        if (!isElectron.value) return []

        const electronAPI = (window as any).electronAPI
        const files = await electronAPI.getTelemetryFiles()
        const registry = (await electronAPI.getRegistry?.()) || {}

        if (!files || files.length === 0) return []

        const uid = ownerId || currentUser.value?.uid
        const isOnline = typeof window === 'undefined' ? true : navigator.onLine
        const localSessions: SessionDocument[] = []

        for (const file of files) {
            try {
                const rawObj = await electronAPI.readFile(file.path)
                if (!rawObj) continue

                // Skip files belonging to other users
                if (rawObj.ownerId && rawObj.ownerId !== uid) continue

                const { meta, summary } = extractMetadata(rawObj)
                const sessionId = generateSessionId(meta.date_start, meta.track)
                const reg = registry[file.name]
                const isSynced = !!(
                    reg
                    && reg.uploadedBy === uid
                    && reg.sessionId === sessionId
                )

                localSessions.push({
                    sessionId,
                    fileHash: '',
                    fileName: file.name,
                    uploadedAt: null,
                    meta,
                    summary,
                    rawChunkCount: 0,
                    rawSizeBytes: 0,
                    source: 'local',
                    syncState: isSynced ? 'synced' : (isOnline ? 'pending_sync' : 'local_only')
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

    // Load sessions from Firebase (bounded fallback query)
    async function loadFromFirebase(targetUserId: string, maxItems: number = FIREBASE_SESSIONS_FALLBACK_LIMIT): Promise<SessionDocument[]> {
        const sessionsRef = collection(db, `users/${targetUserId}/sessions`)

        let querySnapshot
        try {
            const q = query(sessionsRef, orderBy('uploadedAt', 'desc'), limit(maxItems))
            querySnapshot = await getDocs(q)
        } catch (orderError) {
            console.warn('[TELEMETRY] orderBy failed, fetching without order')
            const q = query(sessionsRef, limit(maxItems))
            querySnapshot = await getDocs(q)
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
                rawSizeBytes: data.rawSizeBytes || 0,
                source: 'cloud',
                syncState: 'synced'
            } as SessionDocument
        })
    }

    // Load session metadata - CLOUD-FIRST strategy
    // Online owner: cloud + pending local outbox
    // Offline owner: local cache/outbox only
    async function loadSessions(userId?: string, forceReload: boolean = false): Promise<SessionDocument[]> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) {
            console.warn('[TELEMETRY] No user ID provided')
            return []
        }

        const userChanged = globalLastUserId.value !== targetUserId
        if (!forceReload && !userChanged && sessions.value.length > 0) {
            console.log(`[TELEMETRY] Using cached sessions (${sessions.value.length}), skipping query`)
            return sessions.value
        }

        globalLastUserId.value = targetUserId
        isLoading.value = true
        error.value = null

        try {
            const isLoadingOwnData = !userId || userId === currentUser.value?.uid
            const isOnline = typeof window === 'undefined' ? true : navigator.onLine

            // Offline owner: local cache/outbox only.
            if (isElectron.value && isLoadingOwnData && !isOnline) {
                const localSessions = await loadFromLocalFiles(targetUserId)
                sessions.value = localSessions.map((session) => ({
                    ...session,
                    syncState: session.syncState === 'synced' ? 'synced' : 'local_only'
                }))
                console.log(`[TELEMETRY] Offline mode: loaded ${sessions.value.length} local sessions`)
                return sessions.value
            }

            let cloudSessions: SessionDocument[] = []

            // sessionIndex from user document (cheap overview cache).
            try {
                const userDocRef = doc(db, `users/${targetUserId}`)
                const userDocSnap = await getDoc(userDocRef)
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data()
                    const sessionIndex = userData?.sessionIndex
                    if (sessionIndex?.sessionsList && sessionIndex.sessionsList.length > 0) {
                        cloudSessions = sessionIndex.sessionsList.map((entry: any) => ({
                            sessionId: entry.id,
                            fileHash: '',
                            fileName: '',
                            uploadedAt: null,
                            meta: {
                                track: entry.track,
                                car: entry.car,
                                date_start: entry.date,
                                date_end: null,
                                session_type: entry.type,
                                driver: null
                            },
                            summary: {
                                laps: entry.laps,
                                lapsValid: entry.lapsValid || 0,
                                bestLap: entry.bestLap,
                                avgCleanLap: null,
                                totalTime: entry.totalTime,
                                stintCount: entry.stintCount || 0,
                                best_qualy_ms: entry.bestQualyMs || null,
                                best_race_ms: entry.bestRaceMs || null,
                                best_race_conditions: entry.grip ? { airTemp: 0, roadTemp: 0, grip: entry.grip } : null
                            },
                            rawChunkCount: 0,
                            rawSizeBytes: 0,
                            source: 'cloud',
                            syncState: 'synced'
                        } as SessionDocument))
                    }
                }
            } catch (indexError) {
                console.warn('[TELEMETRY] SessionIndex read failed, fallback to bounded query:', indexError)
            }

            // Fallback query (bounded, no full-history blast).
            if (cloudSessions.length === 0) {
                cloudSessions = await loadFromFirebase(targetUserId, FIREBASE_SESSIONS_FALLBACK_LIMIT)
            }

            // Deduplicate logical duplicates (date_start + track).
            const sessionMap = new Map<string, SessionDocument>()
            for (const session of cloudSessions) {
                const dateKey = (session.meta.date_start || '').split('.')[0]
                const trackKey = (session.meta.track || '').toLowerCase().replace(/[^a-z0-9]/g, '_')
                const logicalKey = `${dateKey}_${trackKey}`

                const existing = sessionMap.get(logicalKey)
                if (!existing) {
                    sessionMap.set(logicalKey, session)
                } else {
                    const existingTime = existing.uploadedAt?.toMillis?.() || 0
                    const newTime = session.uploadedAt?.toMillis?.() || 0
                    if (newTime > existingTime) {
                        sessionMap.set(logicalKey, session)
                    }
                }
            }

            let mergedSessions = Array.from(sessionMap.values())

            // Owner + Electron + online: merge local unsynced outbox only.
            if (isElectron.value && isLoadingOwnData) {
                try {
                    const localSessions = await loadFromLocalFiles(targetUserId)
                    const cloudIds = new Set(mergedSessions.map((session) => session.sessionId))
                    const pendingLocal = localSessions.filter((session) =>
                        session.syncState !== 'synced' && !cloudIds.has(session.sessionId)
                    )
                    if (pendingLocal.length > 0) {
                        mergedSessions = [...pendingLocal, ...mergedSessions]
                    }
                } catch (localMergeError) {
                    console.warn('[TELEMETRY] Local merge failed, continuing with cloud set:', localMergeError)
                }
            }

            mergedSessions.sort((a, b) =>
                (b.meta.date_start || '').localeCompare(a.meta.date_start || '')
            )

            sessions.value = mergedSessions
            console.log(`[TELEMETRY] Loaded ${sessions.value.length} sessions (cloud-first)`)
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
    async function fetchSessionFull(sessionId: string, userId?: string, isCoachAccess: boolean = false): Promise<FullSession | null> {
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
            // Determine if we're loading our own data or external user's data
            // Coach/admin access is NOT external - they have direct read permissions
            const isExternalSession = targetUserId !== currentUser.value?.uid && !isCoachAccess

            // Get session document
            const sessionRef = doc(db, `users/${targetUserId}/sessions/${sessionId}`)
            const sessionSnap = await getDoc(sessionRef)

            if (!sessionSnap.exists()) return null

            const sessionData = sessionSnap.data()
            const chunkCount = sessionData.rawChunkCount || 0

            if (chunkCount === 0) return null

            // Fetch and reconstruct chunks
            // For external sessions (shared links), we MUST filter by isPublic to satisfy Firebase rules
            // For coach/admin access, we use normal ordered query (they have read permissions)
            // Note: We skip orderBy for external sessions to avoid requiring a composite index
            // The in-memory sort below handles ordering correctly
            const chunksRef = collection(db, `users/${targetUserId}/sessions/${sessionId}/rawChunks`)
            const q = isExternalSession
                ? query(chunksRef, where('isPublic', '==', true))
                : query(chunksRef, orderBy('idx', 'asc'))
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
            console.log(`[TELEMETRY] Loaded full session from Firebase chunks${isExternalSession ? ' (EXTERNAL)' : ''}`)
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
        bestQualyFuel: number | null
        bestQualySessionId: string | null
        bestQualyDate: string | null
        // Race Sprint (fuel 25-80L)
        bestRaceSprint: number | null
        bestRaceSprintTemp: number | null
        bestRaceSprintFuel: number | null
        bestRaceSprintSessionId: string | null
        bestRaceSprintDate: string | null
        bestAvgSprint: number | null
        bestAvgSprintTemp: number | null
        bestAvgSprintFuel: number | null
        bestAvgSprintSessionId: string | null
        bestAvgSprintDate: string | null
        // Race Endurance (fuel > 80L)
        bestRaceEndurance: number | null
        bestRaceEnduranceTemp: number | null
        bestRaceEnduranceFuel: number | null
        bestRaceEnduranceSessionId: string | null
        bestRaceEnduranceDate: string | null
        bestAvgEndurance: number | null
        bestAvgEnduranceTemp: number | null
        bestAvgEnduranceFuel: number | null
        bestAvgEnduranceSessionId: string | null
        bestAvgEnduranceDate: string | null
        // Backward compat: best of sprint/endurance (computed)
        bestRace: number | null
        bestRaceTemp: number | null
        bestRaceFuel: number | null
        bestRaceSessionId: string | null
        bestRaceDate: string | null
        bestAvgRace: number | null
        bestAvgRaceTemp: number | null
        bestAvgRaceFuel: number | null
        bestAvgRaceSessionId: string | null
        bestAvgRaceDate: string | null
    }

    // Type for category-organized bests (new v2 structure)
    type CategoryBests = Record<CarCategory, Record<string, GripBestTimes>>

    // Type for trackBests document structure (v2)
    type TrackBestsDocument = {
        version: number
        trackId: string
        lastSessionDate: string | null
        bests: CategoryBests
    }

    // Empty GripBestTimes helper
    const emptyGripBests = (): GripBestTimes => ({
        bestQualy: null, bestQualyTemp: null, bestQualyFuel: null, bestQualySessionId: null, bestQualyDate: null,
        bestRaceSprint: null, bestRaceSprintTemp: null, bestRaceSprintFuel: null, bestRaceSprintSessionId: null, bestRaceSprintDate: null,
        bestAvgSprint: null, bestAvgSprintTemp: null, bestAvgSprintFuel: null, bestAvgSprintSessionId: null, bestAvgSprintDate: null,
        bestRaceEndurance: null, bestRaceEnduranceTemp: null, bestRaceEnduranceFuel: null, bestRaceEnduranceSessionId: null, bestRaceEnduranceDate: null,
        bestAvgEndurance: null, bestAvgEnduranceTemp: null, bestAvgEnduranceFuel: null, bestAvgEnduranceSessionId: null, bestAvgEnduranceDate: null,
        bestRace: null, bestRaceTemp: null, bestRaceFuel: null, bestRaceSessionId: null, bestRaceDate: null,
        bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceFuel: null, bestAvgRaceSessionId: null, bestAvgRaceDate: null
    })

    /**
     * Calculate ALL best times for a track using session summaries (NO EXTRA QUERIES).
     * Returns best Qualy, Race, and AvgRace for each category and grip condition.
     * Uses summary.best_by_grip which is already loaded with session metadata.
     * 
     * NEW V2 STRUCTURE: Organized by CarCategory -> Grip -> Times
     * 
     * @param trackId - Track ID to calculate for
     * @param userId - Optional user ID (default: current user)
     * @returns Promise with CategoryBests (category -> grip -> times)
     */
    async function calculateAllBestTimesForTrack(
        trackId: string,
        userId?: string
    ): Promise<{ bests: CategoryBests; lastSessionDate: string | null }> {
        const trackIdNorm = trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']

        // Initialize structure: category -> grip -> empty bests
        const categoryBests: CategoryBests = {} as CategoryBests
        for (const cat of CAR_CATEGORIES) {
            categoryBests[cat] = {}
            for (const grip of gripConditions) {
                categoryBests[cat][grip] = emptyGripBests()
            }
        }

        // Get sessions for this track (already loaded, no query needed)
        const trackSessionsList = sessions.value.filter(s => {
            const sessionTrackId = s.meta.track.toLowerCase().replace(/[^a-z0-9]/g, '_')
            return sessionTrackId.includes(trackIdNorm) || trackIdNorm.includes(sessionTrackId)
        })

        if (trackSessionsList.length === 0) {
            return { bests: categoryBests, lastSessionDate: null }
        }

        // Track newest session date for smart refresh
        let lastSessionDate: string | null = null

        // Normalize grip helper
        const normalizeGrip = (grip: string) => grip === 'Opt' ? 'Optimum' : grip

        // Process each session's SUMMARY (already loaded, no extra queries!)
        for (const session of trackSessionsList) {
            const sessionDate = session.meta.date_start || null
            const bestByGrip = session.summary?.best_by_grip

            // Track newest session
            if (sessionDate && (!lastSessionDate || sessionDate > lastSessionDate)) {
                lastSessionDate = sessionDate
            }

            if (!bestByGrip) continue

            // Get category from car
            const category = getCarCategory(session.meta.car)

            // Check each grip condition
            for (const grip of gripConditions) {
                const sessionBest = bestByGrip[grip]
                if (!sessionBest) continue

                const currentBest = categoryBests[category][grip]
                if (!currentBest) continue // TypeScript safety

                // Best Qualy
                if (sessionBest.bestQualy && (!currentBest.bestQualy || sessionBest.bestQualy < currentBest.bestQualy)) {
                    currentBest.bestQualy = sessionBest.bestQualy
                    currentBest.bestQualyTemp = sessionBest.bestQualyTemp
                    currentBest.bestQualyFuel = sessionBest.bestQualyFuel ?? null
                    currentBest.bestQualySessionId = session.sessionId
                    currentBest.bestQualyDate = sessionDate
                }

                // Best Race Sprint (new field, or fallback from old bestRace if fuel <= 80)
                const sprintTime = sessionBest.bestRaceSprint || (sessionBest.bestRace && (!sessionBest.bestRaceFuel || sessionBest.bestRaceFuel <= 80) ? sessionBest.bestRace : null)
                if (sprintTime && (!currentBest.bestRaceSprint || sprintTime < currentBest.bestRaceSprint)) {
                    currentBest.bestRaceSprint = sprintTime
                    currentBest.bestRaceSprintTemp = sessionBest.bestRaceSprintTemp || sessionBest.bestRaceTemp
                    currentBest.bestRaceSprintFuel = sessionBest.bestRaceSprintFuel ?? sessionBest.bestRaceFuel ?? null
                    currentBest.bestRaceSprintSessionId = session.sessionId
                    currentBest.bestRaceSprintDate = sessionDate
                }

                // Best Race Endurance (new field, or fallback from old bestRace if fuel > 80)
                const enduranceTime = sessionBest.bestRaceEndurance || (sessionBest.bestRace && sessionBest.bestRaceFuel && sessionBest.bestRaceFuel > 80 ? sessionBest.bestRace : null)
                if (enduranceTime && (!currentBest.bestRaceEndurance || enduranceTime < currentBest.bestRaceEndurance)) {
                    currentBest.bestRaceEndurance = enduranceTime
                    currentBest.bestRaceEnduranceTemp = sessionBest.bestRaceEnduranceTemp || sessionBest.bestRaceTemp
                    currentBest.bestRaceEnduranceFuel = sessionBest.bestRaceEnduranceFuel ?? sessionBest.bestRaceFuel ?? null
                    currentBest.bestRaceEnduranceSessionId = session.sessionId
                    currentBest.bestRaceEnduranceDate = sessionDate
                }

                // Best Avg Sprint
                const avgSprintTime = sessionBest.bestAvgSprint || (sessionBest.bestAvgRace && (!sessionBest.bestAvgRaceFuel || sessionBest.bestAvgRaceFuel <= 80) ? sessionBest.bestAvgRace : null)
                if (avgSprintTime && (!currentBest.bestAvgSprint || avgSprintTime < currentBest.bestAvgSprint)) {
                    currentBest.bestAvgSprint = avgSprintTime
                    currentBest.bestAvgSprintTemp = sessionBest.bestAvgSprintTemp || sessionBest.bestAvgRaceTemp
                    currentBest.bestAvgSprintFuel = sessionBest.bestAvgSprintFuel ?? sessionBest.bestAvgRaceFuel ?? null
                    currentBest.bestAvgSprintSessionId = session.sessionId
                    currentBest.bestAvgSprintDate = sessionDate
                }

                // Best Avg Endurance
                const avgEnduranceTime = sessionBest.bestAvgEndurance || (sessionBest.bestAvgRace && sessionBest.bestAvgRaceFuel && sessionBest.bestAvgRaceFuel > 80 ? sessionBest.bestAvgRace : null)
                if (avgEnduranceTime && (!currentBest.bestAvgEndurance || avgEnduranceTime < currentBest.bestAvgEndurance)) {
                    currentBest.bestAvgEndurance = avgEnduranceTime
                    currentBest.bestAvgEnduranceTemp = sessionBest.bestAvgEnduranceTemp || sessionBest.bestAvgRaceTemp
                    currentBest.bestAvgEnduranceFuel = sessionBest.bestAvgEnduranceFuel ?? sessionBest.bestAvgRaceFuel ?? null
                    currentBest.bestAvgEnduranceSessionId = session.sessionId
                    currentBest.bestAvgEnduranceDate = sessionDate
                }

                // Backward compat: compute bestRace as min(sprint, endurance)
                const bestRaceVal = currentBest.bestRaceSprint && currentBest.bestRaceEndurance
                    ? Math.min(currentBest.bestRaceSprint, currentBest.bestRaceEndurance)
                    : currentBest.bestRaceSprint || currentBest.bestRaceEndurance
                if (bestRaceVal) {
                    const isSprintBetter = currentBest.bestRaceSprint === bestRaceVal
                    currentBest.bestRace = bestRaceVal
                    currentBest.bestRaceTemp = isSprintBetter ? currentBest.bestRaceSprintTemp : currentBest.bestRaceEnduranceTemp
                    currentBest.bestRaceFuel = isSprintBetter ? currentBest.bestRaceSprintFuel : currentBest.bestRaceEnduranceFuel
                    currentBest.bestRaceSessionId = isSprintBetter ? currentBest.bestRaceSprintSessionId : currentBest.bestRaceEnduranceSessionId
                    currentBest.bestRaceDate = isSprintBetter ? currentBest.bestRaceSprintDate : currentBest.bestRaceEnduranceDate
                }

                const bestAvgVal = currentBest.bestAvgSprint && currentBest.bestAvgEndurance
                    ? Math.min(currentBest.bestAvgSprint, currentBest.bestAvgEndurance)
                    : currentBest.bestAvgSprint || currentBest.bestAvgEndurance
                if (bestAvgVal) {
                    const isSprintBetter = currentBest.bestAvgSprint === bestAvgVal
                    currentBest.bestAvgRace = bestAvgVal
                    currentBest.bestAvgRaceTemp = isSprintBetter ? currentBest.bestAvgSprintTemp : currentBest.bestAvgEnduranceTemp
                    currentBest.bestAvgRaceFuel = isSprintBetter ? currentBest.bestAvgSprintFuel : currentBest.bestAvgEnduranceFuel
                    currentBest.bestAvgRaceSessionId = isSprintBetter ? currentBest.bestAvgSprintSessionId : currentBest.bestAvgEnduranceSessionId
                    currentBest.bestAvgRaceDate = isSprintBetter ? currentBest.bestAvgSprintDate : currentBest.bestAvgEnduranceDate
                }
            }
        }

        console.log(`[TELEMETRY] ⚡ Calculated trackBests V2 for ${trackIdNorm} from ${trackSessionsList.length} sessions (by category, 0 extra queries)`)
        return { bests: categoryBests, lastSessionDate }
    }

    /**
     * Get best times for a specific category and grip condition
     * V2: Now requires category parameter
     */
    async function getBestTimesForGrip(
        trackId: string,
        grip: string = 'Optimum',
        category: CarCategory = 'GT3',
        userId?: string
    ): Promise<GripBestTimes> {
        const allBests = await getTrackBests(trackId, category, userId)
        return allBests[grip] || emptyGripBests()
    }

    // Cache for track bests (in-memory for session duration)
    // V2: Stores CategoryBests for each track_user key
    const trackBestsCache = ref<Record<string, { bests: CategoryBests; lastSessionDate: string | null }>>({})

    /**
     * Get all best times for a track and category.
     * V2: Now includes version check and automatic migration.
     * 
     * OPTIMIZED: Uses lazy loading with Firebase caching.
     * 1. Check in-memory cache first
     * 2. Try to read from Firebase /trackBests/{trackId}
     * 3. If version < 2 or not found, recalculate and save
     * 
     * This reduces reads from ~70 (per track) to 1.
     */
    async function getTrackBests(
        trackId: string,
        category: CarCategory = 'GT3',
        userId?: string
    ): Promise<Record<string, GripBestTimes>> {
        const targetUserId = userId || currentUser.value?.uid
        const trackIdNorm = trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const cacheKey = `${trackIdNorm}_${targetUserId || 'anon'}`

        // 1. Check in-memory cache
        if (trackBestsCache.value[cacheKey]) {
            console.log(`[TELEMETRY] trackBests cache HIT for ${trackIdNorm} (category: ${category})`)
            const cached = trackBestsCache.value[cacheKey]
            return cached.bests[category] || {}
        }

        // 2. Try Firebase /trackBests collection (if user is logged in and not Electron)
        if (targetUserId && !isElectron.value) {
            try {
                const docRef = doc(db, `users/${targetUserId}/trackBests/${trackIdNorm}`)
                const docSnap = await getDoc(docRef)

                if (docSnap.exists()) {
                    const data = docSnap.data()
                    const version = data.version || 1

                    // V2 schema: has version >= 2 and bests organized by category
                    if (version >= TRACK_BESTS_SCHEMA_VERSION && data.bests) {
                        console.log(`[TELEMETRY] trackBests Firebase HIT V2 for ${trackIdNorm}`)

                        // Validate structure
                        const isV2Structure = CAR_CATEGORIES.some(cat => data.bests[cat])

                        if (isV2Structure) {
                            // V2 format - use directly
                            const cached = {
                                bests: data.bests as CategoryBests,
                                lastSessionDate: data.lastSessionDate || null
                            }
                            trackBestsCache.value[cacheKey] = cached
                            return cached.bests[category] || {}
                        }
                    }

                    // V1 schema detected - need migration
                    console.log(`[TELEMETRY] trackBests V1 detected for ${trackIdNorm}, migrating to V2...`)
                }
            } catch (e) {
                console.warn(`[TELEMETRY] Error reading trackBests from Firebase:`, e)
            }
        }

        // 3. Not found or needs migration - calculate from sessions
        console.log(`[TELEMETRY] trackBests calculating V2 for ${trackIdNorm}...`)
        const calculated = await calculateAllBestTimesForTrack(trackId, userId)

        // 4. Save to Firebase for future use (if user logged in and not Electron)
        if (targetUserId && !isElectron.value) {
            try {
                const docRef = doc(db, `users/${targetUserId}/trackBests/${trackIdNorm}`)
                await setDoc(docRef, {
                    version: TRACK_BESTS_SCHEMA_VERSION,
                    trackId: trackIdNorm,
                    bests: calculated.bests,
                    lastSessionDate: calculated.lastSessionDate,
                    lastUpdated: new Date().toISOString()
                })
                console.log(`[TELEMETRY] trackBests V2 SAVED to Firebase for ${trackIdNorm}`)
            } catch (e) {
                console.warn(`[TELEMETRY] Error saving trackBests to Firebase:`, e)
            }
        }

        // Cache and return
        trackBestsCache.value[cacheKey] = calculated
        return calculated.bests[category] || {}
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
                await deleteDoc(docRef)
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
    async function forceRecalculateTrackBests(
        trackId: string,
        category: CarCategory = 'GT3',
        userId?: string
    ): Promise<Record<string, GripBestTimes>> {
        console.log(`[TELEMETRY] FORCE RECALCULATING trackBests for ${trackId} (category: ${category})`)

        // Clear both caches
        await invalidateTrackBests(trackId, userId, true)

        // Recalculate from sessions (this will also save to Firebase)
        return await getTrackBests(trackId, category, userId)
    }

    /**
     * Reset ALL trackBests for a user - deletes from Firebase and clears cache
     * After reset, next access will recalculate from sessions
     * 
     * @param userId - Optional user ID (default: current user)
     * @returns Number of trackBests deleted
     */
    async function resetAllTrackBests(userId?: string): Promise<number> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) {
            console.warn('[RESET] No user ID, cannot reset trackBests')
            return 0
        }

        console.log(`[RESET] 🗑️ Resetting ALL trackBests for user ${targetUserId}...`)

        try {
            // 1. Query all trackBests documents for user
            const trackBestsRef = collection(db, `users/${targetUserId}/trackBests`)
            const snapshot = await getDocs(query(trackBestsRef))

            if (snapshot.empty) {
                console.log('[RESET] No trackBests found to delete')
                // Still clear in-memory cache
                trackBestsCache.value = {}
                return 0
            }

            // 2. Batch delete all documents
            const batch = writeBatch(db)
            snapshot.docs.forEach(docSnap => {
                batch.delete(docSnap.ref)
            })
            await batch.commit()

            const count = snapshot.size
            console.log(`[RESET] ✅ Deleted ${count} trackBests documents from Firebase`)

            // 3. Clear all in-memory caches
            trackBestsCache.value = {}
            trackActivityCache.value = {}

            // 4. Clear sessionStorage cache
            try {
                sessionStorage.removeItem('acc_trackBests_cache')
                sessionStorage.removeItem('acc_trackActivity_cache')
            } catch (e) {
                // Ignore storage errors
            }

            return count
        } catch (e) {
            console.error('[RESET] Error resetting trackBests:', e)
            throw e
        }
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
                const version = data.version || 1

                // V2 schema: has version >= 2 and bests organized by category
                if (version >= TRACK_BESTS_SCHEMA_VERSION && data.bests) {
                    const isV2Structure = CAR_CATEGORIES.some(cat => data.bests[cat])

                    if (isV2Structure) {
                        // V2 format - use directly
                        trackBestsCache.value[cacheKey] = {
                            bests: data.bests as CategoryBests,
                            lastSessionDate: data.lastSessionDate || null
                        }
                        loadedCount++

                        // Also parse and store activity if present
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
                        return // continue to next document
                    }
                }

                // V1 legacy: Convert grip-level structure to V2 category structure
                // All V1 data defaults to GT3 category (most common)
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

                // Convert V1 to V2 structure (all legacy data goes to GT3)
                const v2Bests: CategoryBests = {} as CategoryBests
                for (const cat of CAR_CATEGORIES) {
                    v2Bests[cat] = {}
                    for (const grip of standardGrips) {
                        v2Bests[cat][grip] = cat === 'GT3' && result[grip] ? result[grip] : emptyGripBests()
                    }
                }

                // Store in V2 format
                trackBestsCache.value[cacheKey] = {
                    bests: v2Bests,
                    lastSessionDate: data.lastSessionDate || null
                }

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
     * @param category - Car category (e.g., 'GT3', 'GT4')
     * @param userId - Optional user ID
     * @returns Theoretical times with temp adjustment applied
     */
    async function getTheoreticalTimes(
        trackId: string,
        grip: string,
        stintTemp: number,
        category: CarCategory = 'GT3',
        userId?: string
    ): Promise<TheoreticalTimes> {
        // Get centralized best times for this grip and category
        const bests = await getBestTimesForGrip(trackId, grip, category, userId)

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
        category: CarCategory = 'GT3',
        userId?: string
    ): Promise<Record<string, { bestAvgRace: number | null, bestAvgRaceTemp: number | null }>> {
        const { bests } = await calculateAllBestTimesForTrack(trackId, userId)
        const categoryBests = bests[category] || {}

        // Extract only avgRace data for backward compatibility
        const result: Record<string, { bestAvgRace: number | null, bestAvgRaceTemp: number | null }> = {}
        for (const [grip, times] of Object.entries(categoryBests)) {
            if (times) {
                result[grip] = { bestAvgRace: times.bestAvgRace, bestAvgRaceTemp: times.bestAvgRaceTemp }
            }
        }
        return result
    }

    /**
     * Get simple best avg race for a track (any grip condition and any category)
     * Returns the best avg race time regardless of grip or category.
     */
    async function getBestAvgRaceForTrack(trackId: string, userId?: string): Promise<number | null> {
        const { bests } = await calculateAllBestTimesForTrack(trackId, userId)

        let best: number | null = null
        // Search across all categories and grips
        for (const cat of CAR_CATEGORIES) {
            const categoryBests = bests[cat]
            if (!categoryBests) continue
            for (const gripBests of Object.values(categoryBests)) {
                if (!gripBests) continue
                const val = gripBests.bestAvgRace
                if (val && (!best || val < best)) {
                    best = val
                }
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

    // ========================================
    // SESSION SHARING (Cross-User)
    // ========================================

    /**
     * Set a session as public or private.
     * Uses denormalization: updates isPublic on session AND all chunks.
     * This optimizes read costs at the expense of write costs.
     */
    async function setSessionPublic(sessionId: string, isPublic: boolean): Promise<void> {
        const userId = currentUser.value?.uid
        if (!userId) throw new Error('Not authenticated')

        // 1. Update session document
        const sessionRef = doc(db, `users/${userId}/sessions/${sessionId}`)
        await updateDoc(sessionRef, { isPublic })
        console.log(`[SHARING] Session ${sessionId} set isPublic=${isPublic}`)

        // 2. Batch update all chunks (denormalization for 0 extra reads)
        const chunksRef = collection(db, `users/${userId}/sessions/${sessionId}/rawChunks`)
        const chunksSnap = await getDocs(query(chunksRef))

        if (chunksSnap.docs.length > 0) {
            const batch = writeBatch(db)
            chunksSnap.docs.forEach(chunkDoc => {
                batch.update(chunkDoc.ref, { isPublic })
            })
            await batch.commit()
            console.log(`[SHARING] Updated ${chunksSnap.docs.length} chunks with isPublic=${isPublic}`)
        }
    }

    /**
     * Count how many sessions are currently shared (isPublic=true)
     */
    async function countSharedSessions(): Promise<number> {
        const userId = currentUser.value?.uid
        if (!userId) return 0

        const sessionsRef = collection(db, `users/${userId}/sessions`)
        const q = query(sessionsRef, where('isPublic', '==', true))
        const snap = await getDocs(q)
        return snap.docs.length
    }

    /**
     * Revoke all shared sessions (set isPublic=false on all)
     * Returns the number of sessions revoked
     */
    async function revokeAllSharedSessions(): Promise<number> {
        const userId = currentUser.value?.uid
        if (!userId) throw new Error('Not authenticated')

        // Find all public sessions
        const sessionsRef = collection(db, `users/${userId}/sessions`)
        const q = query(sessionsRef, where('isPublic', '==', true))
        const snap = await getDocs(q)

        let count = 0
        for (const sessionDoc of snap.docs) {
            await setSessionPublic(sessionDoc.id, false)
            count++
        }

        console.log(`[SHARING] Revoked ${count} shared sessions`)
        return count
    }

    /**
     * Generate a shareable link for a session.
     * Also sets the session as public if not already.
     */
    async function generateShareLink(sessionId: string): Promise<string> {
        const userId = currentUser.value?.uid
        if (!userId) throw new Error('Not authenticated')

        // Ensure session is public
        await setSessionPublic(sessionId, true)

        // Generate link
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        return `${baseUrl}/sessioni/${sessionId}?userId=${userId}`
    }

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
        resetAllTrackBests,
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
        activityTotals,

        // Session Sharing (Cross-User)
        setSessionPublic,
        countSharedSessions,
        revokeAllSharedSessions,
        generateShareLink
    }
}

