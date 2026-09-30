import { describe, expect, it } from 'vitest'
import {
    RACE_FUEL_BUCKETS,
    classifyHistoricalEligibility,
    classifyStintTypeFromFuel,
    getRaceFuelBucket,
    isHistoricalRaceFuel
} from '~/services/telemetry/raceFuelClassification'

describe('raceFuelClassification', () => {
    it('espone i bucket race canonici in ordine stabile', () => {
        expect(RACE_FUEL_BUCKETS).toEqual(['40-60', '60-80', '80-100', '100+'])
    })

    it.each([
        [null, null],
        [0, null],
        [20, null],
        [40, null],
        [40.1, '40-60'],
        [60, '40-60'],
        [80, '60-80'],
        [100, '80-100'],
        [101, '100+']
    ] as const)('classifica %s nel bucket %s', (fuel, expected) => {
        expect(getRaceFuelBucket(fuel)).toBe(expected)
        expect(isHistoricalRaceFuel(fuel)).toBe(expected !== null)
    })

    it.each([0, 1, 2, null])('classifica dal fuel indipendentemente dalla sessione %s', (sessionType) => {
        for (const [fuel, type, eligibility] of [
            [20, 'Qualify', 'qualy_historical'],
            [20.1, 'Race', 'race_non_historical'],
            [40, 'Race', 'race_non_historical'],
            [40.1, 'Race', 'race_historical'],
            [120, 'Race', 'race_historical']
        ] as const) {
            expect(classifyStintTypeFromFuel(fuel, sessionType)).toBe(type)
            expect(classifyHistoricalEligibility(fuel, sessionType, 'Qualify')).toBe(eligibility)
        }
    })

    it('separa classificazione stint legacy da eligibility race storica', () => {
        expect(classifyStintTypeFromFuel(20, 2)).toBe('Qualify')
        expect(classifyStintTypeFromFuel(40, 2)).toBe('Race')
        expect(classifyHistoricalEligibility(40, 2, 'Race')).toBe('race_non_historical')
        expect(classifyHistoricalEligibility(40.1, 2, 'Race')).toBe('race_historical')
    })
})
