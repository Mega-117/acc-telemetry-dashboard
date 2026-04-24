import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore'
import type { FullSession, SessionDocument } from '~/composables/useTelemetryData'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'

export async function loadCloudSessionsBounded(params: {
  db: any
  targetUserId: string
  maxItems: number
  getDocsFn: (queryRef: any) => Promise<any>
}): Promise<SessionDocument[]> {
  const { db, targetUserId, maxItems, getDocsFn } = params
  const sessionsRef = collection(db, `users/${targetUserId}/sessions`)

  let querySnapshot: any
  try {
    querySnapshot = await getDocsFn(query(sessionsRef, orderBy('meta.date_start', 'desc'), limit(maxItems)))
  } catch {
    try {
      querySnapshot = await getDocsFn(query(sessionsRef, orderBy('uploadedAt', 'desc'), limit(maxItems)))
    } catch {
      querySnapshot = await getDocsFn(query(sessionsRef, limit(maxItems)))
    }
  }

  return (querySnapshot.docs || []).map((docSnap: any) => {
    const data = docSnap.data()
    const bestRulesVersion = Number(data?.summary?.best_rules_version || data?.summaryRulesVersion || 0)
    return {
      sessionId: docSnap.id,
      fileHash: data.fileHash || null,
      fileName: data.fileName || null,
      uploadedAt: data.uploadedAt || null,
      meta: data.meta || {},
      summary: data.summary || {},
      rawChunkCount: data.rawChunkCount || 0,
      rawSizeBytes: data.rawSizeBytes || 0,
      source: 'cloud',
      summarySource: bestRulesVersion >= BEST_RULES_VERSION ? 'canonical' : 'legacy_fallback',
      syncState: 'synced'
    } as SessionDocument
  })
}

export async function loadCloudSessionIndexList(params: {
  db: any
  targetUserId: string
  getDocFn: (ref: any) => Promise<any>
}): Promise<SessionDocument[]> {
  const { db, targetUserId, getDocFn } = params
  const userRef = doc(db, `users/${targetUserId}`)
  const snap = await getDocFn(userRef)
  if (!snap.exists()) return []
  const data = snap.data() || {}
  const list = Array.isArray(data.sessionIndex?.sessionsList) ? data.sessionIndex.sessionsList : []

  return list.map((entry: any) => ({
    sessionId: entry.id,
    fileHash: '',
    fileName: '',
    uploadedAt: null,
    meta: {
      track: entry.track,
      car: entry.car,
      date_start: entry.date,
      date_end: null,
      session_type: entry.type,
      driver: null
    },
    summary: {
      laps: entry.laps || 0,
      lapsValid: entry.lapsValid || 0,
      bestLap: entry.bestLap || null,
      avgCleanLap: null,
      totalTime: entry.totalTime || 0,
      stintCount: entry.stintCount || 0,
      best_qualy_ms: entry.bestQualyMs || null,
      best_session_race_ms: entry.bestSessionRaceMs || null,
      best_session_race_conditions: entry.bestSessionRaceGrip
        ? { airTemp: 0, roadTemp: 0, grip: entry.bestSessionRaceGrip }
        : null,
      best_race_ms: entry.bestRaceMs || null,
      best_race_conditions: entry.grip ? { airTemp: 0, roadTemp: 0, grip: entry.grip } : null,
      best_rules_version: entry.bestRulesVersion || 0
    },
    rawChunkCount: 0,
    rawSizeBytes: 0,
    source: 'cloud',
    summarySource: Number(entry.bestRulesVersion || 0) >= BEST_RULES_VERSION ? 'canonical' : 'legacy_fallback',
    syncState: 'synced'
  } as SessionDocument))
}

export async function fetchCloudFullSession(params: {
  db: any
  targetUserId: string
  sessionId: string
  isExternalSession: boolean
  getDocFn: (ref: any) => Promise<any>
  getDocsFn: (queryRef: any) => Promise<any>
}): Promise<FullSession | null> {
  const { db, targetUserId, sessionId, isExternalSession, getDocFn, getDocsFn } = params
  const sessionRef = doc(db, `users/${targetUserId}/sessions/${sessionId}`)
  const sessionSnap = await getDocFn(sessionRef)
  if (!sessionSnap.exists()) return null

  const sessionData = sessionSnap.data() || {}
  const chunkCount = sessionData.rawChunkCount || 0
  if (chunkCount === 0) return null

  const chunksRef = collection(db, `users/${targetUserId}/sessions/${sessionId}/rawChunks`)
  const chunksQuery = isExternalSession
    ? query(chunksRef, where('isPublic', '==', true))
    : query(chunksRef, orderBy('idx', 'asc'))
  const chunksSnap = await getDocsFn(chunksQuery)

  const rawText = (chunksSnap.docs || [])
    .map((docSnap: any) => docSnap.data())
    .sort((a: any, b: any) => Number(a?.idx || 0) - Number(b?.idx || 0))
    .map((chunk: any) => String(chunk?.chunk || ''))
    .join('')

  return rawText ? (JSON.parse(rawText) as FullSession) : null
}
