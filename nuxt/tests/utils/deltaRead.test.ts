// 05/11 (user): differences as proportional bands, always there, red or green, with the number always written.
import { describe, expect, it } from 'vitest'
import { deltaBars, deltaLevel } from '~/utils/deltaRead'

describe('deltaRead', () => {
  it('even under 0.05 s, small up to 0.15 s, big from there (sign does not matter)', () => {
    expect([0.004, -0.049, 0.078, -0.137, 0.15, 0.336].map(deltaLevel)).toEqual(['even', 'even', 'small', 'small', 'big', 'big'])
  })
  it('bands against the largest difference; even a tiny one keeps a visible band (Monza: corner 1 dwarfs the rest)', () => {
    expect(deltaBars([0.225, 0.069, 0.014, 0.013, -0.004, -0.155])).toEqual([100, 31, 6, 6, 6, 69])
    expect(deltaBars([0.336, 0.078, -0.137])).toEqual([100, 23, 41])
    expect(deltaBars([])).toEqual([])
    expect(deltaBars([0, 0])).toEqual([0, 0])
  })
})
