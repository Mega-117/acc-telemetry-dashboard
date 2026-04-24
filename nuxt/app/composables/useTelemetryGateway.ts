import { computed, ref } from 'vue'
import {
    useTelemetryData,
    type LoadSessionsSourceMode,
    type CarCategory,
    type FullSession,
    type SessionDocument,
    formatLapTime,
    formatDriveTime,
    formatCarName,
    formatTrackName,
    formatDate,
    getSessionTypeLabel,
    getCarCategory
} from './useTelemetryData'
import { useSessionPager, type SessionPagerFilters } from './useSessionPager'
import { useFirebaseAuth } from './useFirebaseAuth'
import { buildTrackOverviewProjection } from '~/services/projections/buildTrackOverviewProjection'
import { buildTrackDetailProjection } from '~/services/projections/buildTrackDetailProjection'
import { buildOverviewProjection } from '~/services/projections/buildOverviewProjection'
import { TRACK_METADATA, normalizeTrackId as normalizeTrackProjectionId, resolveTrackMetadata } from '~/services/projections/trackMetadata'
import type { TrackDetailProjection, TrackOverviewProjectionItem } from '~/types/trackProjections'
import type { OverviewProjection } from '~/types/overviewProjections'
import { loadSessionDetailViewModel } from '~/services/session-detail/loadSessionDetailViewModel'
import type { SessionDetailViewModel } from '~/types/sessionDetailViewModel'

export type PipelineSource =
    | 'cloud_fresh'
    | 'index_cache'
    | 'local_first'
    | 'cloud_fallback'
    | 'cloud_page'
    | 'local_pending'
    | 'local_offline'
    | 'mixed'

export interface PipelineDiagnosticEvent {
    at: string
    source: PipelineSource
    action: string
    targetUserId: string | null
    details?: Record<string, unknown>
}

export interface OverviewSnapshot {
    sessions: SessionDocument[]
    lastSession: SessionDocument | null
    lastUsedCar: string | null
    lastUsedTrack: string | null
    trackStats: ReturnType<typeof useTelemetryData>['trackStats']['value']
    activity7d: ReturnType<typeof useTelemetryData>['getActivityData'] extends (...args: any[]) => infer R ? R : never
    activityTotals: ReturnType<typeof useTelemetryData>['activityTotals']['value']
}

export interface SessionsPageSnapshot {
    sessions: SessionDocument[]
    state: ReturnType<typeof useSessionPager>['state']['value']
}

export interface TrackSnapshot {
    trackId: string
    normalizedTrackId: string
    sessions: SessionDocument[]
    trackStat: ReturnType<typeof useTelemetryData>['trackStats']['value'][number] | null
    bestsByGrip: Record<string, any>
}

type TrackBestTimes = {
    bestQualy: number | null
    bestRace: number | null
    bestAvgRace: number | null
}

const MAX_DIAGNOSTICS = 300
const globalGatewayDiagnostics = ref<PipelineDiagnosticEvent[]>([])

function normalizeTrackKey(track: string): string {
    return normalizeTrackProjectionId(track)
}

function pushGatewayDiagnostic(event: Omit<PipelineDiagnosticEvent, 'at'>): void {
    const withTimestamp: PipelineDiagnosticEvent = {
        ...event,
        at: new Date().toISOString()
    }
    globalGatewayDiagnostics.value = [withTimestamp, ...globalGatewayDiagnostics.value].slice(0, MAX_DIAGNOSTICS)
    const detailText = withTimestamp.details ? ` details=${JSON.stringify(withTimestamp.details)}` : ''
    console.log(`[PIPELINE] source=${withTimestamp.source} action=${withTimestamp.action} user=${withTimestamp.targetUserId || 'none'}${detailText}`)
}

export function useTelemetryGateway() {
    const telemetry = useTelemetryData()
    const pager = useSessionPager()
    const { currentUser, getUserProfile } = useFirebaseAuth()

    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        return !!(window as any).electronAPI
    })

    function resolveTargetUserId(targetUserId?: string): string | null {
        return targetUserId || currentUser.value?.uid || null
    }

    function resolveOverviewSource(targetUserId: string): LoadSessionsSourceMode {
        void targetUserId
        // Overview needs the freshest recent sessions, otherwise a stale sessionIndex can keep
        // showing an old "ultima pista" even while Sessioni already sees newer cloud sessions.
        // cloud_fresh still merges pending local sessions for the Electron owner inside loadSessions.
        return 'cloud_fresh'
    }

    async function getOverviewSnapshot(targetUserId?: string): Promise<OverviewSnapshot | null> {
        const resolvedUserId = resolveTargetUserId(targetUserId)
        if (!resolvedUserId) return null

        const sourceMode = resolveOverviewSource(resolvedUserId)
        await telemetry.loadSessions(resolvedUserId, true, {
            sourceMode,
            context: 'gateway_overview'
        })

        const isOnline = typeof window === 'undefined' ? true : navigator.onLine
        let source: PipelineSource = 'cloud_fresh'
        if (!isOnline && isElectron.value) {
            source = 'local_offline'
        } else if (sourceMode === 'cloud_fresh') {
            source = 'cloud_fresh'
        } else if (sourceMode === 'index_cache') {
            source = 'index_cache'
        }

        pushGatewayDiagnostic({
            source,
            action: 'getOverviewSnapshot',
            targetUserId: resolvedUserId,
            details: {
                sessionCount: telemetry.sessions.value.length,
                isElectron: isElectron.value,
                sourceMode
            }
        })

        return {
            sessions: telemetry.sessions.value,
            lastSession: telemetry.lastSession.value,
            lastUsedCar: telemetry.lastUsedCar.value,
            lastUsedTrack: telemetry.lastUsedTrack.value,
            trackStats: telemetry.trackStats.value,
            activity7d: telemetry.getActivityData(7),
            activityTotals: telemetry.activityTotals.value
        }
    }

    async function collectTrackBestTimes(
        trackIds: string[],
        targetUserId?: string
    ): Promise<Record<string, TrackBestTimes>> {
        const uniqueTrackIds = Array.from(new Set(trackIds.map((trackId) => normalizeTrackKey(trackId)).filter(Boolean)))
        if (uniqueTrackIds.length === 0) return {}

        const results = await Promise.all(
            uniqueTrackIds.map(async (trackId) => {
                const bests = await telemetry.getBestTimesForGrip(trackId, 'Optimum', 'GT3', targetUserId)
                return [
                    trackId,
                    {
                        bestQualy: bests.bestQualy || null,
                        bestRace: bests.bestRace || null,
                        bestAvgRace: bests.bestAvgRace || null
                    }
                ] as const
            })
        )

        return Object.fromEntries(results)
    }

    async function getOverviewProjection(targetUserId?: string): Promise<OverviewProjection | null> {
        const snapshot = await getOverviewSnapshot(targetUserId)
        if (!snapshot) return null

        const relevantTrackIds = snapshot.trackStats
            .slice()
            .sort((a, b) => (b.lastSession || '').localeCompare(a.lastSession || ''))
            .slice(0, 2)
            .map((track) => track.track)

        const bestsByTrack = await collectTrackBestTimes(relevantTrackIds, targetUserId)

        pushGatewayDiagnostic({
            source: 'mixed',
            action: 'getOverviewProjection',
            targetUserId: resolveTargetUserId(targetUserId),
            details: {
                trackCount: snapshot.trackStats.length,
                enrichedTrackCount: Object.keys(bestsByTrack).length
            }
        })

        return buildOverviewProjection({
            lastUsedCar: snapshot.lastUsedCar,
            lastSessionDate: snapshot.lastSession?.meta.date_start || null,
            trackStats: snapshot.trackStats,
            bestsByTrack,
            activity7d: snapshot.activity7d,
            activityTotals: snapshot.activityTotals,
            normalizeTrackId: normalizeTrackKey,
            formatLapTime,
            formatCarName,
            formatTrackName,
            formatDate
        })
    }

    async function getTracksOverviewProjection(targetUserId?: string): Promise<TrackOverviewProjectionItem[]> {
        const snapshot = await getOverviewSnapshot(targetUserId)
        if (!snapshot) return []

        const bestsByTrack = await Promise.all(
            snapshot.trackStats.map(async (stat) => {
                const trackId = normalizeTrackKey(stat.track)
                const bests = await telemetry.getTrackBests(trackId, 'GT3', targetUserId)
                const optimum = bests?.Optimum
                return [
                    trackId,
                    {
                        bestQualy: optimum?.bestQualy || null,
                        bestRace: optimum?.bestRace || null
                    }
                ] as const
            })
        )

        pushGatewayDiagnostic({
            source: 'mixed',
            action: 'getTracksOverviewProjection',
            targetUserId: resolveTargetUserId(targetUserId),
            details: {
                trackCount: snapshot.trackStats.length
            }
        })

        return buildTrackOverviewProjection({
            trackMetadata: Object.fromEntries(
                Object.entries(TRACK_METADATA).map(([id, metadata]) => [id, {
                    name: metadata.name,
                    country: metadata.countryCode,
                    length: metadata.length,
                    image: metadata.image
                }])
            ),
            trackStats: snapshot.trackStats,
            trackBestsMap: Object.fromEntries(bestsByTrack),
            normalizeTrackId: normalizeTrackKey,
            formatLapTime
        })
    }

    async function getSessionsPage(
        targetUserId?: string,
        filters: SessionPagerFilters = {},
        cursor: number = 1,
        pageSize: number = 25,
        reset: boolean = false
    ): Promise<SessionsPageSnapshot> {
        const resolvedUserId = resolveTargetUserId(targetUserId)
        if (!resolvedUserId) {
            return {
                sessions: [],
                state: pager.state.value
            }
        }

        const sessions = await pager.loadPage(resolvedUserId, {
            page: cursor,
            pageSize,
            reset,
            filters
        })

        const isOnline = typeof window === 'undefined' ? true : navigator.onLine
        const hasLocalSource = sessions.some((item) => item.source === 'local')
        const source: PipelineSource = hasLocalSource ? 'mixed' : (isOnline ? 'cloud_page' : 'local_offline')
        pushGatewayDiagnostic({
            source,
            action: 'getSessionsPage',
            targetUserId: resolvedUserId,
            details: {
                page: cursor,
                pageSize,
                count: sessions.length,
                hasNext: pager.state.value.hasNext,
                hasPrev: pager.state.value.hasPrev
            }
        })

        return {
            sessions,
            state: pager.state.value
        }
    }

    async function getTrackSnapshot(
        trackId: string,
        targetUserId?: string,
        category: CarCategory = 'GT3'
    ): Promise<TrackSnapshot | null> {
        const resolvedUserId = resolveTargetUserId(targetUserId)
        if (!resolvedUserId) return null

        await getOverviewSnapshot(resolvedUserId)

        const normalizedTrackId = normalizeTrackKey(trackId)
        const sessions = telemetry.sessions.value.filter((session) => {
            const sessionTrackId = normalizeTrackKey(session.meta.track || '')
            return sessionTrackId.includes(normalizedTrackId) || normalizedTrackId.includes(sessionTrackId)
        })

        const trackStat = telemetry.trackStats.value.find((stat) => {
            const statTrackId = normalizeTrackKey(stat.track || '')
            return statTrackId.includes(normalizedTrackId) || normalizedTrackId.includes(statTrackId)
        }) || null

        const bestsByGrip = await telemetry.getTrackBests(trackId, category, resolvedUserId)

        pushGatewayDiagnostic({
            source: 'mixed',
            action: 'getTrackSnapshot',
            targetUserId: resolvedUserId,
            details: {
                trackId: normalizedTrackId,
                sessionCount: sessions.length,
                category
            }
        })

        return {
            trackId,
            normalizedTrackId,
            sessions,
            trackStat,
            bestsByGrip
        }
    }

    function findBestLapFuel(fullSession: FullSession | null, bestTimeMs: number, isQualy: boolean): number | null {
        if (!fullSession || !bestTimeMs) return null
        const stints = fullSession?.stints || []
        for (const stint of stints) {
            const stintIsQualy = stint.type === 'Qualify'
            if (stintIsQualy !== isQualy) continue
            const laps = stint.laps || []
            for (const lap of laps) {
                if (lap.is_valid && !lap.has_pit_stop && lap.lap_time_ms === bestTimeMs) {
                    return lap.fuel_remaining ?? null
                }
            }
        }
        return null
    }

    async function getTrackDetailProjection(
        trackId: string,
        targetUserId?: string,
        options: {
            category?: CarCategory
            grip?: string
        } = {}
    ): Promise<TrackDetailProjection | null> {
        const category = options.category || 'GT3'
        const selectedGrip = options.grip || 'Optimum'
        const snapshot = await getTrackSnapshot(trackId, targetUserId, category)
        if (!snapshot) return null

        const visibleSessions = snapshot.sessions
            .filter((session) => Number((session.summary as any)?.laps || 0) > 0)
            .filter((session) => getCarCategory(session.meta.car) === category)
            .sort((a, b) => (b.meta.date_start || '').localeCompare(a.meta.date_start || ''))

        const metadata = resolveTrackMetadata(snapshot.normalizedTrackId || trackId)
        const bestFuelData = { qualyFuel: null as number | null, raceFuel: null as number | null }
        const gripBests = snapshot.bestsByGrip?.[selectedGrip] || {}

        const sessionsToFetch = new Map<string, Array<{ type: 'qualy' | 'race'; bestTime: number }>>()
        if (gripBests.bestQualySessionId && gripBests.bestQualy) {
            sessionsToFetch.set(gripBests.bestQualySessionId, [{ type: 'qualy', bestTime: gripBests.bestQualy }])
        }
        if (gripBests.bestRaceSessionId && gripBests.bestRace) {
            const existing = sessionsToFetch.get(gripBests.bestRaceSessionId) || []
            existing.push({ type: 'race', bestTime: gripBests.bestRace })
            sessionsToFetch.set(gripBests.bestRaceSessionId, existing)
        }

        await Promise.all(
            Array.from(sessionsToFetch.entries()).map(async ([sessionId, lookups]) => {
                const fullSession = await telemetry.fetchSessionFull(sessionId, targetUserId)
                if (!fullSession) return
                for (const lookup of lookups) {
                    if (lookup.type === 'qualy') {
                        bestFuelData.qualyFuel = findBestLapFuel(fullSession, lookup.bestTime, true)
                    } else {
                        bestFuelData.raceFuel = findBestLapFuel(fullSession, lookup.bestTime, false)
                    }
                }
            })
        )

        pushGatewayDiagnostic({
            source: 'mixed',
            action: 'getTrackDetailProjection',
            targetUserId: resolveTargetUserId(targetUserId),
            details: {
                trackId: snapshot.normalizedTrackId,
                category,
                grip: selectedGrip,
                visibleSessions: visibleSessions.length
            }
        })

        return buildTrackDetailProjection({
            trackId: snapshot.normalizedTrackId,
            metadata,
            visibleSessions,
            selectedGrip,
            selectedCategory: category,
            recalculatedBestByGrip: snapshot.bestsByGrip,
            bestFuelData,
            formatLapTime,
            formatDriveTime,
            formatCarName,
            getSessionTypeLabel,
            currentTrackStat: snapshot.trackStat
        })
    }

    async function getSessionDetail(
        sessionId: string,
        targetUserId?: string,
        options: { isCoachAccess?: boolean; warmupSessions?: boolean } = {}
    ): Promise<FullSession | null> {
        const resolvedUserId = resolveTargetUserId(targetUserId)
        if (!resolvedUserId) return null

        const warmup = options.warmupSessions !== false
        if (warmup) {
            await telemetry.loadSessions(resolvedUserId, false, {
                sourceMode: 'auto',
                context: 'gateway_session_detail_warmup'
            })
        }

        const fullSession = await telemetry.fetchSessionFull(
            sessionId,
            resolvedUserId,
            options.isCoachAccess || false
        )

        pushGatewayDiagnostic({
            source: 'mixed',
            action: 'getSessionDetail',
            targetUserId: resolvedUserId,
            details: {
                sessionId,
                loaded: !!fullSession,
                warmup
            }
        })

        return fullSession
    }

    async function getSessionDetailViewModel(params: {
        sessionId: string
        externalUserId?: string
        targetUserId?: string | null
    }): Promise<SessionDetailViewModel> {
        const result = await loadSessionDetailViewModel({
            sessionId: params.sessionId,
            externalUserId: params.externalUserId,
            targetUserId: params.targetUserId,
            currentUser,
            getUserProfile,
            telemetryGateway: {
                getOverviewSnapshot,
                getSessionDetail
            }
        })

        return {
            sessionId: params.sessionId,
            userId: result.userIdToLoad,
            isShared: !!params.externalUserId,
            isCoachAccess: !!params.targetUserId && !params.externalUserId,
            isLoading: false,
            loadError: result.loadError,
            currentUserNickname: result.currentUserNickname,
            fullSession: result.fullSession
        }
    }

    function clearGatewayDiagnostics(): void {
        globalGatewayDiagnostics.value = []
    }

    return {
        // Unified data APIs
        getOverviewSnapshot,
        getOverviewProjection,
        getSessionsPage,
        getTrackSnapshot,
        getTracksOverviewProjection,
        getTrackDetailProjection,
        getSessionDetail,
        getSessionDetailViewModel,

        // Diagnostics
        gatewayDiagnostics: computed(() => globalGatewayDiagnostics.value),
        clearGatewayDiagnostics,

        // Telemetry passthrough (shared source of truth)
        ...telemetry,

        // Pager passthrough (single gateway access)
        pagerSessions: pager.sessions,
        pagerState: pager.state,
        pagerIsOnline: pager.isOnline,
        pagerError: pager.error,
        pagerLoadPage: pager.loadPage,
        pagerNextPage: pager.nextPage,
        pagerPrevPage: pager.prevPage
    }
}

export type { SessionPagerFilters }
