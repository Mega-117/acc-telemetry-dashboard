import { describe, expect, it } from 'vitest'
import { stepNumberField, typeNumberField } from '~/utils/controlKNumberField'

const seconds = { min: 0, max: 59, digits: 2, wrap: true }
const minutes = { min: 0, max: 9, digits: 1, wrap: false }
const sector = { min: 10, max: 240, digits: 3, wrap: false }

describe('Control K number field (PIP-556)', () => {
  it('steps one unit, wrapping or stopping at the limits', () => {
    expect(stepNumberField(59, 1, seconds)).toBe(0)
    expect(stepNumberField(0, -1, seconds)).toBe(59)
    expect(stepNumberField(9, 1, minutes)).toBe(9)
    expect(stepNumberField(0, -1, minutes)).toBe(0)
    expect(stepNumberField(null, 1, sector)).toBe(10)
  })

  it('types digits until the field is full, then starts a new number', () => {
    let state = typeNumberField('', '2', seconds)
    expect(state).toEqual({ typed: '2', value: 2 })
    state = typeNumberField(state.typed, '3', seconds)
    expect(state).toEqual({ typed: '23', value: 23 })
    state = typeNumberField(state.typed, '4', seconds)
    expect(state).toEqual({ typed: '4', value: 4 })
  })

  it('keeps typed values inside the limits', () => {
    expect(typeNumberField('7', '5', seconds).value).toBe(59)
    expect(typeNumberField('', '3', sector).value).toBe(10)
    expect(typeNumberField('3', '5', sector).value).toBe(35)
    expect(typeNumberField('16', '0', sector).value).toBe(160)
    expect(typeNumberField('99', '9', sector).value).toBe(240)
  })
})
