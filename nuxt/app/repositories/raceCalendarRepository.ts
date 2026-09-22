import { collection, doc, limit, orderBy, query } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedGetDocs, trackedSetDoc, trackedWriteBatch } from '~/composables/useFirebaseTracker'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { checkFirebaseCacheFreshness, recordFirebaseJournalEvent } from '~/services/monitoring/firebaseOpsJournal'
import { RACE_CALENDAR_CACHE_TTL_MS } from '~/services/cache/cachePolicy'
import { notifyOwnerCacheChanged } from '~/services/cache/ownerCacheSignals'
import {
  RACE_CALENDAR_INDEX_MAX_EVENTS,
  applyRaceCalendarIndexMutation,
  buildRaceCalendarIndexDocument,
  canServeRaceCalendarFromIndex,
  isRaceCalendarIndexUsable,
  normalizeRaceCalendarIndexEvent,
  raceCalendarIndexPath,
  type RaceCalendarIndexDocument,
  type RaceCalendarIndexMutation
} from '~/services/projections/raceCalendarIndexProjectionService'

const CALLER = 'RaceCalendarRepository'

type CalendarCacheEntry = {
  cachedAt: number
  events: RaceCalendarEvent[]
}

type SummaryCacheEntry = {
  cachedAt: number
  /** `null` = sommario assente o con versione non usabile. */
  summary: RaceCalendarIndexDocument | null
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

function summaryRef(userId: string) {
  return doc(db, raceCalendarIndexPath(userId))
}

const eventsCache = new Map<string, CalendarCacheEntry>()
// PIP-441: ultimo sommario `raceCalendarIndex/v1` letto o scritto da questo client.
const summaryCache = new Map<string, SummaryCacheEntry>()

function cacheKey(userId: string, maxItems: number) {
  return `${userId}:${maxItems}`
}

export function clearRaceCalendarCache(userId?: string) {
  if (!userId) {
    eventsCache.clear()
    summaryCache.clear()
    return
  }

  summaryCache.delete(userId)
  for (const key of Array.from(eventsCache.keys())) {
    if (key.startsWith(`${userId}:`)) eventsCache.delete(key)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- QueryDocumentSnapshot
function mapEvent(docSnap: any): RaceCalendarEvent {
  return normalizeRaceCalendarIndexEvent(docSnap.id, docSnap.data()) as RaceCalendarEvent
}

function resolveCurrentUid(): string | null {
  try {
    return useFirebaseAuth().currentUser.value?.uid || null
  } catch {
    // Il composable auth puo' mancare in test isolati: nessuna riparazione del sommario.
    return null
  }
}

function rememberSummary(userId: string, summary: RaceCalendarIndexDocument | null, cachedAt = Date.now()) {
  summaryCache.set(userId, { cachedAt, summary })
  // PIP-442: un sommario valido (letto o appena scritto) merita il salvataggio su disco.
  if (summary) notifyOwnerCacheChanged(userId)
  return summary
}

/**
 * PIP-442: idrata il sommario dal file locale conservando l'istante di lettura originale,
 * cosi' il TTL del calendario (scrivibile anche dal coach) resta quello di sempre.
 */
export function hydrateRaceCalendarSummary(userId: string, input: { summary: unknown; cachedAt: number }): boolean {
  if (!isRaceCalendarIndexUsable(input.summary)) return false
  summaryCache.set(userId, { cachedAt: input.cachedAt, summary: input.summary })
  recordFirebaseJournalEvent({ kind: 'cache', cache: 'raceCalendar.index', reason: 'disk' })
  return true
}

/** Sommario in cache da salvare su disco; `null` se assente o non usabile. */
export function exportRaceCalendarSummary(userId: string): { summary: RaceCalendarIndexDocument; cachedAt: number } | null {
  const cached = summaryCache.get(userId)
  return cached?.summary ? { summary: cached.summary, cachedAt: cached.cachedAt } : null
}

/** Una lettura per tutto il calendario; `null` quando il sommario manca o e' vecchio. */
async function loadSummary(userId: string): Promise<RaceCalendarIndexDocument | null> {
  const cached = summaryCache.get(userId)
  if (checkFirebaseCacheFreshness('raceCalendar.index', cached?.cachedAt, RACE_CALENDAR_CACHE_TTL_MS) && cached) {
    return cached.summary
  }
  let data: unknown = null
  try {
    const snap = await trackedGetDoc(summaryRef(userId), CALLER)
    data = snap.exists() ? snap.data() : null
  } catch (error) {
    // Degradazione: rules non ancora pubblicate o rete assente -> query come prima di PIP-441.
    console.warn('[RACE_CALENDAR] raceCalendarIndex unavailable, falling back to query:', error)
  }
  return rememberSummary(userId, isRaceCalendarIndexUsable(data) ? data : null)
}

async function queryEvents(userId: string, maxItems: number): Promise<RaceCalendarEvent[]> {
  const snap = await trackedGetDocs(
    query(eventCollection(userId), orderBy('startsAt', 'asc'), limit(maxItems)),
    CALLER
  )
  return snap.docs.map(mapEvent)
}

export async function loadRaceCalendarEvents(userId: string, maxItems = 25): Promise<RaceCalendarEvent[]> {
  const key = cacheKey(userId, maxItems)
  const cached = eventsCache.get(key)
  if (checkFirebaseCacheFreshness('raceCalendar', cached?.cachedAt, RACE_CALENDAR_CACHE_TTL_MS) && cached) {
    return cached.events
  }

  const summary = await loadSummary(userId)
  if (summary && canServeRaceCalendarFromIndex(summary, maxItems)) {
    const events = summary.events.slice(0, maxItems) as RaceCalendarEvent[]
    eventsCache.set(key, { cachedAt: Date.now(), events })
    return events
  }

  // Fallback (sommario assente/vecchio): la query come prima di PIP-441. L'owner ne
  // approfitta per scrivere il sommario una volta, cosi' il prossimo avvio costa 1 lettura.
  const isOwner = resolveCurrentUid() === userId
  const fetchLimit = isOwner ? Math.max(maxItems, RACE_CALENDAR_INDEX_MAX_EVENTS + 1) : maxItems
  const fetched = await queryEvents(userId, fetchLimit)
  if (isOwner) {
    const rebuilt = buildRaceCalendarIndexDocument(fetched, { knownComplete: fetched.length <= RACE_CALENDAR_INDEX_MAX_EVENTS })
    try {
      await trackedSetDoc(summaryRef(userId), rebuilt, CALLER)
      rememberSummary(userId, rebuilt)
    } catch (error) {
      console.warn('[RACE_CALENDAR] Unable to repair raceCalendarIndex:', error)
    }
  }
  const events = fetched.slice(0, maxItems)
  eventsCache.set(key, { cachedAt: Date.now(), events })
  return events
}

/**
 * Sommario dopo una mutazione, senza scriverlo. Parte dal sommario noto (cache o 1
 * lettura); se non basta (troncato o evento sconosciuto) riparte dalla collection.
 */
async function buildSummaryAfterMutation(
  userId: string,
  mutation: RaceCalendarIndexMutation,
  updatedAt: string
): Promise<RaceCalendarIndexDocument> {
  const current = await loadSummary(userId)
  const applied = applyRaceCalendarIndexMutation(current, mutation, updatedAt)
  if (applied) return applied

  const fetched = await queryEvents(userId, RACE_CALENDAR_INDEX_MAX_EVENTS + 1)
  const complete = buildRaceCalendarIndexDocument(fetched, { updatedAt, knownComplete: fetched.length <= RACE_CALENDAR_INDEX_MAX_EVENTS })
  // La lista letta puo' essere un prefisso: applichiamo la mutazione a mano e
  // conserviamo il flag `truncated` della lettura.
  const mutated = applyRaceCalendarIndexMutation({ ...complete, truncated: false }, mutation, updatedAt)
    || buildRaceCalendarIndexDocument(fetched, { updatedAt })
  return { ...mutated, truncated: mutated.truncated || complete.truncated }
}

function buildEventPayload(input: RaceCalendarEventInput, now: string) {
  return {
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
  }
}

function afterMutation(userId: string, summary: RaceCalendarIndexDocument) {
  clearRaceCalendarCache(userId)
  // Questo client ha appena scritto il sommario: la prossima lettura non costa nulla.
  rememberSummary(userId, summary)
}

export async function createRaceCalendarEvent(userId: string, input: RaceCalendarEventInput) {
  const now = new Date().toISOString()
  const payload = buildEventPayload(input, now)
  const eventRef = doc(eventCollection(userId))
  const summary = await buildSummaryAfterMutation(userId, {
    type: 'create',
    event: normalizeRaceCalendarIndexEvent(eventRef.id, payload)
  }, now)

  // Evento e sommario nello stesso batch: mai un calendario con sommario disallineato.
  const batch = trackedWriteBatch(db, CALLER)
  batch.set(eventRef, payload)
  batch.set(summaryRef(userId), summary)
  await batch.commit()
  afterMutation(userId, summary)
  return eventRef
}

export async function updateRaceCalendarEvent(userId: string, eventId: string, input: RaceCalendarEventInput) {
  const now = new Date().toISOString()
  const patch = {
    title: input.title.trim(),
    startsAt: input.startsAt,
    trackName: input.trackName.trim(),
    carName: input.carName?.trim() || null,
    simGridUrl: input.simGridUrl?.trim() || null,
    raceUrl: input.raceUrl?.trim() || null,
    updatedAt: now
  }
  const summary = await buildSummaryAfterMutation(userId, {
    type: 'update',
    eventId,
    // Solo i campi modificabili, normalizzati come il lettore ('' al posto di null).
    patch: {
      title: patch.title,
      startsAt: patch.startsAt,
      trackName: patch.trackName,
      carName: patch.carName || '',
      simGridUrl: patch.simGridUrl || '',
      raceUrl: patch.raceUrl || '',
      updatedAt: now
    }
  }, now)

  const batch = trackedWriteBatch(db, CALLER)
  batch.update(doc(db, 'users', userId, 'raceCalendar', eventId), patch)
  batch.set(summaryRef(userId), summary)
  await batch.commit()
  afterMutation(userId, summary)
}

export async function deleteRaceCalendarEvent(userId: string, eventId: string) {
  const now = new Date().toISOString()
  const summary = await buildSummaryAfterMutation(userId, { type: 'delete', eventId }, now)

  const batch = trackedWriteBatch(db, CALLER)
  batch.delete(doc(db, 'users', userId, 'raceCalendar', eventId))
  batch.set(summaryRef(userId), summary)
  await batch.commit()
  afterMutation(userId, summary)
}
