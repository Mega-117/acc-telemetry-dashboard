// @vitest-environment jsdom
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
// Retained legacy component: the shared application selector now exposes V4.
import Panel from '~/components/pitwall/PitwallV3Panel.vue'
import { providePitwallApplicationMethod, MFD_V3_METHOD } from '~/composables/usePitwallApplicationMethod'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ isAdmin: ref(true) }) }))
vi.mock('~/utils/devToolsAccess', () => ({ canUseDevTools: () => false }))
function setup(ready = true) {
  const port = { carSnapshot: ref({ strategy: { applicationMethods: ['standard', MFD_V3_METHOD], mfdV3: { ready, reason: null, driverCount: 0 }, fuelToAdd: 15, tyreSet: 3, compound: 'wet', pressures: { FL: 26, FR: 26, RL: 26, RR: 26 } }, crew: [] }),
    draftSuspended: ref(false), sending: ref(false), canSend: ref(true), sendReadiness: ref({ ready: true, reason: null as string | null }), lastError: ref<string | null>(null), orderStatus: ref<string | null>(null), orderFields: ref({}),
    orderMethod: ref('standard'), orderReason: ref<string | null>(null), orderId: ref('one'), sendPlan: vi.fn(async (_plan: Record<string, any>) => true) }
  let state!: ReturnType<typeof providePitwallApplicationMethod>
  const wrapper = mount(defineComponent({ components: { Panel }, setup() { state = providePitwallApplicationMethod(); return { port: port as unknown as ReturnType<typeof usePitwallRoom> } }, template: '<Panel :port="port" />' }))
  return { wrapper, state, port }
}
describe('V3 separate complete draft', () => {
  it('explains each missing choice and enables the actual send button after explicit No choices', async () => {
    const { wrapper, port } = setup()
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.get('#v3-send-block').text()).toContain('Completa:')
    expect(wrapper.get('#v3-send-block').text()).toContain('cambio gomme')
    for (const button of wrapper.findAll('.v3-choice button')) await button.trigger('click')
    expect(wrapper.find('#v3-send-block').exists()).toBe(false)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('form').trigger('submit')
    expect(port.sendPlan).toHaveBeenCalledWith({ method: MFD_V3_METHOD, mfdV3: {
      operation: 'strategy', fuelLiters: 15, changeTyres: false, brakes: false, repairBodywork: false, repairSuspension: false,
    } })
    wrapper.unmount()
  })
  it('matches prototype order and preserves tyre and brake values while controls are disabled', async () => {
    const { wrapper, state, port } = setup()
    await wrapper.findAll('button')[1]!.trigger('click')
    const label = (text: string) => wrapper.findAll('label').find(l => l.text().startsWith(text))!
    Object.assign(state.draft, { changeTyres: true, compound: 'dry', tyreSet: 5, brakes: true, brakeFront: 2, brakeRear: 3, repairBodywork: false, repairSuspension: false })
    await wrapper.vm.$nextTick()
    const labels = wrapper.findAll('label').map(l => l.text())
    expect(labels.findIndex(l => l.startsWith('Preset'))).toBeLessThan(labels.findIndex(l => l.startsWith('Carburante')))
    expect(labels.findIndex(l => l.startsWith('Pressione RR'))).toBeLessThan(labels.findIndex(l => l.startsWith('Sostituisci freni')))
    expect(labels.findIndex(l => l.startsWith('Pilota'))).toBeLessThan(labels.findIndex(l => l.startsWith('Riparazione sospensioni')))
    await label('Cambio gomme').get('input').setValue(false)
    await label('Sostituisci freni').get('input').setValue(false)
    expect(label('Mescola').get('select').attributes('disabled')).toBeDefined()
    expect(label('Pastiglie anteriori').get('input').attributes('disabled')).toBeDefined()
    expect(state.draft.brakeFront).toBe(2); expect(state.draft.tyreSet).toBe(5)
    await label('Cambio gomme').get('input').setValue(true)
    await label('Sostituisci freni').get('input').setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(port.sendPlan.mock.calls[0]![0].mfdV3).toMatchObject({ changeTyres: true, compound: 'dry', tyreSet: 5, pressures: { FL: 26, FR: 26, RL: 26, RR: 26 }, brakes: true, brakeFront: 2, brakeRear: 3 })
    await label('Mescola').get('select').setValue('wet')
    expect(label('Set pneumatici').get('input').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(port.sendPlan.mock.calls[1]![0].mfdV3).not.toHaveProperty('tyreSet')
    wrapper.unmount()
  })
  it('shows transport and calibration blockers and never bypasses them on form submit', async () => {
    const { wrapper, state, port } = setup(false)
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.get('#v3-send-block').text()).toContain('Calibrazione V3 richiesta')
    port.carSnapshot.value.strategy.applicationMethods = ['standard']
    await wrapper.vm.$nextTick()
    expect(wrapper.get('#v3-send-block').text()).toContain('runtime della Suite aggiornato')
    port.canSend.value = false; port.sendReadiness.value = { ready: false, reason: 'Il tuo collegamento è offline.' }
    Object.assign(state.draft, { changeTyres: false, brakes: false, repairBodywork: false, repairSuspension: false })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('#v3-send-block').text()).toContain('offline')
    await wrapper.get('form').trigger('submit')
    expect(port.sendPlan).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('reports send rejection or exception without losing the draft or retrying automatically', async () => {
    const { wrapper, state, port } = setup()
    await wrapper.findAll('button')[1]!.trigger('click')
    Object.assign(state.draft, { changeTyres: false, brakes: false, repairBodywork: false, repairSuspension: false })
    port.sendPlan.mockResolvedValueOnce(false); port.lastError.value = 'Permesso negato dal server.'
    await wrapper.get('form').trigger('submit'); await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="alert"]').text()).toContain('Permesso negato')
    port.sendPlan.mockRejectedValueOnce(new Error('Connessione interrotta.'))
    await wrapper.get('form').trigger('submit'); await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="alert"]').text()).toContain('Connessione interrotta')
    expect(port.sendPlan).toHaveBeenCalledTimes(2); expect(state.draft.fuelLiters).toBe(15)
    wrapper.unmount()
  })
  it('enforces dependent repairs and rejects pressure fractions unsupported by ACC', async () => {
    const { wrapper, state, port } = setup()
    await wrapper.findAll('button')[1]!.trigger('click')
    Object.assign(state.draft, { changeTyres: true, brakes: false, repairBodywork: false, repairSuspension: false })
    state.draft.pressures.FL = 26.15
    await wrapper.vm.$nextTick()
    expect(wrapper.get('#v3-send-block').text()).toContain('pressione FL')
    const choice = (text: string) => wrapper.findAll('.v3-choice').find(l => l.text().startsWith(text))!
    await choice('Riparazione sospensioni').get('input').setValue(true)
    expect(state.draft.repairBodywork).toBe(true)
    await choice('Riparazione carrozzeria').get('input').setValue(false)
    expect(state.draft.repairSuspension).toBe(false)
    await wrapper.get('form').trigger('submit'); expect(port.sendPlan).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('defaults Standard and prevents sending when calibration unavailable', async () => {
    const { wrapper, state } = setup(false)
    expect(state.method.value).toBe('standard'); expect(wrapper.find('form').exists()).toBe(false)
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined(); wrapper.unmount()
  })
  it('keeps unknown choices unknown, preserves draft, excludes disabled fields and locks pending order', async () => {
    const { wrapper, state, port } = setup()
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(state.draft.fuelLiters).toBe(15); expect(state.draft.tyreSet).toBe(4)
    expect(state.draft.brakes).toBeNull(); expect(state.draft.repairBodywork).toBeNull()
    Object.assign(state.draft, { changeTyres: false, brakes: false, repairBodywork: true, repairSuspension: false, fuelLiters: 22 })
    port.carSnapshot.value.strategy.fuelToAdd = 50
    await wrapper.findAll('button')[0]!.trigger('click'); await wrapper.findAll('button')[1]!.trigger('click')
    expect(state.draft.fuelLiters).toBe(22)
    await wrapper.find('form').trigger('submit')
    expect(port.sendPlan).toHaveBeenCalledWith({ method: MFD_V3_METHOD, mfdV3: { operation: 'strategy', fuelLiters: 22, changeTyres: false, brakes: false, repairBodywork: true, repairSuspension: false } })
    state.draft.fuelLiters = 23
    expect(port.sendPlan.mock.calls[0]![0].mfdV3.fuelLiters).toBe(22)
    port.orderStatus.value = 'applying'; await wrapper.vm.$nextTick()
    expect(wrapper.findAll('button').slice(0, 2).every(b => b.attributes('disabled') !== undefined)).toBe(true)
    wrapper.unmount()
  })
  it('preset is an independent operation and leaves draft untouched', async () => {
    const { wrapper, state, port } = setup(); await wrapper.findAll('button')[1]!.trigger('click')
    state.draft.pitStrategy = 8; state.draft.fuelLiters = 33
    await wrapper.findAll('button').find(b => b.text() === 'Carica preset')!.trigger('click')
    expect(port.sendPlan).toHaveBeenCalledWith({ method: MFD_V3_METHOD, mfdV3: { operation: 'preset', pitStrategy: 8 } })
    expect(state.draft.fuelLiters).toBe(33); wrapper.unmount()
  })
})
