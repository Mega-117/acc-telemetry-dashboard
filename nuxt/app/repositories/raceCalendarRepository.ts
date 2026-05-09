import { collection, doc, limit, orderBy, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedAddDoc, trackedDeleteDoc, trackedGetDocs, trackedUpdateDoc } from '~/composables/useFirebaseTracker'

const CALLER = 'RaceCalendarRepository'
const RACE_CALENDAR_CACHE_TTL_MS = 60_000

type CalendarCacheEntry = {
  cachedAt: number
  events: RaceCalendarEvent[]
}

export interface RaceCalendarEvent {
  id: string
  title: string
  startsAt: string
  trackName: string
  carName?: string
  simGridUrl?: string
  raceUrl?: string
  createdBy?: string
  createdByRole?: 'pilot' | 'coach' | 'admin'
  createdAt?: string
  updatedAt?: string
}

export interface RaceCalendarEventInput {
  title: string
  startsAt: string
  trackName: string
  carName?: string
  simGridUrl?: string
  raceUrl?: string
  createdBy?: string
  createdByRole?: 'pilot' | 'coach' | 'admin'
}

function eventCollection(userId: string) {
  return collection(db, 'users', userId, 'raceCalendar')
}

const eventsCache = new Map<string, CalendarCacheEntry>()

function cacheKey(userId: string, maxItems: number) {
  return `${userId}:${maxItems}`
}

export function clearRaceCalendarCache(userId?: string) {
  if (!userId) {
    eventsCache.clear()
    return
  }

  for (const key of Array.from(eventsCache.keys())) {
    if (key.startsWith(`${userId}:`)) eventsCache.delete(key)
  }
}

function mapEvent(docSnap: any): RaceCalendarEvent {
  const data = docSnap.data() || {}
  return {
    id: docSnap.id,
    title: data.title || '',
    startsAt: data.startsAt || '',
    trackName: data.trackName || '',
    carName: data.carName || '',
    simGridUrl: data.simGridUrl || '',
    raceUrl: data.raceUrl || '',
    createdBy: data.createdBy || '',
    createdByRole: data.createdByRole || '',
    createdAt: data.createdAt || '',
    updatedAt: data.updatedAt || ''
  }
}

export async function loadRaceCalendarEvents(userId: string, maxItems = 25): Promise<RaceCalendarEvent[]> {
  const key = cacheKey(userId, maxItems)
  const cached = eventsCache.get(key)
  if (cached && Date.now() - cached.cachedAt <= RACE_CALENDAR_CACHE_TTL_MS) {
    return cached.events
  }

  const snap = await trackedGetDocs(
    query(eventCollection(userId), orderBy('startsAt', 'asc'), limit(maxItems)),
    CALLER
  )
  const events = snap.docs.map(mapEvent)
  eventsCache.set(key, { cachedAt: Date.now(), events })
  return events
}

export async function createRaceCalendarEvent(userId: string, input: RaceCalendarEventInput) {
  const now = new Date().toISOString()
  const result = await trackedAddDoc(eventCollection(userId), {
    title: input.title.trim(),
    startsAt: input.startsAt,
    trackName: input.trackName.trim(),
    carName: input.carName?.trim() || null,
    simGridUrl: input.simGridUrl?.trim() || null,
    raceUrl: input.raceUrl?.trim() || null,
    createdBy: input.createdBy || null,
    createdByRole: input.createdByRole || null,
    createdAt: now,
    updatedAt: now
  }, CALLER)
  clearRaceCalendarCache(userId)
  return result
}

export async function updateRaceCalendarEvent(userId: string, eventId: string, input: RaceCalendarEventInput) {
  await trackedUpdateDoc(doc(db, 'users', userId, 'raceCalendar', eventId), {
    title: input.title.trim(),
    startsAt: input.startsAt,
    trackName: input.trackName.trim(),
    carName: input.carName?.trim() || null,
    simGridUrl: input.simGridUrl?.trim() || null,
    raceUrl: input.raceUrl?.trim() || null,
    updatedAt: new Date().toISOString()
  }, CALLER)
  clearRaceCalendarCache(userId)
}

export async function deleteRaceCalendarEvent(userId: string, eventId: string) {
  await trackedDeleteDoc(doc(db, 'users', userId, 'raceCalendar', eventId), CALLER)
  clearRaceCalendarCache(userId)
}
