import { collection, documentId, query, where } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDocs } from '~/composables/useFirebaseTracker'

const WEEK = 7 * 24 * 60 * 60 * 1000
const TTL = 5 * 60 * 1000
type Entry = { id?: string; date?: string }
export interface ActivityIndex {
  sessionsList?: Entry[]
  totalSessions?: number
  updatedAt?: string
}
export interface AdminActivity {
  count: number | null
  partial: boolean
  updatedAt: string | null
}

/** Counts known synchronized sessions, never assumes missing records mean zero. */
export function summarizeAdminActivity(index: ActivityIndex | null, now = Date.now()): AdminActivity {
  const unknown = { count: null, partial: true, updatedAt: index?.updatedAt || null }
  if (!Array.isArray(index?.sessionsList)) return unknown
  const entries = [...new Map(index.sessionsList.map((entry, i) => [entry.id || `missing-${i}`, entry])).values()]
  const times = entries.map(entry => Date.parse(entry.date || ''))
  const invalid = times.some(time => !Number.isFinite(time) || time > now)
  const dated = times.filter(time => Number.isFinite(time) && time <= now)
  const complete = !invalid && (Number.isFinite(index.totalSessions) && index.totalSessions! === entries.length
    || dated.some(time => time < now - WEEK))
  return {
    count: dated.filter(time => time >= now - WEEK).length,
    partial: !complete,
    updatedAt: index.updatedAt || null
  }
}

// Bounded, viewer-scoped memory only; a different viewer invalidates the cache.
let viewer = ''
const cache = new Map<string, { fetchedAt: number; index: ActivityIndex | null }>()
export async function loadAdminActivityIndexes(viewerUid: string, uids: string[]): Promise<Map<string, ActivityIndex | null>> {
  if (viewer !== viewerUid) { cache.clear(); viewer = viewerUid }
  const requested = [...new Set(uids)].slice(0, 25)
  const now = Date.now()
  const missing = requested.filter(uid => !cache.has(uid) || now - cache.get(uid)!.fetchedAt >= TTL)
  if (missing.length) {
    const snapshot = await trackedGetDocs(query(collection(db, 'users'), where(documentId(), 'in', missing)), 'AdminActivity')
    if (viewer !== viewerUid) return new Map()
    const found = new Map(snapshot.docs.map(doc => [doc.id, doc.data().sessionIndex as ActivityIndex | undefined]))
    for (const uid of missing) cache.set(uid, { fetchedAt: now, index: found.get(uid) || null })
    while (cache.size > 50) cache.delete(cache.keys().next().value!)
  }
  return new Map(requested.map(uid => [uid, cache.get(uid)?.index || null]))
}
