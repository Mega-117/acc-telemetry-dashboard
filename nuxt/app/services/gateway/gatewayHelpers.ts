import { normalizeTrackId as normalizeTrackProjectionId } from '~/services/projections/trackMetadata'
import type { UserProjectionDocument } from '~/repositories/telemetryProjectionRepository'
import type { SessionDocument } from '~/composables/useTelemetryData'

type TrackStatProjection = {
    track: string
    sessions: number
    lastSession?: string | null
    bestQualy?: number | null
    bestRace?: number | null
    bestAvgRace?: number | null
    bestByGrip?: Record<string, { bestQualy?: number | null; bestRace?: number | null }>
}

/** Normalizza una chiave track chiamando normalizeTrackProjectionId. */
export function normalizeTrackKey(track: string | null | undefined): string {
    return normalizeTrackProjectionId(track || '')
}

/** Verifica se due identificatori di track corrispondono dopo normalizzazione. */
export function trackMatches(left: string | null | undefined, right: string | null | undefined): boolean {
    const a = normalizeTrackKey(left)
    const b = normalizeTrackKey(right)
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a))
}

/** Controlla se il sessionIndex della proiezione utente è pronto (schemaVersion >= 2). */
export function isProjectionIndexReady(userProjection: UserProjectionDocument | null): boolean {
    return Number(userProjection?.sessionIndex?.schemaVersion || 0) >= 2
}

/** Costruisce un array di TrackStatProjection a partire dal sessionIndex grezzo. */
export function buildTrackStatsFromSessionIndex(sessionIndex: any): TrackStatProjection[] {
    const tracksSummary = Array.isArray(sessionIndex?.tracksSummary) ? sessionIndex.tracksSummary : []
    return tracksSummary
        .filter((track: any) => track?.track)
        .map((track: any) => ({
            track: track.track,
            sessions: Number(track.sessions || 0),
            lastSession: track.lastPlayed || track.lastSession || null
        }))
}

/** Unisce le sessioni pending alle statistiche base per track, aggiornando conteggi e date. */
export function mergePendingTrackStats(baseStats: TrackStatProjection[], pendingSessions: SessionDocument[]): TrackStatProjection[] {
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
