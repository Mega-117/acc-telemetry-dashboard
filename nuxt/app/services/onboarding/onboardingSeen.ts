// PIP-757 (user decision 08/11): every account sees the introduction once, the first time it enters,
// then never again by itself: not after an update, not on another PC, not after a reinstall.
// One sentence: the account profile `users/{uid}.onboarding.seenVersion` decides, a copy on this PC
// covers the moments without network, the higher of the two wins, and it shows only below the
// current version (whoever saw an older one sees this one once).
//
// Pure logic: storage, the profile read/write and the diary are injected (the composable wires them).
// PIP-571 / PIP-612 / PIP-749 history: until v3 the "seen" lived only here, keyed per user AND per
// installation (`racercore.onboarding.seen.v<N>:<uid>:<installation>`), so it came back on a new PC.
// Those keys are still read as "seen version N", never written.

/** The introduction's version: raising it shows it once more to everyone, then never again by itself. */
export const ONBOARDING_VERSION = 3
/** Highest version the profile rule accepts (firestore.rules validOnboarding). */
export const ONBOARDING_MAX_VERSION = 1000
/** How long the first launch waits for the profile before trusting this PC's copy alone. */
export const REMOTE_TIMEOUT_MS = 4000

const LOCAL_PREFIX = 'racercore.onboarding.seenVersion:'
const PENDING_PREFIX = 'racercore.onboarding.pendingRemote:'
const LEGACY = /^racercore\.onboarding\.seen\.v(\d+):(.+):[^:]*$/
const LEGACY_SEEN = new Set(['1', 'commands-pending'])

export type OnboardingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>
export type OnboardingReason = 'firstTime' | 'newVersion' | 'manual'
/** The diary row codes (the desktop program accepts integers only). */
export const REASON_CODE: Record<OnboardingReason, number> = { firstTime: 1, newVersion: 2, manual: 3 }

/** Diary rows (desktop-app/runtime/featureUseNotes.js lists the same names and fields). */
export type OnboardingNote =
  /** It appeared. reason: 1 firstTime, 2 newVersion, 3 manual; remote 1 = the profile answered in time. */
  | { event: 'onboarding.opened', reason: number, remote: number }
  /** It stayed closed because the profile remembered it while this PC did not (the fix at work). */
  | { event: 'onboarding.skipped', remote: number }
  /** KO: it opened by itself on this PC, but the profile already said seen (it showed twice). */
  | { event: 'onboarding.repeat', seen: number }

/** A remote read: the version in the profile (0 when never seen), or null when it did not answer. */
export type RemoteRead = () => Promise<number | null>

export interface OnboardingDeps {
  storage: OnboardingStorage | null
  readRemote: RemoteRead
  /** Writes `onboarding: { seenVersion, seenAt }`; rejects when refused (rules not published, offline). */
  writeRemote: (seenVersion: number) => Promise<void>
  note: (note: OnboardingNote) => void
  /** False once the account changed while waiting: nothing is shown or written for the old one. */
  isCurrent: () => boolean
}

/** Pending profile write: the version; `blind` = an automatic open decided without the profile's answer;
 *  `tried` = a write was attempted (it may have landed even if it reported a failure). */
interface Pending { version: number, blind: boolean, tried: boolean }

function validVersion(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= ONBOARDING_MAX_VERSION ? value : 0
}

/** The version recorded in a `users/{uid}` document (0 when absent or malformed). */
export function profileSeenVersion(data: unknown): number {
  const onboarding = (data as { onboarding?: { seenVersion?: unknown } } | null | undefined)?.onboarding
  return validVersion(onboarding?.seenVersion)
}

function safeGet(storage: OnboardingStorage | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null } catch { return null }
}

function legacyVersion(storage: OnboardingStorage, uid: string): number {
  let best = 0
  try {
    const length = typeof storage.length === 'number' ? storage.length : 0
    for (let i = 0; i < length; i++) {
      const key = storage.key?.(i)
      const match = key ? LEGACY.exec(key) : null
      if (key && match && match[2] === uid && LEGACY_SEEN.has(safeGet(storage, key) ?? '')) best = Math.max(best, validVersion(Number(match[1])))
    }
  } catch { /* storage blocked: no legacy copy */ }
  return best
}

/** This PC's copy for the account: the per-account key, or an older per-installation one. */
export function readLocalSeenVersion(storage: OnboardingStorage | null, uid: string): number {
  if (!storage || !uid) return 0
  return Math.max(validVersion(Number(safeGet(storage, LOCAL_PREFIX + uid))), legacyVersion(storage, uid))
}

/** Never lowers the copy. Returns false when there is nowhere to write or the storage refused it. */
export function writeLocalSeenVersion(storage: OnboardingStorage | null, uid: string, version: number): boolean {
  if (!storage || !uid) return false
  if (readLocalSeenVersion(storage, uid) >= version) return true
  try { storage.setItem(LOCAL_PREFIX + uid, String(version)); return true } catch { return false }
}

function readPending(storage: OnboardingStorage | null, uid: string): Pending | null {
  const raw = safeGet(storage, PENDING_PREFIX + uid)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Pending>
    const version = validVersion(value.version)
    return version ? { version, blind: value.blind === true, tried: value.tried === true } : null
  } catch { return null }
}

function writePending(storage: OnboardingStorage | null, uid: string, pending: Pending | null) {
  try {
    if (pending) storage?.setItem(PENDING_PREFIX + uid, JSON.stringify(pending))
    else storage?.removeItem(PENDING_PREFIX + uid)
  } catch { /* the profile stays behind until a launch that can write here */ }
}

/** The remote answer, or null after `ms` or on any error: then this PC's copy decides alone. */
export function readWithin(read: RemoteRead, ms: number = REMOTE_TIMEOUT_MS): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    read().then(resolve, () => resolve(null)).finally(() => clearTimeout(timer))
  })
}

export type OnboardingDecision = { show: false, reason: null, seen: number } | { show: true, reason: OnboardingReason, seen: number }

/** The rule itself: the higher of the two copies, shown only below the current version. */
export function decideOnboarding(local: number, remote: number | null): OnboardingDecision {
  const seen = Math.max(local, remote ?? 0)
  if (seen >= ONBOARDING_VERSION) return { show: false, reason: null, seen }
  return { show: true, reason: seen === 0 ? 'firstTime' : 'newVersion', seen }
}

/**
 * Brings the profile up to this PC's pending version; retried at every launch until it lands.
 * `knownRemote`: the profile's version the caller has just read (no second read).
 */
export async function syncOnboardingRemote(uid: string, deps: OnboardingDeps, knownRemote?: number): Promise<'none' | 'written' | 'already' | 'retry'> {
  const pending = readPending(deps.storage, uid)
  if (!pending) return 'none'
  let remote: number | null = knownRemote ?? null
  if (knownRemote === undefined) {
    try { remote = await deps.readRemote() } catch { remote = null }
  }
  if (!deps.isCurrent() || remote === null) return 'retry'
  if (remote >= pending.version) {
    // The account had already seen it when this PC opened it by itself, and this PC never wrote it: a repeat.
    if (pending.blind && !pending.tried) deps.note({ event: 'onboarding.repeat', seen: remote })
    writePending(deps.storage, uid, null)
    writeLocalSeenVersion(deps.storage, uid, remote)
    return 'already'
  }
  writePending(deps.storage, uid, { ...pending, tried: true })
  try {
    await deps.writeRemote(pending.version)
  } catch {
    return 'retry'
  }
  writePending(deps.storage, uid, null)
  return 'written'
}

/**
 * Records "seen" as it appears: this PC at once, then the profile. `blind`: an automatic open decided
 * without the profile's answer; `knownRemote`: the profile's version when it did answer.
 */
export async function markOnboardingSeen(uid: string, deps: OnboardingDeps, { blind, knownRemote }: { blind: boolean, knownRemote?: number }) {
  writeLocalSeenVersion(deps.storage, uid, ONBOARDING_VERSION)
  const before = readPending(deps.storage, uid)
  writePending(deps.storage, uid, { version: ONBOARDING_VERSION, blind: blind || !!before?.blind, tried: !!before?.tried })
  return syncOnboardingRemote(uid, deps, knownRemote)
}

/**
 * At each launch, for the signed-in account: waits for the profile (at most REMOTE_TIMEOUT_MS), decides,
 * and when it shows records it as seen at once. Returns the reason, or null when it stays closed.
 */
export async function evaluateOnboarding(uid: string, deps: OnboardingDeps): Promise<OnboardingReason | null> {
  const local = readLocalSeenVersion(deps.storage, uid)
  if (local >= ONBOARDING_VERSION) {
    // This PC already knows: no wait. A profile write that failed earlier is retried in the background.
    void syncOnboardingRemote(uid, deps).catch(() => {})
    return null
  }
  const remote = await readWithin(deps.readRemote)
  if (!deps.isCurrent()) return null
  const decision = decideOnboarding(local, remote)
  if (!decision.show) {
    // The profile remembered it (another PC, a reinstall): the old per-installation copy would have shown it.
    deps.note({ event: 'onboarding.skipped', remote: decision.seen })
    writeLocalSeenVersion(deps.storage, uid, decision.seen)
    return null
  }
  deps.note({ event: 'onboarding.opened', reason: REASON_CODE[decision.reason], remote: remote === null ? 0 : 1 })
  void markOnboardingSeen(uid, deps, { blind: remote === null, knownRemote: remote ?? undefined }).catch(() => {})
  return decision.reason
}
