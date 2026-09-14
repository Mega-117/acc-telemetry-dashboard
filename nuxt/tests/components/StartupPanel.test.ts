// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import StartupPanel from '~/components/settings/StartupPanel.vue'

function setup(enabled = true) {
  const api = {
    windowsStartupGet: vi.fn(async () => ({ supported: true, enabled })),
    windowsStartupSet: vi.fn(async (value: boolean) => ({ supported: true, enabled: value })),
  }
  Object.assign(window, { electronAPI: api })
  return api
}
afterEach(() => { delete (window as any).electronAPI })

describe('StartupPanel', () => {
  it('loads the OS state and saves disable and enable', async () => {
    const api = setup(); const wrapper = mount(StartupPanel); await flushPromises()
    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(true)
    await wrapper.get('input').setValue(false); await flushPromises()
    expect(api.windowsStartupSet).toHaveBeenLastCalledWith(false)
    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe('Impostazione salvata.')
    await wrapper.get('input').setValue(true); await flushPromises()
    expect(api.windowsStartupSet).toHaveBeenLastCalledWith(true)
    wrapper.unmount()
  })
  it('locks input until Windows confirms without optimistic state', async () => {
    const api = setup(); let finish!: (value: { supported: boolean; enabled: boolean }) => void
    api.windowsStartupSet.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const wrapper = mount(StartupPanel); await flushPromises()
    await wrapper.get('input').setValue(false)
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(true)
    finish({ supported: true, enabled: false }); await flushPromises()
    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(false)
    wrapper.unmount()
  })
  it('reads back actual state on failure and supports retry', async () => {
    const api = setup(); api.windowsStartupSet.mockRejectedValueOnce(new Error('denied'))
    const wrapper = mount(StartupPanel); await flushPromises()
    await wrapper.get('input').setValue(false); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('non è stata confermata')
    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(true)
    expect(api.windowsStartupGet).toHaveBeenCalledTimes(2)
    await wrapper.get('button').trigger('click'); await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('handles read errors and recovers', async () => {
    const api = setup(); api.windowsStartupGet.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(StartupPanel); await flushPromises()
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('leggere')
    await wrapper.get('button').trigger('click'); await flushPromises()
    expect(wrapper.get('input').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
  it('explains older desktop bridges without crashing', async () => {
    Object.assign(window, { electronAPI: {} })
    const wrapper = mount(StartupPanel); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Aggiorna il programma')
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
  it('disables the option outside installed Windows', async () => {
    const api = setup(false); api.windowsStartupGet.mockResolvedValue({ supported: false, enabled: false })
    const wrapper = mount(StartupPanel); await flushPromises()
    expect(wrapper.text()).toContain('versione installata per Windows')
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
