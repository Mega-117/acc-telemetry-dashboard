import {
    type CarCategory,
    getCarCategory,
    formatLapTime,
    formatDriveTime,
    formatCarName,
    getSessionTypeLabel
} from '~/utils/telemetryFormat'
import { normalizeTrackId as normalizeTrackProjectionId, resolveTrackMetadata } from '~/services/projections/trackMetadata'
import { isSupportedTrackBestProjection } from '~/services/projections/trackBestProjectionGuard'
import type { SessionDocument } from '~/composables/useTelemetryData'
import {
    type TrackActivityProjection,
    type TrackDetailProjection,
    type TrackDetailProjectionDocument,
    type TrackFuelBucketReference,
    type TrackHistoricalPointProjection,
    type TrackRecentSessionProjection
} from '~/types/trackProjections'
import { RACE_FUEL_BUCKETS, getRaceFuelBucket } from '~/services/telemetry/raceFuelClassification'

export { RACE_FUEL_BUCKETS, getRaceFuelBucket } from '~/services/telemetry/raceFuelClassification'

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

function normalizeTrackKey(track: string | null | undefined): string {
    return normalizeTrackProjectionId(track || '')
}

function trackMatches(left: string | null | undefined, right: string | null | undefined): boolean {
    const a = normalizeTrackKey(left)
    const b = normalizeTrackKey(right)
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
export function getNewestSessionEntry(sessionIndex: any, pendingSessions: SessionDocument[]): { car: string | null; date: string | null } {
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

export function normalizeActivity(activity: TrackActivityProjection | null | undefined): TrackActivityProjection {
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

export function buildRecentSessionProjection(session: SessionDocument): TrackRecentSessionProjection {
    const summary = session.summary || {}
    const dateObj = new Date(session.meta.date_start)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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

export function buildHistoricalPointProjection(session: SessionDocument): TrackHistoricalPointProjection {
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

export function buildActivityFromSessions(sessions: SessionDocument[]): TrackActivityProjection {
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

export function buildPendingGripBest(sessions: SessionDocument[], selectedGrip: string): GripBestProjection {
    const best: GripBestProjection = {}
    for (const session of sessions) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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

export function mergeGripBest(base: GripBestProjection, pending: GripBestProjection): GripBestProjection {
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
            merged[tempKey] = pending[tempKey] as any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
            merged[fuelKey] = pending[fuelKey] as any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
            merged[sessionKey] = pending[sessionKey] as any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
            merged[dateKey] = pending[dateKey] as any
        }
    }
    return merged
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
export function normalizeTrackFuelBucketRecord(record: any): {
    timeMs: number
    fuel: number | null
    airTemp: number | null
    date: string | null
    sessionId: string | null
    sampleLapCount: number | null
    confidence: string | null
} | null {
    const timeMs = Number(record?.timeMs || 0)
    if (!timeMs || !Number.isFinite(timeMs)) return null
    return {
        timeMs,
        fuel: record?.fuel ?? null,
        airTemp: record?.airTemp ?? null,
        date: record?.date ?? null,
        sessionId: record?.sessionId ?? null,
        sampleLapCount: record?.sampleLapCount ?? null,
        confidence: record?.confidence ?? null
    }
}

export function buildRaceFuelBucketReferences(gripBests: GripBestProjection): TrackFuelBucketReference[] {
    return RACE_FUEL_BUCKETS.map((bucket) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        const bestRecord = normalizeTrackFuelBucketRecord((gripBests as any).raceBestByFuelBucket?.[bucket])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        const avgRecord = normalizeTrackFuelBucketRecord((gripBests as any).raceAvgByFuelBucket?.[bucket])
        return {
            bucket,
            bestRace: bestRecord?.timeMs ? formatLapTime(bestRecord.timeMs) : null,
            bestRaceFuel: bestRecord?.fuel ?? null,
            bestRaceAirTemp: bestRecord?.airTemp ?? null,
            bestRaceDate: bestRecord?.date ?? null,
            bestRaceSessionId: bestRecord?.sessionId ?? null,
            bestRaceSampleCount: bestRecord?.sampleLapCount ?? null,
            bestRaceConfidence: bestRecord?.confidence ?? null,
            avgRace: avgRecord?.timeMs ? formatLapTime(avgRecord.timeMs) : null,
            avgRaceFuel: avgRecord?.fuel ?? null,
            avgRaceAirTemp: avgRecord?.airTemp ?? null,
            avgRaceDate: avgRecord?.date ?? null,
            avgRaceSessionId: avgRecord?.sessionId ?? null,
            avgRaceSampleCount: avgRecord?.sampleLapCount ?? null,
            avgRaceConfidence: avgRecord?.confidence ?? null,
            hasData: !!bestRecord?.timeMs || !!avgRecord?.timeMs
        }
    })
}

export function dedupeRecentSessions(items: TrackRecentSessionProjection[]): TrackRecentSessionProjection[] {
    const byId = new Map<string, TrackRecentSessionProjection>()
    for (const item of items) {
        if (!byId.has(item.id)) byId.set(item.id, item)
    }
    return Array.from(byId.values())
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
        .slice(0, 200)
}

export function dedupeHistoricalPoints(items: TrackHistoricalPointProjection[]): TrackHistoricalPointProjection[] {
    const byId = new Map<string, TrackHistoricalPointProjection>()
    for (const item of items) {
        if (!byId.has(item.sessionId)) byId.set(item.sessionId, item)
    }
    return Array.from(byId.values()).slice(-200)
}

export function buildTrackDetailFromProjectionDocument(params: {
    detailDoc: TrackDetailProjectionDocument
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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
    const supportedTrackBestDoc = isSupportedTrackBestProjection(trackBestDoc) ? trackBestDoc : null
    const baseActivity = normalizeActivity(categoryDoc?.activity)
    const pendingValidSessions = pendingSessions
        .filter((session) => trackMatches(session.meta?.track, normalizedTrackId))
        .filter((session) => getCarCategory(session.meta?.car || '') === category)
        .filter((session) => Number(session.summary?.laps || 0) > 0)
        .sort((a, b) => (b.meta.date_start || '').localeCompare(a.meta.date_start || ''))
    const pendingActivity = buildActivityFromSessions(pendingValidSessions)
    const gripBests = mergeGripBest(
        supportedTrackBestDoc?.bests?.[category]?.[selectedGrip] || {},
        buildPendingGripBest(pendingValidSessions, selectedGrip)
    )
    const bestRaceFuelBucket = getRaceFuelBucket(gripBests.bestRaceFuel)
    const bestAvgRaceFuelBucket = getRaceFuelBucket(gripBests.bestAvgRaceFuel)
    const bestRaceBucketRecord = bestRaceFuelBucket
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        ? normalizeTrackFuelBucketRecord((gripBests as any).raceBestByFuelBucket?.[bestRaceFuelBucket])
        : null
    const bestAvgRaceBucketRecord = bestAvgRaceFuelBucket
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        ? normalizeTrackFuelBucketRecord((gripBests as any).raceAvgByFuelBucket?.[bestAvgRaceFuelBucket])
        : null
    const raceFuelBuckets = buildRaceFuelBucketReferences(gripBests)
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
            bestRaceFuelBucket,
            bestAvgRaceFuelBucket,
            bestRaceSampleCount: bestRaceBucketRecord?.sampleLapCount ?? null,
            bestAvgRaceSampleCount: bestAvgRaceBucketRecord?.sampleLapCount ?? null,
            bestRaceConfidence: bestRaceBucketRecord?.confidence ?? null,
            bestAvgRaceConfidence: bestAvgRaceBucketRecord?.confidence ?? null,
            raceFuelBuckets,
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
