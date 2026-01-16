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

// Session type mapping
export const SESSION_TYPES = {
    RACE: 0,
    QUALIFY: 1,
    PRACTICE: 2
} as const

export type SessionType = 'race' | 'qualify' | 'practice'

export function getSessionTypeLabel(type: number): SessionType {
    switch (type) {
        case 0: return 'race'
        case 1: return 'qualify'
        default: return 'practice'
    }
}

export function getSessionTypeDisplay(type: number): string {
    switch (type) {
        case 0: return 'RACE'
        case 1: return 'QUALIFY'
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

    // Load session metadata for a user from Firestore
    async function loadSessions(userId?: string): Promise<SessionDocument[]> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) {
            console.warn('[TELEMETRY] No user ID provided')
            return []
        }

        isLoading.value = true
        error.value = null

        try {
            const sessionsRef = collection(db, `users/${targetUserId}/sessions`)

            // Try with orderBy, fallback without if index not ready
            let querySnapshot
            try {
                const q = query(sessionsRef, orderBy('uploadedAt', 'desc'))
                querySnapshot = await getDocs(q)
            } catch (orderError) {
                console.warn('[TELEMETRY] orderBy failed, fetching without order')
                querySnapshot = await getDocs(sessionsRef)
            }

            sessions.value = querySnapshot.docs.map(docSnap => {
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

            // Sort by date if not already
            sessions.value.sort((a, b) =>
                (b.meta.date_start || '').localeCompare(a.meta.date_start || '')
            )

            console.log(`[TELEMETRY] Loaded ${sessions.value.length} sessions for user ${targetUserId}`)
            return sessions.value
        } catch (e: any) {
            console.error('[TELEMETRY] Error loading sessions:', e)
            error.value = e.message
            return []
        } finally {
            isLoading.value = false
        }
    }

    // Fetch full session with raw data (reconstructed from chunks)
    async function fetchSessionFull(sessionId: string, userId?: string): Promise<FullSession | null> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) return null

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
            return JSON.parse(rawText) as FullSession
        } catch (e) {
            console.error('[TELEMETRY] Error fetching full session:', e)
            return null
        }
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
        const dayLabels = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
        const activity: { day: string; practice: number; qualify: number; race: number }[] = []

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
            const dateStr = date.toISOString().split('T')[0]

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
                day: dayLabels[date.getDay()],
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

        // Computed
        lastSession,
        lastUsedCar,
        lastUsedTrack,
        trackStats,
        activityTotals
    }
}
