// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OnboardingCommands from '~/components/onboarding/OnboardingCommands.vue'
import { EMPTY_WHEEL_BINDINGS, type WheelControlAction } from '~/services/controls/wheelBindingModel'

const mock = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { bridge: null as any, ref }
})
vi.mock('~/composables/useWheelInputBridge', () => ({ useWheelInputBridge: () => mock.bridge }))
vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (p: string) => p }) }))

const ORDER: WheelControlAction[] = ['togglePalette', 'nextAction', 'previousAction', 'activateAction', 'mainMenu']
const binding = (button: number) => ({ deviceId: 'Wheel', deviceLabel: 'Wheel', button })

beforeEach(() => {
  vi.useFakeTimers()
  const { ref } = mock
  const state = ref({ available: true, inputStatus: 'ready', inputBackend: 'native', devices: [{ deviceId: 'Wheel', deviceLabel: 'Wheel', buttons: [] }],
    bindings: { ...EMPTY_WHEEL_BINDINGS } as Record<WheelControlAction, any>, capture: null as any, lastError: null, ambiguousDeviceIds: [], operation: undefined as any })
  const testMode = ref(false)
  const testedActions = ref<WheelControlAction[]>([])
  mock.bridge = {
    state, testMode, testedActions,
    start: vi.fn(async () => true),
    beginCapture: vi.fn(async (action: WheelControlAction) => { state.value = { ...state.value, capture: { action }, operation: undefined } }),
    cancelCapture: vi.fn(async () => { state.value = { ...state.value, capture: null } }),
    setTestMode: vi.fn((on: boolean) => { testMode.value = on }),
    finishConfiguration: vi.fn(async () => undefined),
    captureKey: vi.fn(async () => undefined),
  }
})
afterEach(() => { vi.useRealTimers() })

/** The pilot presses a button while the current command is waiting. */
async function pressAndSave(action: WheelControlAction, button: number) {
  const s = mock.bridge.state
  s.value = { ...s.value, capture: null, bindings: { ...s.value.bindings, [action]: binding(button) }, operation: { ok: true, saved: true } }
  await flushPromises()
  vi.advanceTimersByTime(1000)
  await flushPromises()
}
async function tap(action: WheelControlAction) {
  mock.bridge.testedActions.value = [action]; await flushPromises()
  mock.bridge.testedActions.value = []; await flushPromises()
}

describe('OnboardingCommands (PIP-571)', () => {
  it('wheel path: assigns the five commands one at a time, practises the panel and finishes', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } })
    await flushPromises()
    expect(mock.bridge.start).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-cmd-screen="choose"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Collegati: Wheel')
    // Two readers of the same wheel are listed once.
    mock.bridge.state.value = { ...mock.bridge.state.value, devices: [...mock.bridge.state.value.devices, { deviceId: 'Wheel-2', deviceLabel: 'Wheel', buttons: [] }] }
    await flushPromises()
    expect(wrapper.text()).toContain('Collegati: Wheel')
    expect(wrapper.text()).not.toContain('Wheel, Wheel')
    await wrapper.get('button[data-cmd-wheel]').trigger('click'); await flushPromises()
    for (const [i, action] of ORDER.entries()) {
      expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith(action)
      expect(wrapper.text()).toContain('Assegna i pulsanti del volante')
      expect(wrapper.text()).toContain(`Comando ${i + 1} di 5`)
      expect(wrapper.get('[data-cmd-ask]').text()).toContain('Premi ora un pulsante del volante')
      expect(wrapper.find(`[data-slot="${action}"]`).classes()).toContain('now')
      expect(wrapper.find(`[data-slot="${action}"]`).text()).toContain('premi un pulsante')
      // Only Indietro can be skipped.
      expect(wrapper.find('[data-cmd-skip]').exists()).toBe(action === 'mainMenu')
      await pressAndSave(action, i + 1)
      if (i < ORDER.length - 1) expect(wrapper.find(`[data-slot="${action}"]`).classes()).toContain('set')
    }
    expect(wrapper.find('[data-cmd-screen="practice"]').exists()).toBe(true)
    expect(mock.bridge.setTestMode).toHaveBeenLastCalledWith(true)
    expect(wrapper.get('[data-cmd-mock]').text()).toContain('Pannello rapido chiuso')
    await tap('togglePalette')
    expect(wrapper.find('.replica__tile.is-selected').text()).toContain('Stima pressioni')
    // The mouse drives the same copy, like the real panel, without ticking button exercises.
    await wrapper.get('[data-replica-tile="4"]').trigger('mouseenter')
    expect(wrapper.get('[data-replica-tile="4"]').classes()).toContain('is-selected')
    expect(wrapper.find('[data-task="next"]').classes()).not.toContain('done')
    await wrapper.get('[data-replica-tile="0"]').trigger('mouseenter')
    await tap('nextAction'); await tap('nextAction'); await tap('previousAction'); await tap('activateAction')
    expect(wrapper.get('[data-cmd-mock]').text()).toContain('Hai confermato: Correggi pressioni')
    await tap('mainMenu')
    expect(wrapper.find('[data-task="back"]').classes()).toContain('done')
    expect(wrapper.find('.replica__tile.is-confirmed').exists()).toBe(false)
    await tap('togglePalette')
    expect(mock.bridge.setTestMode).toHaveBeenLastCalledWith(false)
    vi.advanceTimersByTime(1000); await flushPromises()
    expect(wrapper.find('[data-cmd-screen="ready"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Wheel · Pulsante 2')
    await wrapper.get('[data-cmd-finish]').trigger('click'); await flushPromises()
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(mock.bridge.finishConfiguration).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('Indietro is optional: skipping it leaves it unassigned and drops its exercise', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } })
    await wrapper.get('button[data-cmd-wheel]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-slot="mainMenu"]').text()).toContain('facoltativo')
    for (const [i, action] of ORDER.slice(0, 4).entries()) await pressAndSave(action, i + 1)
    expect(wrapper.text()).toContain('Comando 5 di 5 · facoltativo')
    await wrapper.get('[data-cmd-skip]').trigger('click'); await flushPromises()
    expect(mock.bridge.cancelCapture).toHaveBeenCalled()
    expect(mock.bridge.state.value.bindings.mainMenu).toBeNull()
    expect(wrapper.find('[data-cmd-screen="practice"]').exists()).toBe(true)
    expect(wrapper.find('[data-task="back"]').exists()).toBe(false)
    await tap('togglePalette'); await tap('nextAction'); await tap('nextAction'); await tap('previousAction'); await tap('activateAction')
    await tap('togglePalette')
    vi.advanceTimersByTime(1000); await flushPromises()
    expect(wrapper.find('[data-cmd-screen="ready"]').exists()).toBe(true)
    expect(wrapper.find('.cmd__summary b.off').text()).toBe('Non assegnato')
    wrapper.unmount()
  })

  it('a failed or cancelled capture explains and Riprova arms it again', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } })
    await wrapper.get('button[data-cmd-wheel]').trigger('click'); await flushPromises()
    const s = mock.bridge.state
    s.value = { ...s.value, capture: null, operation: { ok: false, reason: 'binding_conflict' } }
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toMatch(/già assegnato/)
    await wrapper.get('[data-cmd-retry]').trigger('click'); await flushPromises()
    expect(mock.bridge.beginCapture).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('an existing assignment can be kept without pressing anything, and Indietro goes back', async () => {
    mock.bridge.state.value.bindings.togglePalette = binding(7)
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } })
    await wrapper.get('button[data-cmd-wheel]').trigger('click'); await flushPromises()
    expect(mock.bridge.beginCapture).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Già assegnato: Wheel · Pulsante 8')
    await wrapper.get('[data-cmd-keep]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Comando 2 di 5')
    expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith('nextAction')
    await wrapper.get('[data-cmd-back]').trigger('click'); await flushPromises()
    expect(mock.bridge.cancelCapture).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Comando 1 di 5')
    wrapper.unmount()
  })

  it('waits for the readers before arming the first capture', async () => {
    mock.bridge.state.value = { ...mock.bridge.state.value, inputStatus: 'starting' }
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } })
    await wrapper.get('button[data-cmd-wheel]').trigger('click'); await flushPromises()
    expect(mock.bridge.beginCapture).not.toHaveBeenCalled()
    mock.bridge.state.value = { ...mock.bridge.state.value, inputStatus: 'ready' }; await flushPromises()
    expect(mock.bridge.beginCapture).toHaveBeenCalledWith('togglePalette')
    wrapper.unmount()
  })

  it('"Lo faccio dopo" asks for confirmation and then emits later', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } })
    await wrapper.get('[data-cmd-later]').trigger('click')
    expect(wrapper.emitted('later')).toBeUndefined()
    expect(wrapper.text()).toContain('Te lo richiedo al prossimo avvio')
    await wrapper.get('[data-cmd-later-confirm]').trigger('click'); await flushPromises()
    expect(wrapper.emitted('later')).toHaveLength(1)
    wrapper.unmount()
  })

  it('keyboard path: the pilot must open and close the REAL panel with Ctrl+K before finishing', async () => {
    let push: (p: { visible: boolean }) => void = () => {}
    const off = vi.fn()
    Object.assign(window, { electronAPI: { onTrainingOverlayVisibility: (cb: typeof push) => { push = cb; return off } } })
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } })
    await wrapper.get('button[data-cmd-keyboard]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-cmd-screen="keyboard"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Premi Ctrl+K adesso.')
    expect(wrapper.get('[data-cmd-finish]').attributes('disabled')).toBeDefined()
    push({ visible: false }); await flushPromises()
    expect(wrapper.find('[data-task="kb-open"]').classes()).toContain('now')
    push({ visible: true }); await flushPromises()
    expect(wrapper.find('[data-task="kb-open"]').classes()).toContain('done')
    expect(wrapper.get('[data-cmd-kb-mock]').text()).toContain('Correggi pressioni')
    expect(wrapper.text()).toContain('Clicca una voce qui sopra')
    // Hover selects like the real panel; closing before the click does not count.
    await wrapper.get('[data-replica-tile="3"]').trigger('mouseenter')
    expect(wrapper.get('[data-replica-tile="3"]').classes()).toContain('is-selected')
    push({ visible: false }); await flushPromises()
    expect(wrapper.find('[data-task="kb-close"]').classes()).not.toContain('done')
    expect(wrapper.text()).toContain('Riaprilo con Ctrl+K')
    push({ visible: true }); await flushPromises()
    await wrapper.get('[data-replica-tile="1"]').trigger('click')
    expect(wrapper.find('[data-task="kb-click"]').classes()).toContain('done')
    expect(wrapper.get('[data-cmd-kb-mock]').text()).toContain('Hai scelto: Correggi pressioni')
    expect(wrapper.text()).toContain('Ora premi di nuovo Ctrl+K')
    expect(wrapper.get('[data-cmd-finish]').attributes('disabled')).toBeDefined()
    push({ visible: false }); await flushPromises()
    expect(wrapper.find('[data-task="kb-close"]').classes()).toContain('done')
    expect(wrapper.get('[data-cmd-finish]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-cmd-finish]').trigger('click')
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(off).toHaveBeenCalled()
    wrapper.unmount()
    delete (window as any).electronAPI
  })

  it('keyboard path without the desktop signal does not block; Indietro returns to the choice', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } })
    await wrapper.get('button[data-cmd-keyboard]').trigger('click')
    expect(wrapper.find('[data-task="kb-open"]').exists()).toBe(false)
    expect(wrapper.find('button[data-cmd-wheel]').exists()).toBe(true)
    await wrapper.get('[data-cmd-back]').trigger('click')
    expect(wrapper.find('[data-cmd-screen="choose"]').exists()).toBe(true)
    await wrapper.get('button[data-cmd-keyboard]').trigger('click')
    await wrapper.get('[data-cmd-finish]').trigger('click')
    expect(wrapper.emitted('done')).toHaveLength(1)
    wrapper.unmount()
    mock.bridge.start.mockClear()
    const browser = mount(OnboardingCommands, { props: { wheelAvailable: false } })
    expect(browser.find('[data-cmd-screen="keyboard"]').exists()).toBe(true)
    expect(browser.find('button[data-cmd-wheel]').exists()).toBe(false)
    expect(browser.find('[data-cmd-later]').exists()).toBe(false)
    expect(mock.bridge.start).not.toHaveBeenCalled()
    browser.unmount()
  })
})
