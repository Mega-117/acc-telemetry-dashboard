import { describe, expect, it } from 'vitest'
import {
  fieldWheelCommand, formatField, singleField, stepField, typeFieldDigit, typedFieldText, typedFieldValue, type NumberFieldSpec,
} from '~/utils/controlKNumberField'

// Lap time in tenths (M:SS,d), sector in tenths (SSS,d), timer in seconds (MM:SS).
const lap: NumberFieldSpec = {
  parts: [
    { label: 'MIN', min: 0, max: 9, wrap: false, digits: 1, unit: 600 },
    { label: 'SEC', min: 0, max: 59, wrap: true, digits: 2, unit: 10, separator: ':' },
    { label: 'DEC', min: 0, max: 9, wrap: true, digits: 1, unit: 1, separator: ',' },
  ],
  min: 10, max: 6000, start: 1,
}
const sector: NumberFieldSpec = {
  parts: [
    { label: 'SEC', min: 10, max: 240, wrap: false, digits: 3, unit: 10 },
    { label: 'DEC', min: 0, max: 9, wrap: true, digits: 1, unit: 1, separator: ',' },
  ],
  min: 100, max: 2400,
}
const timer: NumberFieldSpec = {
  parts: [
    { label: 'MIN', min: 0, max: 99, wrap: false, digits: 2, unit: 60, pad: 2 },
    { label: 'SEC', min: 0, max: 59, wrap: true, digits: 2, unit: 1, separator: ':' },
  ],
  min: 0, max: 5999,
}
const type = (digits: string, spec: NumberFieldSpec) => [...digits].reduce((typed, digit) => typeFieldDigit(typed, digit, spec), '')

describe('Control K number field (PIP-611)', () => {
  it('shows one value with our separators', () => {
    expect(formatField(905, lap)).toBe('1:30,5')
    expect(formatField(370, sector)).toBe('37,0')
    expect(formatField(90, timer)).toBe('01:30')
    expect(formatField(null, lap)).toBe('—')
    expect(formatField(5, singleField(1, 10, 2, t => (t / 10).toFixed(1).replace('.', ',')))).toBe('0,5')
  })

  it('types digits from the right, as on a microwave', () => {
    expect(typedFieldText(type('1', lap), lap)).toBe('0:00,1')
    expect(typedFieldText(type('1305', lap), lap)).toBe('1:30,5')
    expect(typedFieldValue(type('1305', lap), lap)).toBe(905)
    expect(typedFieldValue(type('370', sector), sector)).toBe(370)
    expect(typedFieldValue(type('130', timer), timer)).toBe(90)
    // Full field: the oldest digit leaves.
    expect(type('13057', lap)).toBe('3057')
  })

  it('carries typed values that overflow a part, and keeps the limits', () => {
    // 1:75,0 is 2:15,0; 0:75 is 01:15.
    expect(typedFieldValue(type('1750', lap), lap)).toBe(1350)
    expect(typedFieldValue(type('75', timer), timer)).toBe(75)
    expect(formatField(typedFieldValue(type('75', timer), timer), timer)).toBe('01:15')
    // Under the sector minimum (10,0 s) or over the maximum (4:00,0).
    expect(typedFieldValue(type('5', sector), sector)).toBe(100)
    expect(typedFieldValue(type('9999', sector), sector)).toBe(2400)
  })

  it('steps one part without carrying into the others', () => {
    expect(formatField(stepField(1195, 1, 1, lap), lap)).toBe('1:00,5') // 1:59,5 +1 s
    expect(formatField(stepField(909, 2, 1, lap), lap)).toBe('1:30,0') // 1:30,9 +0,1
    expect(stepField(5940, 0, 1, lap)).toBe(5940) // 9:54,0: minutes stop at 9
    expect(stepField(105, 0, -1, sector)).toBe(105) // seconds stop at 10
    expect(stepField(null, 1, 1, lap)).toBe(10) // empty starts from the minimum
  })

  it('wheel: OK engages, Up/Down change the part, OK moves on, Back or the last OK release', () => {
    expect(fieldWheelCommand(null, 905, 'next-action', lap)).toEqual({ handled: false, part: null, value: 905 })
    expect(fieldWheelCommand(1, 905, 'next-action', lap)).toEqual({ handled: true, part: 1, value: 915 })
    expect(fieldWheelCommand(1, 905, 'previous-action', lap)).toEqual({ handled: true, part: 1, value: 895 })
    expect(fieldWheelCommand(1, 905, 'activate-action', lap)).toEqual({ handled: true, part: 2, value: 905 })
    // Lap: SEC, then DEC, then MIN, then released.
    expect(fieldWheelCommand(2, 905, 'activate-action', lap)).toEqual({ handled: true, part: 0, value: 905 })
    expect(fieldWheelCommand(0, 905, 'activate-action', lap)).toEqual({ handled: true, part: null, value: 905 })
    expect(fieldWheelCommand(1, 370, 'activate-action', sector)).toEqual({ handled: true, part: null, value: 370 })
    expect(fieldWheelCommand(1, 905, 'back', lap)).toEqual({ handled: true, part: null, value: 905 })
    expect(fieldWheelCommand(1, 905, 'unknown', lap).handled).toBe(false)
  })
})
