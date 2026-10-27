// PIP-658: "Cancella account". Everything about the user goes, in an order that can be repeated after an
// interruption (closed window, lost connection): online archive first (Worker), then the Firestore
// documents (subcollections before the profile), the Auth account last, so until the very end the user can
// sign in again and finish. Files on the PC (sessions, laps) stay: they belong to the user, who deletes them.
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential, type User } from 'firebase/auth'
import { collection, deleteDoc, doc, getDocs, limit, query, writeBatch, type Firestore } from 'firebase/firestore'

/** Every subcollection under users/{uid} (firestore.rules); sessions also hold rawChunks. */
export const USER_SUBCOLLECTIONS = ['sessions', 'uploads', 'trackBests', 'trackBestsIndex', 'trackDetailProjections',
  'trackProjections', 'sessionListMeta', 'sessionListPages', 'activities', 'diagnostics', 'raceCalendar',
  'raceCalendarIndex', 'coachLessons', 'runtimeInstallations', 'notifications'] as const

export type DeletionStep = 'verify' | 'archive' | 'documents' | 'profile' | 'account' | 'done'

export interface AccountDeletionDeps {
  db: Firestore
  workerOrigin: string
  fetchImpl?: typeof fetch
  onStep?: (step: DeletionStep) => void
}

async function deleteCollection(db: Firestore, path: string, onDoc?: (id: string) => Promise<void>) {
  for (;;) {
    const page = await getDocs(query(collection(db, path), limit(300)))
    if (page.empty) return
    if (onDoc) for (const item of page.docs) await onDoc(item.id)
    const batch = writeBatch(db)
    for (const item of page.docs) batch.delete(item.ref)
    await batch.commit()
  }
}

/** Removes the Worker's copy (laps, shared links, library, usage); the Worker answers 202 until complete. */
async function deleteArchive(user: User, deps: AccountDeletionDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch
  for (let round = 0; round < 40; round++) {
    const response = await fetchImpl(`${deps.workerOrigin.replace(/\/+$/, '')}/v1/account`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${await user.getIdToken()}` } })
    if (response.status === 200) return
    if (response.status !== 202) throw new Error(`archive-${response.status}`)
  }
  throw new Error('archive-incomplete')
}

export async function deleteAccountEverywhere(user: User, password: string, deps: AccountDeletionDeps) {
  const { db, onStep } = deps
  // Firebase deletes an account only after a recent sign-in: the password confirms it is really you.
  onStep?.('verify')
  if (!user.email) throw new Error('no-email')
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
  onStep?.('archive')
  await deleteArchive(user, deps)
  onStep?.('documents')
  const base = `users/${user.uid}`
  const sweep = async () => {
    for (const name of USER_SUBCOLLECTIONS) {
      await deleteCollection(db, `${base}/${name}`, name === 'sessions'
        ? (id) => deleteCollection(db, `${base}/sessions/${id}/rawChunks`)
        : undefined)
    }
  }
  await sweep()
  // Codex: a sync that was still running may have written meanwhile; the Worker already refuses new writes
  // (deletion barrier), so one more pass of both leaves nothing behind before the account goes.
  await deleteArchive(user, deps)
  await sweep()
  onStep?.('profile')
  await deleteDoc(doc(db, 'publicProfiles', user.uid))
  await deleteDoc(doc(db, 'pilotDirectory', user.uid))
  await deleteDoc(doc(db, 'users', user.uid))
  onStep?.('account')
  await deleteUser(user)
  onStep?.('done')
}
