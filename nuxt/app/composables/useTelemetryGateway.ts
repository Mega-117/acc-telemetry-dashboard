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

const OVERVIEW_SNAPSHOT_CACHE_TTL_MS = 1000
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

type TrackBestTimes = {
    bestQualy: number | null
    bestQualyGrip?: string | null
    bestRace: number | null
    bestRaceGrip?: string | null
    bestAvgRace: number | null
    bestAvgRaceGrip?: string | null
}

type TrackBestTimeField = 'bestQualy' | 'bestRace' | 'bestAvgRace'

type TrackStatProjection = {
    track: string
    sessions: number
    lastSession?: string | null
    bestQualy?: number | null
    bestRace?: number | null
    bestAvgRace?: number | null
    bestByGrip?: Record<string, { bestQualy?: number | null; bestRace?: number | null }>
}

type GripBestProjection = {
    bestQualy?: number | null
    bestQualyTemp?: number | null
    bestQualyFuel?: number | null
    bestQualySessionId?: string | null
    bestQualyDate?: string | null
    bestRace?: number | null
    bestRaceTemp?: number | null
    bestRaceFuel?: number | null
    bestRaceSessionId?: string | null
    bestRaceDate?: string | null
    bestAvgRace?: number | null
    bestAvgRaceTemp?: number | null
    bestAvgRaceFuel?: number | null
    bestAvgRaceSessionId?: string | null
    bestAvgRaceDate?: string | null
}

const MAX_DIAGNOSTICS = 300
const OVERVIEW_GRIP_PRIORITY = ['Optimum', 'Fast', 'Green', 'Greasy', 'Damp', 'Wet', 'Flood']
const OVERVIEW_GRIP_SCAN_ORDER = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']
const globalGatewayDiagnostics = ref<PipelineDiagnosticEvent[]>([])
const trackDetailProjectionCache = new Map<string, { detail: TrackDetailProjectionDocument; trackBest: any | null }>()
const pendingLocalOverlayCache = new Map<string, { cachedAt: number; sessions: SessionDocument[] }>()

function normalizeTrackKey(track: string | null | undefined): string {
    return normalizeTrackProjectionId(track || '')
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

function trackMatches(left: string | null | undefined, right: string | null | undefined): boolean {
    const a = normalizeTrackKey(left)
    const b = normalizeTrackKey(right)
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a))
}

function isProjectionIndexReady(userProjection: UserProjectionDocument | null): boolean {
    return Number(userProjection?.sessionIndex?.schemaVersion || 0) >= 2
}

function buildTrackStatsFromSessionIndex(sessionIndex: any): TrackStatProjection[] {
    const tracksSummary = Array.isArray(sessionIndex?.tracksSummary) ? sessionIndex.tracksSummary : []
    return tracksSummary
        .filter((track: any) => track?.track)
        .map((track: any) => ({
            track: track.track,
            sessions: Number(track.sessions || 0),
            lastSession: track.lastPlayed || track.lastSession || null
        }))
}

function mergePendingTrackStats(baseStats: TrackStatProjection[], pendingSessions: SessionDocument[]): TrackStatProjection[] {
    const byTrack = new Map<string, TrackStatProjection>()
    for (const stat of baseStats) {
        byTrack.set(normalizeTrackKey(stat.track), { ...stat })
    }

    for (const session of pendingSessions) {
        const trackId = normalizeTrackKey(session.meta?.track)
        if (!trackId) continue
        const existing = byTrack.get(trackId)
        if (!existing) {
            byTrack.set(trackId, {
                track: session.meta.track,
                sessions: 1,
                lastSession: session.meta.date_start || null
            })
            continue
        }
        existing.sessions += 1
        if ((session.meta.date_start || '') > (existing.lastSession || '')) {
            existing.lastSession = session.meta.date_start
        }
    }

    return Array.from(byTrack.values()).sort((a, b) => (b.lastSession || '').localeCompare(a.lastSession || ''))
}

function buildBestTimesFromTrackBestDoc(
    trackBestDoc: any | null,
    category: CarCategory = 'GT3',
    grip: string = 'Optimum'
): TrackBestTimes {
    const gripBests = trackBestDoc?.bests?.[category]?.[grip] || {}
    return {
        bestQualy: gripBests.bestQualy || null,
        bestRace: gripBests.bestRace || null,
        bestAvgRace: gripBests.bestAvgRace || null
    }
}

function updateBestTimeWithGrip(
    target: TrackBestTimes,
    field: keyof Pick<TrackBestTimes, 'bestQualy' | 'bestRace' | 'bestAvgRace'>,
    gripField: keyof Pick<TrackBestTimes, 'bestQualyGrip' | 'bestRaceGrip' | 'bestAvgRaceGrip'>,
    candidate: number | null | undefined,
    grip: string
): void {
    if (!candidate) return
    const current = target[field]
    const currentGrip = target[gripField]
    const candidatePriority = OVERVIEW_GRIP_PRIORITY.indexOf(grip)
    const currentPriority = currentGrip ? OVERVIEW_GRIP_PRIORITY.indexOf(currentGrip) : Number.MAX_SAFE_INTEGER
    const candidateWinsTie = current === candidate
        && candidatePriority >= 0
        && (currentPriority < 0 || candidatePriority < currentPriority)

    if (!current || candidate < Number(current) || candidateWinsTie) {
        target[field] = candidate
        target[gripField] = grip
    }
}

function buildOverviewBestTimesFromTrackBestDoc(
    trackBestDoc: any | null,
    category: CarCategory = 'GT3'
): TrackBestTimes {
    const result: TrackBestTimes = {
        bestQualy: null,
        bestQualyGrip: null,
        bestRace: null,
        bestRaceGrip: null,
        bestAvgRace: null,
        bestAvgRaceGrip: null
    }

    const categoryBests = trackBestDoc?.bests?.[category] || {}
    for (const grip of OVERVIEW_GRIP_SCAN_ORDER) {
        const gripBests = categoryBests?.[grip] || {}
        updateBestTimeWithGrip(result, 'bestQualy', 'bestQualyGrip', gripBests.bestQualy, grip)
        updateBestTimeWithGrip(result, 'bestRace', 'bestRaceGrip', gripBests.bestRace, grip)
        updateBestTimeWithGrip(result, 'bestAvgRace', 'bestAvgRaceGrip', gripBests.bestAvgRace, grip)
    }

    return result
}

function buildTrackBestsMapFromDocs(trackBestDocs: Record<string, any>): Record<string, TrackBestTimes> {
    const result: Record<string, TrackBestTimes> = {}
    for (const [rawTrackId, doc] of Object.entries(trackBestDocs || {})) {
        const trackId = normalizeTrackKey((doc as any)?.trackId || rawTrackId)
        if (!trackId) continue
        result[trackId] = buildBestTimesFromTrackBestDoc(doc, 'GT3', 'Optimum')
    }
    return result
}

function updateBestTime(
    target: TrackBestTimes,
    field: TrackBestTimeField,
    candidate: number | null | undefined
): void {
    if (!candidate) return
    if (!target[field] || candidate < Number(target[field])) {
        target[field] = candidate
    }
}

function mergePendingBestsByTrack(
    baseBests: Record<string, TrackBestTimes>,
    pendingSessions: SessionDocument[]
): Record<string, TrackBestTimes> {
    const merged: Record<string, TrackBestTimes> = { ...baseBests }
    for (const session of pendingSessions) {
        if (getCarCategory(session.meta?.car || '') !== 'GT3') continue
        const trackId = normalizeTrackKey(session.meta?.track)
        if (!trackId) continue
        const current = merged[trackId] || { bestQualy: null, bestRace: null, bestAvgRace: null }
        const gripBest = (session.summary as any)?.best_by_grip?.Optimum || {}
        updateBestTime(current, 'bestQualy', gripBest.bestQualy)
        updateBestTime(current, 'bestRace', gripBest.bestRace)
        updateBestTime(current, 'bestAvgRace', gripBest.bestAvgRace)
        merged[trackId] = current
    }
    return merged
}

function mergePendingOverviewBestsByTrack(
    baseBests: Record<string, TrackBestTimes>,
    pendingSessions: SessionDocument[]
): Record<string, TrackBestTimes> {
    const merged: Record<string, TrackBestTimes> = { ...baseBests }
    for (const session of pendingSessions) {
        if (getCarCategory(session.meta?.car || '') !== 'GT3') continue
        const trackId = normalizeTrackKey(session.meta?.track)
        if (!trackId) continue
        const current = merged[trackId] || {
            bestQualy: null,
            bestQualyGrip: null,
            bestRace: null,
            bestRaceGrip: null,
            bestAvgRace: null,
            bestAvgRaceGrip: null
        }
        const bestByGrip = (session.summary as any)?.best_by_grip || {}
        for (const grip of OVERVIEW_GRIP_SCAN_ORDER) {
            const gripBest = bestByGrip?.[grip] || {}
            updateBestTimeWithGrip(current, 'bestQualy', 'bestQualyGrip', gripBest.bestQualy, grip)
            updateBestTimeWithGrip(current, 'bestRace', 'bestRaceGrip', gripBest.bestRace, grip)
            updateBestTimeWithGrip(current, 'bestAvgRace', 'bestAvgRaceGrip', gripBest.bestAvgRace, grip)
        }
        merged[trackId] = current
    }
    return merged
}

function buildActivity7dFromSessionIndex(sessionIndex: any): OverviewProjection['activity7d'] {
    const sourceRows = Array.isArray(sessionIndex?.activity7d?.byDay) ? sessionIndex.activity7d.byDay : []
    const byDate = new Map<string, any>()
    for (const row of sourceRows) {
        if (row?.date) byDate.set(row.date, row)
    }

    return buildRecentActivityBuckets(7).map((bucket) => {
        const row = byDate.get(bucket.date) || {}
        return {
            date: bucket.date,
            dateLabel: bucket.dateLabel,
            day: bucket.day,
            practice: Number(row.P || row.practice || 0),
            qualify: Number(row.Q || row.qualify || 0),
            race: Number(row.R || row.race || 0)
        }
    })
}

function buildActivityTotalsFromSessionIndex(sessionIndex: any): OverviewProjection['activityTotals'] {
    const activity = sessionIndex?.activity7d || {}
    return {
        practice: {
            minutes: Number(activity.practice?.minutes || 0),
            sessions: Number(activity.practice?.sessions || 0)
        },
        qualify: {
            minutes: Number(activity.qualify?.minutes || 0),
            sessions: Number(activity.qualify?.sessions || 0)
        },
        race: {
            minutes: Number(activity.race?.minutes || 0),
            sessions: Number(activity.race?.sessions || 0)
        }
    }
}

function sumActivityDataMinutes(activity7d: OverviewProjection['activity7d']): number {
    return activity7d.reduce((sum, row) => sum + Number(row.practice || 0) + Number(row.qualify || 0) + Number(row.race || 0), 0)
}

function sumActivityTotalMinutes(activityTotals: OverviewProjection['activityTotals']): number {
    return Number(activityTotals.practice.minutes || 0)
        + Number(activityTotals.qualify.minutes || 0)
        + Number(activityTotals.race.minutes || 0)
}

function isActivityProjectionInconsistent(
    activity7d: OverviewProjection['activity7d'],
    activityTotals: OverviewProjection['activityTotals']
): boolean {
    return sumActivityDataMinutes(activity7d) !== sumActivityTotalMinutes(activityTotals)
}

function overlayPendingActivity(
    activity7d: OverviewProjection['activity7d'],
    activityTotals: OverviewProjection['activityTotals'],
    pendingSessions: SessionDocument[]
): { activity7d: OverviewProjection['activity7d']; activityTotals: OverviewProjection['activityTotals'] } {
    const resultData = activity7d.map((row) => ({ ...row }))
    const resultTotals = {
        practice: { ...activityTotals.practice },
        qualify: { ...activityTotals.qualify },
        race: { ...activityTotals.race }
    }

    const dateKeys = getRecentActivityDateKeys(7)

    for (const session of pendingSessions) {
        const minutes = Math.round(Number(session.summary?.totalTime || 0) / 60000)
        const dateKey = getTelemetryActivityDateKey(session.meta?.date_start)
        if (!dateKey) continue
        const index = dateKeys.indexOf(dateKey)
        const sessionType = session.meta?.session_type
        const bucket = getActivityBucketForSessionType(sessionType, SESSION_TYPES)
        if (!bucket) continue
        resultTotals[bucket].minutes += minutes
        resultTotals[bucket].sessions += 1
        const dayRow = index >= 0 ? resultData[index] : null
        if (dayRow) {
            dayRow[bucket] += minutes
        }
    }

    return { activity7d: resultData, activityTotals: resultTotals }
}

function getNewestSessionEntry(sessionIndex: any, pendingSessions: SessionDocument[]): { car: string | null; date: string | null } {
    const newestIndexEntry = Array.isArray(sessionIndex?.sessionsList) ? sessionIndex.sessionsList[0] : null
    const newestPending = [...pendingSessions].sort((a, b) => (b.meta.date_start || '').localeCompare(a.meta.date_start || ''))[0] || null
    if (newestPending && (!newestIndexEntry?.date || newestPending.meta.date_start > newestIndexEntry.date)) {
        return {
            car: newestPending.meta.car || null,
            date: newestPending.meta.date_start || null
        }
    }
    return {
        car: newestIndexEntry?.car || null,
        date: newestIndexEntry?.date || null
    }
}

function normalizeActivity(activity: TrackActivityProjection | null | undefined): TrackActivityProjection {
    const totalLaps = Number(activity?.totalLaps || 0)
    const validLaps = Number(activity?.validLaps || 0)
    const totalTimeMs = Number(activity?.totalTimeMs || 0)
    return {
        totalLaps,
        validLaps,
        validPercent: totalLaps > 0 ? Math.round((validLaps / totalLaps) * 100) : 0,
        totalTimeMs,
        totalTimeFormatted: activity?.totalTimeFormatted || formatDriveTime(totalTimeMs),
        sessionCount: Number(activity?.sessionCount || 0)
    }
}

function buildRecentSessionProjection(session: SessionDocument): TrackRecentSessionProjection {
    const summary = session.summary || {}
    const dateObj = new Date(session.meta.date_start)
    const sessionRaceTime = (summary as any)?.best_session_race_ms || summary.best_race_ms || null
    return {
        id: session.sessionId,
        date: session.meta.date_start?.split('T')[0] || '',
        time: Number.isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        type: getSessionTypeLabel(session.meta.session_type),
        car: formatCarName(session.meta.car),
        laps: summary.laps || 0,
        stints: summary.stintCount || 0,
        bestQualy: summary.best_qualy_ms ? formatLapTime(summary.best_qualy_ms) : undefined,
        bestRace: sessionRaceTime ? formatLapTime(sessionRaceTime) : undefined
    }
}

function buildHistoricalPointProjection(session: SessionDocument): TrackHistoricalPointProjection {
    const summary = session.summary || {}
    const dateStr = session.meta.date_start?.split('T')[0] || ''
    const [, month, day] = dateStr.split('-')
    const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
    const dateLabel = day && month ? `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1] || 'N/A'}` : 'N/A'
    const qualyTime = summary.best_qualy_ms || null
    return {
        date: dateLabel,
        sessionId: session.sessionId,
        bestQualy: qualyTime ? formatLapTime(qualyTime) : undefined,
        bestRace: summary.best_race_ms ? formatLapTime(summary.best_race_ms) : undefined
    }
}

function buildActivityFromSessions(sessions: SessionDocument[]): TrackActivityProjection {
    const totalLaps = sessions.reduce((sum, session) => sum + Number(session.summary?.laps || 0), 0)
    const validLaps = sessions.reduce((sum, session) => sum + Number(session.summary?.lapsValid || 0), 0)
    const totalTimeMs = sessions.reduce((sum, session) => sum + Number(session.summary?.totalTime || 0), 0)
    return {
        totalLaps,
        validLaps,
        validPercent: totalLaps > 0 ? Math.round((validLaps / totalLaps) * 100) : 0,
        totalTimeMs,
        totalTimeFormatted: formatDriveTime(totalTimeMs),
        sessionCount: sessions.length
    }
}

function buildPendingGripBest(sessions: SessionDocument[], selectedGrip: string): GripBestProjection {
    const best: GripBestProjection = {}
    for (const session of sessions) {
        const sessionBest = (session.summary as any)?.best_by_grip?.[selectedGrip]
        if (!sessionBest) continue
        if (sessionBest.bestQualy && (!best.bestQualy || sessionBest.bestQualy < best.bestQualy)) {
            best.bestQualy = sessionBest.bestQualy
            best.bestQualyTemp = sessionBest.bestQualyTemp ?? null
            best.bestQualyFuel = sessionBest.bestQualyFuel ?? null
            best.bestQualySessionId = session.sessionId
            best.bestQualyDate = session.meta.date_start
        }
        if (sessionBest.bestRace && (!best.bestRace || sessionBest.bestRace < best.bestRace)) {
            best.bestRace = sessionBest.bestRace
            best.bestRaceTemp = sessionBest.bestRaceTemp ?? null
            best.bestRaceFuel = sessionBest.bestRaceFuel ?? null
            best.bestRaceSessionId = session.sessionId
            best.bestRaceDate = session.meta.date_start
        }
        if (sessionBest.bestAvgRace && (!best.bestAvgRace || sessionBest.bestAvgRace < best.bestAvgRace)) {
            best.bestAvgRace = sessionBest.bestAvgRace
            best.bestAvgRaceTemp = sessionBest.bestAvgRaceTemp ?? null
            best.bestAvgRaceFuel = sessionBest.bestAvgRaceFuel ?? null
            best.bestAvgRaceSessionId = session.sessionId
            best.bestAvgRaceDate = session.meta.date_start
        }
    }
    return best
}

function mergeGripBest(base: GripBestProjection, pending: GripBestProjection): GripBestProjection {
    const merged = { ...base }
    const pairs: Array<[
        'bestQualy' | 'bestRace' | 'bestAvgRace',
        'bestQualyTemp' | 'bestRaceTemp' | 'bestAvgRaceTemp',
        'bestQualyFuel' | 'bestRaceFuel' | 'bestAvgRaceFuel',
        'bestQualySessionId' | 'bestRaceSessionId' | 'bestAvgRaceSessionId',
        'bestQualyDate' | 'bestRaceDate' | 'bestAvgRaceDate'
    ]> = [
        ['bestQualy', 'bestQualyTemp', 'bestQualyFuel', 'bestQualySessionId', 'bestQualyDate'],
        ['bestRace', 'bestRaceTemp', 'bestRaceFuel', 'bestRaceSessionId', 'bestRaceDate'],
        ['bestAvgRace', 'bestAvgRaceTemp', 'bestAvgRaceFuel', 'bestAvgRaceSessionId', 'bestAvgRaceDate']
    ]
    for (const [timeKey, tempKey, fuelKey, sessionKey, dateKey] of pairs) {
        const pendingTime = pending[timeKey]
        if (pendingTime && (!merged[timeKey] || pendingTime < Number(merged[timeKey]))) {
            merged[timeKey] = pendingTime
            merged[tempKey] = pending[tempKey] as any
            merged[fuelKey] = pending[fuelKey] as any
            merged[sessionKey] = pending[sessionKey] as any
            merged[dateKey] = pending[dateKey] as any
        }
    }
    return merged
}

function dedupeRecentSessions(items: TrackRecentSessionProjection[]): TrackRecentSessionProjection[] {
    const byId = new Map<string, TrackRecentSessionProjection>()
    for (const item of items) {
        if (!byId.has(item.id)) byId.set(item.id, item)
    }
    return Array.from(byId.values())
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
        .slice(0, 200)
}

function dedupeHistoricalPoints(items: TrackHistoricalPointProjection[]): TrackHistoricalPointProjection[] {
    const byId = new Map<string, TrackHistoricalPointProjection>()
    for (const item of items) {
        if (!byId.has(item.sessionId)) byId.set(item.sessionId, item)
    }
    return Array.from(byId.values()).slice(-200)
}

function buildTrackDetailFromProjectionDocument(params: {
    detailDoc: TrackDetailProjectionDocument
    trackBestDoc: any | null
    trackId: string
    category: CarCategory
    selectedGrip: string
    pendingSessions: SessionDocument[]
}): TrackDetailProjection {
    const { detailDoc, trackBestDoc, trackId, category, selectedGrip, pendingSessions } = params
    const normalizedTrackId = normalizeTrackKey(trackId || detailDoc.trackId)
    const metadata = resolveTrackMetadata(normalizedTrackId)
    const categoryDoc = detailDoc.categories?.[category]
    const baseActivity = normalizeActivity(categoryDoc?.activity)
    const pendingValidSessions = pendingSessions
        .filter((session) => trackMatches(session.meta?.track, normalizedTrackId))
        .filter((session) => getCarCategory(session.meta?.car || '') === category)
        .filter((session) => Number(session.summary?.laps || 0) > 0)
        .sort((a, b) => (b.meta.date_start || '').localeCompare(a.meta.date_start || ''))
    const pendingActivity = buildActivityFromSessions(pendingValidSessions)
    const gripBests = mergeGripBest(
        trackBestDoc?.bests?.[category]?.[selectedGrip] || {},
        buildPendingGripBest(pendingValidSessions, selectedGrip)
    )
    const lastSession = [
        categoryDoc?.lastSessionDate || null,
        detailDoc.lastSessionDate || null,
        pendingValidSessions[0]?.meta.date_start || null
    ].filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))[0] || '-'

    return {
        track: {
            id: normalizedTrackId,
            name: metadata.name,
            fullName: metadata.fullName,
            country: metadata.country,
            countryCode: metadata.countryCode,
            length: metadata.length,
            turns: metadata.turns,
            image: metadata.image,
            sessions: Number(categoryDoc?.sessionCount || 0) + pendingValidSessions.length,
            lastSession,
            bestQualy: gripBests.bestQualy ? formatLapTime(gripBests.bestQualy) : null,
            bestRace: gripBests.bestRace ? formatLapTime(gripBests.bestRace) : null,
            bestAvgRace: gripBests.bestAvgRace ? formatLapTime(gripBests.bestAvgRace) : null,
            bestQualyConditions: gripBests.bestQualy ? { airTemp: Number(gripBests.bestQualyTemp || 0), roadTemp: 0, grip: selectedGrip } : null,
            bestRaceConditions: gripBests.bestRace ? { airTemp: Number(gripBests.bestRaceTemp || 0), roadTemp: 0, grip: selectedGrip } : null,
            bestAvgRaceConditions: gripBests.bestAvgRace ? { airTemp: Number(gripBests.bestAvgRaceTemp || 0), roadTemp: 0, grip: selectedGrip } : null,
            bestQualySessionId: gripBests.bestQualySessionId || null,
            bestRaceSessionId: gripBests.bestRaceSessionId || null,
            bestAvgRaceSessionId: gripBests.bestAvgRaceSessionId || null,
            bestQualyDate: gripBests.bestQualyDate || null,
            bestRaceDate: gripBests.bestRaceDate || null,
            bestAvgRaceDate: gripBests.bestAvgRaceDate || null,
            bestQualyFuel: gripBests.bestQualyFuel ?? null,
            bestRaceFuel: gripBests.bestRaceFuel ?? null,
            bestAvgRaceFuel: gripBests.bestAvgRaceFuel ?? null,
            hasGripData: !!gripBests.bestQualy || !!gripBests.bestRace || !!gripBests.bestAvgRace
        },
        recentSessions: dedupeRecentSessions([
            ...pendingValidSessions.map(buildRecentSessionProjection),
            ...(categoryDoc?.recentSessions || [])
        ]),
        historicalTimes: dedupeHistoricalPoints([
            ...(categoryDoc?.historicalTimes || []),
            ...pendingValidSessions.map(buildHistoricalPointProjection)
        ]),
        activity: {
            totalLaps: baseActivity.totalLaps + pendingActivity.totalLaps,
            validLaps: baseActivity.validLaps + pendingActivity.validLaps,
            validPercent: baseActivity.totalLaps + pendingActivity.totalLaps > 0
                ? Math.round(((baseActivity.validLaps + pendingActivity.validLaps) / (baseActivity.totalLaps + pendingActivity.totalLaps)) * 100)
                : 0,
            totalTimeMs: baseActivity.totalTimeMs + pendingActivity.totalTimeMs,
            totalTimeFormatted: formatDriveTime(baseActivity.totalTimeMs + pendingActivity.totalTimeMs),
            sessionCount: baseActivity.sessionCount + pendingActivity.sessionCount
        },
        category,
        grip: selectedGrip
    }
}

export function useTelemetryGateway() {
    const telemetry = useTelemetryData()
    const pager = useSessionPager()
    const { currentUser, userDisplayName } = useFirebaseAuth()

    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        return !!(window as any).electronAPI
    })

    function resolveTargetUserId(targetUserId?: string): string | null {
        return targetUserId || currentUser.value?.uid || null
    }

    function resolveOverviewSource(targetUserId: string): LoadSessionsSourceMode {
        void targetUserId
        return 'cloud_fresh'
    }

    async function loadPendingLocalOverlay(targetUserId: string): Promise<SessionDocument[]> {
        if (!isElectron.value || typeof window === 'undefined' || !navigator.onLine) return []
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

export type { SessionPagerFilters }
