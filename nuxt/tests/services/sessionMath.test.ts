import { describe, it, expect } from 'vitest'
import { timeToSeconds, secondsToTime } from '~/services/session-detail/sessionMath'

describe('timeToSeconds', () => {
  it('converte "1:30" in 90 secondi', () => {
    expect(timeToSeconds('1:30')).toBe(90)
  })

  it('converte "2:05" in 125 secondi', () => {
    expect(timeToSeconds('2:05')).toBe(125)
  })

  it('converte "0:00" in 0', () => {
    expect(timeToSeconds('0:00')).toBe(0)
  })

  it('restituisce 0 per stringa vuota', () => {
    expect(timeToSeconds('')).toBe(0)
  })

  it('restituisce 0 per undefined', () => {
    expect(timeToSeconds(undefined)).toBe(0)
  })

  it('gestisce secondi con decimali "1:45.500"', () => {
    const result = timeToSeconds('1:45.500')
    expect(result).toBeCloseTo(105.5, 1)
  })
})

describe('secondsToTime', () => {
  it('converte 90 in "1:30.000"', () => {
    expect(secondsToTime(90)).toBe('1:30.000')
  })

  it('converte 0 in "0:00.000"', () => {
    expect(secondsToTime(0)).toBe('0:00.000')
  })

  it('converte 125 in "2:05.000"', () => {
    expect(secondsToTime(125)).toBe('2:05.000')
  })

  it('arrotonda al millisecondo', () => {
    const result = secondsToTime(61.123)
    expect(result).toBe('1:01.123')
  })

  it('timeToSeconds e secondsToTime sono inversi (roundtrip)', () => {
    const original = '1:37.842'
    const asSeconds = timeToSeconds(original)
    const backToTime = secondsToTime(asSeconds)
    expect(backToTime).toBe(original)
  })
})
