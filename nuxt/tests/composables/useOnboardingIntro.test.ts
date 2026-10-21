// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useOnboardingIntro } from '~/composables/useOnboardingIntro'
import { onboardingSeenKey } from '~/services/onboarding/onboardingSeen'

const mock = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { currentUser: ref<{ uid: string } | null>(null) }
})
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ currentUser: mock.currentUser }) }))

const states = new Map<string, ReturnType<typeof ref>>()
const electron = (installationId = 'inst-a') => Object.assign(window, { electronAPI: { getRuntimeIdentity: vi.fn(async () => ({ installationId })) } })
beforeEach(() => {
  states.clear()
  window.localStorage.clear()
  mock.currentUser.value = null
  vi.stubGlobal('useState', (key: string, init: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(init()))
    return states.get(key)!
  })
})
afterEach(() => { vi.unstubAllGlobals(); delete (window as any).electronAPI })

describe('useOnboardingIntro (PIP-571)', () => {
  it('opens on the tour the first time, and "done" keeps it closed for good', async () => {
    electron(); mock.currentUser.value = { uid: 'u1' }
    const intro = useOnboardingIntro()
    expect(await intro.showIfFirstTime()).toBe(true)
    expect(intro.startPhase.value).toBe('tour')
    intro.close('done')
    expect(intro.visible.value).toBe(false)
    expect(window.localStorage.getItem(onboardingSeenKey('u1', 'inst-a'))).toBe('1')
    expect(await intro.showIfFirstTime()).toBe(false)
    states.clear()
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(false)
  })

  it('"later" reopens straight on the commands at the next launch', async () => {
    electron(); mock.currentUser.value = { uid: 'u1' }
    const first = useOnboardingIntro()
    await first.showIfFirstTime(); first.close('later')
    expect(await first.showIfFirstTime()).toBe(false) // not twice in the same session
    states.clear()
    const next = useOnboardingIntro()
    expect(await next.showIfFirstTime()).toBe(true)
    expect(next.startPhase.value).toBe('commands')
  })

  it('waits for the user, falls back to "browser" without Electron and reopens on demand from the tour', async () => {
    const intro = useOnboardingIntro()
    expect(await intro.showIfFirstTime()).toBe(false)
    mock.currentUser.value = { uid: 'u2' }
    expect(await intro.showIfFirstTime()).toBe(true)
    intro.close('done')
    expect(window.localStorage.getItem(onboardingSeenKey('u2', 'browser'))).toBe('1')
    intro.startPhase.value = 'commands'
    await intro.open()
    expect(intro.visible.value).toBe(true)
    expect(intro.startPhase.value).toBe('tour')
  })

  it('does not loop when the status cannot be written', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    mock.currentUser.value = { uid: 'u3' }
    const intro = useOnboardingIntro()
    expect(await intro.showIfFirstTime()).toBe(true)
    intro.close('done')
    expect(await intro.showIfFirstTime()).toBe(false)
    setItem.mockRestore()
  })

  it('tells users apart on the same installation', async () => {
    electron(); mock.currentUser.value = { uid: 'u1' }
    const first = useOnboardingIntro()
    await first.showIfFirstTime(); first.close('done')
    states.clear()
    mock.currentUser.value = { uid: 'u9' }
    expect(await useOnboardingIntro().showIfFirstTime()).toBe(true)
  })
})
