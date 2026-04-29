import { doc, serverTimestamp } from 'firebase/firestore'
import {
  CAR_CATEGORIES,
  formatCarName,
  formatDriveTime,
  formatLapTime,
  getCarCategory,
  getSessionTypeLabel,
  type CarCategory,
  type SessionDocument
} from '~/composables/useTelemetryData'
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
  const sessionRaceTime = (summary as any)?.best_session_race_ms || summary.best_race_ms || null
  const dateObj = new Date(session.meta.date_start)

  return {
    id: session.sessionId,
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
    sessionId: session.sessionId,
    bestQualy: summary.best_qualy_ms ? formatLapTime(summary.best_qualy_ms) : undefined,
    bestRace: summary.best_race_ms ? formatLapTime(summary.best_race_ms) : undefined
  }
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
  db: any
  uid: string
  sessions: SessionDocument[]
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
