import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decideOnboarding,
  evaluateOnboarding,
  markOnboardingSeen,
  ONBOARDING_VERSION,
  profileSeenVersion,
  readLocalSeenVersion,
  readWithin,
  REMOTE_TIMEOUT_MS,
  syncOnboardingRemote,
  writeLocalSeenVersion,
  type OnboardingDeps,
  type OnboardingNote,
} from '~/services/onboarding/onboardingSeen'

/** One PC's localStorage. */
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size },
  }
}

/** The account profile `users/{uid}`, shared by every PC; `rules: false` = rules not published yet. */
function profile(seenVersion = 0, { online = true, rules = true } = {}) {
  return { seenVersion, online, rules, writes: 0 }
}
type Profile = ReturnType<typeof profile>

function deps(storage: ReturnType<typeof memoryStorage> | null, account: Profile, notes: OnboardingNote[] = [], current = () => true): OnboardingDeps {
  return {
    storage,
    readRemote: async () => {
      if (!account.online) throw new Error('unavailable')
      return account.seenVersion
    },
    writeRemote: async (version) => {
      if (!account.online) throw new Error('unavailable')
      if (!account.rules) throw new Error('permission-denied')
      account.writes++
      account.seenVersion = version
    },
    note: note => notes.push(note),
    isCurrent: current,
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => { vi.useRealTimers() })

describe('onboardingSeen: the rule (PIP-757)', () => {
  it('shows below the current version only: the higher of the two copies wins', () => {
    expect(ONBOARDING_VERSION).toBe(3)
    expect(decideOnboarding(0, 0)).toEqual({ show: true, reason: 'firstTime', seen: 0 })
    expect(decideOnboarding(0, null)).toEqual({ show: true, reason: 'firstTime', seen: 0 })
    expect(decideOnboarding(2, 0)).toEqual({ show: true, reason: 'newVersion', seen: 2 })
    expect(decideOnboarding(0, 3)).toEqual({ show: false, reason: null, seen: 3 })
    expect(decideOnboarding(3, null)).toEqual({ show: false, reason: null, seen: 3 })
    expect(decideOnboarding(1, 2)).toEqual({ show: true, reason: 'newVersion', seen: 2 })
  })

  it('reads the profile version, ignoring malformed values', () => {
    expect(profileSeenVersion({ onboarding: { seenVersion: 3, seenAt: 'x' } })).toBe(3)
    expect(profileSeenVersion({})).toBe(0)
    expect(profileSeenVersion(null)).toBe(0)
    expect(profileSeenVersion({ onboarding: { seenVersion: '3' } })).toBe(0)
    expect(profileSeenVersion({ onboarding: { seenVersion: 2.5 } })).toBe(0)
    expect(profileSeenVersion({ onboarding: { seenVersion: 5000 } })).toBe(0)
  })

  it('maps the old per-installation keys of this account to their version, never lowers the copy', () => {
    const storage = memoryStorage()
    storage.setItem('racercore.onboarding.seen.v2:u1:inst-old', '1')
    storage.setItem('racercore.onboarding.seen.v3:u2:inst-a', 'commands-pending')
    storage.setItem('racercore.onboarding.seen.v3:u1x:inst-a', '1') // another uid that starts the same
    storage.setItem('racercore.onboarding.seen.v1:u1:browser', 'garbage')
    expect(readLocalSeenVersion(storage, 'u1')).toBe(2)
    expect(readLocalSeenVersion(storage, 'u2')).toBe(3)
    expect(readLocalSeenVersion(storage, 'u3')).toBe(0)
    expect(writeLocalSeenVersion(storage, 'u1', 3)).toBe(true)
    expect(writeLocalSeenVersion(storage, 'u1', 1)).toBe(true)
    expect(readLocalSeenVersion(storage, 'u1')).toBe(3)
  })

  it('never throws on a missing or blocked storage', () => {
    const blocked = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') }, key: () => { throw new Error('x') }, length: 1 }
    expect(readLocalSeenVersion(blocked, 'u1')).toBe(0)
    expect(writeLocalSeenVersion(blocked, 'u1', 3)).toBe(false)
    expect(readLocalSeenVersion(null, 'u1')).toBe(0)
    expect(writeLocalSeenVersion(null, 'u1', 3)).toBe(false)
    expect(writeLocalSeenVersion(memoryStorage(), '', 3)).toBe(false)
  })

  it('a slow profile is waited for at most the short timeout, a failing one at once', async () => {
    vi.useFakeTimers()
    const slow = readWithin(() => new Promise(() => {}))
    vi.advanceTimersByTime(REMOTE_TIMEOUT_MS)
    await expect(slow).resolves.toBeNull()
    vi.useRealTimers()
    await expect(readWithin(async () => { throw new Error('offline') })).resolves.toBeNull()
    await expect(readWithin(async () => 2)).resolves.toBe(2)
  })
})

describe('onboardingSeen: the launches (PIP-757)', () => {
  it('a new account sees it once: recorded on this PC and in the profile at once', async () => {
    const pc = memoryStorage(), account = profile(), notes: OnboardingNote[] = []
    expect(await evaluateOnboarding('u1', deps(pc, account, notes))).toBe('firstTime')
    await flush()
    expect(account.seenVersion).toBe(3)
    expect(readLocalSeenVersion(pc, 'u1')).toBe(3)
    expect(notes).toEqual([{ event: 'onboarding.opened', reason: 1, remote: 1 }])
    expect(await evaluateOnboarding('u1', deps(pc, account, notes))).toBeNull()
  })

  it('an account that saw v2 (old key on this PC) sees v3 once, then never', async () => {
    const pc = memoryStorage(), account = profile(), notes: OnboardingNote[] = []
    pc.setItem('racercore.onboarding.seen.v2:u1:inst-a', '1')
    expect(await evaluateOnboarding('u1', deps(pc, account, notes))).toBe('newVersion')
    await flush()
    expect(notes[0]).toEqual({ event: 'onboarding.opened', reason: 2, remote: 1 })
    expect(await evaluateOnboarding('u1', deps(pc, account, notes))).toBeNull()
    // The profile alone saying v2 also counts as a new version.
    expect(await evaluateOnboarding('u2', deps(memoryStorage(), profile(2)))).toBe('newVersion')
  })

  it('an account that saw v3 on another PC does not see it on a new PC (the old per-installation key would)', async () => {
    const newPc = memoryStorage(), account = profile(3), notes: OnboardingNote[] = []
    expect(await evaluateOnboarding('u1', deps(newPc, account, notes))).toBeNull()
    expect(notes).toEqual([{ event: 'onboarding.skipped', remote: 3 }])
    expect(readLocalSeenVersion(newPc, 'u1')).toBe(3) // next launch decides without waiting
    expect(account.writes).toBe(0)
  })

  it('without network: this PC decides alone; the profile is written at a later launch', async () => {
    const pc = memoryStorage(), account = profile(0, { online: false }), notes: OnboardingNote[] = []
    expect(await evaluateOnboarding('u1', deps(pc, account, notes))).toBe('firstTime')
    await flush()
    expect(notes).toEqual([{ event: 'onboarding.opened', reason: 1, remote: 0 }])
    expect(account.seenVersion).toBe(0)
    // Offline relaunch: closed (this PC remembers), nothing written yet.
    expect(await evaluateOnboarding('u1', deps(pc, account, notes))).toBeNull()
    await flush()
    expect(account.writes).toBe(0)
    // Back online: the next launch catches the profile up, no repeat (the account had not seen it).
    account.online = true
    expect(await evaluateOnboarding('u1', deps(pc, account, notes))).toBeNull()
    await flush()
    expect(account.seenVersion).toBe(3)
    expect(notes.filter(n => n.event === 'onboarding.repeat')).toEqual([])
    expect(await syncOnboardingRemote('u1', deps(pc, account))).toBe('none')
  })

  it('rules not published (write denied): this PC still remembers; retried at each launch until it lands', async () => {
    const pc = memoryStorage(), account = profile(0, { rules: false })
    expect(await evaluateOnboarding('u1', deps(pc, account))).toBe('firstTime')
    await flush()
    expect(account.seenVersion).toBe(0)
    expect(await evaluateOnboarding('u1', deps(pc, account))).toBeNull()
    expect(await syncOnboardingRemote('u1', deps(pc, account))).toBe('retry')
    account.rules = true
    expect(await syncOnboardingRemote('u1', deps(pc, account))).toBe('written')
    expect(account.seenVersion).toBe(3)
  })

  it('another user on the same PC is a different account: theirs to see once', async () => {
    const pc = memoryStorage(), first = profile(), second = profile()
    expect(await evaluateOnboarding('u1', deps(pc, first))).toBe('firstTime')
    await flush()
    expect(await evaluateOnboarding('u2', deps(pc, second))).toBe('firstTime')
    await flush()
    expect(await evaluateOnboarding('u1', deps(pc, first))).toBeNull()
    expect(await evaluateOnboarding('u2', deps(pc, second))).toBeNull()
    // An account that saw it elsewhere is not shown it here because someone else's copy is on this PC.
    expect(await evaluateOnboarding('u3', deps(pc, profile(3)))).toBeNull()
  })

  it('the account changing while the profile is read: nothing is shown or written for the old one', async () => {
    const pc = memoryStorage(), account = profile(), notes: OnboardingNote[] = []
    let current = true
    const d = deps(pc, account, notes, () => current)
    d.readRemote = async () => { current = false; return 0 }
    expect(await evaluateOnboarding('u1', d)).toBeNull()
    await flush()
    expect(notes).toEqual([])
    expect(readLocalSeenVersion(pc, 'u1')).toBe(0)
    expect(account.writes).toBe(0)
  })

  it('KO spy: opened blind on a new PC while the profile already said seen -> one repeat row', async () => {
    const pc = memoryStorage(), account = profile(3, { online: false }), notes: OnboardingNote[] = []
    expect(await evaluateOnboarding('u1', deps(pc, account, notes))).toBe('firstTime')
    await flush()
    account.online = true
    expect(await syncOnboardingRemote('u1', deps(pc, account, notes))).toBe('already')
    expect(notes).toEqual([{ event: 'onboarding.opened', reason: 1, remote: 0 }, { event: 'onboarding.repeat', seen: 3 }])
    expect(account.writes).toBe(0)
    expect(await syncOnboardingRemote('u1', deps(pc, account, notes))).toBe('none')
  })

  it('no false repeat: our own write that landed but reported a failure is not a repeat', async () => {
    const pc = memoryStorage(), account = profile(0, { online: false }), notes: OnboardingNote[] = []
    expect(await evaluateOnboarding('u1', deps(pc, account, notes))).toBe('firstTime')
    await flush()
    account.online = true
    const d = deps(pc, account, notes)
    d.writeRemote = async (version) => { account.seenVersion = version; throw new Error('deadline-exceeded') }
    expect(await syncOnboardingRemote('u1', d)).toBe('retry')
    expect(await syncOnboardingRemote('u1', deps(pc, account, notes))).toBe('already')
    expect(notes.filter(n => n.event === 'onboarding.repeat')).toEqual([])
  })

  it('a manual open records it as seen everywhere and is never a repeat', async () => {
    const pc = memoryStorage(), account = profile(3), notes: OnboardingNote[] = []
    expect(await markOnboardingSeen('u1', deps(pc, account, notes), { blind: false })).toBe('already')
    expect(notes).toEqual([])
    const fresh = profile()
    expect(await markOnboardingSeen('u2', deps(pc, fresh, notes), { blind: false })).toBe('written')
    expect(fresh.seenVersion).toBe(3)
    expect(await evaluateOnboarding('u2', deps(memoryStorage(), fresh))).toBeNull()
  })
})
