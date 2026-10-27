// @vitest-environment jsdom
import { setLocale } from '~/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import Impostazioni from '~/pages/impostazioni.vue'
import StartupPanel from '~/components/settings/StartupPanel.vue'

const mock = vi.hoisted(() => ({ start: vi.fn(), finishConfiguration: vi.fn(), replace: vi.fn() }))
vi.mock('~/composables/useWheelInputBridge', () => ({ useWheelInputBridge: () => mock }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useRouter', () => ({ replace: mock.replace }))
  vi.stubGlobal('onBeforeRouteLeave', vi.fn())
  Object.assign(window, { electronAPI: { localIdentityRole: 'primary', controlsGetState: vi.fn(),
    windowsStartupGet: vi.fn(async () => ({ supported: true, enabled: true })),
    windowsStartupSet: vi.fn(async () => ({ supported: true, enabled: false })) } })
})
afterEach(() => { vi.unstubAllGlobals(); delete (window as any).electronAPI })

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('Impostazioni navigation', () => {
  it('keeps a transition root while the desktop bridge is loading', async () => {
    let finish!: () => void
    mock.start.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const wrapper = mount(Impostazioni)
    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.find('.settings-content').exists()).toBe(false)
    finish()
    await flushPromises()
    expect(wrapper.find('.settings-content').exists()).toBe(true)
    wrapper.unmount()
  })
  it('keeps Comandi and opens the actual Avvio panel', async () => {
    const wrapper = mount(Impostazioni, { global: { components: { SettingsStartupPanel: StartupPanel },
      stubs: { SettingsCommandBindingsPanel: { template: '<div>Bindings</div>' } } } })
    await flushPromises()
    expect(mock.start).toHaveBeenCalledTimes(1)
    const tabs = wrapper.findAll('aside button')
    expect(tabs[0]!.attributes('aria-pressed')).toBe('true')
    await tabs[1]!.trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Avvia con Windows')
    expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeUndefined()
    await tabs[0]!.trigger('click'); await flushPromises()
    expect(wrapper.find('[role="switch"]').exists()).toBe(false)
    expect(mock.start).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('PIP-571: offers Introduzione as a third section that reopens the intro', async () => {
    const open = vi.fn()
    const wrapper = mount(Impostazioni, { global: {
      stubs: { SettingsCommandBindingsPanel: { template: '<div>Bindings</div>' }, SettingsStartupPanel: { template: '<div>Startup</div>' },
        SettingsIntroPanel: { template: '<button data-intro @click="open()">Rivedi</button>', setup: () => ({ open }) } } } })
    await flushPromises()
    const tabs = wrapper.findAll('aside button')
    expect(tabs.map(t => t.text())).toEqual(['Comandi', 'Avvio', 'Introduzione', 'Lingua'])
    await tabs[2]!.trigger('click'); await flushPromises()
    expect(tabs[2]!.attributes('aria-pressed')).toBe('true')
    await wrapper.get('[data-intro]').trigger('click')
    expect(open).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('preserves primary-desktop access restriction', async () => {
    Object.assign(window, { electronAPI: { localIdentityRole: 'consumer' } })
    const wrapper = mount(Impostazioni); await flushPromises()
    expect(mock.replace).toHaveBeenCalledWith('/panoramica')
    expect(mock.start).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
