// PIP-615: "Giorno X di 7" della settimana di stabilita' (decisione 2026-10-15). Logica pura.
// Una sola definizione del giorno locale (auto-import Nuxt: niente nomi doppi tra le utils).
import { localDay } from './statsJourney'

export interface StabilityReset { at: string, reason: string, task: string | null, by: string }
export interface StabilityState { schemaVersion: number, startedAt: string, resets: StabilityReset[] }

export const STABILITY_WEEK_DAYS = 7


/** Il giorno d'inizio conta come giorno 1; oltre il settimo la settimana e' completata. */
export function stabilityWeekDay(startedAt: string, nowMs: number): { day: number, complete: boolean } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) return null
  const start = Date.UTC(Number(startedAt.slice(0, 4)), Number(startedAt.slice(5, 7)) - 1, Number(startedAt.slice(8, 10)))
  const today = localDay(nowMs)
  const current = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)))
  const day = Math.floor((current - start) / 86_400_000) + 1
  if (day < 1) return { day: 0, complete: false }
  return { day: Math.min(day, STABILITY_WEEK_DAYS), complete: day > STABILITY_WEEK_DAYS }
}

export function parseStabilityState(value: unknown): StabilityState | null {
  const v = value as Partial<StabilityState> | null
  if (!v || v.schemaVersion !== 1 || typeof v.startedAt !== 'string' || !Array.isArray(v.resets)) return null
  return { schemaVersion: 1, startedAt: v.startedAt, resets: v.resets.filter((r): r is StabilityReset => !!r && typeof r.at === 'string' && typeof r.reason === 'string') }
}
