import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc } from '~/composables/useFirebaseTracker'

const CALLER = 'CoachDirectoryRepository'
const COACH_DIRECTORY_CACHE_TTL_MS = 60_000

export interface CoachDirectoryItem {
  uid: string
  firstName?: string
  lastName?: string
  nickname: string
  role?: string
}

const coachCache = new Map<string, { cachedAt: number; coach: CoachDirectoryItem | null }>()

export function clearCoachDirectoryCache(coachId?: string) {
  if (coachId) {
    coachCache.delete(coachId)
    return
  }

  coachCache.clear()
}

function mapCoachDoc(docSnap: any): CoachDirectoryItem {
  const data = docSnap.data() || {}
  return {
    uid: data.uid || docSnap.id,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    nickname: data.nickname || 'Coach',
    role: data.role || 'coach'
  }
}

export function getCoachDisplayName(coach: CoachDirectoryItem | null | undefined): string {
  if (!coach) return ''
  if (coach.firstName && coach.lastName) return `${coach.firstName} ${coach.lastName}`
  return coach.nickname || 'Coach'
}

export async function loadCoachById(coachId: string | null | undefined): Promise<CoachDirectoryItem | null> {
  if (!coachId) return null
  const cached = coachCache.get(coachId)
  if (cached && Date.now() - cached.cachedAt <= COACH_DIRECTORY_CACHE_TTL_MS) {
    return cached.coach
  }

  const snap = await trackedGetDoc(doc(db, 'publicProfiles', coachId), CALLER)
  if (!snap.exists()) {
    coachCache.set(coachId, { cachedAt: Date.now(), coach: null })
    return null
  }
  const data = snap.data() || {}
  const coach = {
    uid: data.uid || coachId,
    nickname: data.nickname || 'Coach',
    role: 'coach'
  }
  coachCache.set(coachId, { cachedAt: Date.now(), coach })
  return coach
}
