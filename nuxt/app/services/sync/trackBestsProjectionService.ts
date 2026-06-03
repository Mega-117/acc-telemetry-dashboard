import { doc, serverTimestamp } from 'firebase/firestore'
import { CAR_CATEGORIES, getCarCategory, type CarCategory } from '~/composables/useTelemetryData'
import { normalizeTrackId } from '~/services/projections/trackMetadata'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'

export const TRACK_BESTS_SCHEMA_VERSION = 4

const RACE_FUEL_BUCKETS = ['40-60', '60-80', '80-100', '100+'] as const

type RaceFuelBucket = typeof RACE_FUEL_BUCKETS[number]
type FuelBucketRecord = {
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

type GripBest = {
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
  raceBestByFuelBucket: Record<RaceFuelBucket, FuelBucketRecord | Record<string, never>>
  raceAvgByFuelBucket: Record<RaceFuelBucket, FuelBucketRecord | Record<string, never>>
}

export interface TrackBestProjectionDelta {
  trackId: string
  sessionId: string
  dateStart: string
  sessionType?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  summary: any
  car?: string
}

function emptyGripBests(): GripBest {
  return {
    bestQualy: null, bestQualyTemp: null, bestQualyFuel: null, bestQualySessionId: null, bestQualyDate: null,
    bestRace: null, bestRaceTemp: null, bestRaceFuel: null, bestRaceSessionId: null, bestRaceDate: null,
    bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceFuel: null, bestAvgRaceSessionId: null, bestAvgRaceDate: null,
    raceBestByFuelBucket: emptyBucketMap(),
    raceAvgByFuelBucket: emptyBucketMap()
  }
}

function emptyBucketMap(): Record<RaceFuelBucket, Record<string, never>> {
  return Object.fromEntries(RACE_FUEL_BUCKETS.map((bucket) => [bucket, {}])) as Record<RaceFuelBucket, Record<string, never>>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function normalizeBucketRecord(value: any, delta?: TrackBestProjectionDelta): FuelBucketRecord | Record<string, never> {
  const timeMs = Number(value?.timeMs || 0)
  if (!timeMs || !Number.isFinite(timeMs)) return {}
  return {
    timeMs,
    fuel: value?.fuel ?? null,
    airTemp: value?.airTemp ?? null,
    roadTemp: value?.roadTemp ?? null,
    grip: value?.grip ?? null,
    sessionId: value?.sessionId || delta?.sessionId || null,
    date: value?.date || delta?.dateStart || null,
    sampleLapCount: value?.sampleLapCount ?? null,
    confidence: value?.confidence || 'high',
    source: value?.source || null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function normalizeBucketMap(value: any): Record<RaceFuelBucket, FuelBucketRecord | Record<string, never>> {
  const normalized = emptyBucketMap() as Record<RaceFuelBucket, FuelBucketRecord | Record<string, never>>
  for (const bucket of RACE_FUEL_BUCKETS) {
    normalized[bucket] = normalizeBucketRecord(value?.[bucket])
  }
  return normalized
}

function normalizeGripBest(value: Partial<GripBest> | null | undefined): GripBest {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function buildInitialBests(existing: any, gripConditions: string[]) {
  const existingVersion = Number(existing?.version || 1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  const newBests: Record<CarCategory, Record<string, GripBest>> = {} as any

  if (existingVersion >= TRACK_BESTS_SCHEMA_VERSION && existing?.bests) {
    for (const cat of CAR_CATEGORIES) {
      newBests[cat] = {}
      for (const grip of gripConditions) {
        newBests[cat][grip] = normalizeGripBest(existing.bests[cat]?.[grip])
      }
    }
    return newBests
  }

  if (existingVersion >= TRACK_BESTS_SCHEMA_VERSION && (existing?.bests || existing)) {
    const legacyBests = existing.bests ||
      Object.fromEntries(gripConditions.filter((g) => existing[g]).map((g) => [g, existing[g]]))

    for (const cat of CAR_CATEGORIES) {
      newBests[cat] = {}
      for (const grip of gripConditions) {
        newBests[cat][grip] = cat === 'GT3' && legacyBests[grip]
          ? normalizeGripBest(legacyBests[grip])
          : emptyGripBests()
      }
    }
    return newBests
  }

  for (const cat of CAR_CATEGORIES) {
    newBests[cat] = {}
    for (const grip of gripConditions) {
      newBests[cat][grip] = emptyGripBests()
    }
  }
  return newBests
}

function isBucketRecord(value: FuelBucketRecord | Record<string, never>): value is FuelBucketRecord {
  return !!(value as FuelBucketRecord)?.timeMs
}

function raceBucketFromFuel(fuel: number | null | undefined): RaceFuelBucket | null {
  const parsed = Number(fuel || 0)
  if (!parsed || parsed <= 40) return null
  if (parsed <= 60) return '40-60'
  if (parsed <= 80) return '60-80'
  if (parsed <= 100) return '80-100'
  return '100+'
}

function updateBucketBest(
  target: Record<RaceFuelBucket, FuelBucketRecord | Record<string, never>>,
  bucket: RaceFuelBucket,
  record: FuelBucketRecord
) {
  const current = target[bucket]
  if (!isBucketRecord(current) || record.timeMs < current.timeMs) {
    target[bucket] = record
    return true
  }
  if (
    record.timeMs === current.timeMs
    && (current.source === 'legacy_fallback' || (current.sampleLapCount == null && record.sampleLapCount != null))
  ) {
    target[bucket] = {
      ...current,
      ...record
    }
    return true
  }
  return false
}

function updateLegacyRaceBest(catGrip: GripBest, record: FuelBucketRecord, delta: TrackBestProjectionDelta) {
  if (!catGrip.bestRace || record.timeMs < catGrip.bestRace) {
    catGrip.bestRace = record.timeMs
    catGrip.bestRaceTemp = record.airTemp ?? null
    catGrip.bestRaceFuel = record.fuel ?? null
    catGrip.bestRaceSessionId = record.sessionId || delta.sessionId
    catGrip.bestRaceDate = record.date || delta.dateStart
    return true
  }
  return false
}

function updateLegacyAvgBest(catGrip: GripBest, record: FuelBucketRecord, delta: TrackBestProjectionDelta) {
  if (!catGrip.bestAvgRace || record.timeMs < catGrip.bestAvgRace) {
    catGrip.bestAvgRace = record.timeMs
    catGrip.bestAvgRaceTemp = record.airTemp ?? null
    catGrip.bestAvgRaceFuel = record.fuel ?? null
    catGrip.bestAvgRaceSessionId = record.sessionId || delta.sessionId
    catGrip.bestAvgRaceDate = record.date || delta.dateStart
    return true
  }
  return false
}

function applyBestDelta(params: {
  bests: Record<CarCategory, Record<string, GripBest>>
  delta: TrackBestProjectionDelta
  gripConditions: string[]
}) {
  const { bests, delta, gripConditions } = params
  const category = getCarCategory(delta.car || '')
  let hasUpdates = false

  for (const grip of gripConditions) {
    const sessionBest = delta.summary?.best_by_grip?.[grip]
    if (!sessionBest) continue

    if (!bests[category][grip]) {
      bests[category][grip] = emptyGripBests()
    }
    const catGrip = bests[category][grip]

    if (sessionBest.bestQualy && (!catGrip.bestQualy || sessionBest.bestQualy < catGrip.bestQualy)) {
      catGrip.bestQualy = sessionBest.bestQualy
      catGrip.bestQualyTemp = sessionBest.bestQualyTemp ?? null
      catGrip.bestQualyFuel = sessionBest.bestQualyFuel ?? null
      catGrip.bestQualySessionId = delta.sessionId
      catGrip.bestQualyDate = delta.dateStart
      hasUpdates = true
    } else if (sessionBest.bestQualy && catGrip.bestQualy === sessionBest.bestQualy && catGrip.bestQualyFuel == null && sessionBest.bestQualyFuel != null) {
      catGrip.bestQualyFuel = sessionBest.bestQualyFuel
      hasUpdates = true
    }

    if (sessionBest.bestRace && (!catGrip.bestRace || sessionBest.bestRace < catGrip.bestRace)) {
      const bucket = raceBucketFromFuel(sessionBest.bestRaceFuel)
      if (bucket) {
        const record = normalizeBucketRecord({
          timeMs: sessionBest.bestRace,
          fuel: sessionBest.bestRaceFuel ?? null,
          airTemp: sessionBest.bestRaceTemp ?? null,
          roadTemp: null,
          grip,
          source: 'legacy_fallback'
        }, delta)
        if (isBucketRecord(record)) {
          hasUpdates = updateBucketBest(catGrip.raceBestByFuelBucket, bucket, record) || hasUpdates
          hasUpdates = updateLegacyRaceBest(catGrip, record, delta) || hasUpdates
        }
      }
    } else if (sessionBest.bestRace && catGrip.bestRace === sessionBest.bestRace && catGrip.bestRaceFuel == null && sessionBest.bestRaceFuel != null) {
      catGrip.bestRaceFuel = sessionBest.bestRaceFuel
      hasUpdates = true
    }

    if (sessionBest.bestAvgRace && (!catGrip.bestAvgRace || sessionBest.bestAvgRace < catGrip.bestAvgRace)) {
      const bucket = raceBucketFromFuel(sessionBest.bestAvgRaceFuel)
      if (bucket) {
        const record = normalizeBucketRecord({
          timeMs: sessionBest.bestAvgRace,
          fuel: sessionBest.bestAvgRaceFuel ?? null,
          airTemp: sessionBest.bestAvgRaceTemp ?? null,
          roadTemp: null,
          grip,
          sampleLapCount: null,
          source: 'legacy_fallback'
        }, delta)
        if (isBucketRecord(record)) {
          hasUpdates = updateBucketBest(catGrip.raceAvgByFuelBucket, bucket, record) || hasUpdates
          hasUpdates = updateLegacyAvgBest(catGrip, record, delta) || hasUpdates
        }
      }
    } else if (sessionBest.bestAvgRace && catGrip.bestAvgRace === sessionBest.bestAvgRace && catGrip.bestAvgRaceFuel == null && sessionBest.bestAvgRaceFuel != null) {
      catGrip.bestAvgRaceFuel = sessionBest.bestAvgRaceFuel
      hasUpdates = true
    }

    for (const bucket of RACE_FUEL_BUCKETS) {
      const raceRecord = normalizeBucketRecord(sessionBest.raceBestByFuelBucket?.[bucket], delta)
      if (isBucketRecord(raceRecord)) {
        hasUpdates = updateBucketBest(catGrip.raceBestByFuelBucket, bucket, raceRecord) || hasUpdates
        hasUpdates = updateLegacyRaceBest(catGrip, raceRecord, delta) || hasUpdates
      }

      const avgRecord = normalizeBucketRecord(sessionBest.raceAvgByFuelBucket?.[bucket], delta)
      if (isBucketRecord(avgRecord)) {
        hasUpdates = updateBucketBest(catGrip.raceAvgByFuelBucket, bucket, avgRecord) || hasUpdates
        hasUpdates = updateLegacyAvgBest(catGrip, avgRecord, delta) || hasUpdates
      }
    }
  }

  return hasUpdates
}

function maxDateString(current: string | null, next?: string | null) {
  if (!next) return current
  if (!current) return next
  return next > current ? next : current
}

function mergeTrackBestsDocument(params: {
  trackIdNorm: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  existing: any | null
  deltas: TrackBestProjectionDelta[]
  bestRulesVersion: number
}) {
  const { trackIdNorm, existing, deltas, bestRulesVersion } = params
  const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']
  const existingVersion = Number(existing?.version || 0)
  const newBests = buildInitialBests(existing, gripConditions)
  const existingActivity = existing?.activity || {
    totalLaps: 0,
    validLaps: 0,
    totalTimeMs: 0,
    sessionCount: 0
  }
  const countedSessionIds = new Set<string>(Array.isArray(existing?.syncedSessionIds) ? existing.syncedSessionIds : [])
  let lastSessionDate = existingActivity.lastSessionDate || existing?.lastSessionDate || null
  let hasBestUpdates = false
  let hasActivityUpdates = false
  let maxRulesVersion = Number(existing?.bestRulesVersion || bestRulesVersion)

  const newActivity = { ...existingActivity }

  for (const delta of deltas) {
    hasBestUpdates = applyBestDelta({ bests: newBests, delta, gripConditions }) || hasBestUpdates
    maxRulesVersion = Math.max(maxRulesVersion, Number(delta.summary?.best_rules_version || bestRulesVersion))
    lastSessionDate = maxDateString(lastSessionDate, delta.dateStart)

    if (!countedSessionIds.has(delta.sessionId)) {
      countedSessionIds.add(delta.sessionId)
      newActivity.totalLaps = Number(newActivity.totalLaps || 0) + Number(delta.summary?.laps || 0)
      newActivity.validLaps = Number(newActivity.validLaps || 0) + Number(delta.summary?.lapsValid || 0)
      newActivity.totalTimeMs = Number(newActivity.totalTimeMs || 0) + Number(delta.summary?.totalTime || 0)
      newActivity.sessionCount = Number(newActivity.sessionCount || 0) + 1
      newActivity.lastSessionDate = lastSessionDate
      hasActivityUpdates = true
    }
  }

  if (lastSessionDate) {
    newActivity.lastSessionDate = lastSessionDate
  }

  const needsSchemaWrite = !existing || existingVersion < TRACK_BESTS_SCHEMA_VERSION
  const needsRulesWrite = Number(existing?.bestRulesVersion || 0) < maxRulesVersion
  const shouldWrite = needsSchemaWrite || needsRulesWrite || hasBestUpdates || hasActivityUpdates

  const data = sanitizeForFirestore({
    version: TRACK_BESTS_SCHEMA_VERSION,
    bestRulesVersion: maxRulesVersion,
    trackId: trackIdNorm,
    bests: newBests,
    activity: newActivity,
    syncedSessionIds: Array.from(countedSessionIds),
    lastSessionDate
  })

  return {
    shouldWrite,
    data: {
      ...data,
      lastUpdated: serverTimestamp()
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function defaultDocFn(db: any, path: string) {
  return doc(db, path)
}

export async function applyTrackBestsProjectionDeltas(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  uid: string
  deltas: TrackBestProjectionDelta[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  getDocFn: (ref: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  bestRulesVersion: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  docFn?: (db: any, path: string) => any
}): Promise<{ touchedTracks: string[]; updatedTracks: string[] }> {
  const {
    db,
    uid,
    deltas,
    getDocFn,
    setDocFn,
    bestRulesVersion,
    docFn = defaultDocFn
  } = params

  const grouped = new Map<string, TrackBestProjectionDelta[]>()
  for (const delta of deltas) {
    const trackIdNorm = normalizeTrackId(delta.trackId)
    if (!trackIdNorm || !delta.sessionId) continue
    const bucket = grouped.get(trackIdNorm) || []
    bucket.push({ ...delta, trackId: trackIdNorm })
    grouped.set(trackIdNorm, bucket)
  }

  const touchedTracks = Array.from(grouped.keys())
  const updatedTracks: string[] = []

  for (const trackIdNorm of touchedTracks) {
    const trackBestsRef = docFn(db, `users/${uid}/trackBests/${trackIdNorm}`)

    try {
      const existingSnap = await getDocFn(trackBestsRef)
      const existing = existingSnap.exists() ? existingSnap.data() : null
      const merged = mergeTrackBestsDocument({
        trackIdNorm,
        existing,
        deltas: grouped.get(trackIdNorm) || [],
        bestRulesVersion
      })

      if (!merged.shouldWrite) continue
      await setDocFn(trackBestsRef, merged.data)
      updatedTracks.push(trackIdNorm)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    } catch (e: any) {
      console.warn(`[SYNC] Error updating trackBests for ${trackIdNorm}:`, e.message)
    }
  }

  return {
    touchedTracks,
    updatedTracks
  }
}

export async function updateTrackBestsProjection(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  uid: string
  trackId: string
  sessionId: string
  dateStart: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  summary: any
  car?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  getDocFn: (ref: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  bestRulesVersion: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  docFn?: (db: any, path: string) => any
}): Promise<boolean> {
  const result = await applyTrackBestsProjectionDeltas({
    db: params.db,
    uid: params.uid,
    deltas: [{
      trackId: params.trackId,
      sessionId: params.sessionId,
      dateStart: params.dateStart,
      summary: params.summary,
      car: params.car
    }],
    getDocFn: params.getDocFn,
    setDocFn: params.setDocFn,
    bestRulesVersion: params.bestRulesVersion,
    docFn: params.docFn
  })

  return result.updatedTracks.includes(normalizeTrackId(params.trackId))
}
