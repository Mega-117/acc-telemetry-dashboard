export type InfoTargetTimeUnit = 'minutes' | 'seconds' | 'tenths'

export const INFO_TARGET_MIN_MS = 1_000
export const INFO_TARGET_MAX_MS = 600_000
export const INFO_TARGET_TOLERANCE_MIN_MS = 100
export const INFO_TARGET_TOLERANCE_MAX_MS = 1_000

const UNIT_STEP_MS: Record<InfoTargetTimeUnit, number> = {
  minutes: 60_000,
  seconds: 1_000,
  tenths: 100,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function directionSign(direction: number): number {
  return direction < 0 ? -1 : 1
}

export function normalizeInfoTargetTime(valueMs: number): number {
  const rounded = Math.round(Number(valueMs || 0) / 100) * 100
  return clamp(rounded, INFO_TARGET_MIN_MS, INFO_TARGET_MAX_MS)
}

export function adjustInfoTargetTime(
  valueMs: number,
  unit: InfoTargetTimeUnit,
  direction: number,
): number {
  return normalizeInfoTargetTime(valueMs + UNIT_STEP_MS[unit] * directionSign(direction))
}

export function splitInfoTargetTime(valueMs: number): {
  minutes: number
  seconds: number
  tenths: number
} {
  const normalized = normalizeInfoTargetTime(valueMs)
  return {
    minutes: Math.floor(normalized / 60_000),
    seconds: Math.floor((normalized % 60_000) / 1_000),
    tenths: Math.floor((normalized % 1_000) / 100),
  }
}

/**
 * PIP-556: independent MIN | SEC | DEC fields. Seconds cycle 0..59 and tenths
 * 0..9 without carrying into the next field; minutes stop at the limits.
 */
export function adjustInfoTargetField(
  valueMs: number,
  unit: InfoTargetTimeUnit,
  direction: number,
): number {
  const parts = splitInfoTargetTime(valueMs)
  const sign = directionSign(direction)
  const maxMinutes = Math.floor(INFO_TARGET_MAX_MS / 60_000) - 1
  if (unit === 'minutes') parts.minutes = clamp(parts.minutes + sign, 0, maxMinutes)
  if (unit === 'seconds') parts.seconds = (parts.seconds + sign + 60) % 60
  if (unit === 'tenths') parts.tenths = (parts.tenths + sign + 10) % 10
  return normalizeInfoTargetTime(parts.minutes * 60_000 + parts.seconds * 1_000 + parts.tenths * 100)
}

export function adjustInfoTargetTolerance(valueMs: number, direction: number): number {
  const rounded = Math.round(Number(valueMs || 0) / 100) * 100
  return clamp(
    rounded + 100 * directionSign(direction),
    INFO_TARGET_TOLERANCE_MIN_MS,
    INFO_TARGET_TOLERANCE_MAX_MS,
  )
}
