// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useOnboardingIntro } from '~/composables/useOnboardingIntro'
import { readLocalSeenVersion } from '~/services/onboarding/onboardingSeen'

const mock = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return {
    currentUser: ref<{ uid: string } | null>(null),
    // users/{uid}: the account profiles, shared by every PC.
    profiles: new Map<string, Record<string, unknown>>(),
    offline: false,
    denied: false,
    notes: [] as unknown[],
    // A profile read that waits until released (Codex 4 and 5).
    slow: false,
    waiting: [] as Array<() => void>,
    release() { for (const resolve of this.waiting.splice(0)) resolve() },
  }
})
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ currentUser: mock.currentUser }) }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }), serverTimestamp: () => 'SERVER_TIME' }))
vi.mock('~/repositories/ownerDocumentRepository', () => ({
  loadOwnerDocument: vi.fn(async (uid: string) => {
    if (mock.slow) await new Promise<void>(resolve => mock.waiting.push(resolve))
    if (mock.offline) throw new Error('unavailable')
    const data = mock.profiles.get(uid) ?? null
    return { uid, exists: !!data, data, revision: null, readAt: 0 }
  }),
  rememberOwnerDocumentPatch: vi.fn(),
}))
// The real transaction code (onboardingProfile.ts) over an in-memory profile.
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedRunTransaction: vi.fn(async (_db: unknown, _caller: string, _ref: unknown, update: (tx: unknown) => Promise<unknown>) => {
    if (mock.offline) throw new Error('unavailable')
    let pending: [string, Record<string, unknown>] | null = null
    const result = await update({
      get: async (ref: { path: string }) => {
        const data = mock.profiles.get(ref.path.split('/')[1]!)
        return { exists: () => !!data, data: () => data }
      },
      update: (ref: { path: string }, patch: Record<string, unknown>) => { pending = [ref.path.split('/')[1]!, patch] },
    })
    if (pending) {
      if (mock.denied) throw new Error('permission-denied')
      const [uid, patch] = pending as [string, Record<string, unknown>]
      mock.profiles.set(uid, { ...(mock.profiles.get(uid) ?? {}), ...patch })
    }
    return result
  }),
}))
vi.mock('~/services/usage/featureUseNote', () => ({ noteFeatureUse: (note: unknown) => mock.notes.push(note) }))

const states = new Map<string, ReturnType<typeof ref>>()
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const seen = (uid: string) => (mock.profiles.get(uid)?.onboarding as { seenVersion?: number } | undefined)?.seenVersion
/** A new launch of the app: the session state starts again, localStorage stays. */
const relaunch = () => states.clear()

beforeEach(() => {
  states.clear()
  window.localStorage.clear()
  mock.currentUser.value = null
  mock.profiles.clear()
  mock.offline = false
  mock.denied = false
  mock.notes.length = 0
  mock.slow = false
  mock.waiting.length = 0
  vi.stubGlobal('useState', (key: string, init: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(init()))
    return states.get(key)!
  })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useOnboardingIntro (PIP-571 / PIP-757)', () => {
  it('a new account: opens once on the tour, recorded in the profile and on this PC as it appears', async () => {
    mock.currentUser.value = { uid: 'u1' }; mock.profiles.set('u1', {})
    const intro = useOnboardingIntro()
    expect(await intro.showIfFirstTime()).toBe(true)
    expect(intro.startPhase.value).toBe('tour')
    await flush()
    expect(seen('u1')).toBe(3)
    expect(mock.profiles.get('u1')!.onboarding).toEqual({ seenVersion: 3, seenAt: 'SERVER_TIME', how: 'auto' })
    expect(readLocalSeenVersion(window.localStorage, 'u1')).toBe(3)
    expect(mock.notes).toEqual([{ event: 'onboarding.opened', reason: 1, remote: 1 }])
    intro.close()
    expect(intro.visible.value).toBe(false)
    expect(await intro.showIfFirstTime()).toBe(false) // not twice in a session
    relaunch()
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(false) // nor at the next launch
  })

  it('quitting halfway never brings it back: it was recorded when it appeared', async () => {
    mock.currentUser.value = { uid: 'u5' }; mock.profiles.set('u5', {})
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(true)
    await flush()
    relaunch()
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(false)
  })

  it('seen on another PC (profile v3, nothing on this PC): stays closed', async () => {
    mock.currentUser.value = { uid: 'u2' }; mock.profiles.set('u2', { onboarding: { seenVersion: 3, seenAt: 'x' } })
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(false)
    expect(mock.notes).toEqual([{ event: 'onboarding.skipped', remote: 3 }])
  })

  it('an old v2 key on this PC: v3 shows once as a new version', async () => {
    mock.currentUser.value = { uid: 'u6' }; mock.profiles.set('u6', {})
    window.localStorage.setItem('racercore.onboarding.seen.v2:u6:inst-a', '1')
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(true)
    expect(mock.notes).toEqual([{ event: 'onboarding.opened', reason: 2, remote: 1 }])
  })

  it('an old v3 key on this PC counts as seen, and the profile is caught up', async () => {
    mock.currentUser.value = { uid: 'u7' }; mock.profiles.set('u7', {})
    window.localStorage.setItem('racercore.onboarding.seen.v3:u7:inst-a', 'commands-pending')
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(false)
    await flush()
    // Codex 1: the old key is carried to the profile, so a new PC does not show it again.
    expect(mock.profiles.get('u7')!.onboarding).toMatchObject({ seenVersion: 3, how: 'unknown' })
  })

  it('offline or rules not published: this PC decides and remembers; no loop', async () => {
    mock.currentUser.value = { uid: 'u3' }; mock.offline = true
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(true)
    await flush()
    expect(mock.notes).toEqual([{ event: 'onboarding.opened', reason: 1, remote: 0 }])
    relaunch(); mock.offline = false; mock.denied = true; mock.profiles.set('u3', {})
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(false)
    await flush()
    expect(seen('u3')).toBeUndefined()
    relaunch(); mock.denied = false
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(false)
    await flush()
    expect(seen('u3')).toBe(3)
  })

  it('waits for the user; another user on the same PC sees it once too', async () => {
    const intro = useOnboardingIntro()
    expect(await intro.showIfFirstTime()).toBe(false)
    mock.currentUser.value = { uid: 'u1' }; mock.profiles.set('u1', {})
    expect(await intro.showIfFirstTime()).toBe(true)
    intro.close()
    relaunch()
    mock.currentUser.value = { uid: 'u9' }; mock.profiles.set('u9', {})
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(true)
  })

  it('reopens on demand from the tour, notes "manual" and records it seen', async () => {
    mock.currentUser.value = { uid: 'u4' }; mock.profiles.set('u4', {})
    const intro = useOnboardingIntro()
    intro.startPhase.value = 'commands'
    const before = intro.openings.value
    await intro.open(); await intro.open()
    expect(intro.visible.value).toBe(true)
    expect(intro.startPhase.value).toBe('tour')
    expect(intro.openings.value).toBe(before + 2)
    await flush()
    expect(seen('u4')).toBe(3)
    expect(mock.notes).toEqual([{ event: 'onboarding.opened', reason: 3, remote: 0 }, { event: 'onboarding.opened', reason: 3, remote: 0 }])
    relaunch()
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(false)
  })

  it('PIP-749: another account while open drops the window', async () => {
    mock.currentUser.value = { uid: 'u1' }; mock.profiles.set('u1', {})
    const intro = useOnboardingIntro()
    await intro.showIfFirstTime()
    intro.abandon()
    expect(intro.visible.value).toBe(false)
  })

  it('Codex 4: a read cancelled by a logout does not block the same account logging back in', async () => {
    mock.currentUser.value = { uid: 'u1' }; mock.profiles.set('u1', {}); mock.slow = true
    const intro = useOnboardingIntro()
    const first = intro.showIfFirstTime()
    mock.currentUser.value = null
    mock.release()
    expect(await first).toBe(false)
    mock.currentUser.value = { uid: 'u1' }
    const second = intro.showIfFirstTime()
    await flush(); mock.release()
    expect(await second).toBe(true)
    // Decided now: not a third time in this session.
    expect(await intro.showIfFirstTime()).toBe(false)
  })

  it('Codex 5: opened and closed by hand while the profile loads: the automatic one does not open it again', async () => {
    mock.currentUser.value = { uid: 'u1' }; mock.profiles.set('u1', {}); mock.slow = true
    const intro = useOnboardingIntro()
    const auto = intro.showIfFirstTime()
    await intro.open(); intro.close()
    mock.release(); await flush(); mock.release()
    expect(await auto).toBe(false)
    expect(intro.visible.value).toBe(false)
    expect(await intro.showIfFirstTime()).toBe(false)
  })

  it('the account changing while the profile loads shows nothing for the old one', async () => {
    mock.currentUser.value = { uid: 'u1' }; mock.profiles.set('u1', {})
    const pending = useOnboardingIntro().showIfFirstTime()
    mock.currentUser.value = { uid: 'u2' }
    expect(await pending).toBe(false)
    expect(readLocalSeenVersion(window.localStorage, 'u1')).toBe(0)
  })
})
