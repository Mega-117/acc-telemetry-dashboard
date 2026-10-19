// PIP-556: the rules of the shared Control K number field, kept pure for tests.

export interface NumberFieldLimits {
  min: number
  max: number
  /** Digits accepted while typing. */
  digits: number
  /** true: past the end starts again (seconds 59 -> 00); false: stops at the limit. */
  wrap: boolean
}

export function clampNumberField(value: number, limits: NumberFieldLimits): number {
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)))
}

/** One wheel/arrow step; an empty field starts from the minimum. */
export function stepNumberField(value: number | null, direction: 1 | -1, limits: NumberFieldLimits): number {
  if (value === null || !Number.isFinite(value)) return limits.min
  const next = value + direction
  if (!limits.wrap) return clampNumberField(next, limits)
  const range = limits.max - limits.min + 1
  return ((next - limits.min) % range + range) % range + limits.min
}

/**
 * Typing: digits append until the field is full, then a new digit starts a new
 * number. The shown value is always inside the limits ("7" "5" in seconds -> 59).
 */
export function typeNumberField(typed: string, digit: string, limits: NumberFieldLimits): { typed: string, value: number } {
  const next = typed.length >= limits.digits ? digit : typed + digit
  return { typed: next, value: clampNumberField(Number(next), limits) }
}
