// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { serialize } from 'node:v8'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Panel from '~/components/pitwall/PitwallV4OnlinePanel.vue'
import Application from '~/components/pitwall/PitwallApplicationPanel.vue'
import * as hostAccess from '~/utils/devToolsAccess'
const actualIsDevToolsHost = hostAccess.isDevToolsHost
const contextId = 'a'.repeat(64)
beforeEach(() => vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/' } })))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it.each(['/', '/acc-telemetry-dashboard/docs/'])('loads the form under the configured app base %s', (baseURL) => {
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL } }))
  const wrapper = mount(Panel)
  try {
    expect(wrapper.get('iframe').attributes('src')).toBe(`${baseURL}mfd-v4-online.html`)
    expect(wrapper.get('iframe').attributes('sandbox')).toBe('allow-scripts')
  } finally { wrapper.unmount() }
})
function port() {
  return { sending: ref(false), orderStatus: ref(''), canSend: ref(true), sendReadiness: ref({ reason: null }),
    selectedRoomId: ref('room'), selectedTargetUid: ref('rico'),
    carSnapshot: ref({ crew: [{ driverIndex: 0, name: 'Enrico Saiani', current: true }], strategy: { applicationMethods: ['standard', 'mfd-v4'], mfdV4: { ready: true, contextId }, fuelToAdd: 0 } }),
    executorLabel: ref('Rico117'), orderMethod: ref('mfd-v4'), orderReason: ref(''), orderFields: ref({}),
    lastError: ref(''), sendPlan: vi.fn(async () => true), draftSuspended: ref(false) }
}
function message(wrapper: ReturnType<typeof mount>, type: string, value: unknown, source?: Window) {
  const iframe = wrapper.get('iframe').element as HTMLIFrameElement
  window.dispatchEvent(new MessageEvent('message', { source: source || iframe.contentWindow, data: { channel: 'mfd-v4-online', type, value } }))
}
it.each(['partial', 'failed', 'rejected', 'stalled'])('explains an unavailable preset for %s while retaining raw diagnostics', async status => {
  const p = port()
  p.orderStatus.value = status === 'stalled' ? 'partial' : status
  p.orderReason.value = '/preset → 400: Verifica preset: Preset richiesto non disponibile: selezione ferma o limite raggiunto. Puoi inviare una nuova strategia. [rif. 8c734ed71d78]'
  if (status === 'stalled') p.orderReason.value = 'Preset non applicato: selezione non avanzata entro il tempo previsto. Richiesto 2, ultimo confermato 1.'
  p.orderFields.value = { pitStrategy: { requested: 2, observed: null, outcome: 'unknown' } }
  const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  try {
    const post = vi.spyOn((w.get('iframe').element as HTMLIFrameElement).contentWindow!, 'postMessage')
    message(w, 'ready', null)
    message(w, 'draft', { applyPitStrategy: true, pitStrategy: 3 })
    await flushPromises()
    const snapshot = post.mock.calls.at(-1)![0].value
    expect(snapshot.result).toMatchObject({ label: 'Preset 2 non applicato', reason: 'Il MFD non ha consentito di selezionare il preset richiesto.', problem: true, busy: false })
    expect(snapshot.outcome).toContain(p.orderReason.value)
    expect(snapshot.verification.fields).toEqual(p.orderFields.value)
  } finally { w.unmount() }
})
it.each(['unreadable', 'strategy', 'applied', 'missing-request'])('preserves the original presentation for %s', kind => {
  const p = port()
  p.orderStatus.value = kind === 'applied' ? 'applied' : 'partial'
  p.orderReason.value = kind === 'unreadable' ? 'Numero preset non leggibile' : 'Preset richiesto non disponibile: selezione ferma o limite raggiunto.'
  p.orderFields.value = kind === 'strategy' ? { fuelLiters: { requested: 2 } } : { pitStrategy: { requested: kind === 'missing-request' ? null : 2 } }
  const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  try {
    const post = vi.spyOn((w.get('iframe').element as HTMLIFrameElement).contentWindow!, 'postMessage')
    message(w, 'ready', null)
    const result = post.mock.calls.at(-1)![0].value.result
    expect(result.label).toBe(kind === 'applied' ? 'Impostata e confermata' : 'Impostata in parte: alcuni campi non sono confermabili')
    expect(result.reason).toBe(p.orderReason.value)
  } finally { w.unmount() }
})
it('publishes structured field verification with its original order context', () => {
  const p = { ...port(), orderId: ref('order-one'), orderContextId: ref('original-context') }
  p.orderFields.value = { brakes: { requested: false, observed: false, outcome: 'verified', source: 'visual' } }
  const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  try {
    const post = vi.spyOn((w.get('iframe').element as HTMLIFrameElement).contentWindow!, 'postMessage')
    message(w, 'ready', null)
    expect(post.mock.calls.at(-1)![0].value.verification).toEqual({ orderId: 'order-one', contextId: 'original-context', fields: p.orderFields.value, tyreSetCondition: null })
  } finally { w.unmount() }
})
it('isolates drafts and ignores the previous iframe when the recipient changes', async () => {
  const p = port(); const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  try {
    const previous = (w.get('iframe').element as HTMLIFrameElement).contentWindow!
    message(w, 'draft', { fuel: 12 })
    p.selectedTargetUid.value = 'other'; await flushPromises()
    const second = (w.get('iframe').element as HTMLIFrameElement).contentWindow!
    expect(second === previous).toBe(false)
    const post = vi.spyOn(second, 'postMessage')
    message(w, 'ready', null)
    expect(post.mock.calls.at(-1)![0].value.draft).toBeNull()
    message(w, 'submit', { contextId }, previous); await flushPromises()
    expect(p.sendPlan).not.toHaveBeenCalled()
    message(w, 'draft', { fuel: 30 })
    p.selectedTargetUid.value = 'rico'; await flushPromises()
    const restored = vi.spyOn((w.get('iframe').element as HTMLIFrameElement).contentWindow!, 'postMessage')
    message(w, 'ready', null)
    expect(restored.mock.calls.at(-1)![0].value.draft).toEqual({ fuel: 12 })
  } finally { w.unmount() }
})
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
it.each(['racercore-develop.pages.dev', 'localhost', '127.0.0.1', '::1'])('shows only the operational V4 form on %s', async host => {
  vi.spyOn(hostAccess, 'isDevToolsHost').mockImplementation(() => actualIsDevToolsHost(host))
  const p = port(); const w = mount(Application, { attachTo: document.body, props: { port: p as never } })
  try {
    expect(w.find('.methods').exists()).toBe(false)
    expect(w.get('iframe').isVisible()).toBe(true)
    expect(p.draftSuspended.value).toBe(true)
    p.sending.value = true; await flushPromises()
    expect(w.get('iframe').isVisible()).toBe(true)
  } finally { w.unmount() }
})
it('publishes cloneable room, crew and draft data across the iframe boundary', async () => {
  const p = port()
  const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  const target = (w.get('iframe').element as HTMLIFrameElement).contentWindow!
  // jsdom postMessage skips the browser structured-clone check. V8 serialization
  // rejects nested proxies too, so the test exercises that real boundary constraint.
  const post = vi.spyOn(target, 'postMessage').mockImplementation((value) => { serialize(value) })
  try {
    message(w, 'draft', { fuel: 0, tyres: false })
    message(w, 'ready', null)
    const snapshot = post.mock.calls.at(-1)![0].value
    expect(snapshot.crew).toEqual(p.carSnapshot.value.crew)
    expect(snapshot.draft).toEqual({ fuel: 0, tyres: false })
    expect(snapshot.strategy.fuelToAdd).toBe(0)
    p.carSnapshot.value.crew[0]!.name = 'Updated driver'
    p.carSnapshot.value = { ...p.carSnapshot.value }
    await flushPromises()
    expect(post.mock.calls.at(-1)![0].value.crew[0].name).toBe('Updated driver')
    expect(snapshot.crew[0].name).toBe('Enrico Saiani')
  } finally { w.unmount() }
})
it('associates the local identity only after an explicit crew choice', async () => {
  vi.spyOn(hostAccess, 'canUseDevTools').mockReturnValue(true)
  const api = vi.fn(async () => ({ ok: true, key: 'crew-key', drivers: [{ driverIndex: 2, firstName: 'Enrico', lastName: 'Saiani' }] }))
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { pitwallV4Identity: api } })
  const p = port(); const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  try {
    await flushPromises(); await w.get('details button').trigger('click'); await flushPromises()
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
  vi.spyOn(hostAccess, 'canUseDevTools').mockReturnValue(true)
  const api = vi.fn(async () => { throw new Error('closed runtime') })
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { pitwallV4Identity: api } })
  const w = mount(Panel, { attachTo: document.body, props: { port: port() as never } })
  try {
    await flushPromises(); await w.get('details button').trigger('click'); await flushPromises()
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

it('accepts layout height only from the current frame and rejects invalid measurements', async () => {
  const p = port(); const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  try {
    message(w, 'layout-height', 740.2); await flushPromises()
    expect(w.get('iframe').attributes('style')).toContain('741px')
    message(w, 'layout-height', 600); await flushPromises()
    expect(w.get('iframe').attributes('style')).toContain('600px')
    for (const value of [NaN, Infinity, -1, 0, 10001, '800', {}]) message(w, 'layout-height', value)
    message(w, 'layout-height', 900, window)
    await flushPromises()
    expect(w.get('iframe').attributes('style')).toContain('600px')
    expect(p.sendPlan).not.toHaveBeenCalled()
    const oldFrame = (w.get('iframe').element as HTMLIFrameElement).contentWindow!
    p.selectedTargetUid.value = 'other'; await flushPromises()
    message(w, 'layout-height', 800, oldFrame); await flushPromises()
    expect(w.get('iframe').attributes('style')).toContain('1040px')
  } finally { w.unmount() }
})

it.each([false, true])('publishes the development gate and current recipient without selecting another pilot (%s)', async (development) => {
  vi.spyOn(hostAccess, 'canUseDevTools').mockReturnValue(development)
  const p = { ...port(), availableTargets: ref([{ uid: 'rico', nickname: 'RICO117' }]), selectTarget: vi.fn() }
  const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  try {
    const post = vi.spyOn((w.get('iframe').element as HTMLIFrameElement).contentWindow!, 'postMessage')
    message(w, 'ready', null)
    expect(post.mock.calls.at(-1)![0].value).toMatchObject({ development, recipientLabel: 'RICO117' })
    await flushPromises()
    expect(w.get('.v4-recipient').text()).toContain('RICO117')
    expect(w.find('.v4-tools').exists()).toBe(development)
    if (development) expect(w.get('.v4-tools').attributes('open')).toBeUndefined()
    p.availableTargets.value = []
    await flushPromises()
    expect(post.mock.calls.at(-1)![0].value.recipientLabel).toBe('')
    expect(p.selectTarget).not.toHaveBeenCalled()
  } finally { w.unmount() }
})
it('publishes the order result and reason for the normal panel', async () => {
  const p = port(); const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  try {
    const post = vi.spyOn((w.get('iframe').element as HTMLIFrameElement).contentWindow!, 'postMessage')
    message(w, 'ready', null)
    p.orderStatus.value = 'rejected'; p.orderReason.value = 'Barra MFD non riconosciuta'
    await flushPromises()
    expect(post.mock.calls.at(-1)![0].value.result).toMatchObject({ label: 'Rifiutata', reason: 'Barra MFD non riconosciuta', problem: true })
    p.orderStatus.value = 'applied'; p.orderReason.value = ''; await flushPromises()
    expect(post.mock.calls.at(-1)![0].value.result.label).toBe('Impostata e confermata')
  } finally { w.unmount() }
})
it('PIP-515: asks for the recipient at send time when several drivers are at the wheel', async () => {
  const p = port() as ReturnType<typeof port> & { availableTargets: any, selectTarget: any }
  p.availableTargets = ref([{ uid: 'rico', nickname: 'Rico117' }, { uid: 'popo', nickname: 'Popo' }])
  p.selectTarget = vi.fn((uid: string | null) => { p.selectedTargetUid.value = uid as string })
  p.selectedTargetUid.value = null as unknown as string
  const w = mount(Panel, { attachTo: document.body, props: { port: p as never } })
  try {
    const select = w.get('select[aria-label="Destinatario strategia"]')
    expect(w.text()).toContain('Più piloti al volante')
    await select.setValue('popo')
    expect(p.selectTarget).toHaveBeenCalledWith('popo')
    p.availableTargets.value = [{ uid: 'popo', nickname: 'Popo' }]; await flushPromises()
    expect(w.find('select[aria-label="Destinatario strategia"]').exists()).toBe(false)
    expect(w.get('.v4-recipient').text()).toContain('Popo')
  } finally { w.unmount() }
})
