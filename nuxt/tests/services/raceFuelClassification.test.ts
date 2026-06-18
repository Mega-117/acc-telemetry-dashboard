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

    it('mantiene session_type=1 come qualifica anche con carburante alto', () => {
        expect(classifyStintTypeFromFuel(90, 1)).toBe('Qualify')
        expect(classifyHistoricalEligibility(90, 1)).toBe('qualy_historical')
    })

    it('separa classificazione stint legacy da eligibility race storica', () => {
        expect(classifyStintTypeFromFuel(20, 2)).toBe('Qualify')
        expect(classifyStintTypeFromFuel(40, 2)).toBe('Race')
        expect(classifyHistoricalEligibility(40, 2, 'Race')).toBe('race_non_historical')
        expect(classifyHistoricalEligibility(40.1, 2, 'Race')).toBe('race_historical')
    })
})
