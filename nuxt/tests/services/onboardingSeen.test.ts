import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createOnboardingMemory,
  decideOnboarding,
  evaluateOnboarding,
  localSeen,
  markOnboardingSeen,
  ONBOARDING_VERSION,
  profileSeen,
  readLocalSeenVersion,
  readWithin,
  REMOTE_TIMEOUT_MS,
  syncOnboardingRemote,
  writeLocalSeenVersion,
  type OnboardingDeps,
  type OnboardingMemory,
  type OnboardingNote,
  type SeenHow,
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
/** A storage that is full or blocked: reads nothing back, refuses every write. */
const fullStorage = () => ({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') }, removeItem: () => {}, key: () => null, length: 0 })

/** The account profile `users/{uid}`, shared by every PC; `rules: false` = rules not published yet. */
function profile(version = 0, how: SeenHow | null = version ? 'auto' : null, { online = true, rules = true } = {}) {
  return { version, how, online, rules, writes: 0 }
}
type Profile = ReturnType<typeof profile>

/** One PC: its storage and this app session's memory (a relaunch is a new memory, same storage). */
type Pc = { storage: OnboardingDeps['storage'], memory: OnboardingMemory }
function pc(storage: OnboardingDeps['storage'] = memoryStorage()): Pc { return { storage, memory: createOnboardingMemory() } }
const relaunch = (machine: Pc): Pc => ({ storage: machine.storage, memory: createOnboardingMemory() })

function deps(machine: Pc, account: Profile, notes: OnboardingNote[] = [], current = () => true): OnboardingDeps {
  return {
    storage: machine.storage,
    memory: machine.memory,
    readRemote: async () => {
      if (!account.online) throw new Error('unavailable')
      return { version: account.version, how: account.how }
    },
    // Like saveOnboardingSeen: a transaction that never lowers the version.
    writeRemote: async (version, how) => {
      if (!account.online) throw new Error('unavailable')
      if (!account.rules) throw new Error('permission-denied')
      if (account.version >= version) return { written: false, profile: { version: account.version, how: account.how } }
      account.writes++
      account.version = version
      account.how = how
      return { written: true, profile: { version, how } }
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

  it('reads the profile record, ignoring malformed values', () => {
    expect(profileSeen({ onboarding: { seenVersion: 3, seenAt: 'x', how: 'manual' } })).toEqual({ version: 3, how: 'manual' })
    expect(profileSeen({ onboarding: { seenVersion: 3, how: 'other' } })).toEqual({ version: 3, how: null })
    expect(profileSeen({})).toEqual({ version: 0, how: null })
    expect(profileSeen(null)).toEqual({ version: 0, how: null })
    expect(profileSeen({ onboarding: { seenVersion: '3', how: 'auto' } })).toEqual({ version: 0, how: null })
    expect(profileSeen({ onboarding: { seenVersion: 2.5 } }).version).toBe(0)
    expect(profileSeen({ onboarding: { seenVersion: 5000 } }).version).toBe(0)
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
    await expect(readWithin(async () => ({ version: 2, how: null }))).resolves.toEqual({ version: 2, how: null })
  })
})

describe('onboardingSeen: the launches (PIP-757)', () => {
  it('a new account sees it once: recorded on this PC and in the profile at once, as an automatic open', async () => {
    const machine = pc(), account = profile(), notes: OnboardingNote[] = []
    expect(await evaluateOnboarding('u1', deps(machine, account, notes))).toBe('firstTime')
    await flush()
    expect(account).toMatchObject({ version: 3, how: 'auto' })
    expect(readLocalSeenVersion(machine.storage, 'u1')).toBe(3)
    expect(notes).toEqual([{ event: 'onboarding.opened', reason: 1, remote: 1 }])
    expect(await evaluateOnboarding('u1', deps(relaunch(machine), account, notes))).toBe('closed')
  })

  it('an account that saw v2 (old key on this PC) sees v3 once, then never', async () => {
    const machine = pc(), account = profile(), notes: OnboardingNote[] = []
    machine.storage!.setItem('racercore.onboarding.seen.v2:u1:inst-a', '1')
    expect(await evaluateOnboarding('u1', deps(machine, account, notes))).toBe('newVersion')
    await flush()
    expect(notes[0]).toEqual({ event: 'onboarding.opened', reason: 2, remote: 1 })
    expect(await evaluateOnboarding('u1', deps(relaunch(machine), account, notes))).toBe('closed')
    // The profile alone saying v2 also counts as a new version.
    expect(await evaluateOnboarding('u2', deps(pc(), profile(2)))).toBe('newVersion')
  })

  it('an account that saw v3 on another PC does not see it on a new PC (the old per-installation key would)', async () => {
    const newPc = pc(), account = profile(3), notes: OnboardingNote[] = []
    expect(await evaluateOnboarding('u1', deps(newPc, account, notes))).toBe('closed')
    expect(notes).toEqual([{ event: 'onboarding.skipped', remote: 3 }])
    expect(readLocalSeenVersion(newPc.storage, 'u1')).toBe(3) // next launch decides without waiting
    expect(account.writes).toBe(0)
  })

  it('Codex 1: an old v3 key on this PC is carried to the profile, so a new PC does not show it again', async () => {
    const oldPc = pc(), account = profile()
    oldPc.storage!.setItem('racercore.onboarding.seen.v3:u1:inst-a', '1')
    expect(await evaluateOnboarding('u1', deps(oldPc, account))).toBe('closed')
    await flush()
    expect(account).toMatchObject({ version: 3, how: 'unknown' })
    expect(await evaluateOnboarding('u1', deps(pc(), account))).toBe('closed')
  })

  it('without network: this PC decides alone; the profile is written at a later launch', async () => {
    const machine = pc(), account = profile(0, null, { online: false }), notes: OnboardingNote[] = []
    expect(await evaluateOnboarding('u1', deps(machine, account, notes))).toBe('firstTime')
    await flush()
    expect(notes).toEqual([{ event: 'onboarding.opened', reason: 1, remote: 0 }])
    expect(account.version).toBe(0)
    // Offline relaunch: closed (this PC remembers), nothing written yet.
    expect(await evaluateOnboarding('u1', deps(relaunch(machine), account, notes))).toBe('closed')
    await flush()
    expect(account.writes).toBe(0)
    // Back online: the next launch catches the profile up, no repeat (the account had not seen it).
    account.online = true
    expect(await evaluateOnboarding('u1', deps(relaunch(machine), account, notes))).toBe('closed')
    await flush()
    expect(account).toMatchObject({ version: 3, how: 'auto' })
    expect(notes.filter(n => n.event !== 'onboarding.opened')).toEqual([])
  })

  it('rules not published (write denied): this PC still remembers; retried at each launch until it lands', async () => {
    const machine = pc(), account = profile(0, null, { rules: false })
    expect(await evaluateOnboarding('u1', deps(machine, account))).toBe('firstTime')
    await flush()
    expect(account.version).toBe(0)
    expect(await evaluateOnboarding('u1', deps(relaunch(machine), account))).toBe('closed')
    expect(await syncOnboardingRemote('u1', deps(relaunch(machine), account))).toBe('retry')
    account.rules = true
    expect(await syncOnboardingRemote('u1', deps(relaunch(machine), account))).toBe('written')
    expect(account.version).toBe(3)
  })

  it('Codex 3: storage full or blocked: the session memory still writes the profile and keeps it closed', async () => {
    const machine = pc(fullStorage()), account = profile()
    expect(await evaluateOnboarding('u1', deps(machine, account))).toBe('firstTime')
    await flush()
    expect(account.version).toBe(3)
    expect(localSeen(machine, 'u1')).toBe(3)
    expect(await evaluateOnboarding('u1', deps(machine, account))).toBe('closed')
  })

  it('Codex 2: a higher version saved by another client after our read is kept (the write never lowers it)', async () => {
    const machine = pc(), account = profile(), notes: OnboardingNote[] = []
    const d = deps(machine, account, notes)
    const read = d.readRemote
    d.readRemote = async () => { const seen = await read(); account.version = 7; account.how = 'manual'; return seen }
    expect(await evaluateOnboarding('u1', d)).toBe('firstTime')
    await flush()
    expect(account).toMatchObject({ version: 7, how: 'manual', writes: 0 })
    expect(localSeen(machine, 'u1')).toBe(7)
  })

  it('another user on the same PC is a different account: theirs to see once', async () => {
    const machine = pc(), first = profile(), second = profile()
    expect(await evaluateOnboarding('u1', deps(machine, first))).toBe('firstTime')
    await flush()
    expect(await evaluateOnboarding('u2', deps(machine, second))).toBe('firstTime')
    await flush()
    expect(await evaluateOnboarding('u1', deps(relaunch(machine), first))).toBe('closed')
    expect(await evaluateOnboarding('u2', deps(relaunch(machine), second))).toBe('closed')
    // An account that saw it elsewhere is not shown it here because someone else's copy is on this PC.
    expect(await evaluateOnboarding('u3', deps(machine, profile(3)))).toBe('closed')
  })

  it('the account changing while the profile is read: cancelled, nothing shown or written for the old one', async () => {
    const machine = pc(), account = profile(), notes: OnboardingNote[] = []
    let current = true
    const d = deps(machine, account, notes, () => current)
    d.readRemote = async () => { current = false; return { version: 0, how: null } }
    expect(await evaluateOnboarding('u1', d)).toBe('cancelled')
    await flush()
    expect(notes).toEqual([])
    expect(localSeen(machine, 'u1')).toBe(0)
    expect(account.writes).toBe(0)
  })

  it('Codex 5: opened by hand during the wait: the evaluation re-reads this PC and stays closed', async () => {
    const machine = pc(), account = profile(), notes: OnboardingNote[] = []
    const d = deps(machine, account, notes)
    const read = d.readRemote
    d.readRemote = async () => { await markOnboardingSeen('u1', deps(machine, profile()), { how: 'manual', blind: false }); return read() }
    expect(await evaluateOnboarding('u1', d)).toBe('closed')
    expect(notes).toEqual([])
  })

  it('KO spy: opened blind here while another PC had also opened it by itself -> one repeat row', async () => {
    const machine = pc(), account = profile(3, 'auto', { online: false }), notes: OnboardingNote[] = []
    expect(await evaluateOnboarding('u1', deps(machine, account, notes))).toBe('firstTime')
    await flush()
    account.online = true
    expect(await syncOnboardingRemote('u1', deps(relaunch(machine), account, notes))).toBe('already')
    expect(notes).toEqual([{ event: 'onboarding.opened', reason: 1, remote: 0 }, { event: 'onboarding.repeat', seen: 3 }])
    expect(account.writes).toBe(0)
    expect(await syncOnboardingRemote('u1', deps(relaunch(machine), account, notes))).toBe('already')
    expect(notes).toHaveLength(2)
  })

  it('Codex 6: opened blind on A, then by hand on B: A records an undetermined overlap, never a repeat', async () => {
    const a = pc(), account = profile(0, null, { online: false }), notes: OnboardingNote[] = []
    expect(await evaluateOnboarding('u1', deps(a, account, notes))).toBe('firstTime')
    await flush()
    account.online = true
    expect(await markOnboardingSeen('u1', deps(pc(), account), { how: 'manual', blind: false })).toBe('written')
    expect(await syncOnboardingRemote('u1', deps(relaunch(a), account, notes))).toBe('already')
    expect(notes).toEqual([{ event: 'onboarding.opened', reason: 1, remote: 0 }, { event: 'onboarding.overlap', seen: 3 }])
    // Carried from an old key elsewhere ('unknown'), or a record without `how`: undetermined too.
    for (const how of ['unknown', null] as const) {
      const other = pc(), seen = profile(3, how, { online: false }), rows: OnboardingNote[] = []
      await evaluateOnboarding('u2', deps(other, seen, rows)); await flush()
      seen.online = true
      await syncOnboardingRemote('u2', deps(other, seen, rows))
      expect(rows.map(r => r.event)).toEqual(['onboarding.opened', 'onboarding.overlap'])
    }
  })

  it('no false repeat: our own write that landed but reported a failure is not a repeat', async () => {
    const machine = pc(), account = profile(0, null, { online: false }), notes: OnboardingNote[] = []
    expect(await evaluateOnboarding('u1', deps(machine, account, notes))).toBe('firstTime')
    await flush()
    account.online = true
    const d = deps(machine, account, notes)
    d.writeRemote = async (version, how) => { account.version = version; account.how = how; throw new Error('deadline-exceeded') }
    expect(await syncOnboardingRemote('u1', d)).toBe('retry')
    expect(await syncOnboardingRemote('u1', deps(relaunch(machine), account, notes))).toBe('already')
    expect(notes.filter(n => n.event !== 'onboarding.opened')).toEqual([])
  })

  it('a manual open records it as seen everywhere and is never a repeat', async () => {
    const machine = pc(), account = profile(3), notes: OnboardingNote[] = []
    expect(await markOnboardingSeen('u1', deps(machine, account, notes), { how: 'manual', blind: false })).toBe('already')
    expect(notes).toEqual([])
    const fresh = profile()
    expect(await markOnboardingSeen('u2', deps(machine, fresh, notes), { how: 'manual', blind: false })).toBe('written')
    expect(fresh).toMatchObject({ version: 3, how: 'manual' })
    expect(await evaluateOnboarding('u2', deps(pc(), fresh))).toBe('closed')
  })
})
