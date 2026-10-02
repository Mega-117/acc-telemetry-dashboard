export const MIN_SECTOR_MS = 10_000
export const MAX_SECTOR_MS = 70_000
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
  if (!/^\d{1,2}(?:\.\d)?$/.test(text)) return null
  const ms = Math.round(Number(text) * 1000)
  return ms >= MIN_SECTOR_MS && ms <= MAX_SECTOR_MS ? ms : null
}

export function adjustSectorReferenceTime(value: string, step: number): string {
  const previous = parseSectorReferenceTime(value)
  const next = previous === null ? MIN_SECTOR_MS : Math.min(MAX_SECTOR_MS, Math.max(MIN_SECTOR_MS, previous + step * SECTOR_STEP_MS))
  return (next / 1000).toFixed(1).replace('.', ',')
}

export function formatCustomSectorDelta(ms: number): string {
  // Round the magnitude symmetrically and never print a negative zero.
  const tenths = Math.round(Math.abs(ms) / 100)
  const sign = ms < 0 && tenths > 0 ? '−' : '+'
  return `${sign}${(tenths / 10).toFixed(1)}`
}
