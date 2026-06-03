import { computed, ref } from 'vue'
import {
    CAR_CATEGORIES,
    SESSION_TYPES,
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
import {
    TRACK_DETAIL_PROJECTION_SCHEMA_VERSION,
    type TrackActivityProjection,
    type TrackDetailProjection,
    type TrackDetailProjectionDocument,
    type TrackFuelBucketReference,
    type TrackHistoricalPointProjection,
    type TrackOverviewProjectionItem,
    type TrackRecentSessionProjection
} from '~/types/trackProjections'
import type { OverviewProjection } from '~/types/overviewProjections'
import { loadSessionDetailViewModel } from '~/services/session-detail/loadSessionDetailViewModel'
import type { SessionDetailViewModel } from '~/types/sessionDetailViewModel'
import { endFirebaseScenario, startFirebaseScenario } from './useFirebaseTracker'
import { loadLocalTelemetrySessions } from '~/repositories/telemetryLocalRepository'
import {
    loadTrackBest,
    loadTrackBestsMap,
    loadTrackDetailProjectionDoc,
    loadUserProjection,
    type UserProjectionDocument
} from '~/repositories/telemetryProjectionRepository'
import {
    buildRecentActivityBuckets,
    getActivityBucketForSessionType,
    getRecentActivityDateKeys,
    getTelemetryActivityDateKey
} from '~/services/telemetry/activityProjectionService'
import {
    normalizeTrackKey,
    trackMatches,
    isProjectionIndexReady,
    buildTrackStatsFromSessionIndex,
    mergePendingTrackStats
} from '~/services/gateway/gatewayHelpers'
import {
    OVERVIEW_GRIP_PRIORITY,
    OVERVIEW_GRIP_SCAN_ORDER,
    type TrackBestTimes,
    type TrackBestTimeField,
    buildBestTimesFromTrackBestDoc,
    updateBestTimeWithGrip,
    buildOverviewBestTimesFromTrackBestDoc,
    buildTrackBestsMapFromDocs,
    updateBestTime,
    mergePendingBestsByTrack,
    mergePendingOverviewBestsByTrack
} from '~/services/gateway/bestTimesBuilders'
import {
    buildActivity7dFromSessionIndex,
    buildActivityTotalsFromSessionIndex,
    sumActivityDataMinutes,
    sumActivityTotalMinutes,
    isActivityProjectionInconsistent,
    overlayPendingActivity
} from '~/services/gateway/activityProjectionBuilders'
import {
    getNewestSessionEntry,
    normalizeActivity,
    buildRecentSessionProjection,
    buildHistoricalPointProjection,
    buildActivityFromSessions,
    buildPendingGripBest,
    mergeGripBest,
    getRaceFuelBucket,
    normalizeTrackFuelBucketRecord,
    buildRaceFuelBucketReferences,
    dedupeRecentSessions,
    dedupeHistoricalPoints,
    buildTrackDetailFromProjectionDocument
} from '~/services/gateway/trackDetailProjectionBuilder'

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    activity7d: ReturnType<typeof useTelemetryData>['getActivityData'] extends (...args: any[]) => infer R ? R : never
    activityTotals: ReturnType<typeof useTelemetryData>['activityTotals']['value']
}

const OVERVIEW_SNAPSHOT_CACHE_TTL_MS = 60_000
const PENDING_LOCAL_OVERLAY_CACHE_TTL_MS = 3000
const overviewSnapshotInFlight = new Map<string, Promise<OverviewSnapshot | null>>()
const overviewSnapshotCache = new Map<string, { cachedAt: number; snapshot: OverviewSnapshot | null }>()

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

type TrackStatProjection = {
    track: string
    sessions: number
    lastSession?: string | null
    bestQualy?: number | null
    bestRace?: number | null
    bestAvgRace?: number | null
    bestByGrip?: Record<string, { bestQualy?: number | null; bestRace?: number | null }>
}

const MAX_DIAGNOSTICS = 300
const globalGatewayDiagnostics = ref<PipelineDiagnosticEvent[]>([])
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
const trackDetailProjectionCache = new Map<string, { detail: TrackDetailProjectionDocument; trackBest: any | null }>()
const pendingLocalOverlayCache = new Map<string, { cachedAt: number; sessions: SessionDocument[] }>()

export function clearTelemetryGatewayCache(uid?: string) {
    const clearByPrefix = <T>(cache: Map<string, T>) => {
        if (!uid) {
            cache.clear()
            return
        }

        for (const key of Array.from(cache.keys())) {
            if (key.startsWith(`${uid}:`)) cache.delete(key)
        }
    }

    clearByPrefix(overviewSnapshotCache)
    clearByPrefix(overviewSnapshotInFlight)
    clearByPrefix(trackDetailProjectionCache)
    clearByPrefix(pendingLocalOverlayCache)
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
    const { currentUser, userDisplayName } = useFirebaseAuth()

    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        return !!(window as any).electronAPI
    })

    function resolveTargetUserId(targetUserId?: string): string | null {
        return targetUserId || currentUser.value?.uid || null
    }

    function resolveOverviewSource(targetUserId: string): LoadSessionsSourceMode {
        void targetUserId
        return 'auto'
    }

    async function loadPendingLocalOverlay(targetUserId: string): Promise<SessionDocument[]> {
        if (!isElectron.value || typeof window === 'undefined' || !navigator.onLine) return []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        const electronAPI = (window as any).electronAPI
        if (!electronAPI) return []
        const cacheKey = `${targetUserId}:pending`
        const cached = pendingLocalOverlayCache.get(cacheKey)
        if (cached && Date.now() - cached.cachedAt <= PENDING_LOCAL_OVERLAY_CACHE_TTL_MS) {
            return cached.sessions
        }
        const localSessions = await loadLocalTelemetrySessions({
            electronAPI,
            ownerId: targetUserId,
            isOnline: true
        })
        const pendingSessions = localSessions.filter((session) => session.syncState && session.syncState !== 'synced')
        pendingLocalOverlayCache.set(cacheKey, {
            cachedAt: Date.now(),
            sessions: pendingSessions
        })
        return pendingSessions
    }

    function pushProjectionFallback(targetUserId: string | null, action: string, details: Record<string, unknown>): void {
        pushGatewayDiagnostic({
            source: 'cloud_fallback',
            action: 'projectionFallback',
            targetUserId,
            details: {
                action,
                ...details
            }
        })
    }

    async function getOverviewSnapshot(targetUserId?: string): Promise<OverviewSnapshot | null> {
        const resolvedUserId = resolveTargetUserId(targetUserId)
        if (!resolvedUserId) return null

        const sourceMode = resolveOverviewSource(resolvedUserId)
        const isOnline = typeof window === 'undefined' ? true : navigator.onLine
        const cacheKey = [
            resolvedUserId,
            sourceMode,
            isElectron.value ? 'electron' : 'web',
            isOnline ? 'online' : 'offline'
        ].join(':')

        const cached = overviewSnapshotCache.get(cacheKey)
        if (cached && Date.now() - cached.cachedAt <= OVERVIEW_SNAPSHOT_CACHE_TTL_MS) {
            pushGatewayDiagnostic({
                source: isOnline ? 'cloud_fresh' : 'local_offline',
                action: 'getOverviewSnapshot.cacheHit',
                targetUserId: resolvedUserId,
                details: {
                    sessionCount: cached.snapshot?.sessions.length || 0,
                    sourceMode,
                    ttlMs: OVERVIEW_SNAPSHOT_CACHE_TTL_MS
                }
            })
            return cached.snapshot
        }

        const existingRequest = overviewSnapshotInFlight.get(cacheKey)
        if (existingRequest) {
            pushGatewayDiagnostic({
                source: isOnline ? 'cloud_fresh' : 'local_offline',
                action: 'getOverviewSnapshot.inFlightReuse',
                targetUserId: resolvedUserId,
                details: { sourceMode }
            })
            return existingRequest
        }

        const request = (async (): Promise<OverviewSnapshot | null> => {
            await telemetry.loadSessions(resolvedUserId, true, {
                sourceMode,
                context: 'gateway_overview'
            })

            const source: PipelineSource = !isOnline && isElectron.value ? 'local_offline' : 'cloud_fresh'
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
                lastSession: telemetry.lastSession.value || null,
                lastUsedCar: telemetry.lastUsedCar.value,
                lastUsedTrack: telemetry.lastUsedTrack.value,
                trackStats: telemetry.trackStats.value,
                activity7d: telemetry.getActivityData(7),
                activityTotals: telemetry.activityTotals.value
            }
        })()

        overviewSnapshotInFlight.set(cacheKey, request)
        try {
            const snapshot = await request
            overviewSnapshotCache.set(cacheKey, { cachedAt: Date.now(), snapshot })
            return snapshot
        } finally {
            overviewSnapshotInFlight.delete(cacheKey)
        }
    }

    async function collectTrackBestTimes(trackIds: string[], targetUserId?: string): Promise<Record<string, TrackBestTimes>> {
        const uniqueTrackIds = Array.from(new Set(trackIds.map((trackId) => normalizeTrackKey(trackId)).filter(Boolean)))
        if (uniqueTrackIds.length === 0) return {}
        const resolvedUserId = resolveTargetUserId(targetUserId)
        if (!resolvedUserId) return {}

        const results = await Promise.all(
            uniqueTrackIds.map(async (trackId) => {
                const trackBestDoc = await loadTrackBest(resolvedUserId, trackId)
                return [
                    trackId,
                    buildOverviewBestTimesFromTrackBestDoc(trackBestDoc, 'GT3')
                ] as const
            })
        )

        return Object.fromEntries(results)
    }

    async function getOverviewProjectionFallback(targetUserId?: string): Promise<OverviewProjection | null> {
        const snapshot = await getOverviewSnapshot(targetUserId)
        if (!snapshot) return null

        const relevantTrackIds = snapshot.trackStats
            .slice()
            .sort((a, b) => (b.lastSession || '').localeCompare(a.lastSession || ''))
            .slice(0, 2)
            .map((track) => track.track)

        const bestsByTrack = await collectTrackBestTimes(relevantTrackIds, targetUserId)
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

    async function getOverviewProjection(targetUserId?: string): Promise<OverviewProjection | null> {
        const resolvedUserId = resolveTargetUserId(targetUserId)
        const scenarioId = startFirebaseScenario('page.panoramica.projection', { targetUserId: resolvedUserId })
        try {
            if (!resolvedUserId) return null
            const userProjection = await loadUserProjection(resolvedUserId)
            if (!isProjectionIndexReady(userProjection)) {
                pushProjectionFallback(resolvedUserId, 'getOverviewProjection', {
                    reason: 'missing_or_old_sessionIndex',
                    schemaVersion: userProjection?.sessionIndex?.schemaVersion || 0
                })
                return await getOverviewProjectionFallback(targetUserId)
            }

            const pendingSessions = await loadPendingLocalOverlay(resolvedUserId)
            const sessionIndex = userProjection?.sessionIndex || {}
            const trackStats = mergePendingTrackStats(buildTrackStatsFromSessionIndex(sessionIndex), pendingSessions)
            const relevantTrackIds = trackStats.slice(0, 2).map((track) => track.track)
            const bestDocs = await Promise.all(relevantTrackIds.map((trackId) => loadTrackBest(resolvedUserId, trackId)))
            const bestsByTrack = mergePendingOverviewBestsByTrack(
                Object.fromEntries(relevantTrackIds.map((trackId, index) => [normalizeTrackKey(trackId), buildOverviewBestTimesFromTrackBestDoc(bestDocs[index], 'GT3')])),
                pendingSessions
            )
            const baseActivity7d = buildActivity7dFromSessionIndex(sessionIndex)
            const baseActivityTotals = buildActivityTotalsFromSessionIndex(sessionIndex)
            if (isActivityProjectionInconsistent(baseActivity7d, baseActivityTotals)) {
                pushProjectionFallback(resolvedUserId, 'getOverviewProjection', {
                    reason: 'stale_activity7d_totals_mismatch',
                    activityMinutes: sumActivityDataMinutes(baseActivity7d),
                    totalMinutes: sumActivityTotalMinutes(baseActivityTotals)
                })
                return await getOverviewProjectionFallback(targetUserId)
            }
            const activity = overlayPendingActivity(
                baseActivity7d,
                baseActivityTotals,
                pendingSessions
            )
            const newest = getNewestSessionEntry(sessionIndex, pendingSessions)

            pushGatewayDiagnostic({
                source: pendingSessions.length > 0 ? 'mixed' : 'index_cache',
                action: 'getOverviewProjection.projectionFirst',
                targetUserId: resolvedUserId,
                details: {
                    trackCount: trackStats.length,
                    enrichedTrackCount: Object.keys(bestsByTrack).length,
                    pendingOverlayCount: pendingSessions.length
                }
            })

            return buildOverviewProjection({
                lastUsedCar: newest.car,
                lastSessionDate: newest.date,
                trackStats,
                bestsByTrack,
                activity7d: activity.activity7d,
                activityTotals: activity.activityTotals,
                normalizeTrackId: normalizeTrackKey,
                formatLapTime,
                formatCarName,
                formatTrackName,
                formatDate
            })
        } finally {
            endFirebaseScenario(scenarioId)
        }
    }

    async function getTracksOverviewProjectionFallback(targetUserId?: string): Promise<TrackOverviewProjectionItem[]> {
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

        return buildTrackOverviewProjection({
            trackMetadata: Object.fromEntries(Object.entries(TRACK_METADATA).map(([id, metadata]) => [id, {
                name: metadata.name,
                country: metadata.countryCode,
                length: metadata.length,
                image: metadata.image
            }])),
            trackStats: snapshot.trackStats,
            trackBestsMap: Object.fromEntries(bestsByTrack),
            normalizeTrackId: normalizeTrackKey,
            formatLapTime
        })
    }

    async function getTracksOverviewProjection(targetUserId?: string): Promise<TrackOverviewProjectionItem[]> {
        const resolvedUserId = resolveTargetUserId(targetUserId)
        const scenarioId = startFirebaseScenario('page.piste.projection', { targetUserId: resolvedUserId })
        try {
            if (!resolvedUserId) return []
            const userProjection = await loadUserProjection(resolvedUserId)
            if (!isProjectionIndexReady(userProjection)) {
                pushProjectionFallback(resolvedUserId, 'getTracksOverviewProjection', {
                    reason: 'missing_or_old_sessionIndex',
                    schemaVersion: userProjection?.sessionIndex?.schemaVersion || 0
                })
                return await getTracksOverviewProjectionFallback(targetUserId)
            }

            const [trackBestDocs, pendingSessions] = await Promise.all([
                loadTrackBestsMap(resolvedUserId),
                loadPendingLocalOverlay(resolvedUserId)
            ])
            const trackStats = mergePendingTrackStats(buildTrackStatsFromSessionIndex(userProjection?.sessionIndex), pendingSessions)
            const trackBestsMap = mergePendingBestsByTrack(buildTrackBestsMapFromDocs(trackBestDocs), pendingSessions)

            pushGatewayDiagnostic({
                source: pendingSessions.length > 0 ? 'mixed' : 'index_cache',
                action: 'getTracksOverviewProjection.projectionFirst',
                targetUserId: resolvedUserId,
                details: {
                    trackCount: trackStats.length,
                    trackBestsCount: Object.keys(trackBestsMap).length,
                    pendingOverlayCount: pendingSessions.length
                }
            })

            return buildTrackOverviewProjection({
                trackMetadata: Object.fromEntries(Object.entries(TRACK_METADATA).map(([id, metadata]) => [id, {
                    name: metadata.name,
                    country: metadata.countryCode,
                    length: metadata.length,
                    image: metadata.image
                }])),
                trackStats,
                trackBestsMap,
                normalizeTrackId: normalizeTrackKey,
                formatLapTime
            })
        } finally {
            endFirebaseScenario(scenarioId)
        }
    }

    async function getSessionsPage(
        targetUserId?: string,
        filters: SessionPagerFilters = {},
        cursor: number = 1,
        pageSize: number = 25,
        reset: boolean = false
    ): Promise<SessionsPageSnapshot> {
        const resolvedUserId = resolveTargetUserId(targetUserId)
        const scenarioId = startFirebaseScenario('page.sessioni.loadPage', {
            targetUserId: resolvedUserId,
            page: cursor,
            pageSize,
            reset
        })
        try {
            if (!resolvedUserId) {
                return { sessions: [], state: pager.state.value }
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

            return { sessions, state: pager.state.value }
        } finally {
            endFirebaseScenario(scenarioId)
        }
    }

    async function getTrackSnapshot(trackId: string, targetUserId?: string, category: CarCategory = 'GT3'): Promise<TrackSnapshot | null> {
        const resolvedUserId = resolveTargetUserId(targetUserId)
        if (!resolvedUserId) return null

        await getOverviewSnapshot(resolvedUserId)

        const normalizedTrackId = normalizeTrackKey(trackId)
        const sessions = telemetry.sessions.value.filter((session) => trackMatches(session.meta.track, normalizedTrackId))
        const trackStat = telemetry.trackStats.value.find((stat) => trackMatches(stat.track, normalizedTrackId)) || null
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

    async function getTrackDetailProjectionFallback(
        trackId: string,
        targetUserId: string | undefined,
        category: CarCategory,
        selectedGrip: string
    ): Promise<TrackDetailProjection | null> {
        const snapshot = await getTrackSnapshot(trackId, targetUserId, category)
        if (!snapshot) return null

        const visibleSessions = snapshot.sessions
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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

        await Promise.all(Array.from(sessionsToFetch.entries()).map(async ([sessionId, lookups]) => {
            const fullSession = await telemetry.fetchSessionFull(sessionId, targetUserId)
            if (!fullSession) return
            for (const lookup of lookups) {
                if (lookup.type === 'qualy') {
                    bestFuelData.qualyFuel = findBestLapFuel(fullSession, lookup.bestTime, true)
                } else {
                    bestFuelData.raceFuel = findBestLapFuel(fullSession, lookup.bestTime, false)
                }
            }
        }))

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

    async function getTrackDetailProjection(
        trackId: string,
        targetUserId?: string,
        options: { category?: CarCategory; grip?: string } = {}
    ): Promise<TrackDetailProjection | null> {
        const resolvedUserId = resolveTargetUserId(targetUserId)
        const category = options.category || 'GT3'
        const selectedGrip = options.grip || 'Optimum'
        const scenarioId = startFirebaseScenario('page.trackDetail.projection', {
            targetUserId: resolvedUserId,
            trackId,
            category,
            grip: selectedGrip
        })
        try {
            if (!resolvedUserId) return null
            const normalizedTrackId = normalizeTrackKey(trackId)
            const cacheKey = `${resolvedUserId}:${normalizedTrackId}`
            let cached = trackDetailProjectionCache.get(cacheKey)
            if (!cached) {
                const [detailResult, trackBestResult] = await Promise.allSettled([
                    loadTrackDetailProjectionDoc(resolvedUserId, normalizedTrackId),
                    loadTrackBest(resolvedUserId, normalizedTrackId)
                ])
                const detail = detailResult.status === 'fulfilled' ? detailResult.value : null
                const trackBest = trackBestResult.status === 'fulfilled' ? trackBestResult.value : null
                if (detailResult.status === 'rejected' || trackBestResult.status === 'rejected') {
                    pushProjectionFallback(resolvedUserId, 'getTrackDetailProjection', {
                        reason: 'projection_read_failed',
                        trackId: normalizedTrackId,
                        detailError: detailResult.status === 'rejected' ? String(detailResult.reason?.message || detailResult.reason) : null,
                        trackBestError: trackBestResult.status === 'rejected' ? String(trackBestResult.reason?.message || trackBestResult.reason) : null
                    })
                    return await getTrackDetailProjectionFallback(trackId, targetUserId, category, selectedGrip)
                }
                if (!detail || Number(detail.schemaVersion || 0) !== TRACK_DETAIL_PROJECTION_SCHEMA_VERSION) {
                    pushProjectionFallback(resolvedUserId, 'getTrackDetailProjection', {
                        reason: 'missing_or_old_trackDetailProjection',
                        trackId: normalizedTrackId,
                        schemaVersion: detail?.schemaVersion || 0
                    })
                    return await getTrackDetailProjectionFallback(trackId, targetUserId, category, selectedGrip)
                }
                cached = { detail, trackBest }
                trackDetailProjectionCache.set(cacheKey, cached)
            }

            const pendingSessions = await loadPendingLocalOverlay(resolvedUserId)
            const projection = buildTrackDetailFromProjectionDocument({
                detailDoc: cached.detail,
                trackBestDoc: cached.trackBest,
                trackId: normalizedTrackId,
                category,
                selectedGrip,
                pendingSessions
            })

            pushGatewayDiagnostic({
                source: pendingSessions.length > 0 ? 'mixed' : 'index_cache',
                action: 'getTrackDetailProjection.projectionFirst',
                targetUserId: resolvedUserId,
                details: {
                    trackId: normalizedTrackId,
                    category,
                    grip: selectedGrip,
                    pendingOverlayCount: pendingSessions.filter((session) => trackMatches(session.meta?.track, normalizedTrackId)).length
                }
            })

            return projection
        } finally {
            endFirebaseScenario(scenarioId)
        }
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
        const scenarioId = startFirebaseScenario('page.sessionDetail.viewModel', {
            sessionId: params.sessionId,
            targetUserId: params.externalUserId || params.targetUserId || currentUser.value?.uid || null,
            isCoachAccess: !!params.targetUserId && !params.externalUserId
        })
        try {
            const result = await loadSessionDetailViewModel({
                sessionId: params.sessionId,
                externalUserId: params.externalUserId,
                targetUserId: params.targetUserId,
                currentUser,
                currentUserDisplayName: userDisplayName.value || currentUser.value?.displayName || 'Tu',
                telemetryGateway: {
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
        } finally {
            endFirebaseScenario(scenarioId)
        }
    }

    function clearGatewayDiagnostics(): void {
        globalGatewayDiagnostics.value = []
    }

    return {
        getOverviewSnapshot,
        getOverviewProjection,
        getSessionsPage,
        getTrackSnapshot,
        getTracksOverviewProjection,
        getTrackDetailProjection,
        getSessionDetail,
        getSessionDetailViewModel,
        gatewayDiagnostics: computed(() => globalGatewayDiagnostics.value),
        clearGatewayDiagnostics,
        ...telemetry,
        pagerSessions: pager.sessions,
        pagerState: pager.state,
        pagerIsOnline: pager.isOnline,
        pagerError: pager.error,
        pagerLoadPage: pager.loadPage,
        pagerNextPage: pager.nextPage,
        pagerPrevPage: pager.prevPage
    }
}


