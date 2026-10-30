import { describe, it, expect } from 'vitest'
import { raceSlip, raceSlipFill, raceNumber, raceDamageTime, racePressureFlash, raceTyreValueOrder, raceAxleBrake } from '~/utils/raceTyrePresentation'
import { tyreTemperatureOverheated } from '~/utils/tyreTemperaturePresentation'

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
  it('PIP-671: front wheels read pressure, AVG, loss from the top; rear wheels the reverse', () => {
    expect(raceTyreValueOrder(false)).toEqual(['primary', 'average', 'loss'])
    expect(raceTyreValueOrder(true)).toEqual(['loss', 'average', 'primary'])
  })
  it('PIP-671: the slip bar fill is the raceSlip height as a share of the bar, same colours', () => {
    expect(raceSlipFill(0.05)).toEqual({ ratio: 0, color: raceSlip(0.05).color })
    expect(raceSlipFill(1)).toEqual({ ratio: 0.5, color: '#6dff38' })
    expect(raceSlipFill(5).ratio).toBe(1)
    expect(raceSlipFill(null).ratio).toBe(0)
  })
  it('PIP-671: one brake reading per axle, the hotter temperature and the lower pad life', () => {
    expect(raceAxleBrake([{ brakeTempC: 568, padLifePct: 92 }, { brakeTempC: 558, padLifePct: 91 }]))
      .toEqual({ brakeTempC: 568, padLifePct: 91 })
    expect(raceAxleBrake([{ brakeTempC: null, padLifePct: 88 }, { brakeTempC: 540, padLifePct: undefined }]))
      .toEqual({ brakeTempC: 540, padLifePct: 88 })
    expect(raceAxleBrake([{ brakeTempC: NaN, padLifePct: null }, {}])).toEqual({ brakeTempC: null, padLifePct: null })
    expect(raceAxleBrake([])).toEqual({ brakeTempC: null, padLifePct: null })
    expect(raceNumber(raceAxleBrake([{ brakeTempC: null }, { brakeTempC: null }]).brakeTempC)).toBe('--')
  })
  it('PIP-671: an overheated tyre is the top band of the ACC Drive scale (DRY 100, WET 86)', () => {
    expect(tyreTemperatureOverheated(99.9)).toBe(false)
    expect(tyreTemperatureOverheated(100)).toBe(true)
    expect(tyreTemperatureOverheated(85, 'WET')).toBe(false)
    expect(tyreTemperatureOverheated(86, 'WET')).toBe(true)
    expect(tyreTemperatureOverheated(null)).toBe(false)
    expect(tyreTemperatureOverheated(NaN)).toBe(false)
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
