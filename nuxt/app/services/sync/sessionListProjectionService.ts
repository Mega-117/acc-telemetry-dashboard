import { doc } from 'firebase/firestore'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { getCarCategory, type CarCategory, type SessionDocument } from '~/composables/useTelemetryData'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'

export const SESSION_LIST_PROJECTION_SCHEMA_VERSION = 1
export const SESSION_LIST_PROJECTION_PAGE_SIZE = 100
const SESSION_LIST_CACHE_TTL_MS = 60_000

export type SessionListProjectionEntry = {
  id: string
  date: string
  track: string
  trackKey: string
  car: string
  carKey: string
  carCategory: CarCategory
  type: number
  laps: number
  lapsValid: number
  stintCount: number
  bestLapMs: number | null
  bestQualyMs: number | null
  bestRaceMs: number | null
  bestSessionRaceMs: number | null
  bestRulesVersion: number
  hasLaps: boolean
  totalTimeMs: number
}

export type SessionListProjectionMeta = {
  schemaVersion: number
  pageSize: number
  totalSessions: number
  pageCount: number
  pageKeys: string[]
  updatedAt: string
}

type SessionListProjectionPage = {
  schemaVersion: number
  pageKey: string
  pageIndex: number
  pageSize: number
  items: SessionListProjectionEntry[]
  updatedAt: string
}

type ProjectionCacheEntry = {
  cachedAt: number
  sessions: SessionDocument[]
}

const projectionCache = new Map<string, ProjectionCacheEntry>()

export function normalizeSessionListKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function createSessionListEntry(session: SessionDocument): SessionListProjectionEntry {
  const summary = session.summary || {}
  const bestRulesVersion = Number(summary.best_rules_version || BEST_RULES_VERSION)
  const raceRuleCompatible = bestRulesVersion >= BEST_RULES_VERSION
  const track = session.meta?.track || ''
  const car = session.meta?.car || ''
  const laps = Number(summary.laps || 0)

  return {
    id: session.sessionId,
    date: session.meta?.date_start || '',
    track,
    trackKey: normalizeSessionListKey(track),
    car,
    carKey: normalizeSessionListKey(car),
    carCategory: getCarCategory(car),
    type: Number(session.meta?.session_type ?? 0),
    laps,
    lapsValid: Number(summary.lapsValid || 0),
    stintCount: Number(summary.stintCount || 0),
    bestLapMs: summary.bestLap || null,
    bestQualyMs: summary.best_qualy_ms || null,
    bestSessionRaceMs: summary.best_session_race_ms || null,
    bestRaceMs: raceRuleCompatible ? (summary.best_race_ms || null) : null,
    bestRulesVersion,
    hasLaps: laps > 0,
    totalTimeMs: Number(summary.totalTime || 0)
  }
}

export function createSessionListEntryFromDelta(delta: {
  sessionId: string
  dateStart?: string | null
  trackId?: string | null
  car?: string | null
  sessionType?: number | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  summary?: any
}): SessionListProjectionEntry {
  const summary = delta.summary || {}
  const bestRulesVersion = Number(summary.best_rules_version || BEST_RULES_VERSION)
  const raceRuleCompatible = bestRulesVersion >= BEST_RULES_VERSION
  const track = delta.trackId || ''
  const car = delta.car || ''
  const laps = Number(summary.laps || 0)

  return {
    id: delta.sessionId,
    date: delta.dateStart || '',
    track,
    trackKey: normalizeSessionListKey(track),
    car,
    carKey: normalizeSessionListKey(car),
    carCategory: getCarCategory(car),
    type: Number(delta.sessionType ?? summary.sessionType ?? summary.session_type ?? 0),
    laps,
    lapsValid: Number(summary.lapsValid || 0),
    stintCount: Number(summary.stintCount || 0),
    bestLapMs: summary.bestLap || null,
    bestQualyMs: summary.best_qualy_ms || null,
    bestSessionRaceMs: summary.best_session_race_ms || null,
    bestRaceMs: raceRuleCompatible ? (summary.best_race_ms || null) : null,
    bestRulesVersion,
    hasLaps: laps > 0,
    totalTimeMs: Number(summary.totalTime || 0)
  }
}

export function sessionListEntryToSessionDocument(entry: SessionListProjectionEntry): SessionDocument {
  return {
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
      laps: entry.laps,
      lapsValid: entry.lapsValid,
      bestLap: entry.bestLapMs,
      avgCleanLap: null,
      totalTime: entry.totalTimeMs,
      stintCount: entry.stintCount,
      best_qualy_ms: entry.bestQualyMs,
      best_session_race_ms: entry.bestSessionRaceMs,
      best_race_ms: entry.bestRaceMs,
      best_rules_version: entry.bestRulesVersion
    },
    rawChunkCount: 0,
    rawSizeBytes: 0,
    source: 'cloud',
    syncState: 'synced'
  } as SessionDocument
}

function pageKey(pageIndex: number): string {
  return `p${String(pageIndex).padStart(4, '0')}`
}

function sortEntries(entries: SessionListProjectionEntry[]): SessionListProjectionEntry[] {
  return [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

function buildProjectionDocsFromEntries(
  entriesInput: SessionListProjectionEntry[],
  nowIso = new Date().toISOString()
): { meta: SessionListProjectionMeta; pages: SessionListProjectionPage[] } {
  const entries = sortEntries(entriesInput.filter((entry) => !!entry.id))
  const pages: SessionListProjectionPage[] = []

  for (let start = 0; start < entries.length; start += SESSION_LIST_PROJECTION_PAGE_SIZE) {
    const pageIndex = pages.length
    const key = pageKey(pageIndex)
    pages.push({
      schemaVersion: SESSION_LIST_PROJECTION_SCHEMA_VERSION,
      pageKey: key,
      pageIndex,
      pageSize: SESSION_LIST_PROJECTION_PAGE_SIZE,
      items: entries.slice(start, start + SESSION_LIST_PROJECTION_PAGE_SIZE),
      updatedAt: nowIso
    })
  }

  const pageKeys = pages.map((page) => page.pageKey)
  return {
    meta: {
      schemaVersion: SESSION_LIST_PROJECTION_SCHEMA_VERSION,
      pageSize: SESSION_LIST_PROJECTION_PAGE_SIZE,
      totalSessions: entries.length,
      pageCount: pages.length,
      pageKeys,
      updatedAt: nowIso
    },
    pages
  }
}

export function buildSessionListProjection(sessions: SessionDocument[], now = new Date()) {
  return buildProjectionDocsFromEntries(sessions.map(createSessionListEntry), now.toISOString())
}

export async function writeSessionListProjectionDocuments(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  uid: string
  sessions: SessionDocument[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  docFn?: (db: any, path: string) => any
}) {
  const { db, uid, sessions, setDocFn, docFn = doc } = params
  const projection = buildSessionListProjection(sessions)

  await setDocFn(
    docFn(db, `users/${uid}/sessionListMeta/v1`),
    sanitizeForFirestore(projection.meta),
    { merge: true }
  )

  for (const page of projection.pages) {
    await setDocFn(
      docFn(db, `users/${uid}/sessionListPages/${page.pageKey}`),
      sanitizeForFirestore(page),
      { merge: true }
    )
  }

  projectionCache.delete(uid)
  return projection
}

async function readSessionListProjectionDocs(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  uid: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  getDocFn: (ref: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  docFn?: (db: any, path: string) => any
}): Promise<{ meta: SessionListProjectionMeta; pages: SessionListProjectionPage[] } | null> {
  const { db, uid, getDocFn, docFn = doc } = params
  const metaSnap = await getDocFn(docFn(db, `users/${uid}/sessionListMeta/v1`))
  if (!metaSnap.exists()) return null

  const meta = metaSnap.data() as SessionListProjectionMeta
  if (Number(meta?.schemaVersion || 0) !== SESSION_LIST_PROJECTION_SCHEMA_VERSION) return null
  if (Number(meta?.pageSize || 0) !== SESSION_LIST_PROJECTION_PAGE_SIZE) return null
  if (!Array.isArray(meta?.pageKeys)) return null

  const pageSnaps = await Promise.all(
    meta.pageKeys.map((key) => getDocFn(docFn(db, `users/${uid}/sessionListPages/${key}`)))
  )
  const pages: SessionListProjectionPage[] = []

  for (const pageSnap of pageSnaps) {
    if (!pageSnap.exists()) return null
    const page = pageSnap.data() as SessionListProjectionPage
    if (Number(page?.schemaVersion || 0) !== SESSION_LIST_PROJECTION_SCHEMA_VERSION) return null
    if (!Array.isArray(page?.items)) return null
    pages.push(page)
  }

  const itemCount = pages.reduce((sum, page) => sum + page.items.length, 0)
  if (itemCount !== Number(meta.totalSessions || 0)) return null

  return { meta, pages: pages.sort((a, b) => a.pageIndex - b.pageIndex) }
}

export async function loadSessionListProjection(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  uid: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  getDocFn: (ref: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  docFn?: (db: any, path: string) => any
}): Promise<SessionDocument[] | null> {
  const cached = projectionCache.get(params.uid)
  if (cached && Date.now() - cached.cachedAt <= SESSION_LIST_CACHE_TTL_MS) {
    return cached.sessions
  }

  const docs = await readSessionListProjectionDocs(params)
  if (!docs) return null

  const sessions = sortEntries(docs.pages.flatMap((page) => page.items)).map(sessionListEntryToSessionDocument)
  projectionCache.set(params.uid, { cachedAt: Date.now(), sessions })
  return sessions
}

export async function applySessionListProjectionDeltas(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  uid: string
  deltas: Array<{
    sessionId: string
    dateStart?: string | null
    trackId?: string | null
    car?: string | null
    sessionType?: number | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    summary?: any
  }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  getDocFn: (ref: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  setDocFn: (ref: any, data: any, options?: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  docFn?: (db: any, path: string) => any
}): Promise<{ wrote: boolean; totalSessions: number }> {
  const { db, uid, deltas, getDocFn, setDocFn, docFn = doc } = params
  if (deltas.length === 0) return { wrote: false, totalSessions: 0 }

  const existing = await readSessionListProjectionDocs({ db, uid, getDocFn, docFn })
  if (!existing) return { wrote: false, totalSessions: 0 }

  const byId = new Map<string, SessionListProjectionEntry>()
  for (const page of existing.pages) {
    for (const entry of page.items || []) {
      if (entry?.id) byId.set(entry.id, entry)
    }
  }
  for (const delta of deltas) {
    byId.set(delta.sessionId, createSessionListEntryFromDelta(delta))
  }

  const projection = buildProjectionDocsFromEntries(Array.from(byId.values()))
  await setDocFn(
    docFn(db, `users/${uid}/sessionListMeta/v1`),
    sanitizeForFirestore(projection.meta),
    { merge: true }
  )

  const oldPagesByKey = new Map(existing.pages.map((page) => [page.pageKey, JSON.stringify(page.items || [])]))
  for (const page of projection.pages) {
    const nextItems = JSON.stringify(page.items || [])
    if (oldPagesByKey.get(page.pageKey) === nextItems) continue
    await setDocFn(
      docFn(db, `users/${uid}/sessionListPages/${page.pageKey}`),
      sanitizeForFirestore(page),
      { merge: true }
    )
  }

  projectionCache.delete(uid)
  return { wrote: true, totalSessions: projection.meta.totalSessions }
}

export function clearSessionListProjectionCache(uid?: string) {
  if (uid) {
    projectionCache.delete(uid)
    return
  }
  projectionCache.clear()
}
