// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OnboardingIntro from '~/components/onboarding/OnboardingIntro.vue'
import { ONBOARDING_STEPS } from '~/services/onboarding/onboardingSteps'

const mock = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return {
    visible: ref(false),
    startPhase: ref<'tour' | 'commands'>('tour'),
    showIfFirstTime: vi.fn(async () => false),
    open: vi.fn(),
    save: vi.fn(),
    close: vi.fn(),
    currentUser: ref<{ uid: string } | null>({ uid: 'u1' }),
  }
})
vi.mock('~/composables/useOnboardingIntro', () => ({
  useOnboardingIntro: () => ({ visible: mock.visible, startPhase: mock.startPhase, showIfFirstTime: mock.showIfFirstTime, open: mock.open, save: mock.save, close: mock.close }),
}))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ currentUser: mock.currentUser }) }))
vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (p: string) => `/base${p}` }) }))

const commandsStub = {
  props: ['wheelAvailable'],
  emits: ['done', 'later'],
  template: '<div data-stub-commands :data-wheel="String(wheelAvailable)"><button data-done @click="$emit(\'done\')" /><button data-later @click="$emit(\'later\')" /></div>',
}
function mountIntro() {
  return mount(OnboardingIntro, { global: { stubs: { OnboardingCommands: commandsStub } }, attachTo: document.body })
}
const q = (selector: string) => document.body.querySelector(selector) as HTMLElement | null
const click = async (selector: string) => { q(selector)!.click(); await flushPromises() }
const open = async () => { mock.visible.value = true; await flushPromises() }

beforeEach(() => {
  vi.clearAllMocks()
  mock.visible.value = false
  mock.startPhase.value = 'tour'
  mock.currentUser.value = { uid: 'u1' }
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 1 })
})
afterEach(() => { vi.unstubAllGlobals(); delete (window as any).electronAPI; document.body.innerHTML = '' })

describe('OnboardingIntro (PIP-571)', () => {
  it('asks to open itself on mount and renders nothing while hidden', async () => {
    const wrapper = mountIntro(); await flushPromises()
    expect(mock.showIfFirstTime).toHaveBeenCalledTimes(1)
    expect(q('[data-onboarding-intro]')).toBeNull()
    wrapper.unmount()
  })

  it('walks the four video cards, then hands over to the command setup', async () => {
    const wrapper = mountIntro(); await open()
    expect(document.body.querySelectorAll('[data-rail-step]').length).toBe(ONBOARDING_STEPS.length + 1)
    expect(q('[aria-current="step"]')!.textContent).toContain(ONBOARDING_STEPS[0]!.label)
    for (const step of ONBOARDING_STEPS) {
      if (step.scene === 'panel') {
        expect(q('[data-onboarding-showcase]')).not.toBeNull()
        expect(q('video')).toBeNull()
      } else {
        expect(q('video')!.getAttribute('src')).toBe(`/base${step.video}`)
        expect(q('video')!.getAttribute('poster')).toBe(`/base${step.poster}`)
      }
      expect(q('[data-onboarding-intro]')!.textContent).toContain(step.accent)
      await click('[data-onboarding-next]')
    }
    expect(q('[data-stub-commands]')).not.toBeNull()
    expect(q('video')).toBeNull()
    expect(q('[aria-current="step"]')!.textContent).toContain('Comandi')
    expect(document.body.querySelectorAll('.onboarding__rail-item.is-done').length).toBe(ONBOARDING_STEPS.length)
    expect(mock.close).not.toHaveBeenCalled()
    // The rail jumps back to any step.
    ;(document.body.querySelectorAll('[data-rail-step]')[1] as HTMLElement).click(); await flushPromises()
    expect(q('[data-onboarding-intro]')!.textContent).toContain(ONBOARDING_STEPS[1]!.accent)
    wrapper.unmount()
  })

  it('Indietro steps back; Salta and Esc jump to the commands instead of closing', async () => {
    const wrapper = mountIntro(); await open()
    await click('[data-onboarding-next]'); await click('[data-onboarding-prev]')
    expect(q('[data-onboarding-intro]')!.textContent).toContain(ONBOARDING_STEPS[0]!.accent)
    await click('[data-onboarding-skip]')
    expect(q('[data-stub-commands]')).not.toBeNull()
    expect(mock.close).not.toHaveBeenCalled()
    mock.visible.value = false; await flushPromises(); await open()
    expect(q('video')).not.toBeNull()
    q('[data-onboarding-intro]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(q('[data-stub-commands]')).not.toBeNull()
    wrapper.unmount()
  })

  it('ends on a last screen: saved at once, closed by Inizia, telling done from later', async () => {
    const wrapper = mountIntro(); await open()
    await click('[data-onboarding-skip]')
    await click('[data-done]')
    expect(mock.save).toHaveBeenLastCalledWith('done')
    expect(mock.close).not.toHaveBeenCalled()
    expect(q('[data-onboarding-finish]')!.textContent).toContain('a guidare')
    expect(document.body.querySelectorAll('.onboarding__rail-item.is-done').length).toBe(ONBOARDING_STEPS.length + 1)
    expect((q('[data-rail-step]') as HTMLButtonElement).disabled).toBe(true)
    await click('[data-onboarding-start]')
    expect(mock.close).toHaveBeenLastCalledWith('done')
    mock.visible.value = false; await flushPromises(); await open()
    await click('[data-onboarding-skip]')
    await click('[data-later]')
    expect(mock.save).toHaveBeenLastCalledWith('later')
    expect(q('[data-onboarding-finish]')!.textContent).toContain('completato')
    q('[data-onboarding-intro]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(mock.close).toHaveBeenLastCalledWith('later')
    wrapper.unmount()
  })

  it('opens directly on the commands when asked, and offers the wheel only in the primary Electron window', async () => {
    Object.assign(window, { electronAPI: { localIdentityRole: 'primary', controlsGetState: vi.fn() } })
    mock.startPhase.value = 'commands'
    const wrapper = mountIntro(); await open()
    expect(q('[data-stub-commands]')!.getAttribute('data-wheel')).toBe('true')
    wrapper.unmount()
    document.body.innerHTML = ''
    Object.assign(window, { electronAPI: { localIdentityRole: 'consumer', controlsGetState: vi.fn() } })
    mock.visible.value = false
    const other = mountIntro(); await open()
    expect(q('[data-stub-commands]')!.getAttribute('data-wheel')).toBe('false')
    other.unmount()
  })

  it('retries the first-time check when the user arrives after mount', async () => {
    mock.currentUser.value = null
    const wrapper = mountIntro(); await flushPromises()
    mock.currentUser.value = { uid: 'late' }; await flushPromises()
    expect(mock.showIfFirstTime).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
