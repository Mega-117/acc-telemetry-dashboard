// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Races from '../../app/components/pitwall/concept/PitwallConceptRaces.vue'
import MyRoom from '../../app/components/pitwall/concept/PitwallConceptMyRoom.vue'
import Feedback from '../../app/components/pitwall/concept/PitwallConceptFeedback.vue'
import Friends from '../../app/components/pitwall/concept/PitwallConceptFriends.vue'
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
    expect(wrapper.text()).toContain('Abbandona Pitwall')
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
    expect(wrapper.text()).toContain('Presenti: Tu')
    expect(wrapper.text()).not.toContain('possono entrare')
    expect(wrapper.find('[popover]').attributes('popover')).toBe('auto')
    expect(wrapper.find('[aria-label="Opzioni Pitwall"]').attributes('popovertarget')).toBe(wrapper.find('[popover]').attributes('id'))
    await wrapper.findAll('button').find(button => button.text() === 'Apri pannello')!.trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.text()).not.toContain('Il tuo Pitwall è chiuso')
    expect(wrapper.text()).not.toContain('Nessun amico può ancora entrare')
    ;(wrapper.find('[popover]').element as HTMLElement).hidePopover = () => {};
    await wrapper.findAll('button').find(button => button.text() === 'Abbandona Pitwall')!.trigger('click')
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


describe('compact Pitwall friends directory', () => {
  const props = {
    people: [{ id: 'A', handle: '@Alex' }, { id: 'B', handle: '@Bea' }, { id: 'C', handle: '@Carlo' }],
    friends: [
      { personId: 'A', state: 'friends', pitwallOpen: true, raceId: 'room-a' },
      { personId: 'B', state: 'received', pitwallOpen: false },
      { personId: 'C', state: 'sent', pitwallOpen: false },
    ] as any,
  }
  it('separates friends from incoming and outgoing requests, preserving their actions', async () => {
    const page = mount(Friends, { props })
    expect(page.findAll('.pwc-person')).toHaveLength(1)
    ;(page.find('[popover]').element as HTMLElement).hidePopover = () => {};
    await page.findAll('button').find(b => b.text() === 'Entra nel Pitwall')!.trigger('click')
    expect(page.emitted('enter')).toEqual([['room-a']])
    await page.findAll('button').find(b => b.text().includes('Richieste'))!.trigger('click')
    expect(page.findAll('.pwc-person')).toHaveLength(2)
    await page.findAll('button').find(b => b.text() === 'Accetta')!.trigger('click')
    expect(page.emitted('accept')).toEqual([['B']])
    await page.findAll('button').find(b => b.text() === 'Annulla')!.trigger('click')
    expect(page.emitted('remove')).toEqual([['C']])
    page.unmount()
  })
  it('filters the visible category and keeps removal confirmation', async () => {
    const page = mount(Friends, { props })
    await page.find('input').setValue('nobody')
    expect(page.findAll('.pwc-person')).toHaveLength(0)
    await page.find('input').setValue('Alex')
    expect(page.find('.pwc-person__heading button').attributes('aria-label')).toBe('Opzioni per Alex')
    expect(page.find('.pwc-person__heading button svg').exists()).toBe(true)
    await page.find('.pwc-person__heading button').trigger('click')
    expect(page.emitted('remove')).toBeUndefined()
    expect(page.find('.pwc-confirm').exists()).toBe(false)
    ;(page.find('[popover]').element as HTMLElement).hidePopover = () => {}
    await page.findAll('[popover] button').find(b => b.text() === 'Rimuovi amico')!.trigger('click')
    expect(page.emitted('remove')).toBeUndefined()
    expect(page.find('.pwc-confirm').text()).toContain('Alex')
    await page.find('.pwc-confirm .pwc-link-btn').trigger('click')
    expect(page.emitted('remove')).toBeUndefined()
    expect(page.find('.pwc-confirm').exists()).toBe(false)
    await page.findAll('[popover] button').find(b => b.text() === 'Rimuovi amico')!.trigger('click')
    await page.find('.pwc-confirm .is-danger').trigger('click')
    expect(page.emitted('remove')).toEqual([['A']])
    page.unmount()
  })
  it('uses the same sidebar for adding people without showing a second search field', async () => {
    const page = mount(Friends, { props, slots: { search: '<input aria-label="Cerca nickname">' } })
    await page.setProps({ adding: true })
    expect(page.findAll('input')).toHaveLength(1)
    expect(page.find('.pwc-social-tabs').exists()).toBe(false)
    await page.setProps({ adding: false })
    expect(page.find('.pwc-social-tabs').exists()).toBe(true)
    page.unmount()
  })
})


describe('Pitwall feedback area', () => {
  it('keeps its region mounted when empty and preserves simultaneous error and clock warning', async () => {
    const page = mount(Feedback, { props: { error: null, notice: null, warning: null } })
    expect(page.find('[aria-label="Messaggi Pitwall"]').exists()).toBe(true)
    await page.setProps({ error: 'Connessione interrotta', notice: 'Richiesta inviata', warning: 'Controlla orologio' })
    expect(page.findAll('[role="alert"]')).toHaveLength(2)
    expect(page.text()).not.toContain('Richiesta inviata')
    await page.setProps({ error: null, warning: null })
    expect(page.find('[role="status"]').text()).toBe('Richiesta inviata')
    page.unmount()
  })
})



describe('social room summary', () => {
  it.each(['social', 'legacy'])('avoids repeated names and distinguishes %s access', model => {
    const page = mount(Races, { props: { meId: 'B', people: [], races: [{
      id: 'r', label: 'Pitwall di Alex', carModel: 'Pitwall di Alex', track: '', carNumber: 0,
      session: 'Entra per vedere chi guida', hostId: 'A', closed: false,
      membershipModel: model === 'social' ? 'social' : undefined,
      members: [{ personId: 'B', role: 'invited', driving: false, online: false }],
      reason: { kind: 'invite', personId: 'A' },
    }] as any } })
    expect(page.text().match(/Pitwall di Alex/g)).toHaveLength(1)
    expect(page.text()).not.toContain('Entra per vedere')
    expect(page.find('.pwc-invitation').exists()).toBe(model !== 'social')
    page.unmount()
  })
  it('keeps room status inline with the name and removes its text when closed', async () => {
    const page = mount(Friends, { props: { people: [{ id:'A', handle:'@Alex' }], friends: [{ personId:'A', state:'friends', pitwallOpen:true, raceId:'r' }] as any } })
    expect(page.find('.pwc-person__status').text()).toContain('Pitwall aperto')
    expect(page.findAll('.pwc-person__actions')).toHaveLength(0)
    await page.setProps({ friends: [{ personId:'A', state:'friends', pitwallOpen:false }] as any })
    expect(page.find('.pwc-person__status').exists()).toBe(true)
    expect(page.find('.pwc-person__status').text()).toBe('')
    expect(page.text()).not.toContain('Entra nel Pitwall')
    page.unmount()
  })
})
