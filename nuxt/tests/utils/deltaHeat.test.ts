// 05/11: one loss/gain colour for the Telemetria (sectors, corners, the stint block).
import { describe, expect, it } from 'vitest'
import { deltaHeat } from '~/utils/deltaHeat'

describe('deltaHeat', () => {
  it('grey under a hundredth, red when slower, green when faster, full strength from 0.15 s', () => {
    expect(deltaHeat(0.008)).toBe('rgba(255, 255, 255, 0.06)')
    expect(deltaHeat(-0.009)).toBe('rgba(255, 255, 255, 0.06)')
    expect(deltaHeat(0.635)).toBe('rgba(228, 0, 43, 1.00)')
    expect(deltaHeat(-0.1)).toMatch(/^rgba\(22, 163, 74, 0\.\d\d\)$/)
    expect(deltaHeat(0.01)).toBe('rgba(228, 0, 43, 0.72)')
  })
})
