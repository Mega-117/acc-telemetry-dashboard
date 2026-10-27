import { describe, it, expect } from 'vitest'
import { raceSlip, raceNumber, raceDamageTime, racePressureFlash, raceTyreCorner, RACE_TYRE_GEOMETRY } from '~/utils/raceTyrePresentation'

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
  it('HUD v2: front corners read pressure, AVG, loss top to bottom; rear corners the reverse', () => {
    const order = (index: number) => [...raceTyreCorner(index).valueLines].sort((a, b) => a.y - b.y).map(line => line.kind)
    expect(order(0)).toEqual(['primary', 'average', 'loss'])
    expect(order(1)).toEqual(['primary', 'average', 'loss'])
    expect(order(2)).toEqual(['loss', 'average', 'primary'])
    expect(order(3)).toEqual(['loss', 'average', 'primary'])
  })
  it('HUD v2: mirrors left and right, values outside, brakes toward the centre, rear below front', () => {
    const G = RACE_TYRE_GEOMETRY
    const [fl, fr, rl, rr] = [0, 1, 2, 3].map(raceTyreCorner)
    // Outside → in on the left: values, slip bar, tyre, brake, brake info.
    expect(fl!.valuesX).toBeLessThan(fl!.slipX)
    expect(fl!.slipX + G.slipWidth).toBeLessThan(fl!.tyreX)
    expect(fl!.tyreX + G.tyreWidth).toBeLessThan(fl!.brakeX)
    expect(fl!.brakeX + G.brakeWidth).toBeLessThan(fl!.brakeInfoX)
    expect(fl!.brakeInfoX).toBeLessThan(83)
    // The right side is the exact mirror around the centre line (x = 83).
    expect(fr!.tyreX + G.tyreWidth).toBeCloseTo(166 - fl!.tyreX)
    expect(fr!.slipX + G.slipWidth).toBeCloseTo(166 - fl!.slipX)
    expect(fr!.brakeX + G.brakeWidth).toBeCloseTo(166 - fl!.brakeX)
    expect(fr!.brakeInfoX).toBeGreaterThan(83)
    // Front and rear axles do not overlap and leave room for the compound line.
    expect(fl!.top + G.tyreHeight).toBeLessThan(G.midTop)
    expect(G.midBottom).toBeLessThan(rl!.top)
    expect(rr!.top + G.tyreHeight).toBeLessThan(G.damageTop)
    expect(G.brakeHeight).toBeLessThan(G.tyreHeight)
    expect(G.brakeWidth).toBeGreaterThan(G.slipWidth)
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
