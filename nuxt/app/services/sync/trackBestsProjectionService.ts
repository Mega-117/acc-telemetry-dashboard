import { doc, serverTimestamp } from 'firebase/firestore'
import { CAR_CATEGORIES, getCarCategory, type CarCategory } from '~/utils/telemetryFormat'
import { normalizeTrackId } from '~/services/projections/trackMetadata'
import { RACE_FUEL_BUCKETS, getRaceFuelBucket, type RaceFuelBucket } from '~/services/telemetry/raceFuelClassification'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'
import type { SessionContribution } from '~/types/trackProjections'
// PIP-441: la forma di `bests` vive in un modulo condiviso con l'indice piste.
import {
  emptyGripBests,
  normalizeBucketRecord,
  normalizeGripBest,
  type FuelBucketRecord,
  type GripBest
} from '~/services/projections/trackBestsShape'
import {
  TRACK_BESTS_INDEX_MAX_BYTES,
  buildDisabledTrackBestsIndexDocument,
  buildTrackBestsIndexDocument,
  buildTrackBestsIndexIncrementalWrite,
  exceedsTrackBestsIndexSizeGuard,
  trackBestsIndexPath,
  type TrackBestsIndexMode
} from './trackBestsIndexProjectionService'

export const TRACK_BESTS_SCHEMA_VERSION = 4

export interface TrackBestProjectionDelta {
  trackId: string
  sessionId: string
  dateStart: string
  sessionType?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  summary: any
  car?: string
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
      const bucket = getRaceFuelBucket(sessionBest.bestRaceFuel)
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
      const bucket = getRaceFuelBucket(sessionBest.bestAvgRaceFuel)
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
  previousContributions?: Map<string, SessionContribution>
}) {
  const { trackIdNorm, existing, deltas, bestRulesVersion, previousContributions = new Map() } = params
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
    } else {
      // PIP-436: sessione gia' contata e poi allungata (giri successivi dello stesso file):
      // l'attivita' cambia della differenza rispetto al contributo gia' registrato.
      const previous = previousContributions.get(delta.sessionId)
      if (previous) {
        const lapDelta = Number(delta.summary?.laps || 0) - previous.laps
        const validDelta = Number(delta.summary?.lapsValid || 0) - previous.lapsValid
        const timeDelta = Number(delta.summary?.totalTime || 0) - previous.totalTime
        if (lapDelta || validDelta || timeDelta) {
          newActivity.totalLaps = Math.max(0, Number(newActivity.totalLaps || 0) + lapDelta)
          newActivity.validLaps = Math.max(0, Number(newActivity.validLaps || 0) + validDelta)
          newActivity.totalTimeMs = Math.max(0, Number(newActivity.totalTimeMs || 0) + timeDelta)
          hasActivityUpdates = true
        }
      }
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
  previousContributions?: Map<string, SessionContribution>
  /** Sync reconciliation must not publish a partially built plan. */
  strict?: boolean
  /**
   * PIP-441: come aggiornare `trackBestsIndex/v1` insieme ai documenti per pista.
   * `incremental` = merge delle sole piste cambiate (sync, zero letture);
   * `full` = i delta coprono TUTTE le piste (rebuild), l'indice viene riscritto completo;
   * `none` (default) = solo documenti per pista, per i chiamanti legacy.
   */
  indexMode?: TrackBestsIndexMode
  /** Timestamp ISO dell'indice, iniettabile per test deterministici. */
  indexUpdatedAt?: string
}): Promise<{ touchedTracks: string[]; updatedTracks: string[]; indexWritten: boolean }> {
  const {
    db,
    uid,
    deltas,
    getDocFn,
    setDocFn,
    bestRulesVersion,
    docFn = defaultDocFn,
    previousContributions,
    indexMode = 'none',
    indexUpdatedAt
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti per pista destinati all'indice
  const indexTrackDocs: Record<string, any> = {}

  for (const trackIdNorm of touchedTracks) {
    const trackBestsRef = docFn(db, `users/${uid}/trackBests/${trackIdNorm}`)

    try {
      const existingSnap = await getDocFn(trackBestsRef)
      const existing = existingSnap.exists() ? existingSnap.data() : null
      const merged = mergeTrackBestsDocument({
        trackIdNorm,
        existing,
        deltas: grouped.get(trackIdNorm) || [],
        bestRulesVersion,
        previousContributions
      })

      // Nel rebuild completo l'indice deve contenere anche le piste rimaste invariate.
      if (indexMode === 'full') indexTrackDocs[trackIdNorm] = merged.data
      if (!merged.shouldWrite) continue
      await setDocFn(trackBestsRef, merged.data)
      updatedTracks.push(trackIdNorm)
      if (indexMode === 'incremental') indexTrackDocs[trackIdNorm] = merged.data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    } catch (e: any) {
      console.warn(`[SYNC] Error updating trackBests for ${trackIdNorm}:`, e.message)
      if (params.strict) throw e
    }
  }

  const indexWritten = await writeTrackBestsIndex({
    db, uid, indexMode, indexTrackDocs, updatedAt: indexUpdatedAt, setDocFn, docFn, strict: params.strict
  })

  return {
    touchedTracks,
    updatedTracks,
    indexWritten
  }
}

async function writeTrackBestsIndex(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  uid: string
  indexMode: TrackBestsIndexMode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documenti per pista
  indexTrackDocs: Record<string, any>
  updatedAt?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  docFn: (db: any, path: string) => any
  strict?: boolean
}): Promise<boolean> {
  const { db, uid, indexMode, indexTrackDocs, updatedAt, setDocFn, docFn } = params
  if (indexMode === 'none') return false
  const indexRef = docFn(db, trackBestsIndexPath(uid))

  try {
    if (indexMode === 'full') {
      const indexDoc = buildTrackBestsIndexDocument(indexTrackDocs, updatedAt)
      if (exceedsTrackBestsIndexSizeGuard(indexDoc)) {
        // Oltre la soglia l'indice viene disabilitato in modo esplicito: i lettori
        // tornano alla collection e la manutenzione non lo tratta come guasto.
        console.warn(`[SYNC] trackBestsIndex for ${uid} exceeds ${TRACK_BESTS_INDEX_MAX_BYTES} bytes, writing disabled index`)
        await setDocFn(indexRef, buildDisabledTrackBestsIndexDocument(updatedAt))
        return true
      }
      await setDocFn(indexRef, indexDoc)
      return true
    }

    const incremental = buildTrackBestsIndexIncrementalWrite(indexTrackDocs, updatedAt)
    if (!incremental) return false
    if (exceedsTrackBestsIndexSizeGuard(incremental.data)) {
      console.warn(`[SYNC] trackBestsIndex delta for ${uid} exceeds ${TRACK_BESTS_INDEX_MAX_BYTES} bytes, skipping index write`)
      return false
    }
    await setDocFn(indexRef, incremental.data, incremental.options)
    return true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  } catch (e: any) {
    console.warn(`[SYNC] Error updating trackBestsIndex for ${uid}:`, e.message)
    if (params.strict) throw e
    return false
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
