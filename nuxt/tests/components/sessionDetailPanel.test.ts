// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SessionDetailPanel from '~/components/session-detail/SessionDetailPanel.vue'

describe('Session detail analysis panel', () => {
  it('shows analysis directly without preview modes', () => {
    const wrapper = mount(SessionDetailPanel, { props: { comparisonOpen: false, label: 'Stint 4' }, slots: { default: '<p>Tempi dello stint</p>' } })
    expect(wrapper.text()).toContain('Stint 4')
    expect(wrapper.text()).toContain('Tempi dello stint')
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Avanzata')
    expect(wrapper.find('button').exists()).toBe(false)
  })
  it('changes result heading without resetting mounted content', async () => {
    const wrapper = mount(SessionDetailPanel, { props: { comparisonOpen: false, label: 'Stint 4' }, slots: { default: '<input value="A #1 B #2 #3" />' } })
    const input = wrapper.get('input').element
    await wrapper.setProps({ comparisonOpen: true })
    expect(wrapper.get('h2').text()).toBe('Confronto stint')
    await wrapper.setProps({ comparisonOpen: false })
    expect(wrapper.get('input').element).toBe(input)
    expect(wrapper.get('h2').text()).toBe('Stint 4')
  })
})
