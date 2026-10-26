/**
 * @description Modello grafici per la pagina "Io vs Riferimento" (PIP-258).
 * Logica pura: normalizza un LapTrace (schema acc.laptrace.v1 dal logger) e
 * costruisce le polyline SVG dei canali sulla distanza — stessa resa del
 * viewer offline (PIP-251), nessun calcolo di confronto qui (quello arriva
 * gia' fatto dal motore coach in coach_state.last_lap_corners).
 */

import { isGameId } from './gameIdentity'

export const LAP_TRACE_SCHEMA = 'acc.laptrace.v1'
export const COMMON_LAP_TRACE_SCHEMA = 'racercore.laptrace.v1'

export interface LapTraceView {
  gameId: string
  variant: string | null
  sessionId: string | null
  track: string
  car: string
  lapTimeS: number
  source: string
  complete: boolean
  valid: boolean | null
  fuelL: number | null
  /** PIP-619: aria/asfalto dal file della sessione, grip anche dal giro stesso. */
  conditions: LapConditions | null
  gridStepM: number
  lengthM: number
  channels: Record<string, number[]>
}

const CORE_CHANNELS = ['time_s', 'speed_kmh', 'brake_pct', 'throttle_pct']

export interface LapConditions { airC: number | null, roadC: number | null, grip: string | null }

const finiteTemp = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > -40 && value < 80 ? value : null
const gripWord = (value: unknown) => typeof value === 'string' && /^[A-Za-z]{2,16}$/.test(value) ? value : null

/** Condizioni da campi grezzi (giro della sessione o `meta.extra.conditions`); `null` se vuote. */
export function lapConditions(source: { air?: unknown, road?: unknown, grip?: unknown }): LapConditions | null {
  const out = { airC: finiteTemp(source.air), roadC: finiteTemp(source.road), grip: gripWord(source.grip) }
  return out.airC === null && out.roadC === null && out.grip === null ? null : out
}

/** Condizioni del giro, completate con la riga della sessione (`air_temp`, `road_temp`, `track_grip_status`). */
export function mergeLapConditions(own: LapConditions | null, row?: { air_temp?: unknown, road_temp?: unknown, track_grip_status?: unknown }): LapConditions | null {
  const fallback = row ? lapConditions({ air: row.air_temp, road: row.road_temp, grip: row.track_grip_status }) : null
  if (!own && !fallback) return null
  return { airC: own?.airC ?? fallback?.airC ?? null, roadC: own?.roadC ?? fallback?.roadC ?? null, grip: own?.grip ?? fallback?.grip ?? null }
}

/** "15°/18° OPT" (aria/asfalto e grip abbreviato come in Panoramica): corto, la barra resta su una riga. */
export function formatLapConditions(c: LapConditions | null): string {
  if (!c) return ''
  const temps = c.airC !== null || c.roadC !== null
    ? `${c.airC !== null ? Math.round(c.airC) + '°' : '–'}/${c.roadC !== null ? Math.round(c.roadC) + '°' : '–'}` : ''
  return [temps, c.grip ? c.grip.slice(0, 3).toUpperCase() : ''].filter(Boolean).join(' ')
}

export function normalizeLapTrace(raw: unknown): LapTraceView | null {
  const data = raw as Record<string, any> | null
  if (!data || typeof data !== 'object' || ![LAP_TRACE_SCHEMA, COMMON_LAP_TRACE_SCHEMA].includes(data.schema)) return null
  const meta = data.meta
  const channels = data.channels
  const gridStep = Number(data.grid_step_m)
  if (!meta || !channels || !Number.isFinite(gridStep) || gridStep <= 0) return null
  const gameId = data.schema === LAP_TRACE_SCHEMA ? (meta.game_id ?? 'acc') : meta.game_id
  if (!isGameId(gameId) || data.schema === LAP_TRACE_SCHEMA && gameId !== 'acc') return null
  if (meta.track_variant != null && (typeof meta.track_variant !== 'string' || !meta.track_variant.trim())) return null
  if (typeof meta.lap_time_s !== 'number' || !Number.isFinite(meta.lap_time_s) || meta.lap_time_s <= 0) return null
  const out: Record<string, number[]> = {}
  let length: number | null = null
  for (const name of Object.keys(channels)) {
    const values = channels[name]
    if (!Array.isArray(values) || values.length < 2) return null
    if (values.some(value => typeof value !== 'number' || !Number.isFinite(value))) return null
    if (length === null) length = values.length
    if (values.length !== length) return null
    out[name] = values as number[]
  }
  for (const required of data.schema === LAP_TRACE_SCHEMA ? CORE_CHANNELS : ['time_s']) {
    if (!out[required]) return null
  }
  return {
    gameId,
    variant: meta.track_variant ?? null,
    sessionId: typeof meta.extra?.session_token === 'string' ? meta.extra.session_token : null,
    track: String(meta.track ?? ''),
    car: String(meta.car ?? ''),
    lapTimeS: Number(meta.lap_time_s) || 0,
    source: String(meta.source ?? ''),
    complete: meta.complete === true,
    valid: typeof meta.valid === 'boolean' ? meta.valid : null,
    fuelL: typeof meta.fuel_l === 'number' && Number.isFinite(meta.fuel_l) ? meta.fuel_l : null,
    conditions: lapConditions({ air: meta.extra?.conditions?.air_c, road: meta.extra?.conditions?.road_c, grip: meta.extra?.conditions?.grip ?? meta.grip_status }),
    gridStepM: gridStep,
    lengthM: (length! - 1) * gridStep,
    channels: out,
  }
}

export function lapTraceContextMatches(a: Pick<LapTraceView, 'gameId' | 'track' | 'variant' | 'car'>, b: Pick<LapTraceView, 'gameId' | 'track' | 'variant' | 'car'>): boolean {
  return a.gameId === b.gameId && a.variant === b.variant
    && !!a.track.trim() && a.track.trim().toLowerCase() === b.track.trim().toLowerCase()
    && !!a.car.trim() && a.car.trim().toLowerCase() === b.car.trim().toLowerCase()
}

export interface ChartBox {
  width: number
  height: number
  padding: number
}

/** Converte un canale in punti "x,y ..." per una polyline SVG.
 * L'asse X e' la frazione di giro (0..1): giri di lunghezza leggermente
 * diversa restano allineati su partenza e traguardo, come nel viewer. */
export function polylinePoints(
  trace: LapTraceView,
  channel: string,
  box: ChartBox,
  yMin: number,
  yMax: number,
  decimate = 2,
): string {
  const values = trace.channels[channel]
  if (!values) return ''
  const span = Math.max(yMax - yMin, 1e-9)
  const innerW = box.width - 2 * box.padding
  const innerH = box.height - 2 * box.padding
  const lastIndex = Math.max(values.length - 1, 1)
  const parts: string[] = []
  const step = Number.isFinite(decimate) ? Math.max(1, Math.floor(decimate)) : 1
  for (let i = 0; ; i = Math.min(i + step, lastIndex)) {
    const x = box.padding + (i / lastIndex) * innerW
    const y = box.height - box.padding - ((values[i]! - yMin) / span) * innerH
    parts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    // Keep the finish line even when decimation does not land on the last sample.
    if (i === lastIndex) break
  }
  return parts.join(' ')
}

/** Estremi Y comuni a piu' giri per lo stesso canale (con margine 5%). */
export function channelRange(traces: LapTraceView[], channel: string): { yMin: number, yMax: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const trace of traces) {
    for (const value of trace.channels[channel] ?? []) {
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { yMin: 0, yMax: 1 }
  const margin = 0.05 * Math.max(max - min, 1e-9)
  return { yMin: min - margin, yMax: max + margin }
}
