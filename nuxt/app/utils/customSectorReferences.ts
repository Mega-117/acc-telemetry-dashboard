export const MIN_SECTOR_MS = 10_000
export const MAX_SECTOR_MS = 70_000
export const SECTOR_STEP_MS = 100
export type CustomSectorTimes = [number, number, number]
export type CustomSectorReferences = Record<string, CustomSectorTimes>

export function sectorReferenceContextKey(context: { track?: unknown, car?: unknown } | null | undefined): string | null {
  const parts = [context?.track, context?.car]
  if (parts.some(value => typeof value !== 'string' || !value.trim() || value.length > 200)) return null
  return JSON.stringify((parts as string[]).map(value => value.trim().toLowerCase()))
}

export function validSectorTimes(value: unknown): value is CustomSectorTimes {
  return Array.isArray(value) && value.length === 3 && value.every(ms =>
    Number.isInteger(ms) && ms >= MIN_SECTOR_MS && ms <= MAX_SECTOR_MS && ms % SECTOR_STEP_MS === 0)
}

export function resolveCustomSectorTimes(references: CustomSectorReferences | undefined, context: { track?: unknown, car?: unknown } | null | undefined): CustomSectorTimes | null {
  const key = sectorReferenceContextKey(context)
  const value = key ? references?.[key] : null
  return validSectorTimes(value) ? [...value] : null
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
