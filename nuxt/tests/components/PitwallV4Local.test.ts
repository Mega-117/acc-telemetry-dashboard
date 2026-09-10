// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import Panel from '~/components/pitwall/PitwallV4Local.vue'
const setBridge = (api?: unknown) => Object.defineProperty(window, 'electronAPI', { value: api, configurable: true })
afterEach(() => { setBridge(undefined); vi.useRealTimers() })
it('explains browser-only use without trying to command ACC', async () => {
  const wrapper = mount(Panel); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('Racer Core')
  expect(wrapper.find('iframe').exists()).toBe(false); wrapper.unmount()
})
it('embeds original endpoint and stops service on unmount', async () => {
  const api=vi.fn(async () => ({ok:true,url:'http://127.0.0.1:12000/token/'}));setBridge({pitwallV4Local:api})
  const wrapper=mount(Panel);await flushPromises()
  expect(wrapper.get('iframe').attributes('src')).toContain('127.0.0.1:12000')
  expect(wrapper.get('iframe').attributes('sandbox')).toBe('allow-scripts allow-same-origin')
  wrapper.unmount();expect(api).toHaveBeenLastCalledWith('stop')
})
it('shows startup failure and permits manual retry', async () => {
  const api=vi.fn(async () => ({ok:false,reason:'ACC non disponibile'}));setBridge({pitwallV4Local:api})
  const wrapper=mount(Panel);await flushPromises();expect(wrapper.text()).toContain('ACC non disponibile')
  await wrapper.get('button').trigger('click');await flushPromises();expect(api).toHaveBeenCalledTimes(2);wrapper.unmount()
})
it('rejects non-loopback iframe and stops explicitly', async () => {
  const api=vi.fn(async () => ({ok:true,url:'https://example.com/'}));setBridge({pitwallV4Local:api})
  const wrapper=mount(Panel);await flushPromises();expect(wrapper.find('iframe').exists()).toBe(false);wrapper.unmount()
})
it('detects stopped child without automatic restart', async () => {
  vi.useFakeTimers();const api=vi.fn(async (action:string) => action==='start'?{ok:true,url:'http://127.0.0.1:12000/token/'}:{ok:true,running:false});setBridge({pitwallV4Local:api})
  const wrapper=mount(Panel);await flushPromises();await vi.advanceTimersByTimeAsync(1001)
  expect(wrapper.find('iframe').exists()).toBe(false);expect(wrapper.text()).toContain('nessun reinvio automatico');wrapper.unmount()
})
