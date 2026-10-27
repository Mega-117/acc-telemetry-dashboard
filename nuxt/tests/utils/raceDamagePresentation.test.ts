import { describe, expect, it } from 'vitest'
import { raceDamageColor, raceDamageSummary, raceDamageZoneTime } from '../../app/utils/raceDamagePresentation'

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

describe('HUD v2 damage summary under the Race tyres', () => {
  const zone = (percentage: number, repairTimeMs: number) => ({ percentage, repairTimeMs })
  const healthy = () => ({
    version: 1, eventSeq: 0, eventTs: null,
    body: { front: zone(0, 0), rear: zone(0, 0), left: zone(0, 0), right: zone(0, 0), repairTimeMs: 0 },
    suspension: { FL: { percentage: 0 }, FR: { percentage: 0 }, RL: { percentage: 0 }, RR: { percentage: 0 }, repairTimeMs: 0 },
    totalRepairTimeMs: 0,
  })

  it('is hidden without damage data or with a healthy car', () => {
    expect(raceDamageSummary(null)).toBeNull()
    expect(raceDamageSummary(undefined)).toBeNull()
    expect(raceDamageSummary(healthy())).toBeNull()
    expect(raceDamageSummary({ ...healthy(), totalRepairTimeMs: null })).toBeNull()
  })

  it('appears with any repair time or damaged zone and keeps the three canonical times', () => {
    const damaged = { ...healthy(), totalRepairTimeMs: 12_400 }
    damaged.body.repairTimeMs = 8_100
    damaged.suspension.repairTimeMs = 4_300
    expect(raceDamageSummary(damaged)).toEqual({ bodyMs: 8_100, suspensionMs: 4_300, totalMs: 12_400 })
    const bent = healthy()
    bent.suspension.RL.percentage = 7
    expect(raceDamageSummary(bent)).toEqual({ bodyMs: 0, suspensionMs: 0, totalMs: 0 })
    const scratched = healthy()
    scratched.body.left.percentage = 3
    expect(raceDamageSummary(scratched)).not.toBeNull()
  })
})
