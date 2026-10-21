// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OnboardingDeviceIcon from '~/components/onboarding/OnboardingDeviceIcon.vue'

describe('OnboardingDeviceIcon (PIP-571)', () => {
  it('draws the wheel with a six-button box', () => {
    const wrapper = mount(OnboardingDeviceIcon, { props: { kind: 'wheel' } })
    expect(wrapper.find('.dev__wheel').exists()).toBe(true)
    expect(wrapper.findAll('.dev__led')).toHaveLength(6)
    expect(wrapper.find('.dev__key').exists()).toBe(false)
  })

  it('draws the keyboard with Ctrl and K marked, inside the frame, plus the mouse', () => {
    const wrapper = mount(OnboardingDeviceIcon, { props: { kind: 'keyboard' } })
    expect(wrapper.findAll('.dev__key--ctrl')).toHaveLength(1)
    expect(wrapper.findAll('.dev__key--k')).toHaveLength(1)
    expect(wrapper.text()).toContain('Ctrl')
    expect(wrapper.find('.dev__mouse').exists()).toBe(true)
    for (const key of wrapper.findAll('.dev__key')) {
      const x = Number(key.attributes('x')); const w = Number(key.attributes('width'))
      expect(x).toBeGreaterThanOrEqual(8)
      expect(x + w).toBeLessThanOrEqual(116)
    }
  })
})
