// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import QuickCountdown from '~/components/overlay/QuickCountdown.vue'

describe('quick timer view', () => {
  // PIP-556: MIN | SEC fields shared with the other editors: wheel, mouse scroll, typed digits.
  it('starts the chosen minutes and seconds, every control reachable from the wheel', async () => {
    const wrapper = mount(QuickCountdown, { props: { status: 'idle', display: '00:00' } })
    expect(wrapper.findAll('[data-overlay-wheel-action]').map(item => item.attributes('data-overlay-wheel-action'))).toEqual([
      'timer-back', 'timer-minutes', 'timer-seconds', 'timer-preset-1', 'timer-preset-3', 'timer-preset-5', 'timer-preset-10', 'timer-start'])
    const minutes = wrapper.get('[data-overlay-wheel-action="timer-minutes"]')
    for (const key of ['0', '2']) await minutes.trigger('keydown', { key })
    await wrapper.get('[data-overlay-wheel-action="timer-seconds"]').trigger('wheel', { deltaY: -100 })
    await wrapper.get('[aria-label^="Avvia timer"]').trigger('click')
    expect(wrapper.emitted('start')).toEqual([[121]])
    // Wheel: OK on SEC, then Down: seconds wrap without touching the minutes.
    await wrapper.get('[data-overlay-wheel-action="timer-preset-5"]').trigger('click')
    await wrapper.get('[data-overlay-wheel-action="timer-seconds"]').trigger('click')
    const timer = wrapper.vm as unknown as { handleWheelCommand(command: string): boolean }
    expect(timer.handleWheelCommand('previous-action')).toBe(true)
    expect(timer.handleWheelCommand('activate-action')).toBe(true)
    await wrapper.get('[aria-label^="Avvia timer"]').trigger('click')
    expect(wrapper.emitted('start')?.[1]).toEqual([359])
    wrapper.unmount()
  })
  it('shows running and finished state, with explicit cancellation', async () => {
    const wrapper = mount(QuickCountdown, { props: { status: 'running', display: '00:12' } })
    expect(wrapper.get('[role="timer"]').text()).toBe('00:12')
    expect(wrapper.find('.ck-field').exists()).toBe(false)
    // PIP-556: ← leaves the running timer alone (back), "Annulla timer" cancels it.
    await wrapper.get('[data-overlay-wheel-action="timer-back"]').trigger('click'); expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.classes()).toContain('quick-countdown--quiet')
    await wrapper.get('[data-overlay-wheel-action="timer-end"]').trigger('click'); expect(wrapper.emitted('cancel')).toHaveLength(1)
    await wrapper.setProps({ armed: true })
    expect(wrapper.classes()).not.toContain('quick-countdown--quiet')
    expect(wrapper.text()).toContain('Premi OK di nuovo per annullare')
    await wrapper.setProps({ status: 'finished', display: '00:00' })
    expect(wrapper.text()).toContain('Tempo scaduto'); expect(wrapper.get('[data-overlay-wheel-action="timer-end"]').text()).toBe('Chiudi timer')
    wrapper.unmount()
  })
})
