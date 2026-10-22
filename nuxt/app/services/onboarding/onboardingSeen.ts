// PIP-571: where the introduction stands for one user on one installation, kept in the local
// browser/Electron profile. Any stored value means "seen": it never opens again by itself
// (22/10). 'done' is written as soon as it appears; 'commands-pending' records that the pilot
// chose "Lo faccio dopo" on the command setup, for information only.
// Pure logic: the storage is injected and every access is guarded.

export const ONBOARDING_SEEN_PREFIX = 'racercore.onboarding.seen.v1'
export const BROWSER_INSTALLATION_ID = 'browser'

export type OnboardingStatus = 'unseen' | 'done' | 'commands-pending'
export type OnboardingSeenStorage = Pick<Storage, 'getItem' | 'setItem'>

const STORED: Record<Exclude<OnboardingStatus, 'unseen'>, string> = { 'done': '1', 'commands-pending': 'commands-pending' }

export function onboardingSeenKey(uid: string, installationId: string): string {
  return `${ONBOARDING_SEEN_PREFIX}:${uid}:${installationId || BROWSER_INSTALLATION_ID}`
}

export function readOnboardingStatus(storage: OnboardingSeenStorage | null | undefined, uid: string, installationId: string): OnboardingStatus {
  if (!storage || !uid) return 'unseen'
  try {
    const value = storage.getItem(onboardingSeenKey(uid, installationId))
    if (value === STORED.done) return 'done'
    if (value === STORED['commands-pending']) return 'commands-pending'
    return 'unseen'
  } catch {
    return 'unseen'
  }
}

/** Returns true when the status was written; false when storage refused it. */
export function writeOnboardingStatus(
  storage: OnboardingSeenStorage | null | undefined,
  uid: string,
  installationId: string,
  status: Exclude<OnboardingStatus, 'unseen'>,
): boolean {
  if (!storage || !uid) return false
  try {
    storage.setItem(onboardingSeenKey(uid, installationId), STORED[status])
    return true
  } catch {
    return false
  }
}
