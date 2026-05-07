import { collection, doc, limit, orderBy, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedAddDoc, trackedDeleteDoc, trackedGetDocs } from '~/composables/useFirebaseTracker'

const CALLER = 'RaceCalendarRepository'

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
  const snap = await trackedGetDocs(
    query(eventCollection(userId), orderBy('startsAt', 'asc'), limit(maxItems)),
    CALLER
  )
  return snap.docs.map(mapEvent)
}

export async function createRaceCalendarEvent(userId: string, input: RaceCalendarEventInput) {
  const now = new Date().toISOString()
  return trackedAddDoc(eventCollection(userId), {
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
}

export async function deleteRaceCalendarEvent(userId: string, eventId: string) {
  await trackedDeleteDoc(doc(db, 'users', userId, 'raceCalendar', eventId), CALLER)
}
