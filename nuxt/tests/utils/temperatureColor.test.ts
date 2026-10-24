import { describe, expect, it } from 'vitest'
import { brakeBands, brakeColor, pressureColor, tyreColor } from '~/utils/temperatureColor'
import { tyreTemperatureColor } from '~/utils/tyreTemperaturePresentation'

describe('Dati panel colours (PIP-613)', () => {
  it('tyres use the one ACC Drive scale of the app', () => {
    for (const t of [40, 60, 80, 99, 120, 130]) expect(tyreColor(t)).toBe(tyreTemperatureColor(t, 'DRY'))
    expect(tyreColor(85, true)).toBe(tyreTemperatureColor(85, 'WET'))
    expect(tyreColor(120)).toBe('rgb(255, 0, 0)')
    expect(tyreColor(null)).toBeNull()
  })

  it('brakes use the same scale on per axle and pad limits', () => {
    expect(brakeColor(60, 'front', 'standard')).toBe('rgb(0, 0, 200)') // under the scale
    expect(brakeColor(490, 'front', 'standard')).toBe('rgb(0, 200, 0)') // end of green
    expect(brakeColor(900, 'rear', 'wet')).toBe('rgb(255, 0, 0)') // over the scale
    // 540 °C: yellow band on a front standard pad, orange band already on an endurance one.
    expect(brakeColor(540, 'front', 'standard')).not.toBe(brakeColor(540, 'front', 'endurance'))
    expect(brakeBands('front', 'qualy')).toEqual(brakeBands('front', 'standard'))
    expect(brakeBands('rear', 'standard')[0]).toEqual([61, 140])
    expect(brakeColor(undefined, 'front', 'standard')).toBeNull()
  })

  it('colours hot pressures against the Correggi pressioni window', () => {
    expect(pressureColor(27.1)).toBe('rgb(0, 200, 0)')
    expect(pressureColor(26.8)).toBe('rgb(0, 200, 0)') // within 0.3 psi
    expect(pressureColor(26.5)).toBe('rgb(230, 230, 0)') // within 0.8 psi
    expect(pressureColor(25.9)).toBe('rgb(0, 170, 220)') // too low
    expect(pressureColor(28.3)).toBe('rgb(255, 60, 40)') // too high
    expect(pressureColor(30.6, true)).toBe('rgb(0, 200, 0)')
    expect(pressureColor(null)).toBeNull()
  })
})
