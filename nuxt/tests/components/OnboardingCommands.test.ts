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

const ORDER: WheelControlAction[] = ['togglePalette', 'nextAction', 'previousAction', 'activateAction']
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
  it('wheel path: assigns the four commands one at a time, practises the panel and finishes', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } })
    await flushPromises()
    expect(mock.bridge.start).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-cmd-screen="choose"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Collegati: Wheel')
    await wrapper.get('button[data-cmd-wheel]').trigger('click'); await flushPromises()
    for (const [i, action] of ORDER.entries()) {
      expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith(action)
      expect(wrapper.text()).toContain('Assegna i pulsanti del volante')
      expect(wrapper.text()).toContain(`Comando ${i + 1} di 4`)
      expect(wrapper.text()).toContain('Premi il pulsante sul volante')
      expect(wrapper.find(`[data-slot="${action}"]`).classes()).toContain('now')
      expect(wrapper.find(`[data-slot="${action}"]`).text()).toContain('da assegnare')
      await pressAndSave(action, i + 1)
      if (i < ORDER.length - 1) expect(wrapper.find(`[data-slot="${action}"]`).classes()).toContain('set')
    }
    expect(wrapper.find('[data-cmd-screen="practice"]').exists()).toBe(true)
    expect(mock.bridge.setTestMode).toHaveBeenLastCalledWith(true)
    expect(wrapper.get('[data-cmd-mock]').text()).toContain('Pannello chiuso')
    await tap('togglePalette')
    expect(wrapper.find('.cmd__tile.is-selected').text()).toBe('Stima pressioni')
    await tap('nextAction'); await tap('nextAction'); await tap('previousAction'); await tap('activateAction')
    expect(wrapper.get('[data-cmd-mock]').text()).toContain('Hai confermato: Correggi pressioni')
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
    expect(wrapper.text()).toContain('Comando 2 di 4')
    expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith('nextAction')
    await wrapper.get('[data-cmd-back]').trigger('click'); await flushPromises()
    expect(mock.bridge.cancelCapture).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Comando 1 di 4')
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

  it('keyboard-only is an explicit choice that finishes; without the desktop bridge it is the only screen', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } })
    await wrapper.get('button[data-cmd-keyboard]').trigger('click')
    expect(wrapper.text()).toContain('apre e chiude il pannello')
    expect(wrapper.find('button[data-cmd-wheel]').exists()).toBe(true)
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
