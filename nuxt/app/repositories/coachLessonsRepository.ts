import { addDoc, collection, doc, limit, orderBy, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedAddDoc, trackedGetDoc, trackedGetDocs } from '~/composables/useFirebaseTracker'

const CALLER = 'CoachLessonsRepository'

export type CoachFeedbackType = 'positive' | 'issue' | 'action'

export interface CoachFeedbackItem {
  type: CoachFeedbackType
  turn?: string
  category: string
  message: string
}

export interface CoachLesson {
  id: string
  pilotId: string
  coachId: string
  coachName?: string
  lessonAt: string
  trackName: string
  carName?: string
  durationMinutes: number
  initialBestLapMs?: number | null
  finalBestLapMs?: number | null
  trackTitanPilotUrl?: string
  trackTitanReferenceUrl?: string
  recordingUrl?: string
  writtenNotes?: string
  feedbackItems: CoachFeedbackItem[]
  createdAt?: string
  updatedAt?: string
}

export interface CoachLessonInput {
  coachId: string
  coachName?: string
  lessonAt: string
  trackName: string
  carName?: string
  durationMinutes: number
  initialBestLapMs?: number | null
  finalBestLapMs?: number | null
  trackTitanPilotUrl?: string
  trackTitanReferenceUrl?: string
  recordingUrl?: string
  writtenNotes?: string
  feedbackItems: CoachFeedbackItem[]
}

function lessonsCollection(pilotId: string) {
  return collection(db, 'users', pilotId, 'coachLessons')
}

function mapLesson(docSnap: any, pilotId: string): CoachLesson {
  const data = docSnap.data() || {}
  return {
    id: docSnap.id,
    pilotId,
    coachId: data.coachId || '',
    coachName: data.coachName || '',
    lessonAt: data.lessonAt || '',
    trackName: data.trackName || '',
    carName: data.carName || '',
    durationMinutes: Number(data.durationMinutes || 0),
    initialBestLapMs: data.initialBestLapMs ?? null,
    finalBestLapMs: data.finalBestLapMs ?? null,
    trackTitanPilotUrl: data.trackTitanPilotUrl || '',
    trackTitanReferenceUrl: data.trackTitanReferenceUrl || '',
    recordingUrl: data.recordingUrl || '',
    writtenNotes: data.writtenNotes || '',
    feedbackItems: Array.isArray(data.feedbackItems) ? data.feedbackItems : [],
    createdAt: data.createdAt || '',
    updatedAt: data.updatedAt || ''
  }
}

export async function loadCoachLessons(pilotId: string, maxItems = 25): Promise<CoachLesson[]> {
  const snap = await trackedGetDocs(
    query(lessonsCollection(pilotId), orderBy('lessonAt', 'desc'), limit(maxItems)),
    CALLER
  )
  return snap.docs.map((docSnap) => mapLesson(docSnap, pilotId))
}

export async function loadCoachLesson(pilotId: string, lessonId: string): Promise<CoachLesson | null> {
  const snap = await trackedGetDoc(doc(db, 'users', pilotId, 'coachLessons', lessonId), CALLER)
  if (!snap.exists()) return null
  return mapLesson(snap, pilotId)
}

export async function createCoachLesson(pilotId: string, input: CoachLessonInput) {
  const now = new Date().toISOString()
  return trackedAddDoc(lessonsCollection(pilotId), {
    pilotId,
    coachId: input.coachId,
    coachName: input.coachName || '',
    lessonAt: input.lessonAt,
    trackName: input.trackName.trim(),
    carName: input.carName?.trim() || null,
    durationMinutes: Number(input.durationMinutes || 0),
    initialBestLapMs: input.initialBestLapMs ?? null,
    finalBestLapMs: input.finalBestLapMs ?? null,
    trackTitanPilotUrl: input.trackTitanPilotUrl?.trim() || null,
    trackTitanReferenceUrl: input.trackTitanReferenceUrl?.trim() || null,
    recordingUrl: input.recordingUrl?.trim() || null,
    writtenNotes: input.writtenNotes?.trim() || '',
    feedbackItems: input.feedbackItems,
    createdAt: now,
    updatedAt: now
  }, CALLER)
}
