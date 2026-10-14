import { describe, expect, it } from 'vitest'
import {
  isSpotterFeatureAllowed,
  isSpotterSessionChange,
  normalizeSpotterSessionModes,
  resolveSpotterSessionMode,
  serializeSpotterSessionModes,
  toggleCurrentSessionMode,
  toggleSpotterSessionMode,
  voiceSessionType,
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

  it('PIP-533: allows multiple modes and deselecting the last one (= off everywhere)', () => {
    expect(toggleSpotterSessionMode(['practice'], 'practice')).toEqual([])
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

describe('PIP-533 per-session voice alerts', () => {
  it('stores an explicit empty choice as "none" and reads it back as off everywhere', () => {
    expect(serializeSpotterSessionModes([])).toBe('none')
    expect(normalizeSpotterSessionModes('none')).toEqual([])
    expect(normalizeSpotterSessionModes(null)).toEqual(['practice'])
    expect(isSpotterFeatureAllowed(true, 'none', 2)).toBe(false)
  })
  it('a Ctrl+K click adds or removes only the session being driven', () => {
    expect(toggleCurrentSessionMode(['practice'], 1, false)).toEqual({ modes: ['practice', 'qualify'], on: true })
    expect(toggleCurrentSessionMode(['practice', 'qualify'], 1, true)).toEqual({ modes: ['practice'], on: false })
    expect(toggleCurrentSessionMode(['race'], 2, true)).toEqual({ modes: [], on: false })
    expect(toggleCurrentSessionMode(['race'], 'race', false)).toEqual({ modes: ['race'], on: true })
    expect(toggleCurrentSessionMode(['race'], null, false)).toBeNull()
  })
  it('follows ACC numbers and other simulators by session kind', () => {
    expect(voiceSessionType({ sessionType: 1, commonLive: { gameId: 'acc', sessionKind: 'race' } })).toBe(1)
    expect(voiceSessionType({ sessionType: 1, commonLive: { gameId: 'evo', sessionKind: 'race' } })).toBe('race')
    expect(voiceSessionType({ sessionType: 2, commonLive: null })).toBe(2)
  })
})
