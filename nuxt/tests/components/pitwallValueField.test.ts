// @vitest-environment jsdom
// 06/11 (user): a value typed in a Pitwall field stays inside its limits and on its step; garbage restores the value.
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PitwallValueField from '~/components/pitwall/PitwallValueField.vue'

const echo = { changed: false, carValue: '', delta: '' }
const fuel = (value: number | null = 40) => mount(PitwallValueField, { props: { inputLabel: 'Benzina', value, min: 0, max: 120, step: 1, echo: echo as never } })
const psi = () => mount(PitwallValueField, { props: { inputLabel: 'PSI', value: 26.5, min: 20.3, max: 35, step: 0.1, decimals: 1, echo: echo as never } })
// setValue sends both input and change (the field listens to change only).
async function type(view: ReturnType<typeof fuel>, text: string) { const input = view.get('input'); await input.setValue(text); return input }

describe('PitwallValueField typed values', () => {
  it('keeps a typed value inside min..max', async () => {
    const view = fuel()
    expect((await type(view, '999')).element.value).toBe('120')
    await type(view, '-5')
    expect(view.emitted('update:value')).toEqual([[120], [0]])
  })
  it('rounds to the step and the decimals (comma accepted)', async () => {
    const view = psi()
    expect((await type(view, '27,46')).element.value).toBe('27,5')
    expect(view.emitted('update:value')).toEqual([[27.5]])
  })
  it('text that is not a number puts the previous value back and sends nothing', async () => {
    const view = fuel(40)
    expect((await type(view, 'abc')).element.value).toBe('40')
    expect((await type(view, '')).element.value).toBe('40')
    expect(view.emitted('update:value')).toBeUndefined()
  })
})
