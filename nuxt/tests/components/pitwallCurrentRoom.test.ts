// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MyRoom from '../../app/components/pitwall/concept/PitwallConceptMyRoom.vue'

describe('current social party presentation', () => {
  it.each([true, false])('shows and leaves the joined room with creator intent off (desktop=%s)', async available => {
    const wrapper = mount(MyRoom, { props: {
      meId: 'B', people: [{ id: 'A', handle: '@A' }, { id: 'B', handle: '@B' }],
      pitwall: { available, state: 'off', roomId: null, reason: null },
      room: { id: 'one', label: 'Pitwall di A', track: null, carNumber: null, state: 'live', drivingId: null,
        members: [{ personId: 'B', role: 'member', driving: false, online: false }], invitedIds: [] },
    } })
    expect(wrapper.text()).toContain('Pitwall di A')
    expect(wrapper.text()).not.toContain('Il tuo Pitwall è chiuso')
    expect(wrapper.text()).not.toContain('Nessun amico può ancora entrare')
    await wrapper.findAll('button').find(button => button.text() === 'Esci dal Pitwall')!.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
  it('distinguishes a refused opening from a pending connection', () => {
    const wrapper = mount(MyRoom, { props: { meId: 'A', people: [], room: null,
      pitwall: { available: true, state: 'arming', roomId: null, reason: 'Permission denied' } } })
    expect(wrapper.text()).toContain('Apertura del Pitwall non riuscita')
    expect(wrapper.text()).not.toContain('Connessione in corso')
    wrapper.unmount()
  })
})
