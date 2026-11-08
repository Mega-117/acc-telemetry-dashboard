// PIP-757 (user decision 08/11): every account sees the introduction once, the first time it enters,
// then never again by itself: not after an update, not on another PC, not after a reinstall.
// One sentence: the account profile `users/{uid}.onboarding.seenVersion` decides, a copy on this PC
// covers the moments without network, the higher of the two wins, and it shows only below the
// current version (whoever saw an older one sees this one once).
//
// Pure logic: storage, memory, the profile read/write and the diary are injected (the composable
// wires them). PIP-571 / PIP-612 / PIP-749 history: until v3 the "seen" lived only here, keyed per
// user AND per installation (`racercore.onboarding.seen.v<N>:<uid>:<installation>`), so it came back
// on a new PC. Those keys are still read as "seen version N" (and carried to the profile), never written.

/** The introduction's version: raising it shows it once more to everyone, then never again by itself. */
export const ONBOARDING_VERSION = 3
/** Highest version the profile rule accepts (firestore.rules validOnboarding). */
export const ONBOARDING_MAX_VERSION = 1000
/** How long the first launch waits for the profile before trusting this PC's copy alone. */
export const REMOTE_TIMEOUT_MS = 4000

const LOCAL_PREFIX = 'racercore.onboarding.seenVersion:'
const OPENED_PREFIX = 'racercore.onboarding.opened:'
const LEGACY = /^racercore\.onboarding\.seen\.v(\d+):(.+):[^:]*$/
const LEGACY_SEEN = new Set(['1', 'commands-pending'])

export type OnboardingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>
export type OnboardingReason = 'firstTime' | 'newVersion' | 'manual'
/** The diary row codes (the desktop program accepts integers only). */
export const REASON_CODE: Record<OnboardingReason, number> = { firstTime: 1, newVersion: 2, manual: 3 }

/** How the version in the profile was seen: by itself, from Impostazioni, or carried from an old key. */
export type SeenHow = 'auto' | 'manual' | 'unknown'
const SEEN_HOW: readonly SeenHow[] = ['auto', 'manual', 'unknown']
/** The profile's record: version 0 when never seen; `how` null when the record does not say. */
export interface RemoteSeen { version: number, how: SeenHow | null }

/** Diary rows (desktop-app/runtime/featureUseNotes.js lists the same names and fields). */
export type OnboardingNote =
  /** It appeared. reason: 1 firstTime, 2 newVersion, 3 manual; remote 1 = the profile answered in time. */
  | { event: 'onboarding.opened', reason: number, remote: number }
  /** It stayed closed because the profile remembered it while this PC did not (the fix at work). */
  | { event: 'onboarding.skipped', remote: number }
  /** KO: it opened by itself here (without the profile, or racing another PC on the same old value), and
   *  the profile says another PC had also opened it by itself. */
  | { event: 'onboarding.repeat', seen: number }
  /** Undetermined: opened by itself here, and the profile already held it written another way
   *  (from Impostazioni, an old key, or an older record). Never a KO. */
  | { event: 'onboarding.overlap', seen: number }

/** A remote read: the profile's record, or null when it did not answer. */
export type RemoteRead = () => Promise<RemoteSeen | null>
/** Raises the profile to `version` keeping the higher one (a transaction); returns what it holds now. */
export type RemoteWrite = (version: number, how: SeenHow) => Promise<{ written: boolean, profile: RemoteSeen }>

/** This app session's copy: it holds even when the storage refuses every write (blocked or full). */
export interface OnboardingMemory { seen: Map<string, number>, opened: Map<string, Opened | null> }
export function createOnboardingMemory(): OnboardingMemory { return { seen: new Map(), opened: new Map() } }

export interface OnboardingDeps {
  storage: OnboardingStorage | null
  memory: OnboardingMemory
  readRemote: RemoteRead
  writeRemote: RemoteWrite
  note: (note: OnboardingNote) => void
  /** False once the account changed: nothing is shown or written for the old one. */
  isCurrent: () => boolean
}

/** How this PC opened it, until the profile has it. `tried` = a write was attempted (it may have landed
 *  even if it reported a failure, so a later "already there" may be this PC's own write). */
interface Opened { how: 'auto' | 'manual', tried: boolean }

function validVersion(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= ONBOARDING_MAX_VERSION ? value : 0
}

/** The record in a `users/{uid}` document (version 0 when absent or malformed). */
export function profileSeen(data: unknown): RemoteSeen {
  const onboarding = (data as { onboarding?: { seenVersion?: unknown, how?: unknown } } | null | undefined)?.onboarding
  const version = validVersion(onboarding?.seenVersion)
  const how = SEEN_HOW.find(item => item === onboarding?.how) ?? null
  return { version, how: version ? how : null }
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

/** This PC's stored copy for the account: the per-account key, or an older per-installation one. */
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

/** What this PC knows: the stored copy and this session's memory. */
export function localSeen(deps: Pick<OnboardingDeps, 'storage' | 'memory'>, uid: string): number {
  return Math.max(readLocalSeenVersion(deps.storage, uid), deps.memory.seen.get(uid) ?? 0)
}

function rememberSeen(deps: OnboardingDeps, uid: string, version: number) {
  deps.memory.seen.set(uid, Math.max(deps.memory.seen.get(uid) ?? 0, version))
  writeLocalSeenVersion(deps.storage, uid, version)
}

function readOpened(deps: OnboardingDeps, uid: string): Opened | null {
  if (deps.memory.opened.has(uid)) return deps.memory.opened.get(uid) ?? null
  const raw = safeGet(deps.storage, OPENED_PREFIX + uid)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Opened>
    if (value.how !== 'auto' && value.how !== 'manual') return null
    return { how: value.how, tried: value.tried === true }
  } catch { return null }
}

/** Memory first (it always holds); the storage only carries it to a later launch. */
function writeOpened(deps: OnboardingDeps, uid: string, opened: Opened | null) {
  deps.memory.opened.set(uid, opened)
  try {
    if (opened) deps.storage?.setItem(OPENED_PREFIX + uid, JSON.stringify(opened))
    else deps.storage?.removeItem(OPENED_PREFIX + uid)
  } catch { /* this session still has it in memory */ }
}

/** The remote answer, or null after `ms` or on any error: then this PC's copy decides alone. */
export function readWithin(read: RemoteRead, ms: number = REMOTE_TIMEOUT_MS): Promise<RemoteSeen | null> {
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
 * The profile already has it, not from this PC (which never wrote it). If this PC opened it by itself
 * (without the profile's answer, or racing another PC that read the same old value), it is a repeat
 * when the profile says it was opened by itself elsewhere too; any other origin is undetermined.
 */
function settle(deps: OnboardingDeps, uid: string, profile: RemoteSeen, opened: Opened | null, wasTried: boolean) {
  if (opened?.how === 'auto' && !wasTried) {
    deps.note(profile.how === 'auto'
      ? { event: 'onboarding.repeat', seen: profile.version }
      : { event: 'onboarding.overlap', seen: profile.version })
  }
  writeOpened(deps, uid, null)
  rememberSeen(deps, uid, profile.version)
}

/**
 * Brings the profile up to what this PC knows (a fresh open, or an old key); retried at every launch
 * until it lands. `known`: the profile's record the caller has just read (no second read).
 */
export async function syncOnboardingRemote(uid: string, deps: OnboardingDeps, known?: RemoteSeen): Promise<'none' | 'written' | 'already' | 'retry'> {
  const target = localSeen(deps, uid)
  if (!target) return 'none'
  let remote: RemoteSeen | null = known ?? null
  if (!known) {
    try { remote = await deps.readRemote() } catch { remote = null }
  }
  if (!deps.isCurrent() || !remote) return 'retry'
  const opened = readOpened(deps, uid)
  const wasTried = !!opened?.tried
  if (remote.version >= target) {
    settle(deps, uid, remote, opened, wasTried)
    return 'already'
  }
  if (opened) writeOpened(deps, uid, { ...opened, tried: true })
  let result: Awaited<ReturnType<RemoteWrite>>
  try {
    result = await deps.writeRemote(target, opened?.how ?? 'unknown')
  } catch {
    return 'retry'
  }
  if (!result.written) {
    // Another client raised it between the read and the transaction: it was not this write.
    settle(deps, uid, result.profile, opened, wasTried)
    return 'already'
  }
  writeOpened(deps, uid, null)
  return 'written'
}

/**
 * Records "seen" as it appears: this PC at once, then the profile (never awaited by the opening).
 * `known`: the profile's record when it answered in time (no second read).
 */
export async function markOnboardingSeen(uid: string, deps: OnboardingDeps,
  { how, known }: { how: 'auto' | 'manual', known?: RemoteSeen }) {
  rememberSeen(deps, uid, ONBOARDING_VERSION)
  const before = readOpened(deps, uid)
  writeOpened(deps, uid, { how: before?.how ?? how, tried: !!before?.tried })
  return syncOnboardingRemote(uid, deps, known)
}

/** 'closed': decided, it stays closed; 'cancelled': nothing decided (the account changed meanwhile). */
export type OnboardingEvaluation = OnboardingReason | 'closed' | 'cancelled'

/**
 * At each launch, for the signed-in account: waits for the profile (at most REMOTE_TIMEOUT_MS), decides
 * on what this PC knows after the wait (an open from Impostazioni meanwhile has recorded it), and when
 * it shows records it as seen at once.
 */
export async function evaluateOnboarding(uid: string, deps: OnboardingDeps): Promise<OnboardingEvaluation> {
  if (localSeen(deps, uid) >= ONBOARDING_VERSION) {
    // This PC already knows: no wait. The profile is caught up in the background (an old key, a failed write).
    void syncOnboardingRemote(uid, deps).catch(() => {})
    return 'closed'
  }
  const remote = await readWithin(deps.readRemote)
  if (!deps.isCurrent()) return 'cancelled'
  // Re-read: an open from Impostazioni during the wait has recorded it already.
  const local = localSeen(deps, uid)
  const decision = decideOnboarding(local, remote?.version ?? null)
  if (!decision.show) {
    // The profile remembered it (another PC, a reinstall): the old per-installation copy would have shown it.
    if (local < ONBOARDING_VERSION) deps.note({ event: 'onboarding.skipped', remote: decision.seen })
    rememberSeen(deps, uid, decision.seen)
    return 'closed'
  }
  deps.note({ event: 'onboarding.opened', reason: REASON_CODE[decision.reason], remote: remote ? 1 : 0 })
  void markOnboardingSeen(uid, deps, { how: 'auto', known: remote ?? undefined }).catch(() => {})
  return decision.reason
}
