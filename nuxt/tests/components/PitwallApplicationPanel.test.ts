// @vitest-environment jsdom
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import Panel from '~/components/pitwall/PitwallApplicationPanel.vue'
import { providePitwallApplicationMethod, ACC_DRIVE_METHOD } from '~/composables/usePitwallApplicationMethod'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ isAdmin: ref(true) }) }))
vi.mock('~/utils/devToolsAccess', () => ({ canUseDevTools: () => false }))
function setup(capable = true) {
  const port = { carSnapshot: ref({ strategy: { applicationMethods: capable ? [ACC_DRIVE_METHOD] : [], fuelToAdd: 15, tyreSet: 3, compound: 'wet', pressures: { FL: 26, FR: 26, RL: 26, RR: 26 } }, crew: [{ driverIndex: 1, name: 'Marick', current: true }] }),
    draftSuspended: ref(false), sending: ref(false), canSend: ref(true), orderStatus: ref<string | null>(null),
    orderMethod: ref('standard'), orderReason: ref<string | null>(null), orderId: ref('one'), sendPlan: vi.fn(async () => true) }
  let state!: ReturnType<typeof providePitwallApplicationMethod>
  const wrapper = mount(defineComponent({ components: { Panel }, setup() { state = providePitwallApplicationMethod(); return { port: port as unknown as ReturnType<typeof usePitwallRoom> } }, template: '<Panel :port="port" />' }))
  return { wrapper, state, port }
}
describe('independent ACC Drive form', () => {
  it('requires recipient capability and defaults to Standard per page', () => {
    const { wrapper, state } = setup(false)
    expect(state.method.value).toBe('standard')
    expect(wrapper.findAll('button')[1]!.attributes('disabled')).toBeDefined()
    expect(wrapper.find('form').exists()).toBe(false)
    wrapper.unmount()
  })
  it('prefills once, requires explicit switches, preserves draft and sends complete payload', async () => {
    const { wrapper, state, port } = setup()
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(state.draft.fuel).toBe(15); expect(state.draft.tyreSet).toBe(4); expect(state.draft.compound).toBe('Wet')
    expect(state.draft.changeTyre).toBeNull(); expect(state.draft.changeBodywork).toBeNull()
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    Object.assign(state.draft, { changeTyre: false, changeBodywork: true, changeSuspension: false, fuel: 22 })
    port.carSnapshot.value.strategy.fuelToAdd = 50
    await wrapper.vm.$nextTick()
    expect(state.draft.fuel).toBe(22)
    await wrapper.findAll('button')[0]!.trigger('click')
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(state.draft.fuel).toBe(22)
    await wrapper.find('form').trigger('submit')
    expect(port.sendPlan).toHaveBeenCalledWith({ method: ACC_DRIVE_METHOD, accDrive: { fuel: 22, changeTyre: false, compound: 'Wet', tyreSet: 4,
      pressures: { FL: 26, FR: 26, RL: 26, RR: 26 }, driverId: 1, changeBodywork: true, changeSuspension: false, mfdKeyCycleSpeed: 60, mfdOffset: 0 } })
    state.draft.fuel = 23
    expect(port.sendPlan.mock.calls[0]![0].accDrive.fuel).toBe(22)
    port.orderStatus.value = 'applying'; await wrapper.vm.$nextTick()
    expect(wrapper.findAll('button').slice(0, 2).every(button => button.attributes('disabled') !== undefined)).toBe(true)
    port.orderMethod.value = ACC_DRIVE_METHOD; port.orderStatus.value = 'applied'; await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Completed'); expect(wrapper.text()).not.toContain('campi verificati')
    wrapper.unmount()
    const next = setup(); expect(next.state.method.value).toBe('standard'); next.wrapper.unmount()
  })
})
