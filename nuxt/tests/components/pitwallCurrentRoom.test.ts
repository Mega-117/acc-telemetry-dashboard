// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MyRoom from '../../app/components/pitwall/concept/PitwallConceptMyRoom.vue'
import Wall from '../../app/components/pitwall/concept/PitwallConceptWall.vue'

describe('current social party presentation', () => {
  it('shows the retained room while its own connection is recovering', () => {
    const wrapper = mount(MyRoom, { props: {
      meId: 'A', people: [], pitwall: { available: true, state: 'open', roomId: 'one', reason: null },
      room: { id: 'one', label: 'Original party', track: null, carNumber: null, state: 'live', invitedIds: [],
        members: [{ personId: 'A', role: 'member', online: false, driving: false, reconnecting: true }] },
    } })
    expect(wrapper.text()).toContain('Original party')
    expect(wrapper.text()).toContain('Riconnessione in corso')
    expect(wrapper.text()).toContain('Esci dal Pitwall')
    expect(wrapper.text()).not.toContain('Il tuo Pitwall è chiuso')
    wrapper.unmount()
  })

  it('offers the founder an exit and shows social capacity without manager instructions', async () => {
    const wrapper = mount(Wall, { props: {
      meId: 'A', people: [], race: { id: 'one', membershipModel: 'social', hostId: 'A', carNumber: 0, carModel: '', track: '', session: '', closed: false,
        reason: { kind: 'grant', personId: 'A' },
        members: Array.from({ length: 16 }, (_, index) => ({ personId: index === 0 ? 'A' : String(index), role: 'member', online: true, driving: false })),
      },
    } })
    expect(wrapper.text()).toContain('16 persone')
    expect(wrapper.text()).not.toContain('Solo chi gestisce')
    const leave = wrapper.findAll('button').find(button => /Esci/.test(button.text()))!
    expect(leave).toBeTruthy()
    await leave.trigger('click')
    expect(wrapper.emitted('leave')).toHaveLength(1)
    wrapper.unmount()
  })

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
