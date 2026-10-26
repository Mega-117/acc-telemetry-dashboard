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

// ---- Frasi in parole semplici: una per riquadro, per chi non legge le tabelle ----

type Name = (raw: string) => string
const secs = (ms: number) => (Math.abs(ms) / 1000).toFixed(1).replace('.', ',')

// Frasi senza articolo davanti ai nomi delle auto ("la Audi" sarebbe sbagliato).
const TIE_MS = 50

export function carInsight(cars: CarTime[], carName: Name): string | null {
  const total = cars.reduce((s, c) => s + c.timeMs, 0)
  const top = cars[0]
  if (!top || !total) return null
  if (cars.length === 1) return `Una sola auto nel periodo: ${carName(top.car)}.`
  const tied = cars.filter(c => c.timeMs === top.timeMs)
  if (tied.length > 1) return `Tempo diviso in parti uguali tra ${tied.map(c => carName(c.car)).join(' e ')}.`
  return `Auto più usata: ${carName(top.car)}, ${Math.round((top.timeMs / total) * 100)}% del tempo in pista.`
}

export function compareInsight(rows: { track: string, gapMs: number | null, timeA: number, timeB: number }[], nameA: string, nameB: string, trackName: Name): string {
  const shared = rows.filter(r => r.timeA > 0 && r.timeB > 0)
  if (!shared.length) return 'Nessuna pista guidata con entrambe le auto: per confrontarle serve almeno una pista in comune.'
  const both = shared.filter((r): r is typeof r & { gapMs: number } => r.gapMs !== null)
  if (!both.length) return 'Piste in comune ci sono, ma senza un miglior giro valido per entrambe le auto: non si possono ancora confrontare.'
  const decided = both.filter(r => Math.abs(r.gapMs) >= TIE_MS)
  if (!decided.length) return both.length === 1 ? `Unica pista in comune, ${trackName(both[0]!.track)}: tempi praticamente uguali.` : 'Sulle piste in comune i tempi sono praticamente uguali.'
  const biggest = [...decided].sort((a, b) => Math.abs(b.gapMs) - Math.abs(a.gapMs))[0]!
  const winner = biggest.gapMs < 0 ? nameB : nameA
  if (both.length === 1) return `Unica pista in comune, ${trackName(biggest.track)}: più veloce ${winner}, di ${secs(biggest.gapMs)} s.`
  const fasterB = decided.filter(r => r.gapMs < 0).length
  return `${nameB} più veloce su ${fasterB} ${fasterB === 1 ? 'pista' : 'piste'} su ${both.length}. Differenza più grande: ${trackName(biggest.track)}, ${secs(biggest.gapMs)} s a favore di ${winner}.`
}

export function idealInsight(rows: { track: string, car: string, marginMs: number | null }[], trackName: Name, carName: Name): string | null {
  // Un margine positivo (giro migliore senza settori affidabili) non e' un confronto valido: si ignora.
  const valid = rows.filter((r): r is typeof r & { marginMs: number } => r.marginMs !== null && r.marginMs <= 0)
  const top = valid[0]
  if (!top) return null
  if (-top.marginMs <= 100) return 'I tuoi giri migliori sono già vicini al giro ideale: settori costanti.'
  return `Dove puoi guadagnare di più: ${trackName(top.track)} con ${carName(top.car)}, ${secs(top.marginMs)} s mettendo insieme i tuoi settori migliori.`
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
  if (ranked[1] && ranked[1][1] === top[1]) return 'Nessuna temperatura dell\'aria in cui vai nettamente più forte: i tuoi migliori sono distribuiti.'
  const words: Record<string, string> = { lt15: 'sotto i 15°', ge30: 'sopra i 30°' }
  const band = bands.find(b => b.id === top[0])!
  const when = words[band.id] ?? `tra ${band.label.replace('–', ' e ')}`
  return `Vai più forte con aria ${when}: è la tua condizione migliore su ${top[1]} ${top[1] === 1 ? 'combinazione' : 'combinazioni'} pista-auto.`
}

/** Larghezza della barra del distacco, in percentuale del distacco piu' grande della tabella (minimo visibile 4%). */
export function gapBarPct(gapMs: number | null, maxAbsMs: number): number {
  if (gapMs === null || gapMs === 0 || !maxAbsMs) return 0
  return Math.max(4, Math.round((Math.abs(gapMs) / maxAbsMs) * 100))
}
