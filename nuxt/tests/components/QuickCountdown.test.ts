// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import QuickCountdown from '~/components/overlay/QuickCountdown.vue'

describe('quick timer view', () => {
  it('starts the chosen minutes and seconds, every control reachable from the wheel (PIP-526)', async () => {
    const wrapper = mount(QuickCountdown, { props: { status: 'idle', display: '00:00' } })
    await wrapper.get('[aria-label="Minuti timer"]').setValue(2)
    await wrapper.get('[aria-label="Secondi timer"]').setValue(15)
    await wrapper.get('[aria-label="Avvia timer"]').trigger('click')
    expect(wrapper.emitted('start')).toEqual([[135]])
    expect(wrapper.findAll('[data-overlay-wheel-action]').map(item => item.attributes('data-overlay-wheel-action'))).toEqual([
      'timer-preset-1', 'timer-preset-3', 'timer-preset-5', 'timer-preset-10',
      'timer-minutes-minus', 'timer-minutes-plus', 'timer-seconds-minus', 'timer-seconds-plus', 'timer-start', 'timer-back'])
    await wrapper.get('[data-overlay-wheel-action="timer-preset-5"]').trigger('click')
    await wrapper.get('[data-overlay-wheel-action="timer-seconds-plus"]').trigger('click')
    await wrapper.get('[aria-label="Avvia timer"]').trigger('click')
    expect(wrapper.emitted('start')?.[1]).toEqual([305])
    await wrapper.get('[aria-label="Secondi timer"]').setValue(60)
    expect(wrapper.get('[aria-label="Avvia timer"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
  it('shows running and finished state, with explicit cancellation', async () => {
    const wrapper = mount(QuickCountdown, { props: { status: 'running', display: '00:12' } })
    expect(wrapper.get('[role="timer"]').text()).toBe('00:12')
    expect(wrapper.find('input').exists()).toBe(false)
    await wrapper.get('button').trigger('click'); expect(wrapper.emitted('cancel')).toHaveLength(1)
    await wrapper.setProps({ status: 'finished', display: '00:00' })
    expect(wrapper.text()).toContain('Tempo scaduto'); expect(wrapper.get('button').text()).toBe('Chiudi timer')
    wrapper.unmount()
  })
})
