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

export function adjustInfoTargetTolerance(valueMs: number, direction: number): number {
  const rounded = Math.round(Number(valueMs || 0) / 100) * 100
  return clamp(
    rounded + 100 * directionSign(direction),
    INFO_TARGET_TOLERANCE_MIN_MS,
    INFO_TARGET_TOLERANCE_MAX_MS,
  )
}
