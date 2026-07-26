import { describe, expect, it } from 'vitest'
import {
  adjustInfoTargetTime,
  adjustInfoTargetTolerance,
  normalizeInfoTargetTime,
  splitInfoTargetTime,
} from '~/utils/infoTargetPicker'

describe('Info Target rotary picker', () => {
  it('separa minuti, secondi e decimi', () => {
    expect(splitInfoTargetTime(89_700)).toEqual({
      minutes: 1,
      seconds: 29,
      tenths: 7,
    })
  })

  it('regola ogni rullo con carry naturale', () => {
    expect(adjustInfoTargetTime(119_900, 'tenths', 1)).toBe(120_000)
    expect(adjustInfoTargetTime(119_900, 'seconds', 1)).toBe(120_900)
    expect(adjustInfoTargetTime(119_900, 'minutes', -1)).toBe(59_900)
  })

  it('normalizza il target a decimi e rispetta i limiti', () => {
    expect(normalizeInfoTargetTime(90_049)).toBe(90_000)
    expect(normalizeInfoTargetTime(90_051)).toBe(90_100)
    expect(adjustInfoTargetTime(1_000, 'seconds', -1)).toBe(1_000)
    expect(adjustInfoTargetTime(600_000, 'minutes', 1)).toBe(600_000)
  })

  it('regola la tolleranza da 0,1 a 1,0 secondi', () => {
    expect(adjustInfoTargetTolerance(500, 1)).toBe(600)
    expect(adjustInfoTargetTolerance(500, -1)).toBe(400)
    expect(adjustInfoTargetTolerance(100, -1)).toBe(100)
    expect(adjustInfoTargetTolerance(1_000, 1)).toBe(1_000)
  })
})
