import { collection, limit, orderBy, query, startAfter, where, type DocumentSnapshot, type QueryConstraint } from 'firebase/firestore'
import { trackedGetCountFromServer, trackedGetDocs } from '~/composables/useFirebaseTracker'
import { db } from '~/config/firebase'
import { normalizePilotDirectoryText } from '~/utils/pilotDirectoryFields'

const CALLER = 'PilotDirectoryRepository'

export const PILOT_PAGE_SIZE = 25

export interface PilotDirectoryItem {
  uid: string
  firstName?: string
  lastName?: string
  nickname: string
  role?: string
  coachId?: string
  lastSession?: string
  totalSessions?: number
  suiteVersion?: string
  suiteVersionUpdatedAt?: string
}

export interface PilotDirectoryPage {
  pilots: PilotDirectoryItem[]
  nextCursor: DocumentSnapshot | null
  hasNext: boolean
}

function buildDirectoryConstraints(params: {
  role: 'admin' | 'coach'
  currentUserId: string
  searchTerm?: string
  includeOrdering: boolean
}) {
  const constraints: QueryConstraint[] = []
  const search = normalizePilotDirectoryText(params.searchTerm)

  if (params.role === 'coach') {
    constraints.push(where('role', '==', 'pilot'))
    constraints.push(where('coachId', '==', params.currentUserId))
  }

  if (search) {
    constraints.push(where('searchPrefixes', 'array-contains', search))
  }

  if (params.includeOrdering) {
    constraints.push(orderBy('directorySortName', 'asc'))
  }

  return constraints
}

function mapPilotDoc(docSnap: any): PilotDirectoryItem {
  const data = docSnap.data() || {}
  return {
    uid: data.uid || docSnap.id,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    nickname: data.nickname || 'Utente',
    role: data.role || 'pilot',
    coachId: data.coachId || null,
    lastSession: data.lastSessionDate || undefined,
    totalSessions: data.sessionsLast7Days ?? 0,
    suiteVersion: data.suiteVersion || undefined,
    suiteVersionUpdatedAt: data.suiteVersionUpdatedAt || undefined
  }
}

export async function loadPilotDirectoryPage(params: {
  role: 'admin' | 'coach'
  currentUserId: string
  pageSize?: number
  cursor?: DocumentSnapshot | null
  searchTerm?: string
}): Promise<PilotDirectoryPage> {
  const pageSize = params.pageSize || PILOT_PAGE_SIZE
  const fetchLimit = pageSize + 1 + (params.role === 'admin' ? 1 : 0)
  const constraints = buildDirectoryConstraints({
    role: params.role,
    currentUserId: params.currentUserId,
    searchTerm: params.searchTerm,
    includeOrdering: true
  })

  if (params.cursor) {
    constraints.push(startAfter(params.cursor))
  }
  constraints.push(limit(fetchLimit))

  const snap = await trackedGetDocs(query(collection(db, 'pilotDirectory'), ...constraints), CALLER)
  const docs = snap.docs || []
  const visibleDocs = docs.filter((docSnap: any) => params.role !== 'admin' || docSnap.id !== params.currentUserId)
  const pageDocs = visibleDocs.slice(0, pageSize)

  return {
    pilots: pageDocs.map(mapPilotDoc),
    nextCursor: (pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null) as DocumentSnapshot | null,
    hasNext: visibleDocs.length > pageSize
  }
}

export async function countPilotDirectory(params: {
  role: 'admin' | 'coach'
  currentUserId: string
  searchTerm?: string
}): Promise<number> {
  const constraints = buildDirectoryConstraints({
    role: params.role,
    currentUserId: params.currentUserId,
    searchTerm: params.searchTerm,
    includeOrdering: false
  })
  const snap = await trackedGetCountFromServer(query(collection(db, 'pilotDirectory'), ...constraints), CALLER)
  const rawCount = Number(snap.data().count || 0)
  if (params.role === 'admin' && !normalizePilotDirectoryText(params.searchTerm)) {
    return Math.max(0, rawCount - 1)
  }
  return rawCount
}
