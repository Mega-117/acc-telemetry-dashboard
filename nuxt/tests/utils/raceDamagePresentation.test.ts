import { describe, expect, it } from 'vitest'
import { raceDamageColor, raceDamageZoneTime } from '../../app/utils/raceDamagePresentation'

describe('reference damage presentation', () => {
  it('keeps healthy geometry transparent with grey outlines and white totals', () => {
    for (const value of [0, null, undefined, NaN, -1]) {
      expect(raceDamageColor(value)).toBe('rgba(255,255,255,0)')
      expect(raceDamageColor(value, 150, false, true)).toBe('#808080')
      expect(raceDamageColor(value, 150, true)).toBe('#ffffff')
    }
  })
  it('uses continuous reference thirds on raw body points and suspension percentages', () => {
    expect(raceDamageColor(24.75)).toBe('rgba(255,127,0,0.5882352941176471)')
    expect(raceDamageColor(49.5)).toBe('rgba(255,0,0,0.7843137254901961)')
    expect(raceDamageColor(99)).toBe('rgba(255,0,0,1)')
    expect(raceDamageColor(150, 150, false, true)).toBe('rgba(102,0,0,0.7843137254901961)')
    expect(raceDamageColor(33, 100)).toBe(raceDamageColor(49.5))
    expect(raceDamageColor(150, 150, true)).toBe('rgba(255,128,0,1)')
    expect(raceDamageColor(999)).toBe(raceDamageColor(150))
  })
  it('truncates reference TimeSpan fractions without rolling 59.999 into 60', () => {
    expect(raceDamageZoneTime(59999)).toBe('0:59.99')
    expect(raceDamageZoneTime(6789, 1)).toBe('0:06.7')
    expect(raceDamageZoneTime(60000)).toBe('1:00.00')
    expect(raceDamageZoneTime(null)).toBe('--:--.--')
  })
})
