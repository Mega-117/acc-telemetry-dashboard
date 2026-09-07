// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TyreCondition from '~/components/pitwall/PitwallTyreCondition.vue'
import { boundPitwallStrategy, boundPitwallTyreCondition } from '~/services/pitwall/pitwallLink'

const condition = { tyreSet: 11, compound: 'dry', state: 'new', via: 'screen', observedAt: '2026-09-07T11:53:55Z' }
describe('tyre condition presentation and transport', () => {
  it('keeps the same timestamp, outside requested fields', () => {
    const snapshot = boundPitwallStrategy({ tyreSet: 10, tyreSetCondition: condition }, 'now')!
    expect(snapshot.tyreSetCondition).toEqual(condition)
    expect(boundPitwallStrategy({ tyreSet: 10 }, 'now')!.tyreSetCondition).toBeUndefined()
  })
  it.each([null, {}, { ...condition, tyreSet: 0 }, { ...condition, tyreSet: 51 }, { ...condition, state: 'invented' }, { ...condition, observedAt: 'invalid' }, { ...condition, via: 'memory' }])('rejects invalid metadata %o', value => {
    expect(boundPitwallTyreCondition(value)).toBeNull()
  })
  it('shows new/used only for the observed set and clears on disconnect or uncertain read', async () => {
    const wrapper = mount(TyreCondition, { props: { tyreSet: 11, fresh: true, condition } })
    expect(wrapper.text()).toContain('Nuovo · 11')
    expect(wrapper.text()).toContain('LIVE')
    expect(wrapper.text()).toContain('A SCHERMO')
    expect(wrapper.find('[title]').attributes('title')).toContain(condition.observedAt)
    await wrapper.setProps({ condition: { ...condition, state: 'used' } })
    expect(wrapper.text()).toContain('Usato · 11')
    await wrapper.setProps({ tyreSet: 1 })
    expect(wrapper.text()).toContain('Stato non verificato')
    expect(wrapper.text()).not.toContain('Usato')
    await wrapper.setProps({ tyreSet: 11, fresh: false })
    expect(wrapper.text()).toContain('Stato non verificato')
    await wrapper.setProps({ fresh: true, condition: { ...condition, state: 'unknown' } })
    expect(wrapper.text()).toContain('Stato non verificato')
  })
})
