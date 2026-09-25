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
  clientRuntime?: {
    channel?: string | null
    updateState?: string | null
    lastHeartbeatAt?: string | null
  }
}

export interface PilotDirectoryActivityFields {
  sessionsLast7Days?: number
  lastSessionDate?: string | null
  suiteVersion?: string | null
  suiteVersionUpdatedAt?: string | null
  clientChannel?: string | null
  clientUpdateState?: string | null
  clientLastHeartbeatAt?: string | null
}

export interface PilotDirectoryRepairResult {
  uid: string
  wrote: boolean
  reason?: 'missing_user'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
type FirestoreDocFn = (db: any, path: string) => any
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
type FirestoreGetDocFn = (ref: any) => Promise<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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
    suiteVersionUpdatedAt: userData.suiteVersionUpdatedAt || null,
    clientChannel: userData.clientRuntime?.channel || null,
    clientUpdateState: userData.clientRuntime?.updateState || null,
    clientLastHeartbeatAt: userData.clientRuntime?.lastHeartbeatAt || null
  })
}

export async function writePilotDirectoryFromUser(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  uid: string
  /** Lettore esplicito (test, strumenti dev); senza, il documento owner condiviso (PIP-442). */
  getDocFn?: FirestoreGetDocFn
  setDocFn: FirestoreSetDocFn
  docFn?: FirestoreDocFn
}): Promise<PilotDirectoryRepairResult> {
  const { db, uid, getDocFn, setDocFn, docFn = doc } = params
  let userData: Record<string, unknown> | null = null
  if (getDocFn) {
    const userSnap = await getDocFn(docFn(db, `users/${uid}`))
    userData = userSnap.exists() ? (userSnap.data() || {}) : null
  } else {
    // Import pigro: questo servizio resta puro (nessun Firestore a livello di modulo) per
    // i chiamanti della sync che iniettano il proprio lettore.
    const { loadOwnerDocument } = await import('~/repositories/ownerDocumentRepository')
    const snapshot = await loadOwnerDocument(uid, { caller: 'PilotDirectoryProjection' })
    userData = snapshot.exists ? (snapshot.data || {}) : null
  }
  if (!userData) {
    return { uid, wrote: false, reason: 'missing_user' }
  }

  await writePilotDirectoryFromUser({
    db,
    uid,
    userData: { uid, ...userData },
    setDocFn,
    docFn
  })

  return { uid, wrote: true }
}

export async function updatePilotDirectoryActivity(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  uid: string
  fields: PilotDirectoryActivityFields
  setDocFn: FirestoreSetDocFn
  docFn?: FirestoreDocFn
}) {
  const { db, uid, fields, setDocFn, docFn = doc } = params
  await setDocFn(docFn(db, `pilotDirectory/${uid}`), buildPilotDirectoryActivityDocument(uid, fields), { merge: true })
}

export function buildPilotDirectoryActivityDocument(uid: string, fields: PilotDirectoryActivityFields) {
  return sanitizeForFirestore({
    schemaVersion: PILOT_DIRECTORY_SCHEMA_VERSION,
    uid,
    ...fields
  })
}
