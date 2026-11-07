// @vitest-environment jsdom
import { setLocale } from '~/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OnboardingCommands from '~/components/onboarding/OnboardingCommands.vue'
import { EMPTY_WHEEL_BINDINGS, type WheelControlAction } from '~/services/controls/wheelBindingModel'

const mock = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { bridge: null as any, ref, windowVisible: ref(true) }
})
vi.mock('~/composables/useWheelInputBridge', () => ({ useWheelInputBridge: () => mock.bridge }))
// PIP-749: the native window state (X to tray), fed by the desktop program.
vi.mock('~/composables/usePresentationVisibility', () => ({ usePresentationVisibility: () => mock.windowVisible }))
vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (p: string) => p }) }))

const ORDER: WheelControlAction[] = ['togglePalette', 'nextAction', 'previousAction', 'activateAction', 'mainMenu']
const binding = (button: number) => ({ deviceId: 'Wheel', deviceLabel: 'Wheel', button })

beforeEach(() => {
  vi.useFakeTimers()
  mock.windowVisible.value = true
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

/** PIP-749: with a wheel reader the step opens on the question; "yes" leads to the key list. */
async function answerYes(wrapper: { get: (s: string) => { trigger: (e: string) => Promise<void> } }) {
  await wrapper.get('[data-cmd-choose-wheel]').trigger('click'); await flushPromises()
}

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('OnboardingCommands (PIP-571)', () => {
  it('PIP-749: asks first; nothing listens until "yes", "no" goes to the Ctrl+K trial, Indietro asks again', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises()
    expect(wrapper.find('[data-cmd-screen="choose"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('i tasti del volante?')
    expect(mock.bridge.start).toHaveBeenCalledTimes(1)
    expect(mock.bridge.beginCapture).not.toHaveBeenCalled()
    await wrapper.get('[data-cmd-choose-keyboard]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-cmd-screen="keyboard"]').exists()).toBe(true)
    await wrapper.get('[data-cmd-back]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-cmd-screen="choose"]').exists()).toBe(true)
    await answerYes(wrapper)
    expect(wrapper.find('[data-cmd-screen="assign"]').exists()).toBe(true)
    expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith('togglePalette')
    // From the key list, Indietro also returns to the question and stops listening.
    await wrapper.get('[data-cmd-back]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-cmd-screen="choose"]').exists()).toBe(true)
    expect(mock.bridge.cancelCapture).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('wheel path: assigns the five commands one at a time, practises the panel and finishes', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    await flushPromises()
    expect(mock.bridge.start).toHaveBeenCalledTimes(1)
    // PIP-612: no choice first: the key list opens with its first row already waiting.
    expect(wrapper.find('[data-cmd-screen="assign"]').exists()).toBe(true)
    expect(wrapper.find('[data-cmd-screen="choose"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Imposta i tasti')
    for (const [, action] of ORDER.entries()) {
      expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith(action)
      expect(wrapper.get(`[data-slot="${action}"] .cmd__bind-key`).text()).toBe('premi un tasto…')
      expect(wrapper.find(`[data-slot="${action}"]`).classes()).toContain('now')
      // Only Indietro can be skipped.
      expect(wrapper.find('[data-cmd-skip]').exists()).toBe(action === 'mainMenu')
      const i = ORDER.indexOf(action)
      await pressAndSave(action, i + 1)
      if (i < ORDER.length - 1) {
        expect(wrapper.find(`[data-slot="${action}"]`).classes()).toContain('done')
        // The button first, the device on a second, smaller line.
        expect(wrapper.get(`[data-slot="${action}"] .cmd__bind-key b`).text()).toBe(`✓ Pulsante ${i + 2}`)
        expect(wrapper.get(`[data-slot="${action}"] .cmd__bind-key small`).text()).toBe('Wheel')
      }
    }
    expect(wrapper.find('[data-cmd-screen="practice"]').exists()).toBe(true)
    expect(mock.bridge.setTestMode).toHaveBeenLastCalledWith(true)
    expect(wrapper.get('[data-cmd-mock]').text()).toContain('Menu chiuso')
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
    // The menu key travels to the last screen of the introduction.
    expect(wrapper.emitted('done')).toEqual([['Wheel · Pulsante 2']])
    expect(mock.bridge.finishConfiguration).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('Indietro is optional: skipping it leaves it unassigned and drops its exercise', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    for (const [i, action] of ORDER.slice(0, 4).entries()) await pressAndSave(action, i + 1)
    expect(wrapper.find('[data-slot="mainMenu"]').classes()).toContain('now'); expect(wrapper.get('[data-slot="mainMenu"]').text()).toContain('facoltativo')
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

  it('after a while without any button it says what to check', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    expect(wrapper.get('[data-cmd-ask]').text()).not.toContain('collegato')
    vi.advanceTimersByTime(8100); await flushPromises()
    expect(wrapper.get('[data-cmd-ask]').text()).toContain('Il volante è collegato?')
    await pressAndSave('togglePalette', 1)
    expect(wrapper.get('[data-cmd-ask]').text()).not.toContain('collegato')
    wrapper.unmount()
  })

  it('a failed or cancelled capture explains and Riprova arms it again', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    const s = mock.bridge.state
    s.value = { ...s.value, capture: null, operation: { ok: false, reason: 'binding_conflict' } }
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toMatch(/già assegnato/)
    await wrapper.get('[data-cmd-retry]').trigger('click'); await flushPromises()
    expect(mock.bridge.beginCapture).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  // PIP-612: the classic key list. Empty rows are filled in order; a row with a key
  // changes when clicked; with every row set there is one action, Continua.
  it('a click on a row right after a save cancels the pending move to the next command', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    await pressAndSave('togglePalette', 1)
    expect(wrapper.find('[data-slot="nextAction"]').classes()).toContain('now')
    const s = mock.bridge.state
    s.value = { ...s.value, capture: null, bindings: { ...s.value.bindings, nextAction: binding(2) }, operation: { ok: true, saved: true } }
    await flushPromises()
    // Before the 900 ms tick: the pilot clicks the first row to change its key.
    await wrapper.get('[data-slot="togglePalette"] .cmd__bind').trigger('click'); await flushPromises()
    expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith('togglePalette')
    expect(wrapper.get('[data-cmd-ask]').text()).toContain('Premi il nuovo tasto')
    vi.advanceTimersByTime(1000); await flushPromises()
    expect(wrapper.find('[data-slot="togglePalette"]').classes()).toContain('now')
    wrapper.unmount()
  })

  it('rows already set are skipped; a changed key stays on its row; Esc keeps the old key', async () => {
    mock.bridge.state.value.bindings.togglePalette = binding(7)
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    expect(wrapper.get('[data-slot="togglePalette"] .cmd__bind-key b').text()).toBe('✓ Pulsante 8')
    // The cursor starts on the first empty row.
    expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith('nextAction')
    expect(wrapper.find('[data-slot="nextAction"]').classes()).toContain('now')
    // Change the first key, then Esc: the old key stays and nothing is reported.
    await wrapper.get('[data-slot="togglePalette"] .cmd__bind').trigger('click'); await flushPromises()
    const s = mock.bridge.state
    s.value = { ...s.value, capture: null, operation: undefined }; await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('[data-slot="togglePalette"] .cmd__bind-key b').text()).toBe('✓ Pulsante 8')
    // ...and the cursor goes back to the first empty row, waiting again.
    expect(wrapper.find('[data-slot="nextAction"]').classes()).toContain('now')
    expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith('nextAction')
    wrapper.unmount()
  })

  // Codex review of PIP-612: captures left half-way.
  it('Esc goes back to the FIRST empty row, not the next one after the changed key', async () => {
    const s = mock.bridge.state
    s.value.bindings = { ...s.value.bindings, togglePalette: binding(0), previousAction: binding(2), activateAction: binding(3) }
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    await wrapper.get('[data-slot="activateAction"] .cmd__bind').trigger('click'); await flushPromises()
    s.value = { ...s.value, capture: null, operation: undefined }; await flushPromises()
    expect(wrapper.find('[data-slot="nextAction"]').classes()).toContain('now')
    wrapper.unmount()
  })

  it('clicking the row that is already listening does not arm it again after Esc', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    expect(mock.bridge.beginCapture).toHaveBeenCalledTimes(1)
    await wrapper.get('[data-slot="togglePalette"] .cmd__bind').trigger('click'); await flushPromises()
    expect(mock.bridge.beginCapture).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('a capture that starts late after leaving for the keyboard path is dropped', async () => {
    const s = mock.bridge.state
    let finishBegin: () => void = () => {}
    mock.bridge.beginCapture = vi.fn((action: WheelControlAction) => new Promise<void>((resolve) => {
      finishBegin = () => { s.value = { ...s.value, capture: { action }, operation: undefined }; resolve() }
    }))
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    // PIP-749: from the key list, Indietro and then "No, tastiera e mouse".
    await wrapper.get('[data-cmd-back]').trigger('click'); await flushPromises()
    await wrapper.get('[data-cmd-choose-keyboard]').trigger('click'); await flushPromises()
    finishBegin(); await flushPromises()
    expect(wrapper.find('[data-cmd-screen="keyboard"]').exists()).toBe(true)
    expect(mock.bridge.cancelCapture).toHaveBeenCalled()
    expect(s.value.capture).toBeNull()
    wrapper.unmount()
  })

  it('pause stops listening without an error; resume listens again on the same row', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    const api = wrapper.vm as unknown as { pause(): void; resume(): void }
    api.pause(); await flushPromises()
    expect(mock.bridge.state.value.capture).toBeNull()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    api.resume(); await flushPromises()
    expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith('togglePalette')
    expect(mock.bridge.beginCapture).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('with every key already set: no capture, one Continua, and a changed key does not jump ahead', async () => {
    const s = mock.bridge.state
    s.value.bindings = Object.fromEntries(ORDER.map((action, i) => [action, binding(i)])) as any
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    expect(mock.bridge.beginCapture).not.toHaveBeenCalled()
    expect(wrapper.find('[data-cmd-keep]').exists()).toBe(false)
    await wrapper.get('[data-slot="activateAction"] .cmd__bind').trigger('click'); await flushPromises()
    s.value = { ...s.value, capture: null, bindings: { ...s.value.bindings, activateAction: binding(20) }, operation: { ok: true, saved: true } }
    await flushPromises(); vi.advanceTimersByTime(1000); await flushPromises()
    expect(wrapper.find('[data-cmd-screen="assign"]').exists()).toBe(true)
    expect(wrapper.get('[data-slot="activateAction"] .cmd__bind-key b').text()).toBe('✓ Pulsante 21')
    await wrapper.get('[data-cmd-continue]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-cmd-screen="practice"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('waits for the readers before arming the first capture', async () => {
    mock.bridge.state.value = { ...mock.bridge.state.value, inputStatus: 'starting' }
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    expect(mock.bridge.beginCapture).not.toHaveBeenCalled()
    mock.bridge.state.value = { ...mock.bridge.state.value, inputStatus: 'ready' }; await flushPromises()
    expect(mock.bridge.beginCapture).toHaveBeenCalledWith('togglePalette')
    wrapper.unmount()
  })

  // PIP-612: "Lo faccio dopo" and its confirmation are in the corner of the introduction,
  // which calls postpone: the commands release the readers and emit later.
  it('postpone releases the readers and emits later', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    expect(wrapper.find('[data-cmd-later]').exists()).toBe(false)
    ;(wrapper.vm as unknown as { postpone(): void }).postpone(); await flushPromises()
    expect(mock.bridge.finishConfiguration).toHaveBeenCalled()
    expect(wrapper.emitted('later')).toHaveLength(1)
    wrapper.unmount()
  })

  it('keyboard path: the pilot must open and close the REAL panel with Ctrl+K before finishing', async () => {
    let push: (p: { visible: boolean }) => void = () => {}
    const off = vi.fn()
    Object.assign(window, { electronAPI: { onTrainingOverlayVisibility: (cb: typeof push) => { push = cb; return off } } })
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises()
    await wrapper.get('[data-cmd-choose-keyboard]').trigger('click'); await flushPromises()
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

  it('keyboard path without the desktop signal does not block; Indietro returns to the question (PIP-749)', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises()
    await wrapper.get('[data-cmd-choose-keyboard]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-task="kb-open"]').exists()).toBe(false)
    // PIP-749: one way back only, to the question (no second "Ho un volante" button).
    expect(wrapper.find('button[data-cmd-wheel]').exists()).toBe(false)
    await wrapper.get('[data-cmd-back]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-cmd-screen="choose"]').exists()).toBe(true)
    await wrapper.get('[data-cmd-choose-keyboard]').trigger('click'); await flushPromises()
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

  it('PIP-749: the key list offers no second way to the keyboard path (the question has it)', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    expect(wrapper.find('button[data-cmd-keyboard]').exists()).toBe(false)
    expect((wrapper.vm as unknown as { busy: boolean }).busy).toBe(true)
    await wrapper.get('[data-cmd-back]').trigger('click'); await flushPromises()
    expect((wrapper.vm as unknown as { busy: boolean }).busy).toBe(false)
    wrapper.unmount()
  })

  it('PIP-749: a hidden window (tray) stops the capture and the test mode, and both come back when shown', async () => {
    const toggle = async (visible: boolean) => { mock.windowVisible.value = visible; await flushPromises() }
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    expect(mock.bridge.state.value.capture).toEqual({ action: 'togglePalette' })
    await toggle(false)
    expect(mock.bridge.state.value.capture).toBeNull()
    mock.bridge.beginCapture.mockClear()
    // While hidden nothing arms again, even when the readers report changes.
    mock.bridge.state.value = { ...mock.bridge.state.value, devices: [...mock.bridge.state.value.devices] }; await flushPromises()
    expect(mock.bridge.beginCapture).not.toHaveBeenCalled()
    await toggle(true)
    expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith('togglePalette')
    // Practice: test mode off while hidden (the wheel drives the real panel again), on when back.
    for (const [a, b] of [['togglePalette', 26], ['nextAction', 24], ['previousAction', 23], ['activateAction', 32], ['mainMenu', 34]] as const) await pressAndSave(a, b)
    expect(wrapper.find('[data-cmd-screen="practice"]').exists()).toBe(true)
    expect(mock.bridge.testMode.value).toBe(true)
    await toggle(false)
    expect(mock.bridge.testMode.value).toBe(false)
    await toggle(true)
    expect(mock.bridge.testMode.value).toBe(true)
    wrapper.unmount()
  })

  it('PIP-749: readers that fail to start say so, and "Sì" tries again', async () => {
    mock.bridge.state.value = { ...mock.bridge.state.value, available: false }
    mock.bridge.start = vi.fn(async () => { throw new Error('bridge down') })
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises()
    await answerYes(wrapper)
    // The failed start is retried by "Sì", and the failure is said instead of an endless wait.
    expect(mock.bridge.start).toHaveBeenCalledTimes(2)
    expect(mock.bridge.beginCapture).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Lettura dei comandi non disponibile')
    wrapper.unmount()
  })

  it('PIP-749: a pause right after a saved key still moves on to the next empty row', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    const s = mock.bridge.state
    // The key is saved; the move to the next row is still pending (900 ms) when the pause comes.
    s.value = { ...s.value, capture: null, bindings: { ...s.value.bindings, togglePalette: binding(26) }, operation: { ok: true, saved: true } }
    await flushPromises()
    const exposed = wrapper.vm as unknown as { pause: () => void; resume: () => void }
    exposed.pause(); await flushPromises()
    vi.advanceTimersByTime(2000); await flushPromises()
    exposed.resume(); await flushPromises()
    expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith('nextAction')
    expect(wrapper.find('[data-slot="nextAction"]').classes()).toContain('now')
    wrapper.unmount()
  })

  it('PIP-749: "Lo faccio dopo" opened right after the last exercise does not strand the practice', async () => {
    const wrapper = mount(OnboardingCommands, { props: { wheelAvailable: true } }); await flushPromises(); await answerYes(wrapper)
    for (const [a, b] of [['togglePalette', 26], ['nextAction', 24], ['previousAction', 23], ['activateAction', 32], ['mainMenu', 34]] as const) await pressAndSave(a, b)
    expect(wrapper.find('[data-cmd-screen="practice"]').exists()).toBe(true)
    for (const action of ['togglePalette', 'nextAction', 'nextAction', 'previousAction', 'activateAction', 'mainMenu', 'togglePalette'] as const) await tap(action)
    // The confirmation opens inside the 900 ms before "ready", then the pilot cancels it.
    const exposed = wrapper.vm as unknown as { pause: () => void; resume: () => void }
    exposed.pause(); await flushPromises()
    vi.advanceTimersByTime(2000); await flushPromises()
    exposed.resume(); await flushPromises()
    expect(wrapper.find('[data-cmd-finish]').exists()).toBe(true)
    wrapper.unmount()
  })
})
