export const MIN_SECTOR_MS = 10_000
// PIP-556: 4:00 covers the long Nürburgring 24h sectors.
export const MAX_SECTOR_MS = 240_000
export const SECTOR_STEP_MS = 100
export type CustomSectorTimes = number[]
export type CustomSectorReferences = Record<string, CustomSectorTimes>
export interface SectorReferenceContext { track?: unknown, car?: unknown, gameId?: unknown, variant?: unknown, sectorCount?: unknown }

export function sectorReferenceContextKey(context: SectorReferenceContext | null | undefined): string | null {
  const parts = [context?.track, context?.car]
  if (parts.some(value => typeof value !== 'string' || !value.trim() || value.length > 200)) return null
  const game = context?.gameId ?? 'acc', variant = context?.variant ?? null, count = context?.sectorCount ?? 3
  if (typeof game !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(game)
    || variant !== null && (typeof variant !== 'string' || !variant.trim() || variant.length > 200)
    || !Number.isInteger(count) || Number(count) < 1 || Number(count) > 32) return null
  const normalized = (parts as string[]).map(value => value.trim().toLowerCase())
  if (game === 'acc' && variant === null && count === 3) return JSON.stringify(normalized)
  return JSON.stringify([game, typeof variant === 'string' ? variant.trim() : null, ...normalized, count])
}

export function validSectorTimes(value: unknown, count = 3): value is CustomSectorTimes {
  return Number.isInteger(count) && count >= 1 && count <= 32 && Array.isArray(value) && value.length === count && value.every(ms =>
    Number.isInteger(ms) && ms >= MIN_SECTOR_MS && ms <= MAX_SECTOR_MS && ms % SECTOR_STEP_MS === 0)
}

export function resolveCustomSectorTimes(references: CustomSectorReferences | undefined, context: SectorReferenceContext | null | undefined): CustomSectorTimes | null {
  const key = sectorReferenceContextKey(context)
  const value = key ? references?.[key] : null
  return validSectorTimes(value, Number(context?.sectorCount ?? 3)) ? [...value] : null
}

export function parseSectorReferenceTime(value: string): number | null {
  const text = value.trim().replace(',', '.')
  if (!/^\d{1,3}(?:\.\d)?$/.test(text)) return null
  const ms = Math.round(Number(text) * 1000)
  return ms >= MIN_SECTOR_MS && ms <= MAX_SECTOR_MS ? ms : null
}

export function adjustSectorReferenceTime(value: string, step: number): string {
  const previous = parseSectorReferenceTime(value)
  const next = previous === null ? MIN_SECTOR_MS : Math.min(MAX_SECTOR_MS, Math.max(MIN_SECTOR_MS, previous + step * SECTOR_STEP_MS))
  return formatSectorReferenceTime(next)
}

export function formatSectorReferenceTime(ms: number): string {
  return (Math.round(ms / SECTOR_STEP_MS) / 10).toFixed(1).replace('.', ',')
}

export type SectorReferenceField = 'seconds' | 'tenths'

/** Whole seconds and tenths of a sector draft, for independent editing (PIP-556). */
export function splitSectorReferenceTime(value: string): { seconds: number, tenths: number } | null {
  const ms = parseSectorReferenceTime(value)
  return ms === null ? null : { seconds: Math.floor(ms / 1000), tenths: Math.round((ms % 1000) / SECTOR_STEP_MS) }
}

/**
 * PIP-556: one field changes alone. Seconds move by 1 s within the limits;
 * tenths cycle 0..9 without touching the seconds. A missing value starts at
 * the minimum, exactly like a single wheel step.
 */
export function adjustSectorReferenceField(value: string, field: SectorReferenceField, direction: number): string {
  const parts = splitSectorReferenceTime(value)
  if (!parts) return formatSectorReferenceTime(MIN_SECTOR_MS)
  const sign = direction < 0 ? -1 : 1
  const next = field === 'seconds'
    ? { seconds: parts.seconds + sign, tenths: parts.tenths }
    : { seconds: parts.seconds, tenths: (parts.tenths + sign + 10) % 10 }
  const ms = next.seconds * 1000 + next.tenths * SECTOR_STEP_MS
  return formatSectorReferenceTime(Math.min(MAX_SECTOR_MS, Math.max(MIN_SECTOR_MS, ms)))
}

export function formatCustomSectorDelta(ms: number): string {
  // Round the magnitude symmetrically and never print a negative zero.
  const tenths = Math.round(Math.abs(ms) / 100)
  const sign = ms < 0 && tenths > 0 ? '−' : '+'
  return `${sign}${(tenths / 10).toFixed(1)}`
}
