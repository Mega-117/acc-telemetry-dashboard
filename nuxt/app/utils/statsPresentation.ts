// PIP-633: presentazione delle Statistiche (numeri in testa, ordine per margine, colori per
// distacco). Logica pura sopra i calcoli di activityStats: i dati non cambiano, cambia la lettura.
import { idealLapMs, type CarTime, type ComboStats } from '~/services/telemetry/activityStats'

export interface StatsTotals { timeMs: number, sessions: number, laps: number, lapsValid: number, validPct: number | null }

export function statsTotals(cars: CarTime[]): StatsTotals {
  const t = cars.reduce((acc, c) => ({ timeMs: acc.timeMs + c.timeMs, sessions: acc.sessions + c.sessions, laps: acc.laps + c.laps, lapsValid: acc.lapsValid + c.lapsValid }),
    { timeMs: 0, sessions: 0, laps: 0, lapsValid: 0 })
  return { ...t, validPct: t.laps ? Math.round((t.lapsValid / t.laps) * 100) : null }
}

export type IdealRow<T extends ComboStats> = T & { idealMs: number | null, marginMs: number | null }

/** Giro ideale meno migliore (negativo = tempo da guadagnare): prima dove c'e' piu' margine, poi i casi senza dato. */
export function byIdealMargin<T extends ComboStats>(combos: T[]): IdealRow<T>[] {
  return combos
    .map((c) => {
      const idealMs = idealLapMs(c.bestSectorsMs)
      return { ...c, idealMs, marginMs: idealMs !== null && c.bestLapMs !== null ? idealMs - c.bestLapMs : null }
    })
    .sort((a, b) => (a.marginMs ?? Infinity) - (b.marginMs ?? Infinity))
}

/** Margine colorato: 'big' oltre mezzo secondo, 'mid' oltre un decimo, altrimenti 'small'. */
export function marginLevel(marginMs: number | null): 'big' | 'mid' | 'small' | null {
  if (marginMs === null) return null
  const gain = -marginMs
  return gain > 500 ? 'big' : gain > 100 ? 'mid' : 'small'
}

/**
 * Distacco dal migliore della riga, in fasce: 0 = il migliore, 1 entro 0,3 s, 2 entro 1 s,
 * 3 entro 2 s, 4 oltre. Senza tempo: null (cella vuota).
 */
export function heatLevel(valueMs: number | null | undefined, rowBestMs: number | null): 0 | 1 | 2 | 3 | 4 | null {
  if (valueMs === null || valueMs === undefined || rowBestMs === null) return null
  const d = valueMs - rowBestMs
  return d <= 0 ? 0 : d <= 300 ? 1 : d <= 1000 ? 2 : d <= 2000 ? 3 : 4
}

export function rowBest(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && v > 0)
  return valid.length ? Math.min(...valid) : null
}

/** Larghezza della barra del distacco, in percentuale del distacco piu' grande della tabella (minimo visibile 4%). */
export function gapBarPct(gapMs: number | null, maxAbsMs: number): number {
  if (gapMs === null || !maxAbsMs) return 0
  return Math.max(4, Math.round((Math.abs(gapMs) / maxAbsMs) * 100))
}
