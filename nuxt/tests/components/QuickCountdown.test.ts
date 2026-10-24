// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import QuickCountdown from '~/components/overlay/QuickCountdown.vue'

describe('quick timer view', () => {
  // PIP-611: one MM:SS field shared with the other editors: wheel, mouse scroll, typed digits.
  it('starts the chosen duration, every control reachable from the wheel', async () => {
    const wrapper = mount(QuickCountdown, { props: { status: 'idle', display: '00:00' } })
    expect(wrapper.findAll('[data-overlay-wheel-action]').map(item => item.attributes('data-overlay-wheel-action'))).toEqual([
      'timer-back', 'timer-time', 'timer-preset-5', 'timer-preset-10', 'timer-preset-20', 'timer-preset-30', 'timer-start'])
    // Starts on the first preset, 5 minutes.
    expect(wrapper.get('[data-overlay-wheel-action="timer-preset-5"]').attributes('aria-pressed')).toBe('true')
    const time = wrapper.get('[data-overlay-wheel-action="timer-time"]')
    // Typed from the right: 2 0 0 = 02:00; then the scroll wheel over the seconds adds one.
    for (const key of ['2', '0', '0']) await time.trigger('keydown', { key })
    expect(time.text()).toContain('02:00')
    // Still typing: the pointer finds the seconds, not the minutes.
    await time.get('[data-part="1"]').trigger('wheel', { deltaY: -100 })
    await wrapper.get('[aria-label^="Avvia timer"]').trigger('click')
    expect(wrapper.emitted('start')).toEqual([[121]])
    // Backspace down to nothing shows the value before typing again.
    await time.trigger('keydown', { key: '5' }); await time.trigger('keydown', { key: 'Backspace' })
    expect(time.text()).toContain('02:01')
    // Typing, then the wheel takes over: the field shows the new value, not the typed digits.
    for (const key of ['1', '3', '0']) await time.trigger('keydown', { key })
    await time.trigger('click')
    const wheel = wrapper.vm as unknown as { handleWheelCommand(command: string): boolean }
    expect(wheel.handleWheelCommand('next-action')).toBe(true); await wrapper.vm.$nextTick()
    expect(time.text()).toContain('02:30')
    expect(wheel.handleWheelCommand('back')).toBe(true)
    // Wheel: OK engages the minutes, OK again the seconds; Down wraps them without touching the minutes.
    await wrapper.get('[data-overlay-wheel-action="timer-preset-5"]').trigger('click')
    await time.trigger('click')
    const timer = wrapper.vm as unknown as { handleWheelCommand(command: string): boolean }
    expect(timer.handleWheelCommand('activate-action')).toBe(true)
    expect(timer.handleWheelCommand('previous-action')).toBe(true)
    expect(timer.handleWheelCommand('activate-action')).toBe(true)
    expect(timer.handleWheelCommand('previous-action')).toBe(false)
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
