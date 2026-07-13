import { describe, expect, it } from 'vitest'
import {
  isSpotterFeatureAllowed,
  isSpotterSessionChange,
  normalizeSpotterSessionModes,
  resolveSpotterSessionMode,
  serializeSpotterSessionModes,
  toggleSpotterSessionMode,
} from '~/services/spotter/spotterSessionPolicy'

describe('spotterSessionPolicy', () => {
  it('maps ACC session types into the three user-facing modes', () => {
    expect([0, 3, 4, 7].map(resolveSpotterSessionMode)).toEqual(['practice', 'practice', 'practice', 'practice'])
    expect([1, 8].map(resolveSpotterSessionMode)).toEqual(['qualify', 'qualify'])
    expect(resolveSpotterSessionMode(2)).toBe('race')
    expect(resolveSpotterSessionMode(-1)).toBeNull()
    expect(resolveSpotterSessionMode(null)).toBeNull()
    expect(resolveSpotterSessionMode(99)).toBeNull()
  })

  it('defaults missing, empty or invalid storage to practice only', () => {
    expect(normalizeSpotterSessionModes(null)).toEqual(['practice'])
    expect(normalizeSpotterSessionModes('')).toEqual(['practice'])
    expect(normalizeSpotterSessionModes('mystery')).toEqual(['practice'])
  })

  it('normalizes and serializes modes in stable UI order', () => {
    expect(normalizeSpotterSessionModes('race,practice,race')).toEqual(['practice', 'race'])
    expect(serializeSpotterSessionModes(['race', 'qualify'])).toBe('qualify,race')
  })

  it('allows multiple modes but never deselects the last one', () => {
    expect(toggleSpotterSessionMode(['practice'], 'practice')).toEqual(['practice'])
    expect(toggleSpotterSessionMode(['practice'], 'qualify')).toEqual(['practice', 'qualify'])
    expect(toggleSpotterSessionMode(['practice', 'qualify'], 'practice')).toEqual(['qualify'])
  })

  it('requires master, a known fresh session and a selected mode', () => {
    expect(isSpotterFeatureAllowed(true, ['practice'], 0)).toBe(true)
    expect(isSpotterFeatureAllowed(true, ['practice'], 1)).toBe(false)
    expect(isSpotterFeatureAllowed(false, ['practice', 'race'], 2)).toBe(false)
    expect(isSpotterFeatureAllowed(true, ['practice', 'race'], null)).toBe(false)
    expect(isSpotterFeatureAllowed(true, ['practice', 'race'], 99)).toBe(false)
  })

  it('treats only a numeric session-type transition as a real session boundary', () => {
    expect(isSpotterSessionChange(0, 1)).toBe(true)
    expect(isSpotterSessionChange(1, 2)).toBe(true)
    expect(isSpotterSessionChange(2, 0)).toBe(true)
    expect(isSpotterSessionChange(0, 0)).toBe(false)
    expect(isSpotterSessionChange(null, 0)).toBe(false)
    expect(isSpotterSessionChange(0, null)).toBe(false)
    expect(isSpotterSessionChange(Number.NaN, 1)).toBe(false)
  })
})
