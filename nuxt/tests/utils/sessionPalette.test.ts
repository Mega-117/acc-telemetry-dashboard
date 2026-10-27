// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { sessionColor, sessionColorAlpha, withAlpha } from '~/utils/sessionPalette'

describe('session palette (PIP-654)', () => {
  afterEach(() => { document.documentElement.removeAttribute('style') })

  it('reads the colours from the CSS tokens, the single source', () => {
    document.documentElement.style.setProperty('--racing-practice', '#0076ff')
    document.documentElement.style.setProperty('--racing-qualify', '#ffc400')
    document.documentElement.style.setProperty('--racing-race', '#ff0024')
    expect(sessionColor('practice')).toBe('#0076ff')
    expect(sessionColor('qualify')).toBe('#ffc400')
    expect(sessionColor('race')).toBe('#ff0024')
    expect(sessionColorAlpha('qualify', 0.2)).toBe('rgba(255, 196, 0, 0.2)')
  })

  it('degrades to a neutral grey when a token is missing', () => {
    expect(sessionColor('race')).toBe('#888888')
  })

  it('adds transparency to short and long hex, leaves other formats alone', () => {
    expect(withAlpha('#f00', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
    expect(withAlpha('#0076ff', 2)).toBe('rgba(0, 118, 255, 1)')
    expect(withAlpha('rgb(1, 2, 3)', 0.5)).toBe('rgb(1, 2, 3)')
  })
})
