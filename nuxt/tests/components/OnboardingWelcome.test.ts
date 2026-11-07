// @vitest-environment jsdom
// PIP-749: the first card of the introduction draws the logo and the four pillars live.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setLocale } from '~/i18n'
import OnboardingWelcome from '~/components/onboarding/OnboardingWelcome.vue'

vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (p: string) => `/base${p}` }) }))

afterEach(() => setLocale('it'))

describe('OnboardingWelcome (PIP-749)', () => {
  it('shows the logo and the four pillars in order, with the line of each in the interface language', async () => {
    setLocale('it')
    const wrapper = mount(OnboardingWelcome)
    expect(wrapper.get('img').attributes('src')).toBe('/base/branding/auth/racer_core_exact.svg')
    expect(wrapper.findAll('[data-pillar]').map(p => p.attributes('data-pillar'))).toEqual(['live', 'automation', 'performance', 'memory'])
    expect(wrapper.get('[data-pillar="live"]').text()).toContain('HUD in pista')
    expect(wrapper.text()).toContain('per te')
    setLocale('en')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-pillar="live"]').text()).toContain('HUDs on track')
    expect(wrapper.text()).toContain('for you')
    // The pillar names are the product's own words and stay the same in both languages.
    expect(wrapper.get('[data-pillar="memory"] b').text()).toBe('Memory')
    wrapper.unmount()
  })
})
