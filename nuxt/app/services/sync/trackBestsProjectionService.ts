import { doc, serverTimestamp } from 'firebase/firestore'
import { CAR_CATEGORIES, getCarCategory, type CarCategory } from '~/composables/useTelemetryData'

export const TRACK_BESTS_SCHEMA_VERSION = 2

type GripBest = {
  bestQualy: number | null
  bestQualyTemp: number | null
  bestQualySessionId: string | null
  bestQualyDate: string | null
  bestRace: number | null
  bestRaceTemp: number | null
  bestRaceSessionId: string | null
  bestRaceDate: string | null
  bestAvgRace: number | null
  bestAvgRaceTemp: number | null
  bestAvgRaceSessionId: string | null
  bestAvgRaceDate: string | null
}

function emptyGripBests(): GripBest {
  return {
    bestQualy: null, bestQualyTemp: null, bestQualySessionId: null, bestQualyDate: null,
    bestRace: null, bestRaceTemp: null, bestRaceSessionId: null, bestRaceDate: null,
    bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceSessionId: null, bestAvgRaceDate: null
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
}): Promise<boolean> {
  const {
    db,
    uid,
    trackId,
    sessionId,
    dateStart,
    summary,
    car,
    getDocFn,
    setDocFn,
    bestRulesVersion
  } = params

  const trackIdNorm = trackId.toLowerCase().replace(/\s+/g, '_')
  const trackBestsRef = doc(db, `users/${uid}/trackBests/${trackIdNorm}`)
  const category = getCarCategory(car || '')
  const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']

  try {
    const existingSnap = await getDocFn(trackBestsRef)
    const existing = existingSnap.exists() ? existingSnap.data() : null
    const existingVersion = existing?.version || 1

    let newBests: Record<CarCategory, Record<string, GripBest>> = {} as any

    if (existingVersion >= TRACK_BESTS_SCHEMA_VERSION && existing?.bests) {
      for (const cat of CAR_CATEGORIES) {
        newBests[cat] = existing.bests[cat] || {}
      }
    } else if (existing?.bests || existing) {
      const legacyBests = existing.bests ||
        Object.fromEntries(gripConditions.filter((g) => existing[g]).map((g) => [g, existing[g]]))

      for (const cat of CAR_CATEGORIES) {
        newBests[cat] = {}
        for (const grip of gripConditions) {
          newBests[cat][grip] = cat === 'GT3' && legacyBests[grip] ? legacyBests[grip] : emptyGripBests()
        }
      }
    } else {
      for (const cat of CAR_CATEGORIES) {
        newBests[cat] = {}
        for (const grip of gripConditions) {
          newBests[cat][grip] = emptyGripBests()
        }
      }
    }

    let hasUpdates = false
    for (const grip of gripConditions) {
      const sessionBest = summary.best_by_grip?.[grip]
      if (!sessionBest) continue

      if (!newBests[category][grip]) {
        newBests[category][grip] = emptyGripBests()
      }
      const catGrip = newBests[category][grip]

      if (sessionBest.bestQualy && (!catGrip.bestQualy || sessionBest.bestQualy < catGrip.bestQualy)) {
        catGrip.bestQualy = sessionBest.bestQualy
        catGrip.bestQualyTemp = sessionBest.bestQualyTemp
        catGrip.bestQualySessionId = sessionId
        catGrip.bestQualyDate = dateStart
        hasUpdates = true
      }

      if (sessionBest.bestRace && (!catGrip.bestRace || sessionBest.bestRace < catGrip.bestRace)) {
        catGrip.bestRace = sessionBest.bestRace
        catGrip.bestRaceTemp = sessionBest.bestRaceTemp
        catGrip.bestRaceSessionId = sessionId
        catGrip.bestRaceDate = dateStart
        hasUpdates = true
      }

      if (sessionBest.bestAvgRace && (!catGrip.bestAvgRace || sessionBest.bestAvgRace < catGrip.bestAvgRace)) {
        catGrip.bestAvgRace = sessionBest.bestAvgRace
        catGrip.bestAvgRaceTemp = sessionBest.bestAvgRaceTemp
        catGrip.bestAvgRaceSessionId = sessionId
        catGrip.bestAvgRaceDate = dateStart
        hasUpdates = true
      }
    }

    const existingActivity = existing?.activity || {
      totalLaps: 0,
      validLaps: 0,
      totalTimeMs: 0,
      sessionCount: 0
    }
    const lastSyncedSessions = existing?.syncedSessionIds || []
    const alreadyCounted = lastSyncedSessions.includes(sessionId)

    const newActivity = alreadyCounted ? existingActivity : {
      totalLaps: existingActivity.totalLaps + (summary.laps || 0),
      validLaps: existingActivity.validLaps + (summary.lapsValid || 0),
      totalTimeMs: existingActivity.totalTimeMs + (summary.totalTime || 0),
      sessionCount: existingActivity.sessionCount + 1,
      lastSessionDate: dateStart
    }

    const newSyncedSessions = alreadyCounted ? lastSyncedSessions : [...lastSyncedSessions, sessionId].slice(-100)

    await setDocFn(trackBestsRef, {
      version: TRACK_BESTS_SCHEMA_VERSION,
      bestRulesVersion: Number(summary?.best_rules_version || bestRulesVersion),
      trackId: trackIdNorm,
      bests: newBests,
      activity: newActivity,
      syncedSessionIds: newSyncedSessions,
      lastSessionDate: dateStart,
      lastUpdated: serverTimestamp()
    })

    return hasUpdates || !alreadyCounted
  } catch (e: any) {
    console.warn(`[SYNC] Error updating trackBests for ${trackIdNorm}:`, e.message)
    return false
  }
}
