import { describe, expect, it } from 'vitest'
import { gripAbbreviation, lapCountLabel, lapPointAppearance, sessionKindLabel, stintTypeLabel } from '~/services/session-detail/sessionPresentation'
import { translate } from '~/i18n'

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

describe('session counts and kinds in plain Italian (audit 09/11)', () => {
  it('says "1 giro" and "n giri", never "1 giri"', () => {
    expect(lapCountLabel(1)).toBe('1 giro')
    expect(lapCountLabel(0)).toBe('0 giri')
    expect(lapCountLabel(4)).toBe('4 giri')
  })
  it('names the session kind from its ACC type instead of the raw English word', () => {
    expect(sessionKindLabel(0)).toBe('Prove libere')
    expect(sessionKindLabel(1)).toBe('Qualifica')
    expect(sessionKindLabel(2)).toBe('Gara')
  })
  it('agrees the zones lap count in the singular', () => {
    expect(translate('it', 'telemetry.zones.lapsOne')).toBe('1 giro valido')
  })
})

describe('unreadable laps note in the singular (audit 09/11)', () => {
  it('says "1 giro non leggibile escluso"', () => {
    expect(translate('it', 'telemetry.skippedOne')).toBe('1 giro non leggibile escluso.')
  })
})
