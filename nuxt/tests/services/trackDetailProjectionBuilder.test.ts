import { describe, it, expect } from 'vitest'
import {
    RACE_FUEL_BUCKETS,
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
import type { SessionDocument } from '~/composables/useTelemetryData'
import type {
    TrackDetailProjectionDocument,
    TrackActivityProjection,
    TrackRecentSessionProjection,
    TrackHistoricalPointProjection
} from '~/types/trackProjections'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function makeSession(overrides: Partial<{
    sessionId: string
    car: string
    track: string
    date_start: string
    session_type: number
    laps: number
    lapsValid: number
    totalTime: number
    best_qualy_ms: number | null
    best_race_ms: number | null
    best_by_grip: Record<string, any>
}> = {}): SessionDocument {
    return {
        sessionId: overrides.sessionId ?? 'sess-001',
        fileHash: 'abc',
        fileName: 'session.json',
        uploadedAt: null,
        rawChunkCount: 0,
        rawSizeBytes: 0,
        meta: {
            track: overrides.track ?? 'monza',
            car: overrides.car ?? 'ferrari_296_gt3',
            date_start: overrides.date_start ?? '2024-06-01T10:00:00',
            date_end: null,
            session_type: overrides.session_type ?? 2,
            driver: null
        },
        summary: {
            laps: overrides.laps ?? 10,
            lapsValid: overrides.lapsValid ?? 8,
            bestLap: null,
            avgCleanLap: null,
            totalTime: overrides.totalTime ?? 1800000,
            stintCount: 1,
            best_qualy_ms: overrides.best_qualy_ms ?? null,
            best_race_ms: overrides.best_race_ms ?? null,
            best_by_grip: overrides.best_by_grip
        }
    }
}

function makeEmptyDetailDoc(trackId = 'monza'): TrackDetailProjectionDocument {
    return {
        schemaVersion: 1,
        trackId,
        lastSessionDate: null,
        categories: {}
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RACE_FUEL_BUCKETS
// ─────────────────────────────────────────────────────────────────────────────
describe('RACE_FUEL_BUCKETS', () => {
    it('contiene 4 bucket', () => {
        expect(RACE_FUEL_BUCKETS).toHaveLength(4)
    })

    it('i bucket sono in ordine crescente', () => {
        expect(RACE_FUEL_BUCKETS[0]).toBe('40-60')
        expect(RACE_FUEL_BUCKETS[3]).toBe('100+')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// getNewestSessionEntry
// ─────────────────────────────────────────────────────────────────────────────
describe('getNewestSessionEntry', () => {
    it('usa il primo elemento di sessionsList se non ci sono pending', () => {
        const sessionIndex = {
            sessionsList: [{ car: 'ferrari_296_gt3', date: '2024-06-01T10:00:00' }]
        }
        const result = getNewestSessionEntry(sessionIndex, [])
        expect(result.car).toBe('ferrari_296_gt3')
        expect(result.date).toBe('2024-06-01T10:00:00')
    })

    it('preferisce la sessione pending se più recente', () => {
        const sessionIndex = {
            sessionsList: [{ car: 'amr_v8_vantage_gt3', date: '2024-05-01T10:00:00' }]
        }
        const pending = [makeSession({ date_start: '2024-06-15T10:00:00', car: 'ferrari_296_gt3' })]
        const result = getNewestSessionEntry(sessionIndex, pending)
        expect(result.date).toBe('2024-06-15T10:00:00')
        expect(result.car).toBe('ferrari_296_gt3')
    })

    it('usa il più recente tra più sessioni pending', () => {
        const pending = [
            makeSession({ sessionId: 's1', date_start: '2024-06-10T10:00:00', car: 'porsche_991_gt3_r' }),
            makeSession({ sessionId: 's2', date_start: '2024-06-15T10:00:00', car: 'ferrari_296_gt3' })
        ]
        const result = getNewestSessionEntry(null, pending)
        expect(result.date).toBe('2024-06-15T10:00:00')
    })

    it('restituisce null/null per sessionIndex null e pending vuoto', () => {
        const result = getNewestSessionEntry(null, [])
        expect(result.car).toBeNull()
        expect(result.date).toBeNull()
    })

    it('gestisce sessionsList non array', () => {
        const result = getNewestSessionEntry({ sessionsList: null }, [])
        expect(result.car).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// normalizeActivity
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeActivity', () => {
    it('calcola validPercent correttamente', () => {
        const result = normalizeActivity({
            totalLaps: 10, validLaps: 8, totalTimeMs: 1800000, sessionCount: 1
        } as TrackActivityProjection)
        expect(result.validPercent).toBe(80)
    })

    it('validPercent è 0 per totalLaps = 0', () => {
        const result = normalizeActivity({ totalLaps: 0, validLaps: 0, totalTimeMs: 0, sessionCount: 0 } as any)
        expect(result.validPercent).toBe(0)
    })

    it('gestisce input null restituendo zeri', () => {
        const result = normalizeActivity(null)
        expect(result.totalLaps).toBe(0)
        expect(result.validLaps).toBe(0)
        expect(result.sessionCount).toBe(0)
    })

    it('produce totalTimeFormatted non vuoto per totalTimeMs > 0', () => {
        const result = normalizeActivity({ totalLaps: 5, validLaps: 5, totalTimeMs: 3600000, sessionCount: 1 } as any)
        expect(result.totalTimeFormatted).toBeTruthy()
    })

    it('validPercent arrotondato all\'intero', () => {
        const result = normalizeActivity({ totalLaps: 3, validLaps: 1, totalTimeMs: 0, sessionCount: 1 } as any)
        expect(Number.isInteger(result.validPercent)).toBe(true)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildRecentSessionProjection
// ─────────────────────────────────────────────────────────────────────────────
describe('buildRecentSessionProjection', () => {
    it('mappa id, date, laps dalla sessione', () => {
        const session = makeSession({ sessionId: 'abc123', laps: 12, date_start: '2024-06-01T10:30:00' })
        const result = buildRecentSessionProjection(session)
        expect(result.id).toBe('abc123')
        expect(result.date).toBe('2024-06-01')
        expect(result.laps).toBe(12)
    })

    it('type per sessione race (2) è "race"', () => {
        const session = makeSession({ session_type: 2 })
        expect(buildRecentSessionProjection(session).type).toBe('race')
    })

    it('type per sessione practice (0) è "practice"', () => {
        const session = makeSession({ session_type: 0 })
        expect(buildRecentSessionProjection(session).type).toBe('practice')
    })

    it('type per sessione qualify (1) è "qualify"', () => {
        const session = makeSession({ session_type: 1 })
        expect(buildRecentSessionProjection(session).type).toBe('qualify')
    })

    it('bestQualy formattato se presente', () => {
        const session = makeSession({ best_qualy_ms: 83456 })
        const result = buildRecentSessionProjection(session)
        expect(result.bestQualy).toBe('1:23.456')
    })

    it('bestQualy assente se null', () => {
        const session = makeSession({ best_qualy_ms: null })
        const result = buildRecentSessionProjection(session)
        expect(result.bestQualy).toBeUndefined()
    })

    it('time è stringa HH:MM per data valida', () => {
        const session = makeSession({ date_start: '2024-06-01T14:30:00' })
        const result = buildRecentSessionProjection(session)
        expect(result.time).toMatch(/^\d{2}:\d{2}$/)
    })

    it('car è formattato (non raw)', () => {
        const session = makeSession({ car: 'ferrari_296_gt3' })
        const result = buildRecentSessionProjection(session)
        expect(result.car).toContain('Ferrari')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildHistoricalPointProjection
// ─────────────────────────────────────────────────────────────────────────────
describe('buildHistoricalPointProjection', () => {
    it('costruisce una data leggibile', () => {
        const session = makeSession({ date_start: '2024-06-15T10:00:00' })
        const result = buildHistoricalPointProjection(session)
        expect(result.date).toContain('15')
    })

    it('sessionId corrisponde a quello della sessione', () => {
        const session = makeSession({ sessionId: 'xyz' })
        const result = buildHistoricalPointProjection(session)
        expect(result.sessionId).toBe('xyz')
    })

    it('bestQualy formattato se presente', () => {
        const session = makeSession({ best_qualy_ms: 83456 })
        const result = buildHistoricalPointProjection(session)
        expect(result.bestQualy).toBe('1:23.456')
    })

    it('bestQualy assente se null', () => {
        const session = makeSession({ best_qualy_ms: null })
        const result = buildHistoricalPointProjection(session)
        expect(result.bestQualy).toBeUndefined()
    })

    it('restituisce N/A per date malformate', () => {
        const session = makeSession({ date_start: '' })
        const result = buildHistoricalPointProjection(session)
        expect(result.date).toBe('N/A')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildActivityFromSessions
// ─────────────────────────────────────────────────────────────────────────────
describe('buildActivityFromSessions', () => {
    it('somma laps e tempo da più sessioni', () => {
        const sessions = [
            makeSession({ laps: 10, lapsValid: 8, totalTime: 1800000 }),
            makeSession({ sessionId: 's2', laps: 5, lapsValid: 5, totalTime: 900000 })
        ]
        const result = buildActivityFromSessions(sessions)
        expect(result.totalLaps).toBe(15)
        expect(result.validLaps).toBe(13)
        expect(result.totalTimeMs).toBe(2700000)
        expect(result.sessionCount).toBe(2)
    })

    it('restituisce zeri per array vuoto', () => {
        const result = buildActivityFromSessions([])
        expect(result.totalLaps).toBe(0)
        expect(result.validPercent).toBe(0)
        expect(result.sessionCount).toBe(0)
    })

    it('validPercent corretto', () => {
        const sessions = [makeSession({ laps: 10, lapsValid: 7 })]
        const result = buildActivityFromSessions(sessions)
        expect(result.validPercent).toBe(70)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildPendingGripBest
// ─────────────────────────────────────────────────────────────────────────────
describe('buildPendingGripBest', () => {
    it('restituisce oggetto vuoto per sessioni senza grip data', () => {
        const session = makeSession()
        const result = buildPendingGripBest([session], 'Optimum')
        expect(result.bestQualy).toBeUndefined()
    })

    it('estrae bestQualy dal grip corretto', () => {
        const session = makeSession({
            best_by_grip: { Optimum: { bestQualy: 83456, bestQualyTemp: 22 } }
        })
        const result = buildPendingGripBest([session], 'Optimum')
        expect(result.bestQualy).toBe(83456)
        expect(result.bestQualyTemp).toBe(22)
    })

    it('non estrae dati da grip diverso', () => {
        const session = makeSession({
            best_by_grip: { Wet: { bestQualy: 90000 } }
        })
        const result = buildPendingGripBest([session], 'Optimum')
        expect(result.bestQualy).toBeUndefined()
    })

    it('mantiene il migliore tra più sessioni', () => {
        const s1 = makeSession({ sessionId: 's1', best_by_grip: { Optimum: { bestQualy: 84000 } } })
        const s2 = makeSession({ sessionId: 's2', best_by_grip: { Optimum: { bestQualy: 83000 } } })
        const result = buildPendingGripBest([s1, s2], 'Optimum')
        expect(result.bestQualy).toBe(83000)
        expect(result.bestQualySessionId).toBe('s2')
    })

    it('gestisce array vuoto', () => {
        const result = buildPendingGripBest([], 'Optimum')
        expect(result).toEqual({})
    })

    it('registra il sessionId e la data della sessione migliore', () => {
        const session = makeSession({
            sessionId: 'test-id',
            date_start: '2024-06-01T10:00:00',
            best_by_grip: { Optimum: { bestRace: 84000 } }
        })
        const result = buildPendingGripBest([session], 'Optimum')
        expect(result.bestRaceSessionId).toBe('test-id')
        expect(result.bestRaceDate).toBe('2024-06-01T10:00:00')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// mergeGripBest
// ─────────────────────────────────────────────────────────────────────────────
describe('mergeGripBest', () => {
    it('usa i valori base se pending è vuoto', () => {
        const base = { bestQualy: 83456, bestQualySessionId: 'base-id' }
        const result = mergeGripBest(base, {})
        expect(result.bestQualy).toBe(83456)
    })

    it('usa i valori pending se base è vuoto', () => {
        const result = mergeGripBest({}, { bestQualy: 83456, bestQualySessionId: 'pend-id' })
        expect(result.bestQualy).toBe(83456)
        expect(result.bestQualySessionId).toBe('pend-id')
    })

    it('pending migliore vince su base', () => {
        const base = { bestQualy: 84000, bestQualySessionId: 'base' }
        const pending = { bestQualy: 83000, bestQualySessionId: 'pend' }
        const result = mergeGripBest(base, pending)
        expect(result.bestQualy).toBe(83000)
        expect(result.bestQualySessionId).toBe('pend')
    })

    it('base migliore vince su pending', () => {
        const base = { bestRace: 84000, bestRaceSessionId: 'base' }
        const pending = { bestRace: 85000, bestRaceSessionId: 'pend' }
        const result = mergeGripBest(base, pending)
        expect(result.bestRace).toBe(84000)
        expect(result.bestRaceSessionId).toBe('base')
    })

    it('non muta l\'oggetto base', () => {
        const base = { bestAvgRace: 84500 }
        mergeGripBest(base, { bestAvgRace: 83000 })
        expect(base.bestAvgRace).toBe(84500)
    })

    it('gestisce tutti e tre i campi (qualy, race, avgRace)', () => {
        const base = { bestQualy: 83000, bestRace: 84000, bestAvgRace: 84500 }
        const pending = { bestQualy: 82000, bestRace: 85000, bestAvgRace: 83500 }
        const result = mergeGripBest(base, pending)
        expect(result.bestQualy).toBe(82000)
        expect(result.bestRace).toBe(84000)
        expect(result.bestAvgRace).toBe(83500)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// getRaceFuelBucket
// ─────────────────────────────────────────────────────────────────────────────
describe('getRaceFuelBucket', () => {
    it('null per fuel null', () => {
        expect(getRaceFuelBucket(null)).toBeNull()
    })

    it('null per fuel 0', () => {
        expect(getRaceFuelBucket(0)).toBeNull()
    })

    it('null per fuel ≤ 40', () => {
        expect(getRaceFuelBucket(40)).toBeNull()
        expect(getRaceFuelBucket(20)).toBeNull()
    })

    it('40-60 per fuel 41', () => {
        expect(getRaceFuelBucket(41)).toBe('40-60')
    })

    it('40-60 per fuel 60', () => {
        expect(getRaceFuelBucket(60)).toBe('40-60')
    })

    it('60-80 per fuel 61', () => {
        expect(getRaceFuelBucket(61)).toBe('60-80')
    })

    it('60-80 per fuel 80', () => {
        expect(getRaceFuelBucket(80)).toBe('60-80')
    })

    it('80-100 per fuel 81', () => {
        expect(getRaceFuelBucket(81)).toBe('80-100')
    })

    it('80-100 per fuel 100', () => {
        expect(getRaceFuelBucket(100)).toBe('80-100')
    })

    it('100+ per fuel 101', () => {
        expect(getRaceFuelBucket(101)).toBe('100+')
    })

    it('100+ per fuel molto alto', () => {
        expect(getRaceFuelBucket(999)).toBe('100+')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// normalizeTrackFuelBucketRecord
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeTrackFuelBucketRecord', () => {
    it('restituisce null per record null', () => {
        expect(normalizeTrackFuelBucketRecord(null)).toBeNull()
    })

    it('restituisce null per record senza timeMs', () => {
        expect(normalizeTrackFuelBucketRecord({ fuel: 75 })).toBeNull()
    })

    it('restituisce null per timeMs = 0', () => {
        expect(normalizeTrackFuelBucketRecord({ timeMs: 0, fuel: 75 })).toBeNull()
    })

    it('normalizza un record valido', () => {
        const record = {
            timeMs: 84000,
            fuel: 75,
            airTemp: 24,
            date: '2024-06-01',
            sessionId: 'abc',
            sampleLapCount: 5,
            confidence: 'high'
        }
        const result = normalizeTrackFuelBucketRecord(record)
        expect(result).not.toBeNull()
        expect(result!.timeMs).toBe(84000)
        expect(result!.fuel).toBe(75)
        expect(result!.confidence).toBe('high')
    })

    it('usa null per campi mancanti', () => {
        const result = normalizeTrackFuelBucketRecord({ timeMs: 84000 })
        expect(result!.fuel).toBeNull()
        expect(result!.airTemp).toBeNull()
        expect(result!.date).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildRaceFuelBucketReferences
// ─────────────────────────────────────────────────────────────────────────────
describe('buildRaceFuelBucketReferences', () => {
    it('restituisce sempre 4 bucket', () => {
        const result = buildRaceFuelBucketReferences({})
        expect(result).toHaveLength(4)
    })

    it('hasData è false se non ci sono dati', () => {
        const result = buildRaceFuelBucketReferences({})
        for (const b of result) {
            expect(b.hasData).toBe(false)
        }
    })

    it('hasData è true se il bucket ha bestRace', () => {
        const gripBests: any = {
            raceBestByFuelBucket: {
                '60-80': { timeMs: 84000, fuel: 70 }
            }
        }
        const result = buildRaceFuelBucketReferences(gripBests)
        const bucket = result.find(b => b.bucket === '60-80')
        expect(bucket?.hasData).toBe(true)
        expect(bucket?.bestRace).toBeTruthy()
    })

    it('i bucket corrispondono a RACE_FUEL_BUCKETS', () => {
        const result = buildRaceFuelBucketReferences({})
        const labels = result.map(b => b.bucket)
        expect(labels).toEqual([...RACE_FUEL_BUCKETS])
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// dedupeRecentSessions
// ─────────────────────────────────────────────────────────────────────────────
describe('dedupeRecentSessions', () => {
    it('rimuove duplicati per id', () => {
        const items: TrackRecentSessionProjection[] = [
            { id: 'a', date: '2024-06-01', time: '10:00', type: 'race', car: 'Ferrari', laps: 10, stints: 1 },
            { id: 'a', date: '2024-06-01', time: '10:00', type: 'race', car: 'Ferrari', laps: 10, stints: 1 }
        ]
        const result = dedupeRecentSessions(items)
        expect(result).toHaveLength(1)
    })

    it('ordina per data decrescente', () => {
        const items: TrackRecentSessionProjection[] = [
            { id: 'a', date: '2024-05-01', time: '10:00', type: 'race', car: 'Ferrari', laps: 10, stints: 1 },
            { id: 'b', date: '2024-06-01', time: '10:00', type: 'race', car: 'Ferrari', laps: 10, stints: 1 }
        ]
        const result = dedupeRecentSessions(items)
        expect(result[0].id).toBe('b')
    })

    it('restituisce array vuoto per input vuoto', () => {
        expect(dedupeRecentSessions([])).toEqual([])
    })

    it('tronca a 200 elementi', () => {
        const items = Array.from({ length: 250 }, (_, i): TrackRecentSessionProjection => ({
            id: `id-${i}`,
            date: `2024-01-${String(i % 28 + 1).padStart(2, '0')}`,
            time: '10:00',
            type: 'race',
            car: 'Ferrari',
            laps: 10,
            stints: 1
        }))
        const result = dedupeRecentSessions(items)
        expect(result.length).toBeLessThanOrEqual(200)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// dedupeHistoricalPoints
// ─────────────────────────────────────────────────────────────────────────────
describe('dedupeHistoricalPoints', () => {
    it('rimuove duplicati per sessionId', () => {
        const items: TrackHistoricalPointProjection[] = [
            { sessionId: 'a', date: '1 giu' },
            { sessionId: 'a', date: '1 giu' }
        ]
        const result = dedupeHistoricalPoints(items)
        expect(result).toHaveLength(1)
    })

    it('restituisce array vuoto per input vuoto', () => {
        expect(dedupeHistoricalPoints([])).toEqual([])
    })

    it('tronca a 200 elementi', () => {
        const items = Array.from({ length: 250 }, (_, i): TrackHistoricalPointProjection => ({
            sessionId: `id-${i}`,
            date: `${i} giu`
        }))
        const result = dedupeHistoricalPoints(items)
        expect(result.length).toBeLessThanOrEqual(200)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildTrackDetailFromProjectionDocument
// ─────────────────────────────────────────────────────────────────────────────
describe('buildTrackDetailFromProjectionDocument', () => {
    it('produce un TrackDetailProjection valido con doc vuoto', () => {
        const result = buildTrackDetailFromProjectionDocument({
            detailDoc: makeEmptyDetailDoc('monza'),
            trackBestDoc: null,
            trackId: 'monza',
            category: 'GT3',
            selectedGrip: 'Optimum',
            pendingSessions: []
        })
        expect(result.track.id).toBe('monza')
        expect(result.category).toBe('GT3')
        expect(result.grip).toBe('Optimum')
    })

    it('include le sessioni pending nel conteggio e in recentSessions', () => {
        const pending = [makeSession({ laps: 10, track: 'monza' })]
        const result = buildTrackDetailFromProjectionDocument({
            detailDoc: makeEmptyDetailDoc('monza'),
            trackBestDoc: null,
            trackId: 'monza',
            category: 'GT3',
            selectedGrip: 'Optimum',
            pendingSessions: pending
        })
        expect(result.track.sessions).toBe(1)
        expect(result.recentSessions).toHaveLength(1)
    })

    it('esclude sessioni pending di tracciato diverso', () => {
        const pending = [makeSession({ laps: 10, track: 'spa' })]
        const result = buildTrackDetailFromProjectionDocument({
            detailDoc: makeEmptyDetailDoc('monza'),
            trackBestDoc: null,
            trackId: 'monza',
            category: 'GT3',
            selectedGrip: 'Optimum',
            pendingSessions: pending
        })
        expect(result.track.sessions).toBe(0)
    })

    it('esclude sessioni pending di categoria diversa', () => {
        const pending = [makeSession({ laps: 10, track: 'monza', car: 'porsche_718_cayman_gt4' })]
        const result = buildTrackDetailFromProjectionDocument({
            detailDoc: makeEmptyDetailDoc('monza'),
            trackBestDoc: null,
            trackId: 'monza',
            category: 'GT3',
            selectedGrip: 'Optimum',
            pendingSessions: pending
        })
        expect(result.track.sessions).toBe(0)
    })

    it('esclude sessioni pending con 0 laps', () => {
        const pending = [makeSession({ laps: 0, track: 'monza' })]
        const result = buildTrackDetailFromProjectionDocument({
            detailDoc: makeEmptyDetailDoc('monza'),
            trackBestDoc: null,
            trackId: 'monza',
            category: 'GT3',
            selectedGrip: 'Optimum',
            pendingSessions: pending
        })
        expect(result.track.sessions).toBe(0)
    })

    it('somma l\'activity dal doc e dalle sessioni pending', () => {
        const detailDoc: TrackDetailProjectionDocument = {
            ...makeEmptyDetailDoc('monza'),
            categories: {
                GT3: {
                    recentSessions: [],
                    historicalTimes: [],
                    sessionCount: 5,
                    lastSessionDate: '2024-05-01T10:00:00',
                    activity: {
                        totalLaps: 50,
                        validLaps: 40,
                        validPercent: 80,
                        totalTimeMs: 9000000,
                        totalTimeFormatted: '2h 30m',
                        sessionCount: 5
                    }
                }
            }
        }
        const pending = [makeSession({ laps: 10, lapsValid: 8, totalTime: 1800000, track: 'monza' })]
        const result = buildTrackDetailFromProjectionDocument({
            detailDoc,
            trackBestDoc: null,
            trackId: 'monza',
            category: 'GT3',
            selectedGrip: 'Optimum',
            pendingSessions: pending
        })
        expect(result.activity.totalLaps).toBe(60)
        expect(result.activity.validLaps).toBe(48)
        expect(result.activity.sessionCount).toBe(6)
    })

    it('hasGripData è false se non ci sono best times', () => {
        const result = buildTrackDetailFromProjectionDocument({
            detailDoc: makeEmptyDetailDoc('monza'),
            trackBestDoc: null,
            trackId: 'monza',
            category: 'GT3',
            selectedGrip: 'Optimum',
            pendingSessions: []
        })
        expect(result.track.hasGripData).toBe(false)
    })

    it('hasGripData è true se i best times vengono dal trackBestDoc', () => {
        const trackBestDoc = {
            bests: { GT3: { Optimum: { bestQualy: 83456 } } }
        }
        const result = buildTrackDetailFromProjectionDocument({
            detailDoc: makeEmptyDetailDoc('monza'),
            trackBestDoc,
            trackId: 'monza',
            category: 'GT3',
            selectedGrip: 'Optimum',
            pendingSessions: []
        })
        expect(result.track.hasGripData).toBe(true)
        expect(result.track.bestQualy).toBe('1:23.456')
    })

    it('raceFuelBuckets ha 4 elementi', () => {
        const result = buildTrackDetailFromProjectionDocument({
            detailDoc: makeEmptyDetailDoc('monza'),
            trackBestDoc: null,
            trackId: 'monza',
            category: 'GT3',
            selectedGrip: 'Optimum',
            pendingSessions: []
        })
        expect(result.track.raceFuelBuckets).toHaveLength(4)
    })

    it('lastSession riflette la pending più recente', () => {
        const pending = [makeSession({ laps: 10, track: 'monza', date_start: '2024-12-31T23:00:00' })]
        const result = buildTrackDetailFromProjectionDocument({
            detailDoc: makeEmptyDetailDoc('monza'),
            trackBestDoc: null,
            trackId: 'monza',
            category: 'GT3',
            selectedGrip: 'Optimum',
            pendingSessions: pending
        })
        expect(result.track.lastSession).toContain('2024-12-31')
    })
})
