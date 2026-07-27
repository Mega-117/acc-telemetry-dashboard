import { describe, expect, it } from 'vitest'
import { tyreTemperatureColor } from '../../app/utils/tyreTemperaturePresentation'

describe('tyre temperature presentation', () => {
  it('matches the verified ACC Drive dry thresholds', () => {
    expect(tyreTemperatureColor(50)).toBe('rgb(0, 0, 200)')
    expect(tyreTemperatureColor(51)).toBe('rgb(0, 0, 200)')
    expect(tyreTemperatureColor(65)).toBe('rgb(0, 200, 200)')
    expect(tyreTemperatureColor(66)).toBe('rgb(0, 200, 200)')
    expect(tyreTemperatureColor(85)).toBe('rgb(0, 200, 0)')
    expect(tyreTemperatureColor(86)).toBe('rgb(0, 255, 0)')
    expect(tyreTemperatureColor(99)).toBe('rgb(255, 255, 0)')
    expect(tyreTemperatureColor(100)).toBe('rgb(255, 255, 0)')
    expect(tyreTemperatureColor(120)).toBe('rgb(255, 0, 0)')
    expect(tyreTemperatureColor(121)).toBe('rgb(255, 0, 0)')
  })

  it('matches the verified ACC Drive wet thresholds', () => {
    expect(tyreTemperatureColor(14, 'WET')).toBe('rgb(0, 0, 200)')
    expect(tyreTemperatureColor(24, 'WET')).toBe('rgb(0, 200, 200)')
    expect(tyreTemperatureColor(65, 'WET')).toBe('rgb(0, 200, 0)')
    expect(tyreTemperatureColor(85, 'WET')).toBe('rgb(255, 255, 0)')
    expect(tyreTemperatureColor(100, 'WET')).toBe('rgb(255, 0, 0)')
  })

  it('uses a neutral fallback when temperature is missing', () => {
    expect(tyreTemperatureColor(null)).toBe('#6b7280')
  })
})
