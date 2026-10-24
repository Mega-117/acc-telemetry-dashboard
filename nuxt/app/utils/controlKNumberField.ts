// PIP-556 / PIP-611: the rules of the shared Control K number field, kept pure for tests.
// One value is one field, also when it is made of parts (1:30,5 = minutes, seconds,
// tenths). The value is a whole number of the smallest part (tenths, seconds...).
//
// - Keyboard: digits enter from the right, as on a microwave (1 3 0 5 -> 1:30,5);
//   the separators are ours, the driver only types numbers.
// - Wheel: OK engages the field on its most used part; Up/Down change that part,
//   OK moves to the next part, after the last one (or Back) the field is released.
// - Mouse: the scroll wheel changes the part under the pointer.

export interface NumberFieldPart {
  label: string
  min: number
  max: number
  /** true: past the end starts again (seconds 59 -> 00); false: stops at the limit. */
  wrap: boolean
  /** Digits typed for this part. */
  digits: number
  /** Value of one step of this part, in the field unit (minutes of a lap in tenths = 600). */
  unit: number
  /** Zero padding when shown; default 1 for the first part, `digits` for the others. */
  pad?: number
  /** Shown before this part (':' or ','). */
  separator?: string
}

export interface NumberFieldSpec {
  parts: NumberFieldPart[]
  /** Limits of the whole value, in the field unit. */
  min: number
  max: number
  /** Part engaged first by OK (the one a driver changes most often). */
  start?: number
  /** Custom display for single-part fields, e.g. tenths shown as "0,5". */
  format?: (value: number) => string
}

export const clampField = (value: number, spec: NumberFieldSpec) => Math.min(spec.max, Math.max(spec.min, Math.round(value)))

/** The value split in its parts, from the largest. */
export function splitField(value: number, spec: NumberFieldSpec): number[] {
  return spec.parts.map((part, index) => {
    const whole = Math.floor(value / part.unit)
    return index === 0 ? whole : whole % (spec.parts[index - 1]!.unit / part.unit)
  })
}

/** Parts back to one value: carries naturally, 1 min 75 s = 2:15. */
export const joinField = (parts: number[], spec: NumberFieldSpec) =>
  parts.reduce((sum, value, index) => sum + value * spec.parts[index]!.unit, 0)

export function formatFieldParts(parts: number[], spec: NumberFieldSpec): string {
  if (spec.format && spec.parts.length === 1) return spec.format(parts[0]!)
  return spec.parts.map((part, index) => (part.separator ?? '')
    + String(parts[index] ?? 0).padStart(part.pad ?? (index === 0 ? 1 : part.digits), '0')).join('')
}

export const formatField = (value: number | null, spec: NumberFieldSpec) =>
  value === null || !Number.isFinite(value) ? '—' : formatFieldParts(splitField(value, spec), spec)

/** One wheel/arrow step of one part, without carrying into the others; an empty field starts from the minimum. */
export function stepField(value: number | null, partIndex: number, direction: 1 | -1, spec: NumberFieldSpec): number {
  if (value === null || !Number.isFinite(value)) return spec.min
  const parts = splitField(value, spec)
  const part = spec.parts[partIndex]!
  const next = parts[partIndex]! + direction
  const range = part.max - part.min + 1
  parts[partIndex] = part.wrap ? ((next - part.min) % range + range) % range + part.min : Math.min(part.max, Math.max(part.min, next))
  return clampField(joinField(parts, spec), spec)
}

const totalDigits = (spec: NumberFieldSpec) => spec.parts.reduce((sum, part) => sum + part.digits, 0)

/** Typed digits enter from the right; when the field is full the oldest digit leaves. */
export const typeFieldDigit = (typed: string, digit: string, spec: NumberFieldSpec) => (typed + digit).slice(-totalDigits(spec))

/** The typed digits as parts, as written (75 seconds stay 75 until the value is read). */
export function typedFieldParts(typed: string, spec: NumberFieldSpec): number[] {
  let digits = typed.padStart(totalDigits(spec), '0')
  return spec.parts.map(part => { const value = Number(digits.slice(0, part.digits)); digits = digits.slice(part.digits); return value })
}

/** The value of the typed digits, carried and kept inside the limits. */
export const typedFieldValue = (typed: string, spec: NumberFieldSpec) => clampField(joinField(typedFieldParts(typed, spec), spec), spec)

/** What the field shows while typing: the digits as written, with our separators. */
export const typedFieldText = (typed: string, spec: NumberFieldSpec) => formatFieldParts(typedFieldParts(typed, spec), spec)

/**
 * Wheel commands for an engaged field. `part` is the engaged part (null = not engaged).
 * Returns handled=false when the command is not for the field.
 */
export function fieldWheelCommand(part: number | null, value: number | null, command: string | undefined, spec: NumberFieldSpec):
  { handled: boolean, part: number | null, value: number | null } {
  if (part === null) return { handled: false, part, value }
  if (command === 'back' || command === 'primary') return { handled: true, part: null, value }
  if (command === 'activate-action') {
    // From the first engaged part through the others once (lap: SEC, DEC, MIN), then release.
    const order = spec.parts.map((_, index) => (fieldStartPart(spec) + index) % spec.parts.length)
    return { handled: true, part: order[order.indexOf(part) + 1] ?? null, value }
  }
  if (command === 'next-action' || command === 'previous-action') {
    return { handled: true, part, value: stepField(value, part, command === 'next-action' ? 1 : -1, spec) }
  }
  return { handled: false, part, value }
}

export const fieldStartPart = (spec: NumberFieldSpec) => spec.start ?? 0

/** Single-number fields (stint minutes, tolerance in tenths). */
export function singleField(min: number, max: number, digits: number, format?: (value: number) => string, label = ''): NumberFieldSpec {
  return { parts: [{ label, min, max, wrap: false, digits, unit: 1 }], min, max, format }
}
