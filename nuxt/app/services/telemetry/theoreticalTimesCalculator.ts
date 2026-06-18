import type { CarCategory } from '~/utils/telemetryFormat'
import { getRaceFuelBucket, type RaceFuelBucket } from '~/services/telemetry/raceFuelClassification'

export { getRaceFuelBucket } from '~/services/telemetry/raceFuelClassification'

// ---- Types ----

export type GripBestTimes = {
    bestQualy: number | null
    bestQualyTemp: number | null
    bestQualyFuel: number | null
    bestQualySessionId: string | null
    bestQualyDate: string | null
    // Race Sprint (fuel 25-80L)
    bestRaceSprint: number | null
    bestRaceSprintTemp: number | null
    bestRaceSprintFuel: number | null
    bestRaceSprintSessionId: string | null
    bestRaceSprintDate: string | null
    bestAvgSprint: number | null
    bestAvgSprintTemp: number | null
    bestAvgSprintFuel: number | null
    bestAvgSprintSessionId: string | null
    bestAvgSprintDate: string | null
    // Race Endurance (fuel > 80L)
    bestRaceEndurance: number | null
    bestRaceEnduranceTemp: number | null
    bestRaceEnduranceFuel: number | null
    bestRaceEnduranceSessionId: string | null
    bestRaceEnduranceDate: string | null
    bestAvgEndurance: number | null
    bestAvgEnduranceTemp: number | null
    bestAvgEnduranceFuel: number | null
    bestAvgEnduranceSessionId: string | null
    bestAvgEnduranceDate: string | null
    // Backward compat: best of sprint/endurance (computed)
    bestRace: number | null
    bestRaceTemp: number | null
    bestRaceFuel: number | null
    bestRaceSessionId: string | null
    bestRaceDate: string | null
    bestAvgRace: number | null
    bestAvgRaceTemp: number | null
    bestAvgRaceFuel: number | null
    bestAvgRaceSessionId: string | null
    bestAvgRaceDate: string | null
    raceBestByFuelBucket?: Record<string, unknown>
    raceAvgByFuelBucket?: Record<string, unknown>
}

export type TheoreticalTimes = {
    theoQualy: number | null
    theoRace: number | null
    theoAvgRace: number | null
    // Historic values for reference
    historicQualy: number | null
    historicQualyTemp: number | null
    historicRace: number | null
    historicRaceTemp: number | null
    historicAvgRace: number | null
    historicAvgRaceTemp: number | null
    // Context
    grip: string
    stintTemp: number
    fuelBucket: RaceFuelBucket | null
    qualyReference: TheoreticalReferenceDetails
    raceReference: TheoreticalReferenceDetails
    avgRaceReference: TheoreticalReferenceDetails
}

export type TheoreticalReferenceSource = 'qualy' | 'raceBest' | 'raceAvg'

export type TempAdjustmentDetails = {
    historicMs: number | null
    historicTemp: number | null
    historicTempRounded: number | null
    stintTemp: number
    tempDiff: number | null
    adjustmentMs: number | null
    adjustedMs: number | null
    hasHistoricTemp: boolean
}

export type TheoreticalReferenceDetails = TempAdjustmentDetails & {
    source: TheoreticalReferenceSource
    fuelBucket: RaceFuelBucket | null
}

// ---- Pure helpers ----

export function getBucketRecord(bucketMap: Record<string, unknown> | null | undefined, bucket: string | null) {
    if (!bucket || !bucketMap || typeof bucketMap !== 'object') return null
    const record = bucketMap[bucket] as Record<string, unknown> | undefined
    return record?.['timeMs'] ? record : null
}

export function resolveRaceReference(bests: GripBestTimes, fuelBucket: string | null): { time: number | null; temp: number | null } {
    const bucketRecord = getBucketRecord(bests.raceBestByFuelBucket as Record<string, unknown> | undefined, fuelBucket)
    if (bucketRecord) {
        return {
            time: Number(bucketRecord['timeMs'] || 0) || null,
            temp: Number(bucketRecord['airTemp'] || 0) || null
        }
    }

    return getRaceFuelBucket(bests.bestRaceFuel) === fuelBucket
        ? { time: bests.bestRace, temp: bests.bestRaceTemp }
        : { time: null, temp: null }
}

export function resolveAvgRaceReference(bests: GripBestTimes, fuelBucket: string | null): { time: number | null; temp: number | null } {
    const bucketRecord = getBucketRecord(bests.raceAvgByFuelBucket as Record<string, unknown> | undefined, fuelBucket)
    if (bucketRecord) {
        return {
            time: Number(bucketRecord['timeMs'] || 0) || null,
            temp: Number(bucketRecord['airTemp'] || 0) || null
        }
    }

    return getRaceFuelBucket(bests.bestAvgRaceFuel) === fuelBucket
        ? { time: bests.bestAvgRace, temp: bests.bestAvgRaceTemp }
        : { time: null, temp: null }
}

export function applyTempAdjustment(
    historicMs: number | null,
    historicTemp: number | null,
    stintTemp: number
): number | null {
    return calculateTempAdjustmentDetails(historicMs, historicTemp, stintTemp).adjustedMs
}

export function calculateTempAdjustmentDetails(
    historicMs: number | null,
    historicTemp: number | null,
    stintTemp: number
): TempAdjustmentDetails {
    const safeStintTemp = Number.isFinite(stintTemp) ? stintTemp : 23
    const hasHistoricMs = typeof historicMs === 'number' && Number.isFinite(historicMs) && historicMs > 0
    const hasHistoricTemp = typeof historicTemp === 'number' && Number.isFinite(historicTemp)

    if (!hasHistoricMs) {
        return {
            historicMs: null,
            historicTemp: hasHistoricTemp ? historicTemp : null,
            historicTempRounded: hasHistoricTemp ? Math.round(historicTemp) : null,
            stintTemp: safeStintTemp,
            tempDiff: null,
            adjustmentMs: null,
            adjustedMs: null,
            hasHistoricTemp
        }
    }

    if (!hasHistoricTemp) {
        return {
            historicMs,
            historicTemp: null,
            historicTempRounded: null,
            stintTemp: safeStintTemp,
            tempDiff: 0,
            adjustmentMs: 0,
            adjustedMs: Math.round(historicMs),
            hasHistoricTemp: false
        }
    }

    const historicTempRounded = Math.round(historicTemp)
    const tempDiff = safeStintTemp - historicTempRounded
    const adjustmentMs = tempDiff * 100 // 100ms per degree

    return {
        historicMs,
        historicTemp,
        historicTempRounded,
        stintTemp: safeStintTemp,
        tempDiff,
        adjustmentMs,
        adjustedMs: Math.round(historicMs + adjustmentMs),
        hasHistoricTemp: true
    }
}

function buildTheoreticalReference(
    source: TheoreticalReferenceSource,
    fuelBucket: RaceFuelBucket | null,
    historicMs: number | null,
    historicTemp: number | null,
    stintTemp: number
): TheoreticalReferenceDetails {
    return {
        source,
        fuelBucket,
        ...calculateTempAdjustmentDetails(historicMs, historicTemp, stintTemp)
    }
}

// ---- Factory ----

/**
 * Creates getTheoreticalTimes bound to a getBestTimesForGrip implementation.
 *
 * Temperature adjustment formula:
 *   Teorico = Storico + (TempStint - TempStorico) x 100ms/C
 *   - Colder = faster (negative adjustment)
 *   - Hotter = slower (positive adjustment)
 */
export function createGetTheoreticalTimes(
    getBestTimesForGrip: (
        trackId: string,
        grip: string,
        category: CarCategory,
        userId?: string
    ) => Promise<GripBestTimes>
) {
    return async function getTheoreticalTimes(
        trackId: string,
        grip: string,
        stintTemp: number,
        category: CarCategory = 'GT3',
        userId?: string,
        stintFuelStart?: number | null
    ): Promise<TheoreticalTimes> {
        const bests = await getBestTimesForGrip(trackId, grip, category, userId)
        const stintReferenceFuelBucket = getRaceFuelBucket(stintFuelStart)
        const raceReference = resolveRaceReference(bests, stintReferenceFuelBucket)
        const avgRaceReference = resolveAvgRaceReference(bests, stintReferenceFuelBucket)
        const qualyTheoreticalReference = buildTheoreticalReference('qualy', null, bests.bestQualy, bests.bestQualyTemp, stintTemp)
        const raceTheoreticalReference = buildTheoreticalReference('raceBest', stintReferenceFuelBucket, raceReference.time, raceReference.temp, stintTemp)
        const avgRaceTheoreticalReference = buildTheoreticalReference('raceAvg', stintReferenceFuelBucket, avgRaceReference.time, avgRaceReference.temp, stintTemp)

        return {
            theoQualy: qualyTheoreticalReference.adjustedMs,
            theoRace: raceTheoreticalReference.adjustedMs,
            theoAvgRace: avgRaceTheoreticalReference.adjustedMs,
            historicQualy: bests.bestQualy,
            historicQualyTemp: bests.bestQualyTemp,
            historicRace: raceReference.time,
            historicRaceTemp: raceReference.temp,
            historicAvgRace: avgRaceReference.time,
            historicAvgRaceTemp: avgRaceReference.temp,
            grip,
            stintTemp,
            fuelBucket: stintReferenceFuelBucket,
            qualyReference: qualyTheoreticalReference,
            raceReference: raceTheoreticalReference,
            avgRaceReference: avgRaceTheoreticalReference
        }
    }
}
