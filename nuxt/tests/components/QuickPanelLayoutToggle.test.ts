// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import Toggle from '~/components/overlay/QuickPanelLayoutToggle.vue'

it('exposes icon-only choices with names and the selected layout', async () => {
  const wrapper = mount(Toggle, { props: { modelValue: 'vertical' } })
  const vertical = wrapper.get('button[aria-label="Layout verticale"]')
  const horizontal = wrapper.get('button[aria-label="Layout orizzontale"]')
  expect(vertical.attributes('aria-pressed')).toBe('true')
  expect(horizontal.attributes('aria-pressed')).toBe('false')
  expect(wrapper.text()).toBe('')
  await horizontal.trigger('click')
  expect(wrapper.emitted('update:modelValue')).toEqual([['horizontal']])
  await wrapper.setProps({ modelValue: 'horizontal' })
  expect(horizontal.attributes('aria-pressed')).toBe('true')
  expect(vertical.attributes('aria-pressed')).toBe('false')
  await vertical.trigger('click')
  expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['vertical'])
  wrapper.unmount()
})
