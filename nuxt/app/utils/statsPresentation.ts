// PIP-633: presentazione delle Statistiche (numeri in testa, ordine per margine, colori per
// distacco). Logica pura sopra i calcoli di activityStats: i dati non cambiano, cambia la lettura.
import { idealLapMs, type CarTime, type ComboStats } from '~/services/telemetry/activityStats'
import { useI18n } from '~/i18n'

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

// ---- Frasi in parole semplici: una per riquadro, per chi non legge le tabelle ----

type Name = (raw: string) => string
const secs = (ms: number) => (Math.abs(ms) / 1000).toFixed(1).replace('.', useI18n().locale.value === 'it' ? ',' : '.')

// Frasi senza articolo davanti ai nomi delle auto ("la Audi" sarebbe sbagliato).
const TIE_MS = 50

export function carInsight(cars: CarTime[], carName: Name): string | null {
  const total = cars.reduce((s, c) => s + c.timeMs, 0)
  const top = cars[0]
  if (!top || !total) return null
  const { t } = useI18n()
  if (cars.length === 1) return t('stats.insight.oneCar', { car: carName(top.car) })
  const tied = cars.filter(c => c.timeMs === top.timeMs)
  if (tied.length > 1) return t('stats.insight.tied', { cars: tied.map(c => carName(c.car)).join(t('stats.insight.and')) })
  return t('stats.insight.topCar', { car: carName(top.car), pct: Math.round((top.timeMs / total) * 100) })
}

export function compareInsight(rows: { track: string, gapMs: number | null, timeA: number, timeB: number }[], nameA: string, nameB: string, trackName: Name): string {
  const shared = rows.filter(r => r.timeA > 0 && r.timeB > 0)
  const { t } = useI18n()
  if (!shared.length) return t('stats.insight.noShared')
  const both = shared.filter((r): r is typeof r & { gapMs: number } => r.gapMs !== null)
  if (!both.length) return t('stats.insight.noBoth')
  const decided = both.filter(r => Math.abs(r.gapMs) >= TIE_MS)
  if (!decided.length) return both.length === 1 ? t('stats.insight.oneSame', { track: trackName(both[0]!.track) }) : t('stats.insight.allSame')
  const biggest = [...decided].sort((a, b) => Math.abs(b.gapMs) - Math.abs(a.gapMs))[0]!
  const winner = biggest.gapMs < 0 ? nameB : nameA
  if (both.length === 1) return t('stats.insight.oneWinner', { track: trackName(biggest.track), winner, s: secs(biggest.gapMs) })
  const fasterB = decided.filter(r => r.gapMs < 0).length
  return t(fasterB === 1 ? 'stats.insight.fasterOne' : 'stats.insight.fasterMany', { car: nameB, count: fasterB, total: both.length, track: trackName(biggest.track), s: secs(biggest.gapMs), winner })
}

export function idealInsight(rows: { track: string, car: string, marginMs: number | null }[], trackName: Name, carName: Name): string | null {
  // Un margine positivo (giro migliore senza settori affidabili) non e' un confronto valido: si ignora.
  const valid = rows.filter((r): r is typeof r & { marginMs: number } => r.marginMs !== null && r.marginMs <= 0)
  const top = valid[0]
  if (!top) return null
  const { t } = useI18n()
  if (-top.marginMs <= 100) return t('stats.insight.idealClose')
  return t('stats.insight.idealGain', { track: trackName(top.track), car: carName(top.car), s: secs(top.marginMs) })
}

/** In quale fascia d'aria fai il tuo miglior tempo piu' spesso (tra le combinazioni con almeno due fasce). */
export function airInsight(combos: { byAir: Partial<Record<string, number>> }[], bands: readonly { id: string, label: string }[]): string | null {
  const wins = new Map<string, number>()
  for (const c of combos) {
    const timed = bands.filter(b => typeof c.byAir[b.id] === 'number')
    if (timed.length < 2) continue
    const bestMs = Math.min(...timed.map(b => c.byAir[b.id] as number))
    const best = timed.filter(b => c.byAir[b.id] === bestMs)
    if (best.length > 1) continue // pari merito tra due fasce: nessuna vince
    wins.set(best[0]!.id, (wins.get(best[0]!.id) ?? 0) + 1)
  }
  const ranked = [...wins.entries()].sort((a, b) => b[1] - a[1])
  const top = ranked[0]
  if (!top) return null
  const { t } = useI18n()
  if (ranked[1] && ranked[1][1] === top[1]) return t('stats.insight.airSpread')
  const words: Record<string, string> = { lt15: t('stats.insight.airBelow'), ge30: t('stats.insight.airAbove') }
  const band = bands.find(b => b.id === top[0])!
  const when = words[band.id] ?? t('stats.insight.airBetween', { range: band.label.replace('–', t('stats.insight.and')) })
  return t(top[1] === 1 ? 'stats.insight.airOne' : 'stats.insight.airMany', { when, count: top[1] })
}

/** Larghezza della barra del distacco, in percentuale del distacco piu' grande della tabella (minimo visibile 4%). */
export function gapBarPct(gapMs: number | null, maxAbsMs: number): number {
  if (gapMs === null || gapMs === 0 || !maxAbsMs) return 0
  return Math.max(4, Math.round((Math.abs(gapMs) / maxAbsMs) * 100))
}
