// PIP-698: the optional usage-statistics choice made at registration.
// Kept apart from the components so the rule is tested without Vue or Firebase.
//
// User decision 31/10/2026: accounts registered before keep statistics on (the service default for an
// account that never chose); a new account decides at registration. The choice is sent to the statistics
// service right after the account is created, before any collection can start (the service accepts this
// one write before the email is verified). If that fails, it is kept in `users/{uid}.consent.usage` and on
// this PC, and applied at the first entry. Every write is conditional (`expectedRevision: 0`): it never
// overwrites a choice made in the meantime, e.g. "off" in the Profile.
import { doc } from 'firebase/firestore'
import { trackedUpdateDoc } from '~/composables/useFirebaseTracker'
import { db } from '~/config/firebase'
import { rememberOwnerDocumentPatch } from '~/repositories/ownerDocumentRepository'
import { usageOrigin } from './usageClient'

type Consent = Record<string, unknown> & { usage?: unknown, choicesAt?: unknown }
type LoadOwner = (uid: string) => Promise<{ data: unknown }>
type LocalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
/** 'stored': the service has a choice now (this one, or an earlier one that wins); 'failed': try again. */
export type ChoiceOutcome = 'stored' | 'failed'

const localKey = (uid: string) => `rc-usage-registration-choice:${uid}`

function browserStorage(): LocalStorage {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

/** One conditional write: only the very first choice of the account is accepted. */
export async function sendRegistrationUsageChoice(getToken: () => Promise<string>, enabled: boolean,
  fetchImpl: typeof fetch = fetch): Promise<ChoiceOutcome> {
  try {
    const response = await fetchImpl(`${usageOrigin()}/v1/usage/preference`, {
      method: 'PUT', headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, expectedRevision: 0 }), signal: AbortSignal.timeout(10000),
    })
    if (response.ok) return 'stored'
    // 409 preference-changed: a choice already exists (sent earlier, or made in the Profile) and wins.
    if (response.status === 409) {
      const body = await response.json().catch(() => null) as { error?: unknown } | null
      if (body?.error === 'preference-changed') return 'stored'
    }
    return 'failed'
  } catch { return 'failed' }
}

/** Right after the account is created. On failure the choice waits on this PC for the first entry. */
export async function saveRegistrationUsageChoice(uid: string, getToken: () => Promise<string>, enabled: boolean,
  { fetchImpl = fetch, storage = browserStorage() }: { fetchImpl?: typeof fetch, storage?: LocalStorage } = {}) {
  if (await sendRegistrationUsageChoice(getToken, enabled, fetchImpl) === 'stored') return 'stored'
  try {
    storage?.setItem(localKey(uid), enabled ? '1' : '0')
    // Codex: a "no" holds on this browser at once: the usage client neither collects nor uploads and sends
    // the opt-out itself (same keys as usageClient). "Off" is the safe direction, never a wrong overwrite.
    if (!enabled) { storage?.setItem(`rc-usage-disabled:${uid}`, '1'); storage?.setItem(`rc-usage-pending-disable:${uid}`, '1') }
  } catch { /* the account document still has it */ }
  return 'failed'
}

export interface RegistrationUsageDeps {
  send: (enabled: boolean) => Promise<ChoiceOutcome>
  markApplied: (uid: string, consent: Consent) => Promise<void>
  storage: LocalStorage
  now: () => Date
}

export function defaultRegistrationUsageDeps(getToken: () => Promise<string>): RegistrationUsageDeps {
  return {
    send: enabled => sendRegistrationUsageChoice(getToken, enabled),
    async markApplied(uid, consent) {
      // The whole map, as Firestore validConsent checks it and the owner cache merges shallowly.
      await trackedUpdateDoc(doc(db, 'users', uid), { consent }, 'RegistrationUsageChoice')
      rememberOwnerDocumentPatch(uid, { consent })
    },
    storage: browserStorage(),
    now: () => new Date(),
  }
}

/**
 * At the first entry. 'done': nothing to do, or the service has a choice now; 'retry': try again later;
 * 'stale': the account changed while working (nothing is sent for the new one).
 */
export async function applyRegistrationUsageChoice(uid: string, loadOwner: LoadOwner, isCurrent: () => boolean,
  deps: RegistrationUsageDeps): Promise<'done' | 'retry' | 'stale'> {
  const owner = await loadOwner(uid)
  if (!isCurrent()) return 'stale'
  const consent = (owner.data as { consent?: Consent } | null)?.consent ?? null
  let local: string | null = null
  try { local = deps.storage?.getItem(localKey(uid)) ?? null } catch { /* storage blocked */ }
  const choice = typeof consent?.usage === 'boolean' ? consent.usage : local === '1' ? true : local === '0' ? false : null
  const forget = () => { try { deps.storage?.removeItem(localKey(uid)) } catch { /* ignore */ } }
  if (choice === null || consent?.choicesAt) { forget(); return 'done' }

  const outcome = await deps.send(choice)
  if (!isCurrent()) return 'stale'
  if (outcome !== 'stored') return 'retry'
  forget()
  // Best effort: the conditional write already prevents a second application if this one fails.
  if (consent) await deps.markApplied(uid, { ...consent, choicesAt: deps.now().toISOString() }).catch(() => {})
  return 'done'
}
