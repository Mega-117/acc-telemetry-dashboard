// PIP-757: the profile side of "seen once per account". One transaction reads `users/{uid}.onboarding`
// and writes only when it raises the version, so a higher version saved by another client between a
// read and this write is never lowered (firestore.rules enforces the same: seenVersion never goes down).
import { serverTimestamp, type DocumentReference, type Transaction } from 'firebase/firestore'
import { profileSeen, type RemoteSeen, type SeenHow } from './onboardingSeen'

export type RunTransaction = <T>(update: (transaction: Transaction) => Promise<T>) => Promise<T>

export async function saveOnboardingSeen(run: RunTransaction, profile: DocumentReference, version: number, how: SeenHow): Promise<{ written: boolean, profile: RemoteSeen }> {
  return run(async (transaction) => {
    const snapshot = await transaction.get(profile)
    // Not provisioned yet: nothing to raise; this PC keeps it and retries at a later launch.
    if (!snapshot.exists()) throw new Error('onboarding: profile missing')
    const current = profileSeen(snapshot.data())
    if (current.version >= version) {
      // A record without `how` (first PIP-757 build) is completed as of unknown origin, nothing else changes.
      if (!current.how) transaction.update(profile, { 'onboarding.how': 'unknown' })
      return { written: false, profile: current }
    }
    // The whole map: firestore.rules validOnboarding checks exactly these fields.
    transaction.update(profile, { onboarding: { seenVersion: version, seenAt: serverTimestamp(), how } })
    return { written: true, profile: { version, how } }
  })
}
