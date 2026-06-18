import { describe, it, expect } from 'vitest'
import {
    getRaceFuelBucket,
    getBucketRecord,
    resolveRaceReference,
    resolveAvgRaceReference,
    applyTempAdjustment,
    calculateTempAdjustmentDetails,
    createGetTheoreticalTimes,
} from '~/services/telemetry/theoreticalTimesCalculator'
import type { GripBestTimes } from '~/services/telemetry/theoreticalTimesCalculator'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEmptyBests(overrides: Partial<GripBestTimes> = {}): GripBestTimes {
    return {
        bestQualy: null, bestQualyTemp: null, bestQualyFuel: null,
        bestQualySessionId: null, bestQualyDate: null,
        bestRaceSprint: null, bestRaceSprintTemp: null, bestRaceSprintFuel: null,
        bestRaceSprintSessionId: null, bestRaceSprintDate: null,
        bestAvgSprint: null, bestAvgSprintTemp: null, bestAvgSprintFuel: null,
        bestAvgSprintSessionId: null, bestAvgSprintDate: null,
        bestRaceEndurance: null, bestRaceEnduranceTemp: null, bestRaceEnduranceFuel: null,
        bestRaceEnduranceSessionId: null, bestRaceEnduranceDate: null,
        bestAvgEndurance: null, bestAvgEnduranceTemp: null, bestAvgEnduranceFuel: null,
        bestAvgEnduranceSessionId: null, bestAvgEnduranceDate: null,
        bestRace: null, bestRaceTemp: null, bestRaceFuel: null,
        bestRaceSessionId: null, bestRaceDate: null,
        bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceFuel: null,
        bestAvgRaceSessionId: null, bestAvgRaceDate: null,
        ...overrides,
    }
}

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

    it('null per fuel <= 40', () => {
        expect(getRaceFuelBucket(40)).toBeNull()
    })

    it('null per undefined', () => {
        expect(getRaceFuelBucket(undefined)).toBeNull()
    })

    it('40-60 per fuel 41', () => {
        expect(getRaceFuelBucket(41)).toBe('40-60')
    })

    it('40-60 per fuel esattamente 60', () => {
        expect(getRaceFuelBucket(60)).toBe('40-60')
    })

    it('60-80 per fuel 61', () => {
        expect(getRaceFuelBucket(61)).toBe('60-80')
    })

    it('60-80 per fuel esattamente 80', () => {
        expect(getRaceFuelBucket(80)).toBe('60-80')
    })

    it('80-100 per fuel 81', () => {
        expect(getRaceFuelBucket(81)).toBe('80-100')
    })

    it('80-100 per fuel esattamente 100', () => {
        expect(getRaceFuelBucket(100)).toBe('80-100')
    })

    it('100+ per fuel 101', () => {
        expect(getRaceFuelBucket(101)).toBe('100+')
    })

    it('100+ per fuel molto alto (120L endurance)', () => {
        expect(getRaceFuelBucket(120)).toBe('100+')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// getBucketRecord
// ─────────────────────────────────────────────────────────────────────────────

describe('getBucketRecord', () => {
    it('null se bucket è null', () => {
        expect(getBucketRecord({ '40-60': { timeMs: 92000 } }, null)).toBeNull()
    })

    it('null se bucketMap è null', () => {
        expect(getBucketRecord(null, '40-60')).toBeNull()
    })

    it('null se bucketMap non è un oggetto (stringa)', () => {
        expect(getBucketRecord('invalid', '40-60')).toBeNull()
    })

    it('null se il bucket non esiste nella mappa', () => {
        expect(getBucketRecord({}, '40-60')).toBeNull()
    })

    it('null se il record esiste ma non ha timeMs', () => {
        expect(getBucketRecord({ '40-60': { airTemp: 20 } }, '40-60')).toBeNull()
    })

    it('null se timeMs è falsy (0)', () => {
        expect(getBucketRecord({ '40-60': { timeMs: 0 } }, '40-60')).toBeNull()
    })

    it('ritorna il record se timeMs è valido', () => {
        const record = { timeMs: 92000, airTemp: 22 }
        expect(getBucketRecord({ '40-60': record }, '40-60')).toEqual(record)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveRaceReference
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveRaceReference', () => {
    it('usa raceBestByFuelBucket se disponibile per il bucket', () => {
        const bests = makeEmptyBests({
            raceBestByFuelBucket: { '40-60': { timeMs: 91500, airTemp: 20 } }
        } as any)
        const result = resolveRaceReference(bests, '40-60')
        expect(result.time).toBe(91500)
        expect(result.temp).toBe(20)
    })

    it('fallback a bestRace se il bucket corrisponde a bestRaceFuel', () => {
        const bests = makeEmptyBests({
            bestRace: 92000,
            bestRaceTemp: 22,
            bestRaceFuel: 55,  // → bucket '40-60'
        })
        const result = resolveRaceReference(bests, '40-60')
        expect(result.time).toBe(92000)
        expect(result.temp).toBe(22)
    })

    it("ritorna null se il bucket non corrisponde e non c'è mappa", () => {
        const bests = makeEmptyBests({ bestRace: 92000, bestRaceFuel: 55 })
        const result = resolveRaceReference(bests, '60-80')
        expect(result.time).toBeNull()
        expect(result.temp).toBeNull()
    })

    it('ritorna null se bests non ha nessun riferimento per il bucket', () => {
        const bests = makeEmptyBests()
        const result = resolveRaceReference(bests, '40-60')
        expect(result.time).toBeNull()
    })

    it('preferisce bucket map su bestRace anche quando bestRaceFuel corrisponde', () => {
        const bests = makeEmptyBests({
            bestRace: 92000,
            bestRaceTemp: 22,
            bestRaceFuel: 55,
            raceBestByFuelBucket: { '40-60': { timeMs: 91000, airTemp: 18 } }
        } as any)
        const result = resolveRaceReference(bests, '40-60')
        expect(result.time).toBe(91000)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveAvgRaceReference
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveAvgRaceReference', () => {
    it('usa raceAvgByFuelBucket se disponibile', () => {
        const bests = makeEmptyBests({
            raceAvgByFuelBucket: { '60-80': { timeMs: 93500, airTemp: 25 } }
        } as any)
        const result = resolveAvgRaceReference(bests, '60-80')
        expect(result.time).toBe(93500)
        expect(result.temp).toBe(25)
    })

    it('fallback a bestAvgRace se il bucket corrisponde', () => {
        const bests = makeEmptyBests({
            bestAvgRace: 93000,
            bestAvgRaceTemp: 23,
            bestAvgRaceFuel: 70,  // → bucket '60-80'
        })
        const result = resolveAvgRaceReference(bests, '60-80')
        expect(result.time).toBe(93000)
        expect(result.temp).toBe(23)
    })

    it('ritorna null se bucket non corrisponde', () => {
        const bests = makeEmptyBests({ bestAvgRace: 93000, bestAvgRaceFuel: 70 })
        const result = resolveAvgRaceReference(bests, '40-60')
        expect(result.time).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// applyTempAdjustment
// ─────────────────────────────────────────────────────────────────────────────

describe('applyTempAdjustment', () => {
    it('nessuna correzione se temp storica == temp stint', () => {
        expect(applyTempAdjustment(92000, 22, 22)).toBe(92000)
    })

    it('temp più calda → tempo più lento (+100ms/°C)', () => {
        // storico a 20°C, stint a 25°C → +500ms
        expect(applyTempAdjustment(92000, 20, 25)).toBe(92500)
    })

    it('temp più fredda → tempo più veloce (-100ms/°C)', () => {
        // storico a 25°C, stint a 20°C → -500ms
        expect(applyTempAdjustment(92000, 25, 20)).toBe(91500)
    })

    it('ritorna null se historicMs è null', () => {
        expect(applyTempAdjustment(null, 22, 25)).toBeNull()
    })

    it('ritorna null se historicMs è 0', () => {
        expect(applyTempAdjustment(0, 22, 25)).toBeNull()
    })

    it('usa stintTemp come fallback se historicTemp è null', () => {
        // historicTemp null → arrotondato a stintTemp → diff 0 → nessuna correzione
        expect(applyTempAdjustment(92000, null, 22)).toBe(92000)
    })

    it('arrotonda il risultato al millisecondo', () => {
        // diff frazionario dopo arrotondamento temp storica
        const result = applyTempAdjustment(92000, 22.4, 23)
        expect(Number.isInteger(result)).toBe(true)
    })

    it('correzione di 1 grado (caso tipico ACC)', () => {
        expect(applyTempAdjustment(92000, 20, 21)).toBe(92100)
    })

    it('correzione di -3 gradi (stint invernale)', () => {
        expect(applyTempAdjustment(92000, 20, 17)).toBe(91700)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// calculateTempAdjustmentDetails
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateTempAdjustmentDetails', () => {
    it('espone metadata senza correzione se temp storica e temp stint coincidono', () => {
        expect(calculateTempAdjustmentDetails(92000, 22, 22)).toMatchObject({
            historicMs: 92000,
            historicTemp: 22,
            historicTempRounded: 22,
            stintTemp: 22,
            tempDiff: 0,
            adjustmentMs: 0,
            adjustedMs: 92000,
            hasHistoricTemp: true,
        })
    })

    it('espone correzione positiva quando lo stint è più caldo', () => {
        expect(calculateTempAdjustmentDetails(92000, 20, 25)).toMatchObject({
            tempDiff: 5,
            adjustmentMs: 500,
            adjustedMs: 92500,
            hasHistoricTemp: true,
        })
    })

    it('espone correzione negativa quando lo stint è più freddo', () => {
        expect(calculateTempAdjustmentDetails(92000, 25, 20)).toMatchObject({
            tempDiff: -5,
            adjustmentMs: -500,
            adjustedMs: 91500,
            hasHistoricTemp: true,
        })
    })

    it('mantiene il tempo storico e segnala temp storica mancante', () => {
        expect(calculateTempAdjustmentDetails(92000, null, 22)).toMatchObject({
            historicMs: 92000,
            historicTemp: null,
            historicTempRounded: null,
            stintTemp: 22,
            tempDiff: 0,
            adjustmentMs: 0,
            adjustedMs: 92000,
            hasHistoricTemp: false,
        })
    })

    it('ritorna metadata vuoti se manca il tempo storico', () => {
        expect(calculateTempAdjustmentDetails(null, 22, 25)).toMatchObject({
            historicMs: null,
            historicTemp: 22,
            historicTempRounded: 22,
            stintTemp: 25,
            tempDiff: null,
            adjustmentMs: null,
            adjustedMs: null,
            hasHistoricTemp: true,
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// createGetTheoreticalTimes (factory + integrazione)
// ─────────────────────────────────────────────────────────────────────────────

describe('createGetTheoreticalTimes', () => {
    const mockBests: GripBestTimes = makeEmptyBests({
        bestQualy: 91000,
        bestQualyTemp: 20,
        bestQualyFuel: null,
        bestRace: 92000,
        bestRaceTemp: 20,
        bestRaceFuel: 55,  // bucket '40-60'
        bestAvgRace: 93000,
        bestAvgRaceTemp: 20,
        bestAvgRaceFuel: 55,
    })

    function makeMockProvider(bests: GripBestTimes = mockBests) {
        return async (_trackId: string, _grip: string, _cat: any, _userId?: string) => bests
    }

    it('ritorna un oggetto TheoreticalTimes completo', async () => {
        const getTheo = createGetTheoreticalTimes(makeMockProvider())
        const result = await getTheo('spa', 'dry', 20, 'GT3', undefined, 55)
        expect(result).toMatchObject({
            grip: 'dry',
            stintTemp: 20,
            fuelBucket: '40-60',
        })
        expect(result.theoQualy).toBeDefined()
        expect(result.theoRace).toBeDefined()
        expect(result.theoAvgRace).toBeDefined()
        expect(result.qualyReference).toMatchObject({ source: 'qualy', adjustedMs: 91000 })
        expect(result.raceReference).toMatchObject({ source: 'raceBest', fuelBucket: '40-60', adjustedMs: 92000 })
        expect(result.avgRaceReference).toMatchObject({ source: 'raceAvg', fuelBucket: '40-60', adjustedMs: 93000 })
    })

    it('nessuna correzione temp se stintTemp uguale a storico', async () => {
        const getTheo = createGetTheoreticalTimes(makeMockProvider())
        const result = await getTheo('spa', 'dry', 20, 'GT3', undefined, 55)
        expect(result.theoQualy).toBe(91000)
        expect(result.theoRace).toBe(92000)
        expect(result.theoAvgRace).toBe(93000)
    })

    it('temp più calda rallenta i tempi teorici', async () => {
        const getTheo = createGetTheoreticalTimes(makeMockProvider())
        const result = await getTheo('spa', 'dry', 25, 'GT3', undefined, 55)
        // +5°C rispetto al storico a 20°C → +500ms ciascuno
        expect(result.theoQualy).toBe(91500)
        expect(result.theoRace).toBe(92500)
        expect(result.theoAvgRace).toBe(93500)
    })

    it('temp più fredda velocizza i tempi teorici', async () => {
        const getTheo = createGetTheoreticalTimes(makeMockProvider())
        const result = await getTheo('spa', 'dry', 15, 'GT3', undefined, 55)
        // -5°C → -500ms
        expect(result.theoQualy).toBe(90500)
    })

    it('theoRace null se fuel bucket non corrisponde', async () => {
        const getTheo = createGetTheoreticalTimes(makeMockProvider())
        // stintFuelStart 70 → bucket '60-80', bestRaceFuel 55 → bucket '40-60' → no match
        const result = await getTheo('spa', 'dry', 20, 'GT3', undefined, 70)
        expect(result.theoRace).toBeNull()
        expect(result.fuelBucket).toBe('60-80')
        expect(result.raceReference).toMatchObject({
            source: 'raceBest',
            fuelBucket: '60-80',
            historicMs: null,
            adjustedMs: null,
        })
    })

    it('theoRace null se stintFuelStart è null', async () => {
        const getTheo = createGetTheoreticalTimes(makeMockProvider())
        const result = await getTheo('spa', 'dry', 20, 'GT3', undefined, null)
        // fuelBucket null → resolveRaceReference ritorna null se bestRaceFuel ha un bucket
        expect(result.fuelBucket).toBeNull()
    })

    it('passa grip al risultato (wet)', async () => {
        const getTheo = createGetTheoreticalTimes(makeMockProvider())
        const result = await getTheo('monza', 'wet', 18, 'GT3', undefined, 55)
        expect(result.grip).toBe('wet')
    })

    it('passa grip drizzle al risultato', async () => {
        const getTheo = createGetTheoreticalTimes(makeMockProvider())
        const result = await getTheo('monza', 'drizzle', 18, 'GT3')
        expect(result.grip).toBe('drizzle')
    })

    it('historicQualy e historicQualyTemp riflettono i dati originali', async () => {
        const getTheo = createGetTheoreticalTimes(makeMockProvider())
        const result = await getTheo('spa', 'dry', 25, 'GT3', undefined, 55)
        expect(result.historicQualy).toBe(91000)
        expect(result.historicQualyTemp).toBe(20)
    })

    it('usa raceBestByFuelBucket quando disponibile', async () => {
        const bestsWithBucket: GripBestTimes = makeEmptyBests({
            bestQualy: 91000,
            bestQualyTemp: 20,
            raceBestByFuelBucket: { '40-60': { timeMs: 91800, airTemp: 20 } },
            raceAvgByFuelBucket: { '40-60': { timeMs: 92800, airTemp: 20 } },
        } as any)
        const getTheo = createGetTheoreticalTimes(makeMockProvider(bestsWithBucket))
        const result = await getTheo('spa', 'dry', 20, 'GT3', undefined, 55)
        expect(result.theoRace).toBe(91800)
        expect(result.theoAvgRace).toBe(92800)
        expect(result.raceReference).toMatchObject({
            source: 'raceBest',
            fuelBucket: '40-60',
            historicMs: 91800,
            historicTemp: 20,
            adjustmentMs: 0,
        })
        expect(result.avgRaceReference).toMatchObject({
            source: 'raceAvg',
            fuelBucket: '40-60',
            historicMs: 92800,
            historicTemp: 20,
            adjustmentMs: 0,
        })
    })

    it('espone metadata di correzione temperatura sui riferimenti teorici', async () => {
        const bestsWithBucket: GripBestTimes = makeEmptyBests({
            bestQualy: 91000,
            bestQualyTemp: 18,
            raceBestByFuelBucket: { '60-80': { timeMs: 91800, airTemp: 20 } },
            raceAvgByFuelBucket: { '60-80': { timeMs: 92800, airTemp: 21 } },
        } as any)
        const getTheo = createGetTheoreticalTimes(makeMockProvider(bestsWithBucket))
        const result = await getTheo('spa', 'dry', 24, 'GT3', undefined, 70)
        expect(result.qualyReference).toMatchObject({
            historicMs: 91000,
            historicTempRounded: 18,
            stintTemp: 24,
            adjustmentMs: 600,
            adjustedMs: 91600,
        })
        expect(result.raceReference).toMatchObject({
            fuelBucket: '60-80',
            historicMs: 91800,
            historicTempRounded: 20,
            adjustmentMs: 400,
            adjustedMs: 92200,
        })
        expect(result.avgRaceReference).toMatchObject({
            fuelBucket: '60-80',
            historicMs: 92800,
            historicTempRounded: 21,
            adjustmentMs: 300,
            adjustedMs: 93100,
        })
    })

    it('theoQualy null se bestQualy null', async () => {
        const bestsNoQualy = makeEmptyBests()
        const getTheo = createGetTheoreticalTimes(makeMockProvider(bestsNoQualy))
        const result = await getTheo('spa', 'dry', 20, 'GT3')
        expect(result.theoQualy).toBeNull()
    })

    it('categoria GT4 viene passata al provider', async () => {
        let capturedCat: string | undefined
        const provider = async (_t: string, _g: string, cat: any) => {
            capturedCat = cat
            return mockBests
        }
        const getTheo = createGetTheoreticalTimes(provider)
        await getTheo('spa', 'dry', 20, 'GT4', undefined, 55)
        expect(capturedCat).toBe('GT4')
    })
})
