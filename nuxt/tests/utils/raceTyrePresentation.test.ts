import { describe, it, expect } from 'vitest'
import { raceSlip, racePressureHeight, raceNumber, raceDamageTime, racePressureFlash } from '~/utils/raceTyrePresentation'

describe('Race reference presentation', () => {
  it.each([[0, 0, '#ffffff'], [.099, 0, '#ffffff'], [.1, 2.8, '#ffffff'],
    [1, 28, '#6dff38'], [1.4, 39.2, '#ffeb38'], [1.5, 42, '#ff9838'],
    [1.7, 47.6, '#ff3838'], [3, 56, '#ff3838']] as const)('slip %s', (raw, height, color) => {
    expect(raceSlip(raw).height).toBeCloseTo(height)
    expect(raceSlip(raw).color).toBe(color)
  })
  it('uses raw slip without minimum fill, negative or missing is empty', () => {
    for (const raw of [null, undefined, NaN, -2]) expect(raceSlip(raw).height).toBe(0)
  })
  it('pressure shape grows and shrinks around compound target without clamping to tyre', () => {
    expect(racePressureHeight(26.9, 'DRY')).toBe(56)
    expect(racePressureHeight(30, 'WET')).toBe(56)
    expect(racePressureHeight(25, 'DRY')).toBeLessThan(56)
    expect(racePressureHeight(28, 'DRY')).toBeGreaterThan(56)
    for (const bad of [null, NaN, 0, -1]) expect(racePressureHeight(bad, null)).toBe(56)
  })
  it('formats missing values and repair time instead of inventing a lap time', () => {
    expect(raceNumber(70.5)).toBe('70')
    expect(raceNumber(71.5)).toBe('72')
    expect(raceNumber(71.6)).toBe('72')
    expect(raceNumber(70.5)).toBe('70')
    expect(raceNumber(71.5)).toBe('72')
    expect(raceNumber(71.6)).toBe('72')
    expect(raceNumber(25.54, 1)).toBe('25.5')
    expect(raceNumber(null)).toBe('--')
    expect(raceNumber(NaN)).toBe('--')
    expect(raceDamageTime(65123)).toBe('1:05.123')
    expect(raceDamageTime(0)).toBe('0:00.000')
    expect(raceDamageTime(null)).toBe('--:--.---')
    expect(raceDamageTime(-1)).toBe('--:--.---')
  })
  it('flash is tied to recent producer event and cannot replay an old retained total', () => {
    const tyre = { id: 'FL', racePressure: { eventSeq: 1, eventTs: 10, variationPsi: .1 } } as any
    expect(racePressureFlash(tyre, 10500)?.delay).toBe('-500ms')
    expect(racePressureFlash(tyre, 12000)).toBeNull()
    expect(racePressureFlash(tyre, 9999)).toBeNull()
    expect(racePressureFlash({ id: 'FL' } as any, 10000)).toBeNull()
    expect(racePressureFlash({ ...tyre, racePressure: { ...tyre.racePressure, eventSeq: 0 } }, 10500)).toBeNull()
  })
})
