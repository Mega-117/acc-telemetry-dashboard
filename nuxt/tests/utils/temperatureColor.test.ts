import { describe, expect, it } from 'vitest'
import { TYRE_BANDS, brakeBands, temperatureColor } from '~/utils/temperatureColor'

describe('temperature colour (PIP-613, ACC Drive scale)', () => {
  it('runs blue -> light blue -> green -> yellow -> orange -> red on dry tyres', () => {
    const dry = TYRE_BANDS.dry
    expect(temperatureColor(40, dry)).toBe('rgb(0, 0, 200)') // under the scale
    expect(temperatureColor(51, dry)).toBe('rgb(0, 0, 200)') // light blue band start
    expect(temperatureColor(65, dry)).toBe('rgb(0, 200, 200)') // light blue band end
    expect(temperatureColor(66, dry)).toBe('rgb(0, 200, 200)') // green band start
    expect(temperatureColor(85, dry)).toBe('rgb(0, 200, 0)') // full green
    expect(temperatureColor(99, dry)).toBe('rgb(200, 255, 0)') // yellow
    expect(temperatureColor(120, dry)).toBe('rgb(255, 55, 0)') // orange end
    expect(temperatureColor(130, dry)).toBe('rgb(255, 0, 0)') // over the scale
  })

  it('moves the bands for wet tyres and per brake axle and pad', () => {
    expect(temperatureColor(85, TYRE_BANDS.wet)).toBe('rgb(200, 255, 0)')
    // 520 °C: yellow on a front standard pad, orange already on a front endurance pad.
    expect(temperatureColor(520, brakeBands('front', 'standard'))).toMatch(/^rgb\(\d+, 255, 0\)$/)
    expect(temperatureColor(540, brakeBands('front', 'endurance'))).toMatch(/^rgb\(255, \d+, 0\)$/)
    // The qualifying pad uses the standard bands; the rear has its own.
    expect(brakeBands('front', 'qualy')).toEqual(brakeBands('front', 'standard'))
    expect(brakeBands('rear', 'standard')[0]).toEqual([61, 140])
  })

  it('has no colour for a missing value', () => {
    expect(temperatureColor(null, TYRE_BANDS.dry)).toBeNull()
    expect(temperatureColor(Number.NaN, TYRE_BANDS.dry)).toBeNull()
  })
})
