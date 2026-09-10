// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { expect, it, vi } from 'vitest'
import Panel from '~/components/pitwall/PitwallV4OnlinePanel.vue'
import Application from '~/components/pitwall/PitwallApplicationPanel.vue'
const contextId = 'a'.repeat(64)
function port() {
  return { sending: ref(false), orderStatus: ref(''), canSend: ref(true), sendReadiness: ref({ reason: null }),
    carSnapshot: ref({ crew: [{ driverIndex: 0, name: 'Enrico Saiani', current: true }], strategy: { applicationMethods: ['standard', 'mfd-v4'], mfdV4: { ready: true, contextId }, fuelToAdd: 0 } }),
    executorLabel: ref('Rico117'), orderMethod: ref('mfd-v4'), orderReason: ref(''), orderFields: ref({}),
    lastError: ref(''), sendPlan: vi.fn(async () => true), draftSuspended: ref(false) }
}
function message(wrapper: ReturnType<typeof mount>, type: string, value: unknown, source?: Window) {
  const iframe = wrapper.get('iframe').element as HTMLIFrameElement
  window.dispatchEvent(new MessageEvent('message', { source: source || iframe.contentWindow, data: { channel: 'mfd-v4-online', type, value } }))
}
it('sends only an entire intent from the owned iframe and current context', async () => {
  const p = port(); const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  expect(w.get('iframe').attributes('sandbox')).toBe('allow-scripts')
  const plan = { version: 1, contextId, operation: 'strategy', fuelLiters: 0 }
  message(w, 'submit', plan, window); await flushPromises(); expect(p.sendPlan).not.toHaveBeenCalled()
  message(w, 'submit', plan); await flushPromises(); expect(p.sendPlan).toHaveBeenCalledWith({ method: 'mfd-v4', mfdV4: plan })
  message(w, 'submit', { ...plan, contextId: 'stale' }); await flushPromises(); expect(p.sendPlan).toHaveBeenCalledTimes(1)
  w.unmount()
})
it('blocks missing recipient and orders in progress', async () => {
  const p = port(); const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  p.sending.value = true; await flushPromises(); message(w, 'submit', { contextId }); await flushPromises()
  expect(p.sendPlan).not.toHaveBeenCalled()
  p.sending.value = false; p.canSend.value = false; await flushPromises(); message(w, 'submit', { contextId }); await flushPromises()
  expect(p.sendPlan).not.toHaveBeenCalled(); expect(w.text()).toContain('Seleziona una stanza')
  w.unmount()
})
it('shows manual-send failures and publishes readiness to the frame', async () => {
  const p = port(); p.sendPlan.mockResolvedValue(false); p.lastError.value = 'Permission denied'
  const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  const target = (w.get('iframe').element as HTMLIFrameElement).contentWindow!
  const post = vi.spyOn(target, 'postMessage')
  message(w, 'ready', null); expect(post).toHaveBeenCalled()
  message(w, 'draft', { fuel: 0 }); message(w, 'submit', { contextId }); await flushPromises()
  expect(w.text()).toContain('Permission denied'); w.unmount()
})
it('Standard stays default and the method switch suspends its draft', async () => {
  const p = port(); const w = mount(Application, { attachTo: document.body, props: { port: p as never } })
  expect(w.get('button[aria-pressed=true]').text()).toBe('Standard')
  await w.findAll('button')[1]!.trigger('click'); expect(p.draftSuspended.value).toBe(true)
  p.sending.value = true; await flushPromises(); expect(w.findAll('button')[0]!.attributes('disabled')).toBeDefined()
  w.unmount()
})
it('associates the local identity only after an explicit crew choice', async () => {
  const api = vi.fn(async () => ({ ok: true, key: 'crew-key', drivers: [{ driverIndex: 2, firstName: 'Enrico', lastName: 'Saiani' }] }))
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { pitwallV4Identity: api } })
  const p = port(); const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  try {
    await w.get('details button').trigger('click'); await flushPromises()
    expect(api).toHaveBeenCalledWith({ action: 'status' })
    const confirm = w.findAll('details button')[1]!
    expect(confirm.attributes('disabled')).toBeDefined()
    await w.get('select').setValue('2'); await confirm.trigger('click'); await flushPromises()
    expect(api).toHaveBeenLastCalledWith({ action: 'associate', key: 'crew-key', driverIndex: 2 })
    expect(p.sendPlan).not.toHaveBeenCalled()
    p.sending.value = true; await flushPromises()
    expect(w.findAll('details button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
  } finally { w.unmount(); Reflect.deleteProperty(window, 'electronAPI') }
})
it('reports an unavailable identity bridge without inventing an association', async () => {
  const api = vi.fn(async () => { throw new Error('closed runtime') })
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { pitwallV4Identity: api } })
  const w = mount(Panel, { attachTo: document.body, props: { port: port() as never } })
  try {
    await w.get('details button').trigger('click'); await flushPromises()
    expect(w.text()).toContain('Identità locale non disponibile')
    expect(w.find('select').exists()).toBe(false)
  } finally { w.unmount(); Reflect.deleteProperty(window, 'electronAPI') }
})
it('publishes V4 field observations and never relabels Standard feedback', async () => {
  const p = port()
  p.orderFields.value = { fuelLiters: { requested: 0, observed: 0, outcome: 'verified', source: 'shared-memory' } }
  const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  const target = (w.get('iframe').element as HTMLIFrameElement).contentWindow!
  const post = vi.spyOn(target, 'postMessage')
  message(w, 'ready', null)
  expect(post.mock.calls.at(-1)?.[0].value.outcome).toContain('"observed":0')
  p.orderMethod.value = 'standard'; await flushPromises()
  expect(post.mock.calls.at(-1)?.[0].value.outcome).toBe('')
  w.unmount()
})
