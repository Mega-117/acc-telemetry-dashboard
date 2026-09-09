// @vitest-environment jsdom
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import Panel from '~/components/pitwall/PitwallApplicationPanel.vue'
import { providePitwallApplicationMethod, MFD_V2_METHOD } from '~/composables/usePitwallApplicationMethod'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ isAdmin: ref(true) }) }))
vi.mock('~/utils/devToolsAccess', () => ({ canUseDevTools: () => false }))
function setup(ready = true) {
  const port = { carSnapshot: ref({ strategy: { applicationMethods: ['standard', MFD_V2_METHOD], mfdV2: { ready, reason: null, driverCount: 0 }, fuelToAdd: 15, tyreSet: 3, compound: 'wet', pressures: { FL: 26, FR: 26, RL: 26, RR: 26 } }, crew: [] }),
    draftSuspended: ref(false), sending: ref(false), canSend: ref(true), orderStatus: ref<string | null>(null), orderFields: ref({}),
    orderMethod: ref('standard'), orderReason: ref<string | null>(null), orderId: ref('one'), sendPlan: vi.fn(async (_plan: Record<string, any>) => true) }
  let state!: ReturnType<typeof providePitwallApplicationMethod>
  const wrapper = mount(defineComponent({ components: { Panel }, setup() { state = providePitwallApplicationMethod(); return { port: port as unknown as ReturnType<typeof usePitwallRoom> } }, template: '<Panel :port="port" />' }))
  return { wrapper, state, port }
}
describe('V2 separate complete draft', () => {
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
    expect(port.sendPlan).toHaveBeenCalledWith({ method: MFD_V2_METHOD, mfdV2: { operation: 'strategy', fuelLiters: 22, changeTyres: false, brakes: false, repairBodywork: true, repairSuspension: false } })
    state.draft.fuelLiters = 23
    expect(port.sendPlan.mock.calls[0]![0].mfdV2.fuelLiters).toBe(22)
    port.orderStatus.value = 'applying'; await wrapper.vm.$nextTick()
    expect(wrapper.findAll('button').slice(0, 2).every(b => b.attributes('disabled') !== undefined)).toBe(true)
    wrapper.unmount()
  })
  it('preset is an independent operation and leaves draft untouched', async () => {
    const { wrapper, state, port } = setup(); await wrapper.findAll('button')[1]!.trigger('click')
    state.draft.pitStrategy = 8; state.draft.fuelLiters = 33
    await wrapper.findAll('button').find(b => b.text() === 'Carica preset')!.trigger('click')
    expect(port.sendPlan).toHaveBeenCalledWith({ method: MFD_V2_METHOD, mfdV2: { operation: 'preset', pitStrategy: 8 } })
    expect(state.draft.fuelLiters).toBe(33); wrapper.unmount()
  })
})
