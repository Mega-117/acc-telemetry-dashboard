import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc } from '~/composables/useFirebaseTracker'

const CALLER = 'CoachDirectoryRepository'

export interface CoachDirectoryItem {
  uid: string
  firstName?: string
  lastName?: string
  nickname: string
  role?: string
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
  const snap = await trackedGetDoc(doc(db, 'publicProfiles', coachId), CALLER)
  if (!snap.exists()) return null
  const data = snap.data() || {}
  return {
    uid: data.uid || coachId,
    nickname: data.nickname || 'Coach',
    role: 'coach'
  }
}
