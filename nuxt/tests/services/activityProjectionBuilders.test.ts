import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    buildActivity7dFromSessionIndex,
    buildActivityTotalsFromSessionIndex,
    sumActivityDataMinutes,
    sumActivityTotalMinutes,
    isActivityProjectionInconsistent,
    overlayPendingActivity
} from '~/services/gateway/activityProjectionBuilders'
import { buildRecentActivityBuckets } from '~/services/telemetry/activityProjectionService'
import type { OverviewProjection } from '~/types/overviewProjections'
import type { SessionDocument } from '~/composables/useTelemetryData'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Crea una activity7d con tutti zeri per N giorni */
function makeEmptyActivity7d(n = 7): OverviewProjection['activity7d'] {
    return Array.from({ length: n }, (_, i) => ({
        date: `2024-05-${String(15 + i).padStart(2, '0')}`,
        dateLabel: `${String(15 + i).padStart(2, '0')}/05`,
        day: 'Lun',
        practice: 0,
        qualify: 0,
        race: 0
    }))
}

function makeActivityTotals(
    practice = 0, qualify = 0, race = 0
): OverviewProjection['activityTotals'] {
    return {
        practice: { minutes: practice, sessions: 0 },
        qualify: { minutes: qualify, sessions: 0 },
        race: { minutes: race, sessions: 0 }
    }
}

function makeSession(overrides: {
    session_type?: number
    date_start?: string
    totalTime?: number
} = {}): SessionDocument {
    return {
        sessionId: 'sess-001',
        fileHash: 'abc',
        fileName: 'session.json',
        uploadedAt: null,
        rawChunkCount: 0,
        rawSizeBytes: 0,
        meta: {
            track: 'monza',
            car: 'ferrari_296_gt3',
            date_start: overrides.date_start ?? '2024-05-20T18:00:00',
            date_end: null,
            session_type: overrides.session_type ?? 2,
            driver: null
        },
        summary: {
            laps: 10,
            lapsValid: 8,
            bestLap: null,
            avgCleanLap: null,
            totalTime: overrides.totalTime ?? 1800000,
            stintCount: 1
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildActivity7dFromSessionIndex
// ─────────────────────────────────────────────────────────────────────────────
describe('buildActivity7dFromSessionIndex', () => {
    it('restituisce sempre 7 bucket', () => {
        const result = buildActivity7dFromSessionIndex(null)
        expect(result).toHaveLength(7)
    })

    it('bucket con dati zero per sessionIndex null', () => {
        const result = buildActivity7dFromSessionIndex(null)
        for (const bucket of result) {
            expect(bucket.practice).toBe(0)
            expect(bucket.qualify).toBe(0)
            expect(bucket.race).toBe(0)
        }
    })

    it('bucket con dati zero per sessionIndex senza activity7d', () => {
        const result = buildActivity7dFromSessionIndex({})
        expect(result).toHaveLength(7)
        expect(result[0].practice).toBe(0)
    })

    it('mappa correttamente il campo P (practice short)', () => {
        // Inietta i dati con la data di oggi meno 0 giorni
        // buildRecentActivityBuckets imported statically at top of file
        const buckets = buildRecentActivityBuckets(7)
        const todayDate = buckets[6].date  // ultimo bucket = oggi

        const sessionIndex = {
            activity7d: {
                byDay: [
                    { date: todayDate, P: 45, Q: 0, R: 0 }
                ]
            }
        }
        const result = buildActivity7dFromSessionIndex(sessionIndex)
        const todayBucket = result.find(b => b.date === todayDate)
        expect(todayBucket?.practice).toBe(45)
    })

    it('mappa correttamente il campo qualify con Q', () => {
        // buildRecentActivityBuckets imported statically at top of file
        const buckets = buildRecentActivityBuckets(7)
        const date = buckets[5].date

        const sessionIndex = {
            activity7d: { byDay: [{ date, Q: 30 }] }
        }
        const result = buildActivity7dFromSessionIndex(sessionIndex)
        const bucket = result.find(b => b.date === date)
        expect(bucket?.qualify).toBe(30)
    })

    it('mappa correttamente il campo race con R', () => {
        // buildRecentActivityBuckets imported statically at top of file
        const buckets = buildRecentActivityBuckets(7)
        const date = buckets[4].date

        const sessionIndex = {
            activity7d: { byDay: [{ date, R: 60 }] }
        }
        const result = buildActivity7dFromSessionIndex(sessionIndex)
        const bucket = result.find(b => b.date === date)
        expect(bucket?.race).toBe(60)
    })

    it('ignora righe con date fuori dai 7 giorni', () => {
        const sessionIndex = {
            activity7d: {
                byDay: [{ date: '2000-01-01', P: 99 }]
            }
        }
        const result = buildActivity7dFromSessionIndex(sessionIndex)
        const total = result.reduce((s, b) => s + b.practice, 0)
        expect(total).toBe(0)
    })

    it('ogni bucket ha date, dateLabel, day', () => {
        const result = buildActivity7dFromSessionIndex(null)
        for (const bucket of result) {
            expect(bucket.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            expect(bucket.dateLabel).toBeTruthy()
            expect(bucket.day).toBeTruthy()
        }
    })

    it('gestisce byDay non array', () => {
        const result = buildActivity7dFromSessionIndex({ activity7d: { byDay: null } })
        expect(result).toHaveLength(7)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildActivityTotalsFromSessionIndex
// ─────────────────────────────────────────────────────────────────────────────
describe('buildActivityTotalsFromSessionIndex', () => {
    it('restituisce zeri per sessionIndex null', () => {
        const result = buildActivityTotalsFromSessionIndex(null)
        expect(result.practice.minutes).toBe(0)
        expect(result.qualify.sessions).toBe(0)
        expect(result.race.minutes).toBe(0)
    })

    it('restituisce zeri per sessionIndex senza activity7d', () => {
        const result = buildActivityTotalsFromSessionIndex({})
        expect(result.practice.minutes).toBe(0)
    })

    it('legge correttamente minutes e sessions per practice', () => {
        const sessionIndex = {
            activity7d: {
                practice: { minutes: 120, sessions: 3 }
            }
        }
        const result = buildActivityTotalsFromSessionIndex(sessionIndex)
        expect(result.practice.minutes).toBe(120)
        expect(result.practice.sessions).toBe(3)
    })

    it('legge correttamente qualify e race', () => {
        const sessionIndex = {
            activity7d: {
                qualify: { minutes: 30, sessions: 2 },
                race: { minutes: 90, sessions: 1 }
            }
        }
        const result = buildActivityTotalsFromSessionIndex(sessionIndex)
        expect(result.qualify.minutes).toBe(30)
        expect(result.race.minutes).toBe(90)
        expect(result.race.sessions).toBe(1)
    })

    it('gestisce campi parziali (solo practice)', () => {
        const sessionIndex = {
            activity7d: { practice: { minutes: 60, sessions: 2 } }
        }
        const result = buildActivityTotalsFromSessionIndex(sessionIndex)
        expect(result.practice.minutes).toBe(60)
        expect(result.qualify.minutes).toBe(0)
        expect(result.race.minutes).toBe(0)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// sumActivityDataMinutes
// ─────────────────────────────────────────────────────────────────────────────
describe('sumActivityDataMinutes', () => {
    it('somma tutti i minuti di 7 giorni', () => {
        const data = makeEmptyActivity7d(7)
        data[0].practice = 30
        data[1].qualify = 15
        data[2].race = 60
        expect(sumActivityDataMinutes(data)).toBe(105)
    })

    it('restituisce 0 per array di zeri', () => {
        expect(sumActivityDataMinutes(makeEmptyActivity7d(7))).toBe(0)
    })

    it('restituisce 0 per array vuoto', () => {
        expect(sumActivityDataMinutes([])).toBe(0)
    })

    it('somma correttamente più campi dello stesso bucket', () => {
        const data = makeEmptyActivity7d(1)
        data[0].practice = 10
        data[0].qualify = 20
        data[0].race = 30
        expect(sumActivityDataMinutes(data)).toBe(60)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// sumActivityTotalMinutes
// ─────────────────────────────────────────────────────────────────────────────
describe('sumActivityTotalMinutes', () => {
    it('somma i minuti di tutti e tre i tipi', () => {
        const totals = makeActivityTotals(60, 30, 90)
        expect(sumActivityTotalMinutes(totals)).toBe(180)
    })

    it('restituisce 0 se tutti zeri', () => {
        expect(sumActivityTotalMinutes(makeActivityTotals())).toBe(0)
    })

    it('gestisce valori mancanti come 0 (coercizione Number)', () => {
        const totals: OverviewProjection['activityTotals'] = {
            practice: { minutes: undefined as any, sessions: 0 },
            qualify: { minutes: 30, sessions: 0 },
            race: { minutes: 0, sessions: 0 }
        }
        expect(sumActivityTotalMinutes(totals)).toBe(30)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// isActivityProjectionInconsistent
// ─────────────────────────────────────────────────────────────────────────────
describe('isActivityProjectionInconsistent', () => {
    it('ritorna false quando data e totals concordano', () => {
        const data = makeEmptyActivity7d(7)
        data[0].practice = 30
        const totals = makeActivityTotals(30, 0, 0)
        expect(isActivityProjectionInconsistent(data, totals)).toBe(false)
    })

    it('ritorna true quando data e totals discordano', () => {
        const data = makeEmptyActivity7d(7)
        data[0].practice = 30
        const totals = makeActivityTotals(60, 0, 0)
        expect(isActivityProjectionInconsistent(data, totals)).toBe(true)
    })

    it('ritorna false quando entrambi sono zero', () => {
        expect(isActivityProjectionInconsistent(makeEmptyActivity7d(7), makeActivityTotals())).toBe(false)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// overlayPendingActivity
// ─────────────────────────────────────────────────────────────────────────────
describe('overlayPendingActivity', () => {
    it('non muta activity7d originale', () => {
        const data = makeEmptyActivity7d(7)
        const totals = makeActivityTotals()
        const session = makeSession({ session_type: 2 })
        overlayPendingActivity(data, totals, [session])
        // tutti zeri nell'originale
        expect(data.every(b => b.race === 0)).toBe(true)
    })

    it('non muta activityTotals originale', () => {
        const data = makeEmptyActivity7d(7)
        const totals = makeActivityTotals(0, 0, 0)
        const session = makeSession({ session_type: 2 })
        overlayPendingActivity(data, totals, [session])
        expect(totals.race.minutes).toBe(0)
    })

    it('aggiunge minuti di una sessione race (session_type 2)', () => {
        const data = makeEmptyActivity7d(7)
        const totals = makeActivityTotals()
        // 30 minuti = 1800000 ms
        const session = makeSession({ session_type: 2, totalTime: 1800000 })
        const result = overlayPendingActivity(data, totals, [session])
        expect(result.activityTotals.race.minutes).toBe(30)
        expect(result.activityTotals.race.sessions).toBe(1)
    })

    it('aggiunge minuti di una sessione practice (session_type 0)', () => {
        const data = makeEmptyActivity7d(7)
        const totals = makeActivityTotals()
        const session = makeSession({ session_type: 0, totalTime: 3600000 }) // 60 min
        const result = overlayPendingActivity(data, totals, [session])
        expect(result.activityTotals.practice.minutes).toBe(60)
    })

    it('aggiunge minuti di una sessione qualify (session_type 1)', () => {
        const data = makeEmptyActivity7d(7)
        const totals = makeActivityTotals()
        const session = makeSession({ session_type: 1, totalTime: 900000 }) // 15 min
        const result = overlayPendingActivity(data, totals, [session])
        expect(result.activityTotals.qualify.minutes).toBe(15)
    })

    it('salta sessioni con session_type non riconosciuto', () => {
        const data = makeEmptyActivity7d(7)
        const totals = makeActivityTotals()
        const session = makeSession({ session_type: 99 })
        const result = overlayPendingActivity(data, totals, [session])
        expect(result.activityTotals.practice.sessions).toBe(0)
        expect(result.activityTotals.qualify.sessions).toBe(0)
        expect(result.activityTotals.race.sessions).toBe(0)
    })

    it('salta sessioni senza date', () => {
        const data = makeEmptyActivity7d(7)
        const totals = makeActivityTotals()
        const session = makeSession()
        session.meta.date_start = ''
        const result = overlayPendingActivity(data, totals, [session])
        expect(result.activityTotals.race.sessions).toBe(0)
    })

    it('accumula più sessioni dello stesso tipo', () => {
        const data = makeEmptyActivity7d(7)
        const totals = makeActivityTotals()
        // buildRecentActivityBuckets imported statically at top of file
        const buckets = buildRecentActivityBuckets(7)
        const date = buckets[6].date

        const s1 = makeSession({ session_type: 2, totalTime: 1800000, date_start: `${date}T10:00:00` })
        const s2 = makeSession({ session_type: 2, totalTime: 1800000, date_start: `${date}T14:00:00` })
        const result = overlayPendingActivity(data, totals, [s1, s2])
        expect(result.activityTotals.race.minutes).toBe(60)
        expect(result.activityTotals.race.sessions).toBe(2)
    })

    it('aggiorna anche il bucket corretto nel giorno giusto', () => {
        // buildRecentActivityBuckets imported statically at top of file
        const buckets = buildRecentActivityBuckets(7)
        const todayDate = buckets[6].date

        const data: OverviewProjection['activity7d'] = buckets.map(b => ({
            date: b.date,
            dateLabel: b.dateLabel,
            day: b.day,
            practice: 0,
            qualify: 0,
            race: 0
        }))
        const totals = makeActivityTotals()
        const session = makeSession({ session_type: 2, totalTime: 1800000, date_start: `${todayDate}T10:00:00` })
        const result = overlayPendingActivity(data, totals, [session])
        const todayBucket = result.activity7d.find(b => b.date === todayDate)
        expect(todayBucket?.race).toBe(30)
    })

    it('sessione fuori dai 7 giorni aggiorna i totali ma non i dati per-giorno', () => {
        const data = makeEmptyActivity7d(7)
        const totals = makeActivityTotals()
        // Data di 30 giorni fa — fuori dalla finestra
        const oldDate = '2020-01-01'
        const session = makeSession({ session_type: 2, totalTime: 1800000, date_start: `${oldDate}T10:00:00` })
        const result = overlayPendingActivity(data, totals, [session])
        // I totali aumentano ma nessun bucket della finestra cambia
        expect(result.activityTotals.race.sessions).toBe(1)
        const totalDayRace = result.activity7d.reduce((s, b) => s + b.race, 0)
        expect(totalDayRace).toBe(0)
    })

    it('gestisce array vuoto di sessioni pending', () => {
        const data = makeEmptyActivity7d(7)
        const totals = makeActivityTotals(30, 0, 0)
        const result = overlayPendingActivity(data, totals, [])
        expect(result.activityTotals.practice.minutes).toBe(30)
        expect(result.activityTotals.practice.sessions).toBe(0)
    })
})
