// @vitest-environment jsdom
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

describe('Impostazioni navigation', () => {
  it('keeps Comandi and opens the actual Avvio panel', async () => {
    const wrapper = mount(Impostazioni, { global: { components: { SettingsStartupPanel: StartupPanel },
      stubs: { SettingsCommandBindingsPanel: { template: '<div>Bindings</div>' } } } })
    await flushPromises()
    expect(mock.start).toHaveBeenCalledTimes(1)
    const tabs = wrapper.findAll('aside button')
    expect(tabs[0]!.attributes('aria-pressed')).toBe('true')
    await tabs[1]!.trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Avvia con Windows')
    expect(wrapper.get('input').attributes('disabled')).toBeUndefined()
    await tabs[0]!.trigger('click'); await flushPromises()
    expect(wrapper.find('input').exists()).toBe(false)
    expect(mock.start).toHaveBeenCalledTimes(1)
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
