import { describe, expect, it } from 'vitest'
import { gripAbbreviation, lapPointAppearance, stintTypeLabel } from '~/services/session-detail/sessionPresentation'

describe('session presentation semantics', () => {
  it('names stint types and keeps unknown producer values visible', () => {
    expect(stintTypeLabel('R')).toBe('Gara')
    expect(stintTypeLabel('Q')).toBe('Qualifica')
    expect(stintTypeLabel('X')).toBe('X')
    expect(gripAbbreviation('Optimum')).toBe('OPT')
    expect(gripAbbreviation('new grip')).toBe('new grip')
  })
  it('uses only circles and validity colors, including pit and comparison laps', () => {
    for (const valid of [true, false]) {
      expect(lapPointAppearance({ valid })).toEqual({ shape: 'circle', color: valid ? '#10b981' : '#ef4444' })
    }
  })
})
