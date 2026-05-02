import { doc, serverTimestamp } from 'firebase/firestore'
import { CAR_CATEGORIES, getCarCategory, type CarCategory } from '~/composables/useTelemetryData'
import { normalizeTrackId } from '~/services/projections/trackMetadata'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'

export const TRACK_BESTS_SCHEMA_VERSION = 3

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
}

export interface TrackBestProjectionDelta {
  trackId: string
  sessionId: string
  dateStart: string
  sessionType?: number
  summary: any
  car?: string
}

function emptyGripBests(): GripBest {
  return {
    bestQualy: null, bestQualyTemp: null, bestQualyFuel: null, bestQualySessionId: null, bestQualyDate: null,
    bestRace: null, bestRaceTemp: null, bestRaceFuel: null, bestRaceSessionId: null, bestRaceDate: null,
    bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceFuel: null, bestAvgRaceSessionId: null, bestAvgRaceDate: null
  }
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
    bestAvgRaceDate: source.bestAvgRaceDate ?? null
  }
}

function buildInitialBests(existing: any, gripConditions: string[]) {
  const existingVersion = Number(existing?.version || 1)
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

  if (existing?.bests || existing) {
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
      catGrip.bestRace = sessionBest.bestRace
      catGrip.bestRaceTemp = sessionBest.bestRaceTemp ?? null
      catGrip.bestRaceFuel = sessionBest.bestRaceFuel ?? null
      catGrip.bestRaceSessionId = delta.sessionId
      catGrip.bestRaceDate = delta.dateStart
      hasUpdates = true
    } else if (sessionBest.bestRace && catGrip.bestRace === sessionBest.bestRace && catGrip.bestRaceFuel == null && sessionBest.bestRaceFuel != null) {
      catGrip.bestRaceFuel = sessionBest.bestRaceFuel
      hasUpdates = true
    }

    if (sessionBest.bestAvgRace && (!catGrip.bestAvgRace || sessionBest.bestAvgRace < catGrip.bestAvgRace)) {
      catGrip.bestAvgRace = sessionBest.bestAvgRace
      catGrip.bestAvgRaceTemp = sessionBest.bestAvgRaceTemp ?? null
      catGrip.bestAvgRaceFuel = sessionBest.bestAvgRaceFuel ?? null
      catGrip.bestAvgRaceSessionId = delta.sessionId
      catGrip.bestAvgRaceDate = delta.dateStart
      hasUpdates = true
    } else if (sessionBest.bestAvgRace && catGrip.bestAvgRace === sessionBest.bestAvgRace && catGrip.bestAvgRaceFuel == null && sessionBest.bestAvgRaceFuel != null) {
      catGrip.bestAvgRaceFuel = sessionBest.bestAvgRaceFuel
      hasUpdates = true
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
  const syncedSessionIds = Array.from(countedSessionIds)
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
      syncedSessionIds.push(delta.sessionId)
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
    syncedSessionIds: Array.from(countedSessionIds).slice(-100),
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

function defaultDocFn(db: any, path: string) {
  return doc(db, path)
}

export async function applyTrackBestsProjectionDeltas(params: {
  db: any
  uid: string
  deltas: TrackBestProjectionDelta[]
  getDocFn: (ref: any) => Promise<any>
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  bestRulesVersion: number
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
  db: any
  uid: string
  trackId: string
  sessionId: string
  dateStart: string
  summary: any
  car?: string
  getDocFn: (ref: any) => Promise<any>
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  bestRulesVersion: number
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
