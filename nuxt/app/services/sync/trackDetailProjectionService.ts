import { doc, serverTimestamp } from 'firebase/firestore'
import {
  CAR_CATEGORIES,
  formatCarName,
  formatDriveTime,
  formatLapTime,
  getCarCategory,
  getSessionTypeLabel,
  type CarCategory
} from '~/utils/telemetryFormat'
import type { SessionDocument } from '~/types/telemetry'
import type { UserProjectionDelta } from './syncUserProjectionDeltaService'
import { normalizeTrackId } from '~/services/projections/trackMetadata'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'
import {
  TRACK_DETAIL_PROJECTION_SCHEMA_VERSION,
  type TrackActivityProjection,
  type TrackDetailProjectionCategoryDocument,
  type TrackDetailProjectionDocument,
  type TrackHistoricalPointProjection,
  type TrackRecentSessionProjection
} from '~/types/trackProjections'

export const TRACK_DETAIL_PROJECTION_MAX_ITEMS = 200

function formatHistoricalDateLabel(dateStart: string | null | undefined): string {
  const dateStr = dateStart?.split('T')[0] || ''
  const [, month, day] = dateStr.split('-')
  const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  return day && month ? `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1] || 'N/A'}` : 'N/A'
}

function buildRecentSession(session: SessionDocument): TrackRecentSessionProjection {
  const summary = session.summary || {}
  const sessionRaceTime = summary.best_session_race_ms || summary.best_race_ms || null
  const dateObj = new Date(session.meta.date_start)

  return {
    id: session.sessionId,
    dateStart: session.meta.date_start,
    date: session.meta.date_start?.split('T')[0] || '',
    time: Number.isNaN(dateObj.getTime())
      ? ''
      : dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
    type: getSessionTypeLabel(session.meta.session_type),
    car: formatCarName(session.meta.car),
    laps: summary.laps || 0,
    stints: summary.stintCount || 0,
    bestQualy: summary.best_qualy_ms ? formatLapTime(summary.best_qualy_ms) : undefined,
    bestRace: sessionRaceTime ? formatLapTime(sessionRaceTime) : undefined
  }
}

function buildHistoricalPoint(session: SessionDocument): TrackHistoricalPointProjection {
  const summary = session.summary || {}

  return {
    date: formatHistoricalDateLabel(session.meta.date_start),
    dateStart: session.meta.date_start,
    sessionId: session.sessionId,
    bestQualy: summary.best_qualy_ms ? formatLapTime(summary.best_qualy_ms) : undefined,
    bestRace: summary.best_race_ms ? formatLapTime(summary.best_race_ms) : undefined
  }
}

function buildEmptyCategoryProjection(): TrackDetailProjectionCategoryDocument {
  return {
    recentSessions: [],
    historicalTimes: [],
    activity: buildActivity([]),
    sessionCount: 0,
    lastSessionDate: null
  }
}

function toSessionDocument(delta: UserProjectionDelta): SessionDocument {
  return {
    sessionId: delta.sessionId,
    fileHash: '',
    fileName: '',
    uploadedAt: null,
    meta: {
      track: delta.trackId,
      car: delta.car || '',
      date_start: delta.dateStart,
      date_end: null,
      session_type: Number(delta.sessionType ?? 0),
      driver: null
    },
    summary: delta.summary || {},
    rawChunkCount: 0,
    rawSizeBytes: 0
  }
}

function mergeCreatedDelta(
  document: TrackDetailProjectionDocument,
  delta: UserProjectionDelta
): TrackDetailProjectionDocument {
  const session = toSessionDocument(delta)
  const category = getCarCategory(session.meta.car)
  const existingCategory = document.categories[category] || buildEmptyCategoryProjection()

  if (existingCategory.recentSessions.some((item) => item.id === session.sessionId)) {
    return document
  }

  if (Number(session.summary?.laps || 0) <= 0) {
    return {
      ...document,
      lastSessionDate: [document.lastSessionDate, session.meta.date_start].filter(Boolean).sort().at(-1) || null
    }
  }

  const recentSessions = [...existingCategory.recentSessions, buildRecentSession(session)]
    .sort((a, b) => (b.dateStart || '').localeCompare(a.dateStart || ''))
    .slice(0, TRACK_DETAIL_PROJECTION_MAX_ITEMS)
  const historicalTimes = [...existingCategory.historicalTimes, buildHistoricalPoint(session)]
    .sort((a, b) => (a.dateStart || '').localeCompare(b.dateStart || ''))
    .slice(-TRACK_DETAIL_PROJECTION_MAX_ITEMS)
  const totalLaps = existingCategory.activity.totalLaps + Number(session.summary?.laps || 0)
  const validLaps = existingCategory.activity.validLaps + Number(session.summary?.lapsValid || 0)
  const totalTimeMs = existingCategory.activity.totalTimeMs + Number(session.summary?.totalTime || 0)
  const sessionCount = existingCategory.sessionCount + 1

  return {
    ...document,
    lastSessionDate: [document.lastSessionDate, session.meta.date_start].filter(Boolean).sort().at(-1) || null,
    categories: {
      ...document.categories,
      [category]: {
        recentSessions,
        historicalTimes,
        sessionCount,
        lastSessionDate: [existingCategory.lastSessionDate, session.meta.date_start].filter(Boolean).sort().at(-1) || null,
        activity: {
          totalLaps,
          validLaps,
          validPercent: totalLaps > 0 ? Math.round((validLaps / totalLaps) * 100) : 0,
          totalTimeMs,
          totalTimeFormatted: formatDriveTime(totalTimeMs),
          sessionCount
        }
      }
    }
  }
}

export async function applyTrackDetailProjectionDeltas(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore SDK boundary injected by the sync orchestrator
  db: any
  uid: string
  deltas: UserProjectionDelta[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore snapshot boundary injected for testability
  getDocFn: (ref: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore writer boundary injected for testability
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore document reference factory boundary
  docFn?: (db: any, path: string) => any
}): Promise<{ wrote: boolean; requiresFullRebuild: boolean }> {
  const { db, uid, deltas, getDocFn, setDocFn, docFn = doc } = params
  if (deltas.length === 0) return { wrote: false, requiresFullRebuild: false }
  if (deltas.some((delta) => delta.status !== 'created')) {
    return { wrote: false, requiresFullRebuild: true }
  }

  const byTrack = new Map<string, UserProjectionDelta[]>()
  for (const delta of deltas) {
    const trackId = normalizeTrackId(delta.trackId)
    if (!trackId) continue
    byTrack.set(trackId, [...(byTrack.get(trackId) || []), delta])
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque Firestore DocumentReference
  const writes: Array<{ ref: any; document: TrackDetailProjectionDocument }> = []
  for (const [trackId, trackDeltas] of byTrack) {
    const ref = docFn(db, `users/${uid}/trackDetailProjections/${trackId}`)
    const snapshot = await getDocFn(ref)
    if (!snapshot.exists()) return { wrote: false, requiresFullRebuild: true }
    const existing = snapshot.data() as TrackDetailProjectionDocument
    if (existing.schemaVersion !== TRACK_DETAIL_PROJECTION_SCHEMA_VERSION) {
      return { wrote: false, requiresFullRebuild: true }
    }
    const document = trackDeltas.reduce(mergeCreatedDelta, existing)
    writes.push({ ref, document })
  }

  for (const write of writes) {
    await setDocFn(write.ref, {
      ...sanitizeForFirestore(write.document),
      updatedAt: serverTimestamp()
    }, { merge: true })
  }
  return { wrote: writes.length > 0, requiresFullRebuild: false }
}

function buildActivity(sessions: SessionDocument[]): TrackActivityProjection {
  const totalLaps = sessions.reduce((sum, session) => sum + Number(session.summary?.laps || 0), 0)
  const validLaps = sessions.reduce((sum, session) => sum + Number(session.summary?.lapsValid || 0), 0)
  const totalTimeMs = sessions.reduce((sum, session) => sum + Number(session.summary?.totalTime || 0), 0)

  return {
    totalLaps,
    validLaps,
    validPercent: totalLaps > 0 ? Math.round((validLaps / totalLaps) * 100) : 0,
    totalTimeMs,
    totalTimeFormatted: formatDriveTime(totalTimeMs),
    sessionCount: sessions.length
  }
}

function buildCategoryProjection(sessions: SessionDocument[]): TrackDetailProjectionCategoryDocument {
  const validSessions = sessions
    .filter((session) => Number(session.summary?.laps || 0) > 0)
    .sort((a, b) => (b.meta.date_start || '').localeCompare(a.meta.date_start || ''))

  const historicalSessions = [...validSessions]
    .sort((a, b) => (a.meta.date_start || '').localeCompare(b.meta.date_start || ''))
    .slice(-TRACK_DETAIL_PROJECTION_MAX_ITEMS)

  return {
    recentSessions: validSessions.slice(0, TRACK_DETAIL_PROJECTION_MAX_ITEMS).map(buildRecentSession),
    historicalTimes: historicalSessions.map(buildHistoricalPoint),
    activity: buildActivity(validSessions),
    sessionCount: validSessions.length,
    lastSessionDate: validSessions[0]?.meta.date_start || null
  }
}

export function buildTrackDetailProjectionDocument(
  trackId: string,
  sessions: SessionDocument[]
): TrackDetailProjectionDocument {
  const normalizedTrackId = normalizeTrackId(trackId)
  const trackSessions = sessions.filter((session) => normalizeTrackId(session.meta?.track) === normalizedTrackId)
  const categories: Partial<Record<CarCategory, TrackDetailProjectionCategoryDocument>> = {}

  for (const category of CAR_CATEGORIES) {
    categories[category] = buildCategoryProjection(
      trackSessions.filter((session) => getCarCategory(session.meta?.car || '') === category)
    )
  }

  const lastSessionDate = trackSessions
    .map((session) => session.meta?.date_start || '')
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || null

  return {
    schemaVersion: TRACK_DETAIL_PROJECTION_SCHEMA_VERSION,
    trackId: normalizedTrackId,
    lastSessionDate,
    categories
  }
}

export async function writeTrackDetailProjectionDocuments(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore SDK boundary injected by the sync orchestrator
  db: any
  uid: string
  sessions: SessionDocument[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore writer boundary injected for testability
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
}): Promise<void> {
  const { db, uid, sessions, setDocFn } = params
  const trackIds = Array.from(new Set(sessions.map((session) => normalizeTrackId(session.meta?.track)).filter(Boolean)))

  for (const trackId of trackIds) {
    const projection = sanitizeForFirestore(buildTrackDetailProjectionDocument(trackId, sessions))
    await setDocFn(
      doc(db, `users/${uid}/trackDetailProjections/${trackId}`),
      {
        ...projection,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    )
  }
}
