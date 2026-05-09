import { collection, doc, limit, orderBy, query, startAfter, where, type DocumentData, type QueryDocumentSnapshot, type QueryConstraint } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedAddDoc, trackedGetCountFromServer, trackedGetDoc, trackedGetDocs, trackedUpdateDoc } from '~/composables/useFirebaseTracker'

const CALLER = 'CoachLessonsRepository'
const COACH_LESSONS_CACHE_TTL_MS = 60_000

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

export type CoachLessonUpdateInput = Omit<CoachLessonInput, 'coachId' | 'coachName'>

export interface CoachLessonFilters {
  trackName?: string
  carName?: string
}

export interface CoachLessonsPage {
  lessons: CoachLesson[]
  cursor: QueryDocumentSnapshot<DocumentData> | null
  hasMore: boolean
}

type LessonsPageCacheEntry = {
  cachedAt: number
  page: CoachLessonsPage
}

type LessonsListCacheEntry = {
  cachedAt: number
  lessons: CoachLesson[]
}

type LessonsCountCacheEntry = {
  cachedAt: number
  count: number
}

const firstPageCache = new Map<string, LessonsPageCacheEntry>()
const listCache = new Map<string, LessonsListCacheEntry>()
const countCache = new Map<string, LessonsCountCacheEntry>()
const lessonDetailCache = new Map<string, { cachedAt: number; lesson: CoachLesson | null }>()

function filtersKey(filters: CoachLessonFilters = {}) {
  return JSON.stringify({
    trackName: filters.trackName?.trim() || '',
    carName: filters.carName?.trim() || ''
  })
}

function isFresh(cachedAt: number) {
  return Date.now() - cachedAt <= COACH_LESSONS_CACHE_TTL_MS
}

function firstPageKey(pilotId: string, filters: CoachLessonFilters, pageSize: number) {
  return `${pilotId}:${pageSize}:${filtersKey(filters)}`
}

export function clearCoachLessonsCache(pilotId?: string) {
  if (!pilotId) {
    firstPageCache.clear()
    listCache.clear()
    countCache.clear()
    lessonDetailCache.clear()
    return
  }

  for (const cache of [firstPageCache, listCache, countCache, lessonDetailCache]) {
    for (const key of Array.from(cache.keys())) {
      if (key.startsWith(`${pilotId}:`)) cache.delete(key)
    }
  }
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

function buildCoachLessonConstraints(filters: CoachLessonFilters, pageSize: number, cursor?: QueryDocumentSnapshot<DocumentData> | null): QueryConstraint[] {
  const constraints: QueryConstraint[] = []

  if (filters.trackName?.trim()) {
    constraints.push(where('trackName', '==', filters.trackName.trim()))
  }

  if (filters.carName?.trim()) {
    constraints.push(where('carName', '==', filters.carName.trim()))
  }

  constraints.push(orderBy('lessonAt', 'desc'))

  if (cursor) {
    constraints.push(startAfter(cursor))
  }

  constraints.push(limit(pageSize + 1))
  return constraints
}

export async function loadCoachLessonsPage(
  pilotId: string,
  filters: CoachLessonFilters = {},
  pageSize = 10,
  cursor?: QueryDocumentSnapshot<DocumentData> | null
): Promise<CoachLessonsPage> {
  const key = firstPageKey(pilotId, filters, pageSize)
  const cached = cursor ? null : firstPageCache.get(key)
  if (cached && isFresh(cached.cachedAt)) return cached.page

  const snap = await trackedGetDocs(
    query(lessonsCollection(pilotId), ...buildCoachLessonConstraints(filters, pageSize, cursor)),
    CALLER
  )
  const docs = snap.docs.slice(0, pageSize)
  const page = {
    lessons: docs.map((docSnap) => mapLesson(docSnap, pilotId)),
    cursor: docs[docs.length - 1] || null,
    hasMore: snap.docs.length > pageSize
  }
  if (!cursor) firstPageCache.set(key, { cachedAt: Date.now(), page })
  return page
}

export async function countCoachLessons(pilotId: string): Promise<number> {
  const cached = countCache.get(pilotId)
  if (cached && isFresh(cached.cachedAt)) return cached.count

  const snap = await trackedGetCountFromServer(query(lessonsCollection(pilotId)), CALLER)
  const count = Number(snap.data().count || 0)
  countCache.set(pilotId, { cachedAt: Date.now(), count })
  return count
}

export async function loadCoachLessons(pilotId: string, maxItems = 25): Promise<CoachLesson[]> {
  const key = `${pilotId}:${maxItems}`
  const cached = listCache.get(key)
  if (cached && isFresh(cached.cachedAt)) return cached.lessons

  const snap = await trackedGetDocs(
    query(lessonsCollection(pilotId), orderBy('lessonAt', 'desc'), limit(maxItems)),
    CALLER
  )
  const lessons = snap.docs.map((docSnap) => mapLesson(docSnap, pilotId))
  listCache.set(key, { cachedAt: Date.now(), lessons })
  return lessons
}

export async function loadCoachLesson(pilotId: string, lessonId: string): Promise<CoachLesson | null> {
  const key = `${pilotId}:${lessonId}`
  const cached = lessonDetailCache.get(key)
  if (cached && isFresh(cached.cachedAt)) return cached.lesson

  const snap = await trackedGetDoc(doc(db, 'users', pilotId, 'coachLessons', lessonId), CALLER)
  const lesson = snap.exists() ? mapLesson(snap, pilotId) : null
  lessonDetailCache.set(key, { cachedAt: Date.now(), lesson })
  return lesson
}

export async function createCoachLesson(pilotId: string, input: CoachLessonInput) {
  const now = new Date().toISOString()
  const result = await trackedAddDoc(lessonsCollection(pilotId), {
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
  clearCoachLessonsCache(pilotId)
  return result
}

export async function updateCoachLesson(pilotId: string, lessonId: string, input: CoachLessonUpdateInput) {
  const now = new Date().toISOString()
  await trackedUpdateDoc(doc(db, 'users', pilotId, 'coachLessons', lessonId), {
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
    updatedAt: now
  }, CALLER)
  clearCoachLessonsCache(pilotId)
}
