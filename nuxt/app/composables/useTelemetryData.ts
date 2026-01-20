// ============================================
// useTelemetryData - Load and process session data from Firebase
// ============================================

import { ref, computed } from 'vue'
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '~/config/firebase'

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
    // Optional grip-specific best times
    best_qualy_ms?: number
    best_race_ms?: number
    best_avg_race_ms?: number
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
    if (!ms || ms <= 0) return '0:00'
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
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

// === COMPOSABLE ===

export function useTelemetryData() {
    const sessions = ref<SessionDocument[]>([])
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    const { currentUser } = useFirebaseAuth()

    // Check if running in Electron
    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        return !!(window as any).electronAPI
    })

    // Helper: Generate session ID from date_start and track
    function generateSessionId(dateStart: string, track: string): string {
        const base = `${dateStart}_${track}`.replace(/[^a-zA-Z0-9]/g, '_')
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
    async function loadSessions(userId?: string): Promise<SessionDocument[]> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) {
            console.warn('[TELEMETRY] No user ID provided')
            return []
        }

        isLoading.value = true
        error.value = null

        try {
            // OPTIMIZATION: If in Electron and loading OWN data, use local files
            const isLoadingOwnData = !userId || userId === currentUser.value?.uid

            if (isElectron.value && isLoadingOwnData) {
                try {
                    const localSessions = await loadFromLocalFiles()
                    if (localSessions.length > 0) {
                        sessions.value = localSessions
                        console.log(`[TELEMETRY] ⚡ Loaded ${localSessions.length} sessions from LOCAL files (0 Firebase reads)`)
                        return sessions.value
                    }
                    console.log('[TELEMETRY] No local files found, falling back to Firebase')
                } catch (localError) {
                    console.warn('[TELEMETRY] Local load failed, falling back to Firebase:', localError)
                }
            }

            // FALLBACK: Load from Firebase (web, coach/admin, or no local files)
            const firebaseSessions = await loadFromFirebase(targetUserId)
            sessions.value = firebaseSessions

            // Sort by date if not already
            sessions.value.sort((a, b) =>
                (b.meta.date_start || '').localeCompare(a.meta.date_start || '')
            )

            console.log(`[TELEMETRY] Loaded ${sessions.value.length} sessions from Firebase for user ${targetUserId}`)
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

    // === CENTRALIZED BEST AVG RACE CALCULATION ===
    // Minimum valid laps required for avg race calculation
    const MIN_VALID_LAPS_FOR_AVG = 5

    // Cache for calculated values (to avoid redundant fetches)
    const calculatedAvgCache = ref<Record<string, Record<string, number | null>>>({})

    /**
     * Calculate the best avg race for a track by fetching full session data
     * and filtering for stints with 5+ valid laps.
     * This bypasses Firebase summary caching which may have incorrect values.
     * 
     * @param trackId - Track ID to calculate for
     * @param userId - Optional user ID (default: current user)
     * @returns Promise with best avg per grip condition
     */
    async function calculateBestAvgRaceForTrack(
        trackId: string,
        userId?: string
    ): Promise<Record<string, { bestAvgRace: number | null, bestAvgRaceTemp: number | null }>> {
        const targetUserId = userId || currentUser.value?.uid
        const trackIdNorm = trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')

        const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']
        const gripBests: Record<string, { bestAvgRace: number | null, bestAvgRaceTemp: number | null }> = {}

        gripConditions.forEach(grip => {
            gripBests[grip] = { bestAvgRace: null, bestAvgRaceTemp: null }
        })

        // Get sessions for this track
        const trackSessionsList = sessions.value.filter(s => {
            const sessionTrackId = s.meta.track.toLowerCase().replace(/[^a-z0-9]/g, '_')
            return sessionTrackId.includes(trackIdNorm) || trackIdNorm.includes(sessionTrackId)
        })

        if (trackSessionsList.length === 0) return gripBests

        // Process each session's full data
        for (const session of trackSessionsList) {
            try {
                const fullSession = await fetchSessionFull(session.sessionId, targetUserId)
                if (!fullSession?.stints) continue

                for (const stint of fullSession.stints) {
                    // Skip Qualify stints - only Race/Practice for avg race
                    if (stint.type === 'Qualify') continue

                    // Count valid laps (excluding pit stops)
                    const validLaps = stint.laps?.filter((l: any) => l.is_valid && !l.has_pit_stop) || []

                    // CRITICAL: Only use stints with 5+ valid laps
                    if (validLaps.length < MIN_VALID_LAPS_FOR_AVG) continue
                    if (!stint.avg_clean_lap || stint.avg_clean_lap <= 0) continue

                    // Get grip from first valid lap
                    const firstValidLap = validLaps[0]
                    const grip = firstValidLap?.track_grip_status || 'Unknown'
                    const airTemp = firstValidLap?.air_temp || 0

                    // Update grip best if this is better
                    if (gripBests[grip]) {
                        if (!gripBests[grip].bestAvgRace || stint.avg_clean_lap < gripBests[grip].bestAvgRace!) {
                            gripBests[grip].bestAvgRace = stint.avg_clean_lap
                            gripBests[grip].bestAvgRaceTemp = airTemp
                        }
                    }
                }
            } catch (e) {
                console.warn(`[TELEMETRY] Error loading session ${session.sessionId}:`, e)
            }
        }

        return gripBests
    }

    /**
     * Get simple best avg race for a track (any grip condition)
     * Returns the best avg race time regardless of grip.
     */
    async function getBestAvgRaceForTrack(trackId: string, userId?: string): Promise<number | null> {
        const gripBests = await calculateBestAvgRaceForTrack(trackId, userId)

        let best: number | null = null
        for (const grip of Object.keys(gripBests)) {
            const val = gripBests[grip].bestAvgRace
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
                for (const grip of gripConditions) {
                    const sessionGrip = sessionGripBests[grip]
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
        calculateBestAvgRaceForTrack,
        getBestAvgRaceForTrack,

        // Computed
        lastSession,
        lastUsedCar,
        lastUsedTrack,
        trackStats,
        activityTotals
    }
}
