// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OnboardingPanelShowcase from '~/components/onboarding/OnboardingPanelShowcase.vue'
import { VOICE_TILE } from '~/services/onboarding/commandPractice'

vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (p: string) => `/base${p}` }) }))

const mountShowcase = () => mount(OnboardingPanelShowcase, { global: { stubs: { Transition: false } } })
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('OnboardingPanelShowcase (PIP-571)', () => {
  it('plays Ctrl+K, opens the panel and ends on the voice alerts, all on by default', async () => {
    const wrapper = mountShowcase()
    expect(wrapper.classes()).toContain('is-keys')
    expect(wrapper.find('.replica').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(1200)
    expect(wrapper.classes()).toContain('is-pressed')
    await vi.advanceTimersByTimeAsync(600)
    expect(wrapper.find('.replica').exists()).toBe(true)
    expect(wrapper.find(`[data-replica-tile="${VOICE_TILE}"]`).text()).toContain('4/4')
    await vi.advanceTimersByTimeAsync(1200)
    expect(wrapper.find(`[data-replica-tile="${VOICE_TILE}"]`).classes()).toContain('is-selected')
    await vi.advanceTimersByTimeAsync(1200)
    expect(wrapper.find('[data-replica-voice]').exists()).toBe(true)
    expect(wrapper.findAll('[data-replica-switch]').every(s => s.attributes('aria-checked') === 'true')).toBe(true)
    expect(wrapper.text()).toContain('Li spegni da qui')
    wrapper.unmount()
  })

  it('hands over to the mouse: toggles a voice alert, goes back, confirms a tile', async () => {
    const wrapper = mountShowcase()
    await vi.advanceTimersByTimeAsync(4100)
    await wrapper.get('[data-replica-switch="2"]').trigger('click')
    expect(wrapper.get('[data-replica-switch="2"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.text()).toContain('Pressioni: spento')
    await wrapper.get('[data-replica-back]').trigger('click')
    expect(wrapper.find(`[data-replica-tile="${VOICE_TILE}"]`).text()).toContain('3/4')
    await wrapper.get('[data-replica-tile="1"]').trigger('click')
    expect(wrapper.get('[data-replica-tile="1"]').classes()).toContain('is-confirmed')
    expect(wrapper.text()).toContain('Hai scelto: Correggi pressioni')
    await wrapper.get(`[data-replica-tile="${VOICE_TILE}"]`).trigger('click')
    expect(wrapper.find('[data-replica-voice]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('stops the demo as soon as the pilot touches the panel', async () => {
    const wrapper = mountShowcase()
    await vi.advanceTimersByTimeAsync(1800)
    await wrapper.get('[data-replica-tile="0"]').trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.find('[data-replica-voice]').exists()).toBe(false)
    expect(wrapper.get('[data-replica-tile="0"]').classes()).toContain('is-selected')
    wrapper.unmount()
  })
})
