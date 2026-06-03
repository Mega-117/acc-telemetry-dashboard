import { computed } from 'vue'

import {
    CAR_CATEGORIES, SESSION_TYPES,
    type CarCategory, type SessionType,
    MAX_REASONABLE_LAP_MS,
    getCarCategory, getSessionTypeLabel, getSessionTypeDisplay,
    formatLapTime, formatDriveTime, formatCarName, formatTrackName,
    formatDate, formatDateFull, formatTime,
    parseTelemetryDate, formatLocalDateKey,
} from '~/utils/telemetryFormat'
import {
    type GripBestTimes,
    type TheoreticalTimes,
} from '~/services/telemetry/theoreticalTimesCalculator'
import {
    buildActivityWindowFromSessions,
    getTrackActivityTotalsFromSessions,
    getHistoricalBestTimesFromSessions
} from '~/services/telemetry/activityProjectionService'
import { useSessionLoader } from '~/composables/useSessionLoader'
import type { SessionDocument } from '~/composables/useSessionLoader'
import { useTrackBests } from '~/composables/useTrackBests'
import { useSessionSharing } from '~/composables/useSessionSharing'

// Re-export per backwards compatibility — importare direttamente da ~/utils/telemetryFormat
export {
    CAR_CATEGORIES, SESSION_TYPES,
    type CarCategory, type SessionType,
    MAX_REASONABLE_LAP_MS,
    getCarCategory, getSessionTypeLabel, getSessionTypeDisplay,
    formatLapTime, formatDriveTime, formatCarName, formatTrackName,
    formatDate, formatDateFull, formatTime,
    parseTelemetryDate, formatLocalDateKey,
} from '~/utils/telemetryFormat'

// Re-export types from extracted modules for backward compatibility
export type { GripBestTimes, TheoreticalTimes } from '~/services/telemetry/theoreticalTimesCalculator'
export {
    dedupeCloudSessions,
    mergeSessionLocalPreferred,
    mergeSessionsDeterministic,
} from '~/services/telemetry/sessionMergeLogic'

// === TYPES (re-exported from useSessionLoader to maintain backward compatibility) ===
export type {
    LapData,
    StintData,
    SessionMeta,
    SessionSummary,
    SessionDocument,
    FullSession,
    LoadSessionsSourceMode,
    LoadSessionsOptions,
} from '~/composables/useSessionLoader'

// === COMPOSABLE ===

export function useTelemetryData() {
    // --- Sub-composables ---
    const sessionLoader = useSessionLoader()
    const trackBests = useTrackBests()
    const sessionSharing = useSessionSharing()

    // Expose shared state directly from sessionLoader
    const sessions = sessionLoader.sessions
    const isLoading = sessionLoader.isLoading
    const error = sessionLoader.error

    // === COMPUTED AGGREGATIONS ===

    const lastSession = computed(() => {
        if (sessions.value.length === 0) return null
        return sessions.value[0]
    })

    const lastUsedCar = computed(() => lastSession.value?.meta.car || null)
    const lastUsedTrack = computed(() => lastSession.value?.meta.track || null)

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

            if (session.meta.date_start > stats[track].lastSession) {
                stats[track].lastSession = session.meta.date_start
            }

            const sessionGripBests = summary?.best_by_grip
            if (sessionGripBests) {
                const normalizeGrip = (grip: string) => grip === 'Opt' ? 'Optimum' : grip

                for (const rawGrip in sessionGripBests) {
                    const grip = normalizeGrip(rawGrip)
                    if (!gripConditions.includes(grip)) continue

                    const sessionGrip = sessionGripBests[rawGrip]
                    if (!sessionGrip) continue

                    const trackGrip = stats[track].bestByGrip[grip]
                    if (!trackGrip) continue

                    if (sessionGrip.bestQualy) {
                        if (!trackGrip.bestQualy || sessionGrip.bestQualy < trackGrip.bestQualy) {
                            trackGrip.bestQualy = sessionGrip.bestQualy
                            trackGrip.bestQualyTemp = sessionGrip.bestQualyTemp
                        }
                    }

                    if (sessionGrip.bestRace) {
                        if (!trackGrip.bestRace || sessionGrip.bestRace < trackGrip.bestRace) {
                            trackGrip.bestRace = sessionGrip.bestRace
                            trackGrip.bestRaceTemp = sessionGrip.bestRaceTemp
                        }
                    }

                    if (sessionGrip.bestAvgRace) {
                        if (!trackGrip.bestAvgRace || sessionGrip.bestAvgRace < trackGrip.bestAvgRace) {
                            trackGrip.bestAvgRace = sessionGrip.bestAvgRace
                            trackGrip.bestAvgRaceTemp = sessionGrip.bestAvgRaceTemp
                        }
                    }
                }
            }

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

    function getSessionsForTrack(trackId: string): SessionDocument[] {
        return sessions.value.filter(
            s => (s.meta.track || '').toLowerCase() === trackId.toLowerCase()
        )
    }

    function getSession(sessionId: string): SessionDocument | undefined {
        return sessions.value.find(s => s.sessionId === sessionId)
    }

    function getTrackActivityTotals(trackId: string) {
        return getTrackActivityTotalsFromSessions(getSessionsForTrack(trackId), formatDriveTime)
    }

    function getHistoricalBestTimes(trackId: string, grip?: string) {
        return getHistoricalBestTimesFromSessions(getSessionsForTrack(trackId), grip)
    }

    function buildActivityWindow(days: number = 7) {
        return buildActivityWindowFromSessions({
            sessions: sessions.value,
            days,
            sessionTypes: SESSION_TYPES,
            parseTelemetryDate,
            formatLocalDateKey
        })
    }

    const activityWindow7d = computed(() => buildActivityWindow(7))

    function getActivityData(days: number = 7) {
        if (days === 7) {
            return activityWindow7d.value.data
        }
        return buildActivityWindow(days).data
    }

    const activityTotals = computed(() => activityWindow7d.value.totals)
    const legacySessionCount = computed(() => sessions.value.filter((session) => session.summarySource && session.summarySource !== 'canonical').length)

    // Legacy wrapper: getBestAvgRaceForTrack (uses calculateAllBestTimesForTrack)
    async function calculateBestAvgRaceForTrack(
        trackId: string,
        category: CarCategory = 'GT3',
        userId?: string
    ): Promise<Record<string, { bestAvgRace: number | null, bestAvgRaceTemp: number | null }>> {
        const { bests } = await trackBests.calculateAllBestTimesForTrack(trackId, userId)
        const categoryBests = bests[category] || {}
        const result: Record<string, { bestAvgRace: number | null, bestAvgRaceTemp: number | null }> = {}
        for (const [grip, times] of Object.entries(categoryBests)) {
            if (times) {
                result[grip] = { bestAvgRace: times.bestAvgRace, bestAvgRaceTemp: times.bestAvgRaceTemp }
            }
        }
        return result
    }

    async function getBestAvgRaceForTrack(trackId: string, userId?: string): Promise<number | null> {
        const { bests } = await trackBests.calculateAllBestTimesForTrack(trackId, userId)
        let best: number | null = null
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

    return {
        // State
        sessions,
        isLoading,
        error,

        // Session loading (from useSessionLoader)
        loadSessions: sessionLoader.loadSessions,
        fetchSessionFull: sessionLoader.fetchSessionFull,

        // Session queries
        getSessionsForTrack,
        getSession,
        getActivityData,
        getTrackActivityTotals,
        getHistoricalBestTimes,

        // Best times (from useTrackBests)
        calculateAllBestTimesForTrack: trackBests.calculateAllBestTimesForTrack,
        calculateBestAvgRaceForTrack,
        getBestAvgRaceForTrack,
        getBestTimesForGrip: trackBests.getBestTimesForGrip,
        getTheoreticalTimes: trackBests.getTheoreticalTimes,
        getTrackBests: trackBests.getTrackBests,
        clearTrackDerivedCaches: trackBests.clearTrackDerivedCaches,
        invalidateTrackBests: trackBests.invalidateTrackBests,
        forceRecalculateTrackBests: trackBests.forceRecalculateTrackBests,
        resetAllTrackBests: trackBests.resetAllTrackBests,
        prefetchAllTrackBests: trackBests.prefetchAllTrackBests,
        isPrefetchComplete: trackBests.isPrefetchComplete,
        getTrackActivity: trackBests.getTrackActivity,

        // Computed
        lastSession,
        lastUsedCar,
        lastUsedTrack,
        trackStats,
        activityTotals,
        legacySessionCount,

        // Session Sharing (from useSessionSharing)
        setSessionPublic: sessionSharing.setSessionPublic,
        countSharedSessions: sessionSharing.countSharedSessions,
        revokeAllSharedSessions: sessionSharing.revokeAllSharedSessions,
        generateShareLink: sessionSharing.generateShareLink,
    }
}
