// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RacingSwitch from '~/components/ui/RacingSwitch.vue'

describe('RacingSwitch', () => {
  it('requests a change without claiming success before its owner confirms the state', async () => {
    const wrapper = mount(RacingSwitch, { props: { modelValue: false, label: 'Avvisi giro' } })
    const button = wrapper.get('button')
    expect(button.attributes('role')).toBe('switch')
    expect(button.attributes('aria-label')).toBe('Avvisi giro')
    await button.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    expect(button.attributes('aria-checked')).toBe('false')
    await wrapper.setProps({ modelValue: true })
    expect(button.attributes('aria-checked')).toBe('true')
    await button.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true], [false]])
    wrapper.unmount()
  })
  it('uses native disabled semantics while an operation is pending', async () => {
    const wrapper = mount(RacingSwitch, { props: { modelValue: true, label: 'Blocca posizioni', disabled: true } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
