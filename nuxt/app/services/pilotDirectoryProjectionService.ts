import { doc } from 'firebase/firestore'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'
import { buildPilotDirectoryDocument, PILOT_DIRECTORY_SCHEMA_VERSION } from '~/utils/pilotDirectoryFields'

export interface PilotDirectoryUserData {
  uid?: string
  firstName?: string
  lastName?: string
  nickname?: string
  email?: string | null
  role?: string | null
  coachId?: string | null
  stats?: {
    sessionsLast7Days?: number
    lastSessionDate?: string | null
  }
  sessionsLast7Days?: number
  lastSessionDate?: string | null
  suiteVersion?: string | null
  suiteVersionUpdatedAt?: string | null
}

export interface PilotDirectoryActivityFields {
  sessionsLast7Days?: number
  lastSessionDate?: string | null
  suiteVersion?: string | null
  suiteVersionUpdatedAt?: string | null
}

export interface PilotDirectoryRepairResult {
  uid: string
  wrote: boolean
  reason?: 'missing_user'
}

type FirestoreDocFn = (db: any, path: string) => any
type FirestoreGetDocFn = (ref: any) => Promise<any>
type FirestoreSetDocFn = (ref: any, data: any, options?: any) => Promise<any>

export function buildPilotDirectoryProjection(uid: string, userData: PilotDirectoryUserData) {
  return buildPilotDirectoryDocument({
    uid,
    firstName: userData.firstName || '',
    lastName: userData.lastName || '',
    nickname: userData.nickname || '',
    email: userData.email || '',
    role: userData.role || 'pilot',
    coachId: userData.coachId || null,
    sessionsLast7Days: userData.stats?.sessionsLast7Days ?? userData.sessionsLast7Days ?? 0,
    lastSessionDate: userData.stats?.lastSessionDate ?? userData.lastSessionDate ?? null,
    suiteVersion: userData.suiteVersion || null,
    suiteVersionUpdatedAt: userData.suiteVersionUpdatedAt || null
  })
}

export async function writePilotDirectoryFromUser(params: {
  db: any
  uid: string
  userData: PilotDirectoryUserData
  setDocFn: FirestoreSetDocFn
  docFn?: FirestoreDocFn
}) {
  const { db, uid, userData, setDocFn, docFn = doc } = params
  await setDocFn(
    docFn(db, `pilotDirectory/${uid}`),
    sanitizeForFirestore(buildPilotDirectoryProjection(uid, userData)),
    { merge: true }
  )
}

export async function repairPilotDirectoryFromUser(params: {
  db: any
  uid: string
  getDocFn: FirestoreGetDocFn
  setDocFn: FirestoreSetDocFn
  docFn?: FirestoreDocFn
}): Promise<PilotDirectoryRepairResult> {
  const { db, uid, getDocFn, setDocFn, docFn = doc } = params
  const userSnap = await getDocFn(docFn(db, `users/${uid}`))
  if (!userSnap.exists()) {
    return { uid, wrote: false, reason: 'missing_user' }
  }

  await writePilotDirectoryFromUser({
    db,
    uid,
    userData: { uid, ...(userSnap.data() || {}) },
    setDocFn,
    docFn
  })

  return { uid, wrote: true }
}

export async function updatePilotDirectoryActivity(params: {
  db: any
  uid: string
  fields: PilotDirectoryActivityFields
  setDocFn: FirestoreSetDocFn
  docFn?: FirestoreDocFn
}) {
  const { db, uid, fields, setDocFn, docFn = doc } = params
  await setDocFn(docFn(db, `pilotDirectory/${uid}`), sanitizeForFirestore({
    schemaVersion: PILOT_DIRECTORY_SCHEMA_VERSION,
    uid,
    ...fields
  }), { merge: true })
}
