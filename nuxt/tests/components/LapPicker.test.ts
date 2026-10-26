// @vitest-environment jsdom
// PIP-635: scelta del giro nello stile del sito: best in fucsia, giri non validi in rosso.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LapPicker, { type LapGroup } from '~/components/session-detail/analysis/LapPicker.vue'

const groups: LapGroup[] = [{ label: '', options: [
  { id: 'a', title: 'Giro 1', time: '1:45.000', conditions: '', valid: true, complete: false, best: false },
  { id: 'b', title: 'Giro 2', time: '1:43.362', conditions: '16°/21° OPT', valid: true, complete: true, best: true },
  { id: 'c', title: 'Giro 3', time: '1:44.100', conditions: '', valid: false, complete: true, best: false },
] }]
const render = (modelValue = 'b') => mount(LapPicker, { props: { modelValue, groups, name: 'Tu', color: '#38bdf8' }, attachTo: document.body })

describe('LapPicker', () => {
  it('shows the best lap in fuchsia without a tag, and marks invalid and partial laps in the list', async () => {
    const w = render()
    expect(w.get('.lap-picker__time').classes()).toContain('is-best')
    expect(w.get('.lap-picker__button').text()).not.toContain('Best')
    await w.get('.lap-picker__button').trigger('click')
    const rows = w.findAll('[role="option"]')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.text()).toContain('Parziale')
    expect(rows[0]!.attributes('aria-disabled')).toBe('true')
    expect(rows[2]!.text()).toContain('Non valido')
    expect(rows[2]!.find('.is-invalid').exists()).toBe(true)
    expect(rows[1]!.attributes('aria-selected')).toBe('true')
    w.unmount()
  })

  it('picks with the keyboard, skipping partial laps, and ignores clicks on them', async () => {
    const w = render()
    const button = w.get('.lap-picker__button')
    await button.trigger('keydown', { key: 'ArrowDown' })
    await button.trigger('keydown', { key: 'ArrowDown' })
    await button.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['c'])
    await button.trigger('click')
    await w.findAll('[role="option"]')[0]!.trigger('click')
    expect(w.emitted('update:modelValue')).toHaveLength(1)
    await button.trigger('keydown', { key: 'Escape' })
    expect(w.find('[role="listbox"]').exists()).toBe(false)
    w.unmount()
  })

  it('runs the actions under the list and closes, skipping disabled ones', async () => {
    const actions = [{ id: 'shared', label: '+ Giro di un altro pilota' }, { id: 'off', label: 'Spento', disabled: true }]
    const w = mount(LapPicker, { props: { modelValue: 'b', groups, name: 'Riferimento', color: '#fbbf24', actions }, attachTo: document.body })
    await w.get('.lap-picker__button').trigger('click')
    const buttons = w.findAll('.lap-picker__actions button')
    await buttons[1]!.trigger('click')
    expect(w.emitted('action')).toBeUndefined()
    await buttons[0]!.trigger('click')
    expect(w.emitted('action')?.[0]).toEqual(['shared'])
    expect(w.find('.lap-picker__pop').exists()).toBe(false)
    w.unmount()
  })
})
