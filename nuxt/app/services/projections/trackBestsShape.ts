// Forma canonica di `trackBests.bests` (schema 4): categorie x grip x record per bucket
// carburante. Unica fonte per chi scrive la proiezione (sync) e per chi la compatta
// nell'indice piste (PIP-441) e la riespande in lettura, cosi' i consumatori vedono
// sempre la stessa struttura completa.
import { CAR_CATEGORIES, type CarCategory } from '~/utils/telemetryFormat'
import { RACE_FUEL_BUCKETS, type RaceFuelBucket } from '~/services/telemetry/raceFuelClassification'

export const TRACK_BESTS_GRIP_CONDITIONS = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum'] as const

export type FuelBucketRecord = {
  timeMs: number
  fuel: number | null
  airTemp: number | null
  roadTemp: number | null
  grip: string | null
  sessionId: string | null
  date: string | null
  sampleLapCount: number | null
  confidence: string | null
  source: string | null
}

export type FuelBucketMap = Record<RaceFuelBucket, FuelBucketRecord | Record<string, never>>

export type GripBest = {
  bestQualy: number | null
  bestQualyTemp: number | null
  bestQualyFuel: number | null
  bestQualySessionId: string | null
  bestQualyDate: string | null
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
  raceBestByFuelBucket: FuelBucketMap
  raceAvgByFuelBucket: FuelBucketMap
}

export type TrackBestsMap = Record<CarCategory, Record<string, GripBest>>

export function emptyBucketMap(): FuelBucketMap {
  return Object.fromEntries(RACE_FUEL_BUCKETS.map((bucket) => [bucket, {}])) as FuelBucketMap
}

export function emptyGripBests(): GripBest {
  return {
    bestQualy: null, bestQualyTemp: null, bestQualyFuel: null, bestQualySessionId: null, bestQualyDate: null,
    bestRace: null, bestRaceTemp: null, bestRaceFuel: null, bestRaceSessionId: null, bestRaceDate: null,
    bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceFuel: null, bestAvgRaceSessionId: null, bestAvgRaceDate: null,
    raceBestByFuelBucket: emptyBucketMap(),
    raceAvgByFuelBucket: emptyBucketMap()
  }
}

export function normalizeBucketRecord(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record letto da Firestore o dal riepilogo sessione
  value: any,
  fallback?: { sessionId?: string | null; dateStart?: string | null }
): FuelBucketRecord | Record<string, never> {
  const timeMs = Number(value?.timeMs || 0)
  if (!timeMs || !Number.isFinite(timeMs)) return {}
  return {
    timeMs,
    fuel: value?.fuel ?? null,
    airTemp: value?.airTemp ?? null,
    roadTemp: value?.roadTemp ?? null,
    grip: value?.grip ?? null,
    sessionId: value?.sessionId || fallback?.sessionId || null,
    date: value?.date || fallback?.dateStart || null,
    sampleLapCount: value?.sampleLapCount ?? null,
    confidence: value?.confidence || 'high',
    source: value?.source || null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mappa letta da Firestore
export function normalizeBucketMap(value: any): FuelBucketMap {
  const normalized = emptyBucketMap()
  for (const bucket of RACE_FUEL_BUCKETS) {
    normalized[bucket] = normalizeBucketRecord(value?.[bucket])
  }
  return normalized
}

export function normalizeGripBest(value: Partial<GripBest> | null | undefined): GripBest {
  const source = value || {}
  return {
    bestQualy: source.bestQualy ?? null,
    bestQualyTemp: source.bestQualyTemp ?? null,
    bestQualyFuel: source.bestQualyFuel ?? null,
    bestQualySessionId: source.bestQualySessionId ?? null,
    bestQualyDate: source.bestQualyDate ?? null,
    bestRace: source.bestRace ?? null,
    bestRaceTemp: source.bestRaceTemp ?? null,
    bestRaceFuel: source.bestRaceFuel ?? null,
    bestRaceSessionId: source.bestRaceSessionId ?? null,
    bestRaceDate: source.bestRaceDate ?? null,
    bestAvgRace: source.bestAvgRace ?? null,
    bestAvgRaceTemp: source.bestAvgRaceTemp ?? null,
    bestAvgRaceFuel: source.bestAvgRaceFuel ?? null,
    bestAvgRaceSessionId: source.bestAvgRaceSessionId ?? null,
    bestAvgRaceDate: source.bestAvgRaceDate ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    raceBestByFuelBucket: normalizeBucketMap((source as any).raceBestByFuelBucket),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    raceAvgByFuelBucket: normalizeBucketMap((source as any).raceAvgByFuelBucket)
  }
}

/** Forma completa: ogni categoria e ogni grip presenti, valori mancanti a null, bucket vuoti `{}`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mappa letta da Firestore
export function normalizeTrackBestsMap(bests: any): TrackBestsMap {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  const normalized: TrackBestsMap = {} as any
  for (const category of CAR_CATEGORIES) {
    normalized[category] = {}
    for (const grip of TRACK_BESTS_GRIP_CONDITIONS) {
      normalized[category][grip] = normalizeGripBest(bests?.[category]?.[grip])
    }
  }
  return normalized
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- record generico
function compactRecord(record: any): Record<string, unknown> {
  const compact: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record || {})) {
    if (value === null || value === undefined) continue
    compact[key] = value
  }
  return compact
}

/**
 * Forma compatta per l'indice piste: via i null, i bucket vuoti, i grip e le categorie
 * senza dati. `normalizeTrackBestsMap` la riporta alla forma completa senza perdite.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mappa in forma completa
export function compactTrackBestsMap(bests: any): Record<string, Record<string, Record<string, unknown>>> {
  const compact: Record<string, Record<string, Record<string, unknown>>> = {}
  for (const category of CAR_CATEGORIES) {
    for (const grip of TRACK_BESTS_GRIP_CONDITIONS) {
      const gripBest = bests?.[category]?.[grip]
      if (!gripBest) continue
      const { raceBestByFuelBucket, raceAvgByFuelBucket, ...scalars } = gripBest
      const entry = compactRecord(scalars)
      for (const [mapKey, bucketMap] of [['raceBestByFuelBucket', raceBestByFuelBucket], ['raceAvgByFuelBucket', raceAvgByFuelBucket]] as const) {
        const buckets: Record<string, unknown> = {}
        for (const bucket of RACE_FUEL_BUCKETS) {
          const record = normalizeBucketRecord(bucketMap?.[bucket])
          if ('timeMs' in record) buckets[bucket] = compactRecord(record)
        }
        if (Object.keys(buckets).length > 0) entry[mapKey] = buckets
      }
      if (Object.keys(entry).length === 0) continue
      compact[category] = compact[category] || {}
      compact[category][grip] = entry
    }
  }
  return compact
}
