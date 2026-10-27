import { describe, expect, it } from 'vitest'
import { FIXED_WIDTH_GLYPH_EM, splitFixedWidthGlyphs } from '../../app/utils/fixedWidthGlyphs'

const kinds = (value: string) => splitFixedWidthGlyphs(value)?.map(glyph => glyph.kind).join(',')

describe('splitFixedWidthGlyphs', () => {
  it('gives every digit the same slot and separators their own', () => {
    const glyphs = splitFixedWidthGlyphs('01:41.234')
    expect(glyphs?.map(glyph => glyph.char).join('')).toBe('01:41.234')
    expect(kinds('01:41.234')).toBe('digit,digit,separator,digit,digit,separator,digit,digit,digit')
  })

  it('handles signed deltas with the typographic minus and the plus sign', () => {
    expect(kinds('−0.200')).toBe('sign,digit,separator,digit,digit,digit')
    expect(kinds('+1.285')).toBe('sign,digit,separator,digit,digit,digit')
  })

  it('keeps the dash placeholders as wide as digits and spaces narrow', () => {
    expect(kinds('--:--.---')).toBe('digit,digit,separator,digit,digit,separator,digit,digit,digit')
    expect(kinds('1 2')).toBe('digit,space,digit')
  })

  it('leaves words and empty strings as plain text', () => {
    expect(splitFixedWidthGlyphs('wait')).toBeNull()
    expect(splitFixedWidthGlyphs('live')).toBeNull()
    expect(splitFixedWidthGlyphs('12s')).toBeNull()
    expect(splitFixedWidthGlyphs('')).toBeNull()
  })

  it('sizes digits on the widest Chakra Petch BoldItalic digit (0 = 0.652em)', () => {
    expect(FIXED_WIDTH_GLYPH_EM.digit).toBeGreaterThanOrEqual(0.652)
    expect(FIXED_WIDTH_GLYPH_EM.separator).toBeLessThan(FIXED_WIDTH_GLYPH_EM.digit)
    expect(FIXED_WIDTH_GLYPH_EM.sign).toBeLessThan(FIXED_WIDTH_GLYPH_EM.digit)
  })
})
