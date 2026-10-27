// PIP-654: the session colours for code that needs a colour string (charts). The values live in one place only,
// the CSS tokens of assets/scss/_racing-theme.scss: change a shade there and charts follow.
export type SessionColorKey = 'practice' | 'qualify' | 'race'

// Practice also stands for AVG (average pace), as on the track page.
const TOKENS: Record<SessionColorKey, string> = {
  practice: '--racing-practice',
  qualify: '--racing-qualify',
  race: '--racing-race',
}
// Without a document (tests, server) a neutral grey: visible, but clearly not a session colour.
const MISSING = '#888888'

export function sessionColor(key: SessionColorKey, root?: Element | null): string {
  const el = root ?? (typeof document === 'undefined' ? null : document.documentElement)
  if (!el || typeof getComputedStyle === 'undefined') return MISSING
  return getComputedStyle(el).getPropertyValue(TOKENS[key]).trim() || MISSING
}

/** The same colour with transparency (alpha 0-1), for fills and soft backgrounds in charts. */
export function sessionColorAlpha(key: SessionColorKey, alpha: number, root?: Element | null): string {
  return withAlpha(sessionColor(key, root), alpha)
}

export function withAlpha(hex: string, alpha: number): string {
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())?.[1]
  if (!digits) return hex
  const h = digits.length === 3 ? digits.split('').map(c => c + c).join('') : digits
  const a = Math.min(1, Math.max(0, alpha))
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`
}
