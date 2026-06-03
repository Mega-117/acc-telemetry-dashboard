import { type CarCategory, getCarCategory } from '~/utils/telemetryFormat'
import { normalizeTrackId as normalizeTrackProjectionId } from '~/services/projections/trackMetadata'
import type { SessionDocument } from '~/composables/useTelemetryData'

export const OVERVIEW_GRIP_PRIORITY = ['Optimum', 'Fast', 'Green', 'Greasy', 'Damp', 'Wet', 'Flood']
export const OVERVIEW_GRIP_SCAN_ORDER = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']

export type TrackBestTimes = {
    bestQualy: number | null
    bestQualyGrip?: string | null
    bestRace: number | null
    bestRaceGrip?: string | null
    bestAvgRace: number | null
    bestAvgRaceGrip?: string | null
}

export type TrackBestTimeField = 'bestQualy' | 'bestRace' | 'bestAvgRace'

function normalizeTrackKey(track: string | null | undefined): string {
    return normalizeTrackProjectionId(track || '')
}

export function buildBestTimesFromTrackBestDoc(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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

export function updateBestTimeWithGrip(
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

export function buildOverviewBestTimesFromTrackBestDoc(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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

export function buildTrackBestsMapFromDocs(trackBestDocs: Record<string, any>): Record<string, TrackBestTimes> {
    const result: Record<string, TrackBestTimes> = {}
    for (const [rawTrackId, doc] of Object.entries(trackBestDocs || {})) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        const trackId = normalizeTrackKey((doc as any)?.trackId || rawTrackId)
        if (!trackId) continue
        result[trackId] = buildBestTimesFromTrackBestDoc(doc, 'GT3', 'Optimum')
    }
    return result
}

export function updateBestTime(
    target: TrackBestTimes,
    field: TrackBestTimeField,
    candidate: number | null | undefined
): void {
    if (!candidate) return
    if (!target[field] || candidate < Number(target[field])) {
        target[field] = candidate
    }
}

export function mergePendingBestsByTrack(
    baseBests: Record<string, TrackBestTimes>,
    pendingSessions: SessionDocument[]
): Record<string, TrackBestTimes> {
    const merged: Record<string, TrackBestTimes> = { ...baseBests }
    for (const session of pendingSessions) {
        if (getCarCategory(session.meta?.car || '') !== 'GT3') continue
        const trackId = normalizeTrackKey(session.meta?.track)
        if (!trackId) continue
        // Spread to avoid mutating the original baseBests entries (shallow copy of inner object)
        const current = { ...(merged[trackId] || { bestQualy: null, bestRace: null, bestAvgRace: null }) }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        const gripBest = (session.summary as any)?.best_by_grip?.Optimum || {}
        updateBestTime(current, 'bestQualy', gripBest.bestQualy)
        updateBestTime(current, 'bestRace', gripBest.bestRace)
        updateBestTime(current, 'bestAvgRace', gripBest.bestAvgRace)
        merged[trackId] = current
    }
    return merged
}

export function mergePendingOverviewBestsByTrack(
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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
