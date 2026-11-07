// @vitest-environment jsdom
import { setLocale, translate } from '~/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OnboardingIntro from '~/components/onboarding/OnboardingIntro.vue'
import { ONBOARDING_STEPS, stepMedia } from '~/services/onboarding/onboardingSteps'

const mock = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return {
    visible: ref(false),
    startPhase: ref<'tour' | 'commands'>('tour'),
    showIfFirstTime: vi.fn(async () => false),
    open: vi.fn(),
    save: vi.fn(),
    close: vi.fn(),
    abandon: vi.fn(),
    openings: ref(0),
    currentUser: ref<{ uid: string } | null>({ uid: 'u1' }),
    router: { currentRoute: ref({ path: '/sessioni' }), push: vi.fn(async () => undefined) },
  }
})
// PIP-749: Inizia lands on the Panoramica.
vi.mock('vue-router', async (orig) => ({ ...(await orig<typeof import('vue-router')>()), useRouter: () => mock.router }))
vi.mock('~/composables/useOnboardingIntro', () => ({
  useOnboardingIntro: () => ({ visible: mock.visible, startPhase: mock.startPhase, openings: mock.openings, showIfFirstTime: mock.showIfFirstTime, open: mock.open, save: mock.save, close: mock.close, abandon: mock.abandon }),
}))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ currentUser: mock.currentUser }) }))
vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (p: string) => `/base${p}` }) }))

const stubCalls: string[] = []
const stubState = { busy: false }
const commandsStub = {
  props: ['wheelAvailable'],
  emits: ['done', 'later'],
  computed: { busy: () => stubState.busy },
  methods: {
    postpone(this: { $emit: (event: string) => void }) { this.$emit('later') },
    pause() { stubCalls.push('pause') },
    resume() { stubCalls.push('resume') },
  },
  template: '<div data-stub-commands :data-wheel="String(wheelAvailable)"><button data-done @click="$emit(\'done\', \'Wheel · Pulsante 26\')" /><button data-later @click="$emit(\'later\')" /></div>',
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

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('OnboardingIntro (PIP-571)', () => {
  it('asks to open itself on mount in the desktop program and renders nothing while hidden', async () => {
    Object.assign(window, { electronAPI: {} })
    const wrapper = mountIntro(); await flushPromises()
    expect(mock.showIfFirstTime).toHaveBeenCalledTimes(1)
    expect(q('[data-onboarding-intro]')).toBeNull()
    wrapper.unmount()
  })

  it('PIP-657: in a browser it never opens by itself', async () => {
    const wrapper = mountIntro(); await flushPromises()
    mock.currentUser.value = { uid: 'other' }; await flushPromises()
    expect(mock.showIfFirstTime).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('walks the welcome card and the four clips, then hands over to the key setup (PIP-749)', async () => {
    const wrapper = mountIntro(); await open()
    expect(document.body.querySelectorAll('[data-rail-step]').length).toBe(ONBOARDING_STEPS.length + 1)
    expect(q('[aria-current="step"]')!.textContent).toContain(translate('it', ONBOARDING_STEPS[0]!.label))
    for (const step of ONBOARDING_STEPS) {
      if (step.scene === 'welcome') {
        // The four pillars are drawn live, no clip.
        expect(document.body.querySelectorAll('[data-pillar]').length).toBe(4)
        expect(q('video')).toBeNull()
      } else {
        expect(q('video')!.getAttribute('src')).toBe(`/base${stepMedia(step.video, 'it')}`)
        expect(q('video')!.getAttribute('src')).toContain('/onboarding/v3/it/')
        expect(q('video')!.getAttribute('poster')).toBe(`/base${stepMedia(step.poster, 'it')}`)
      }
      expect(q('[data-onboarding-intro]')!.textContent).toContain(translate('it', step.accent))
      await click('[data-onboarding-next]')
    }
    expect(q('[data-stub-commands]')).not.toBeNull()
    expect(q('video')).toBeNull()
    expect(q('[aria-current="step"]')!.textContent).toContain('Comandi')
    expect(document.body.querySelectorAll('.onboarding__rail-item.is-done').length).toBe(ONBOARDING_STEPS.length)
    expect(mock.close).not.toHaveBeenCalled()
    // The rail jumps back to any step.
    ;(document.body.querySelectorAll('[data-rail-step]')[1] as HTMLElement).click(); await flushPromises()
    expect(q('[data-onboarding-intro]')!.textContent).toContain(translate('it', ONBOARDING_STEPS[1]!.accent))
    wrapper.unmount()
  })

  it('Indietro steps back; Salta and Esc jump to the commands instead of closing', async () => {
    const wrapper = mountIntro(); await open()
    await click('[data-onboarding-next]'); await click('[data-onboarding-prev]')
    expect(q('[data-onboarding-intro]')!.textContent).toContain(translate('it', ONBOARDING_STEPS[0]!.accent))
    await click('[data-onboarding-skip]')
    expect(q('[data-stub-commands]')).not.toBeNull()
    expect(mock.close).not.toHaveBeenCalled()
    mock.visible.value = false; await flushPromises(); await open()
    expect(q('[data-onboarding-welcome]')).not.toBeNull()
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
    expect(q('[data-onboarding-finish]')!.textContent).toContain('per la pista')
    // The key just chosen, drawn as a key, next to Ctrl+K.
    expect([...document.body.querySelectorAll('[data-onboarding-keys] kbd')].map(k => k.textContent)).toEqual(['Wheel · Pulsante 26', 'Ctrl+K'])
    expect(document.body.querySelectorAll('.onboarding__rail-item.is-done').length).toBe(ONBOARDING_STEPS.length + 1)
    expect((q('[data-rail-step]') as HTMLButtonElement).disabled).toBe(true)
    mock.router.push.mockClear(); mock.router.currentRoute.value = { path: '/sessioni' }
    await click('[data-onboarding-start]')
    expect(mock.close).toHaveBeenLastCalledWith('done')
    expect(mock.router.push).toHaveBeenCalledWith('/panoramica')
    mock.visible.value = false; await flushPromises(); await open()
    await click('[data-onboarding-skip]')
    await click('[data-later]')
    expect(mock.save).toHaveBeenLastCalledWith('later')
    expect(q('[data-onboarding-finish]')!.textContent).toContain('Impostazioni → Comandi')
    q('[data-onboarding-intro]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(mock.close).toHaveBeenLastCalledWith('later')
    expect(mock.router.push).toHaveBeenCalledTimes(2)
    // Already on the Panoramica: no second navigation.
    mock.router.push.mockClear(); mock.router.currentRoute.value = { path: '/panoramica' }
    mock.visible.value = false; await flushPromises(); await open()
    await click('[data-onboarding-skip]'); await click('[data-done]'); await click('[data-onboarding-start]')
    expect(mock.router.push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('PIP-749: the clips follow the interface language (labels are burned into the video)', async () => {
    setLocale('en')
    try {
      const wrapper = mountIntro(); await open()
      await click('[data-onboarding-next]')
      expect(q('video')!.getAttribute('src')).toBe(`/base${stepMedia(ONBOARDING_STEPS[1]!.video, 'en')}`)
      expect(q('video')!.getAttribute('src')).toContain('/onboarding/v3/en/')
      wrapper.unmount()
    } finally { setLocale('it') }
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

  // PIP-612: the way out stays in the same corner; on the commands it asks for
  // confirmation right under itself, nothing appears elsewhere.
  it('"Lo faccio dopo" sits where "Salta" was and confirms in place', async () => {
    Object.assign(window, { electronAPI: { localIdentityRole: 'primary', controlsGetState: vi.fn() } })
    const wrapper = mountIntro(); await open()
    expect(q('[data-onboarding-skip]')).not.toBeNull()
    await click('[data-onboarding-skip]'); await new Promise(r => setTimeout(r, 400)); await flushPromises()
    expect(q('[data-cmd-later]')).not.toBeNull()
    expect(q('[data-later-confirm]')).toBeNull()
    stubCalls.length = 0
    await click('[data-cmd-later]')
    expect(q('[data-later-confirm]')!.textContent).toContain('Impostazioni → Comandi')
    // The key list stops listening while the confirmation is open, and listens again after.
    expect(stubCalls).toEqual(['pause'])
    await click('[data-later-cancel]')
    expect(stubCalls).toEqual(['pause', 'resume'])
    expect(mock.save).not.toHaveBeenCalled()
    stubCalls.length = 0
    await click('[data-cmd-later]'); await click('[data-cmd-later-confirm]')
    expect(mock.save).toHaveBeenLastCalledWith('later')
    // PIP-749: leaving with "Sì, dopo" must not make the departing key list listen again.
    expect(stubCalls).toEqual(['pause'])
    expect(q('[data-onboarding-finish]')).not.toBeNull()
    wrapper.unmount()
  })

  it('PIP-749: the rail is still while keys are being set and on the last screen', async () => {
    const wrapper = mountIntro(); await open()
    const rail = () => [...document.body.querySelectorAll('[data-rail-step]')] as HTMLButtonElement[]
    expect(rail().every(b => !b.disabled)).toBe(true)
    await click('[data-onboarding-skip]')
    stubState.busy = false
    expect(rail().every(b => !b.disabled)).toBe(true)
    stubState.busy = true
    mock.visible.value = false; await flushPromises(); await open(); await click('[data-onboarding-skip]')
    expect(rail().every(b => b.disabled)).toBe(true)
    stubState.busy = false
    wrapper.unmount()
  })

  it('PIP-749: a double click on Avanti moves one card, a double click on Inizia navigates once', async () => {
    const wrapper = mountIntro(); await open()
    const next = q('[data-onboarding-next]')!
    next.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    next.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })); await flushPromises()
    expect(q('[aria-current="step"]')!.textContent).toContain(translate('it', ONBOARDING_STEPS[1]!.label))
    await click('[data-onboarding-skip]'); await click('[data-done]')
    mock.router.push.mockClear(); mock.router.currentRoute.value = { path: '/sessioni' }
    mock.close.mockImplementation(() => { mock.visible.value = false })
    const go = q('[data-onboarding-start]')!
    go.click(); go.click(); await flushPromises()
    expect(mock.router.push).toHaveBeenCalledTimes(1)
    mock.close.mockReset()
    wrapper.unmount()
  })

  it('PIP-749: Esc works even when the focus left the window (step or language change)', async () => {
    const wrapper = mountIntro(); await open()
    await click('[data-onboarding-next]')
    ;(document.activeElement as HTMLElement | null)?.blur()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(q('[data-stub-commands]')).not.toBeNull()
    // The rail keeps its buttons across a language change (keyed by position, not by name).
    ;(document.body.querySelectorAll('[data-rail-step]')[0] as HTMLElement).click(); await flushPromises()
    const first = q('[data-rail-step]')
    setLocale('en'); await flushPromises()
    expect(q('[data-rail-step]')).toBe(first)
    setLocale('it'); await flushPromises()
    // Closed: Esc no longer reaches the introduction.
    mock.visible.value = false; await flushPromises()
    mock.close.mockClear()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(mock.close).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('PIP-749: reopened while open it restarts; another account drops it; Tab stays inside', async () => {
    const wrapper = mountIntro(); await open()
    await click('[data-onboarding-next]'); await click('[data-onboarding-next]')
    mock.openings.value++; await flushPromises()
    expect(q('[aria-current="step"]')!.textContent).toContain(translate('it', ONBOARDING_STEPS[0]!.label))
    // Tab from the page behind comes back into the window.
    ;(document.activeElement as HTMLElement | null)?.blur()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); await flushPromises()
    expect(q('[data-onboarding-intro]')!.contains(document.activeElement)).toBe(true)
    mock.currentUser.value = { uid: 'u2' }; await flushPromises()
    expect(mock.abandon).toHaveBeenCalledTimes(1)
    mock.currentUser.value = { uid: 'u1' }
    wrapper.unmount()
  })

  it('retries the first-time check when the user arrives after mount', async () => {
    Object.assign(window, { electronAPI: {} })
    mock.currentUser.value = null
    const wrapper = mountIntro(); await flushPromises()
    mock.currentUser.value = { uid: 'late' }; await flushPromises()
    expect(mock.showIfFirstTime).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
