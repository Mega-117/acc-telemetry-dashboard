// Fixed-width glyph slots for live HUD times. 'Racer Display' (Chakra Petch italic)
// ships without the `tnum` feature, so `font-variant-numeric: tabular-nums` is ignored
// and a ticking time jumps ('1' is 0.38em wide, '0' 0.65em). Each glyph gets its own
// slot instead; the em widths below come from the BoldItalic advance widths.

export type FixedWidthGlyphKind = 'digit' | 'separator' | 'sign' | 'space'

export interface FixedWidthGlyph {
  char: string
  kind: FixedWidthGlyphKind
}

// Slot widths in em: digits use the widest digit ('0' = 0.652em), so every digit
// and the '-' placeholder occupy the same box.
export const FIXED_WIDTH_GLYPH_EM: Readonly<Record<FixedWidthGlyphKind, number>> = {
  digit: 0.66,
  separator: 0.25,
  sign: 0.58,
  space: 0.28,
}

function glyphKind(char: string): FixedWidthGlyphKind | null {
  if (/^[0-9]$/.test(char) || char === '-') return 'digit'
  if (char === ':' || char === '.') return 'separator'
  if (char === '+' || char === '−') return 'sign'
  if (char === ' ') return 'space'
  return null
}

/**
 * Splits a time/delta string into fixed-width slots. Returns null when the string
 * holds anything else (e.g. 'wait', 'live'): those render as plain text.
 */
export function splitFixedWidthGlyphs(value: string): FixedWidthGlyph[] | null {
  if (!value) return null
  const glyphs: FixedWidthGlyph[] = []
  for (const char of value) {
    const kind = glyphKind(char)
    if (!kind) return null
    glyphs.push({ char, kind })
  }
  return glyphs
}
