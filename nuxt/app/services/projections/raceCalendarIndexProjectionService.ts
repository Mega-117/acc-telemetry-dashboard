// PIP-441: sommario del calendario gare in un solo documento.
//
// `users/{uid}/raceCalendar/{eventId}` resta la fonte di verita' per le modifiche.
// `users/{uid}/raceCalendarIndex/v1` contiene fino a 25 eventi ordinati per data,
// cosi' Panoramica e profilo leggono un documento invece di una query. Logica pura:
// chi scrive lo mette nello stesso batch della mutazione.

export const RACE_CALENDAR_INDEX_SCHEMA_VERSION = 1
export const RACE_CALENDAR_INDEX_DOC_ID = 'v1'
export const RACE_CALENDAR_INDEX_MAX_EVENTS = 25

export function raceCalendarIndexPath(uid: string): string {
  return `users/${uid}/raceCalendarIndex/${RACE_CALENDAR_INDEX_DOC_ID}`
}

export interface RaceCalendarIndexEvent {
  id: string
  title: string
  startsAt: string
  trackName: string
  carName: string
  simGridUrl: string
  raceUrl: string
  createdBy: string
  createdByRole: string
  createdAt: string
  updatedAt: string
}

export interface RaceCalendarIndexDocument {
  version: number
  updatedAt: string
  events: RaceCalendarIndexEvent[]
  /** `true` quando esistono piu' eventi di quelli conservati nel sommario. */
  truncated: boolean
}

/** Stessa normalizzazione del lettore della collection: campi assenti o null diventano ''. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documento Firestore
export function normalizeRaceCalendarIndexEvent(id: string, data: any): RaceCalendarIndexEvent {
  const source = data || {}
  return {
    id,
    title: source.title || '',
    startsAt: source.startsAt || '',
    trackName: source.trackName || '',
    carName: source.carName || '',
    simGridUrl: source.simGridUrl || '',
    raceUrl: source.raceUrl || '',
    createdBy: source.createdBy || '',
    createdByRole: source.createdByRole || '',
    createdAt: source.createdAt || '',
    updatedAt: source.updatedAt || ''
  }
}

export function sortRaceCalendarEvents<T extends { startsAt: string; id: string }>(events: T[]): T[] {
  // Stesso ordine della query `orderBy('startsAt', 'asc')`; l'id rompe i pareggi in modo stabile.
  return [...events].sort((a, b) => (a.startsAt || '').localeCompare(b.startsAt || '') || a.id.localeCompare(b.id))
}

/**
 * Sommario da una lista di eventi. `knownComplete = false` indica che la lista e' un
 * prefisso (query limitata): il sommario resta valido solo per le prime `events.length` voci.
 */
export function buildRaceCalendarIndexDocument(
  events: Array<{ id: string } & Partial<RaceCalendarIndexEvent>>,
  options: { updatedAt?: string; knownComplete?: boolean } = {}
): RaceCalendarIndexDocument {
  const { updatedAt = new Date().toISOString(), knownComplete = true } = options
  const normalized = sortRaceCalendarEvents(events.map((event) => normalizeRaceCalendarIndexEvent(event.id, event)))
  const kept = normalized.slice(0, RACE_CALENDAR_INDEX_MAX_EVENTS)
  return {
    version: RACE_CALENDAR_INDEX_SCHEMA_VERSION,
    updatedAt,
    events: kept,
    truncated: !knownComplete || normalized.length > kept.length
  }
}

export type RaceCalendarIndexMutation =
  | { type: 'create'; event: { id: string } & Partial<RaceCalendarIndexEvent> }
  | { type: 'update'; eventId: string; patch: Partial<RaceCalendarIndexEvent> }
  | { type: 'delete'; eventId: string }

/**
 * Applica una mutazione a un sommario completo (non troncato) e ne restituisce uno nuovo.
 * Ritorna `null` se il sommario non basta a ricostruire il risultato (troncato, o
 * evento da aggiornare non presente): il chiamante deve ripartire dalla collection.
 */
export function applyRaceCalendarIndexMutation(
  indexDoc: RaceCalendarIndexDocument | null | undefined,
  mutation: RaceCalendarIndexMutation,
  updatedAt: string = new Date().toISOString()
): RaceCalendarIndexDocument | null {
  if (!isRaceCalendarIndexUsable(indexDoc) || indexDoc.truncated) return null
  const current = indexDoc.events
  if (mutation.type === 'create') {
    return buildRaceCalendarIndexDocument([...current.filter((event) => event.id !== mutation.event.id), mutation.event], { updatedAt })
  }
  if (mutation.type === 'update') {
    const existing = current.find((event) => event.id === mutation.eventId)
    if (!existing) return null
    const patched = { ...existing, ...mutation.patch, id: existing.id }
    return buildRaceCalendarIndexDocument(current.map((event) => (event.id === mutation.eventId ? patched : event)), { updatedAt })
  }
  return buildRaceCalendarIndexDocument(current.filter((event) => event.id !== mutation.eventId), { updatedAt })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documento Firestore
export function isRaceCalendarIndexUsable(indexDoc: any): indexDoc is RaceCalendarIndexDocument {
  return !!indexDoc
    && Number(indexDoc.version || 0) === RACE_CALENDAR_INDEX_SCHEMA_VERSION
    && Array.isArray(indexDoc.events)
    && typeof indexDoc.truncated === 'boolean'
}

/** Il sommario basta per `maxItems` voci se non e' troncato o se ne conserva almeno `maxItems`. */
export function canServeRaceCalendarFromIndex(indexDoc: RaceCalendarIndexDocument, maxItems: number): boolean {
  return !indexDoc.truncated || indexDoc.events.length >= maxItems
}
