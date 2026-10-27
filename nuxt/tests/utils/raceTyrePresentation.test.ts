import { describe, it, expect } from 'vitest'
import { raceSlip, raceNumber, raceDamageTime, racePressureFlash, raceTyreCorner, raceAxleBrake, raceAxleCenterY, RACE_TYRE_GEOMETRY } from '~/utils/raceTyrePresentation'

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
  it('HUD v2: mirrors left and right, values above front / below rear tyres, brakes toward the centre', () => {
    const G = RACE_TYRE_GEOMETRY
    const [fl, fr, rl, rr] = [0, 1, 2, 3].map(raceTyreCorner)
    // Values are centred on the tyre: above the front ones, below the rear ones (28/10).
    expect(fl!.valuesX).toBeCloseTo(fl!.tyreX + G.tyreWidth / 2)
    expect(Math.max(...fl!.valueLines.map(line => line.y))).toBeLessThan(fl!.top)
    expect(Math.min(...rl!.valueLines.map(line => line.y))).toBeGreaterThan(rl!.top + G.tyreHeight)
    expect(fl!.valueLines.map(line => line.kind)).toEqual(['primary', 'average', 'loss'])
    expect(rl!.valueLines.map(line => line.kind)).toEqual(['loss', 'average', 'primary'])
    // Third round (28/10): slip bar about 9 wide, tyre about 30, still wide and low; brakes taller than half the tyre.
    expect(G.slipWidth).toBe(9)
    expect(G.tyreWidth).toBe(30)
    expect(G.tyreWidth).toBeLessThan(G.tyreHeight)
    expect(G.brakeHeight).toBeGreaterThan(G.tyreHeight / 2)
    // Outside → in on the left: slip bar, tyre, brake, then the axle reading in the middle.
    expect(fl!.slipX).toBeGreaterThanOrEqual(0)
    expect(fl!.slipX + G.slipWidth).toBeLessThan(fl!.tyreX)
    expect(fl!.tyreX + G.tyreWidth).toBeLessThan(fl!.brakeX)
    expect(fl!.brakeX + G.brakeWidth).toBeLessThan(G.centerX)
    // The right side is the exact mirror around the centre line (x = 83).
    expect(G.centerX).toBe(G.width / 2)
    expect(fr!.tyreX + G.tyreWidth).toBeCloseTo(166 - fl!.tyreX)
    expect(fr!.slipX + G.slipWidth).toBeCloseTo(166 - fl!.slipX)
    expect(fr!.brakeX + G.brakeWidth).toBeCloseTo(166 - fl!.brakeX)
    expect(rr!.tyreX).toBe(fr!.tyreX)
    // Front and rear axles do not overlap and leave room for the compound line.
    expect(fl!.top + G.tyreHeight).toBeLessThan(G.midTop)
    expect(G.midTop).toBeLessThan(G.midText)
    expect(G.midText).toBeLessThan(G.midBottom)
    expect(G.midBottom).toBeLessThan(rl!.top)
    expect(G.brakeHeight).toBeLessThan(G.tyreHeight)
    expect(G.brakeWidth).toBeGreaterThan(G.slipWidth)
  })
  it('third round: the viewBox ends with the content, no space kept for hidden sections', () => {
    const G = RACE_TYRE_GEOMETRY
    const lines = [0, 1, 2, 3].flatMap(index => raceTyreCorner(index).valueLines.map(line => line.y))
    // 13-unit pressure on top: its cap height (~10) still sits inside the box with a small margin.
    expect(Math.min(...lines)).toBeGreaterThanOrEqual(13)
    expect(Math.min(...lines) - 13).toBeLessThanOrEqual(6)
    // The lowest baseline (rear pressure) leaves only a small bottom margin.
    expect(G.height - Math.max(...lines)).toBeGreaterThanOrEqual(3)
    expect(G.height - Math.max(...lines)).toBeLessThanOrEqual(6)
    expect(G.width).toBe(166)
    expect(G.height).toBe(195)
    expect('damageTop' in G).toBe(false)
  })
  it('third round: status boxes and axle readings are centred on their axle', () => {
    const G = RACE_TYRE_GEOMETRY
    for (const [rear, index] of [[false, 0], [true, 2]] as const) {
      const corner = raceTyreCorner(index)
      expect(raceAxleCenterY(rear)).toBe(corner.centerY)
      const boxTop = raceAxleCenterY(rear) - G.statusHeight / 2
      expect(boxTop + G.statusHeight / 2).toBe(corner.top + G.tyreHeight / 2)
      expect(boxTop).toBeGreaterThanOrEqual(0)
      expect(boxTop + G.statusHeight).toBeLessThanOrEqual(G.height)
    }
    // Owner detail: the 12-unit temperature is vertically centred on the axle (baseline about
    // half a cap height below it) and the pad wear sits directly underneath, small gap.
    expect(G.axleTempDy).toBeGreaterThanOrEqual(3)
    expect(G.axleTempDy).toBeLessThanOrEqual(5)
    expect(G.axlePadDy - G.axleTempDy).toBeGreaterThanOrEqual(12)
    expect(G.axlePadDy - G.axleTempDy).toBeLessThanOrEqual(15)
    // The pad line stays clear of the middle band (front) and the rear tyre bottom.
    expect(raceAxleCenterY(false) + G.axlePadDy).toBeLessThan(G.midTop)
    expect(raceAxleCenterY(true) + G.axlePadDy).toBeLessThan(G.rearTop + G.tyreHeight)
  })
  it('averages brake temperature and pad wear per axle, counting only the sides that exist', () => {
    expect(raceAxleBrake([{ brakeTempC: 568, padLifePct: 92 }, { brakeTempC: 558, padLifePct: 91 }]))
      .toEqual({ brakeTempC: 563, padLifePct: 91.5 })
    expect(raceAxleBrake([{ brakeTempC: null, padLifePct: 88 }, { brakeTempC: 540, padLifePct: undefined }]))
      .toEqual({ brakeTempC: 540, padLifePct: 88 })
    expect(raceAxleBrake([{ brakeTempC: NaN, padLifePct: null }, {}])).toEqual({ brakeTempC: null, padLifePct: null })
    expect(raceAxleBrake([])).toEqual({ brakeTempC: null, padLifePct: null })
    expect(raceNumber(raceAxleBrake([{ brakeTempC: null }, { brakeTempC: null }]).brakeTempC)).toBe('--')
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
