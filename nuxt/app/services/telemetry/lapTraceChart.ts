/**
 * @description Modello grafici per la pagina "Io vs Riferimento" (PIP-258).
 * Logica pura: normalizza un LapTrace (schema acc.laptrace.v1 dal logger) e
 * costruisce le polyline SVG dei canali sulla distanza — stessa resa del
 * viewer offline (PIP-251), nessun calcolo di confronto qui (quello arriva
 * gia' fatto dal motore coach in coach_state.last_lap_corners).
 */

export const LAP_TRACE_SCHEMA = 'acc.laptrace.v1'

export interface LapTraceView {
  track: string
  car: string
  lapTimeS: number
  source: string
  complete: boolean
  valid: boolean
  fuelL: number | null
  gridStepM: number
  lengthM: number
  channels: Record<string, number[]>
}

const CORE_CHANNELS = ['time_s', 'speed_kmh', 'brake_pct', 'throttle_pct']

export function normalizeLapTrace(raw: unknown): LapTraceView | null {
  const data = raw as Record<string, any> | null
  if (!data || typeof data !== 'object' || data.schema !== LAP_TRACE_SCHEMA) return null
  const meta = data.meta
  const channels = data.channels
  const gridStep = Number(data.grid_step_m)
  if (!meta || !channels || !Number.isFinite(gridStep) || gridStep <= 0) return null
  const out: Record<string, number[]> = {}
  let length: number | null = null
  for (const name of Object.keys(channels)) {
    const values = channels[name]
    if (!Array.isArray(values) || values.length < 2) return null
    if (length === null) length = values.length
    if (values.length !== length) return null
    out[name] = values as number[]
  }
  for (const required of CORE_CHANNELS) {
    if (!out[required]) return null
  }
  return {
    track: String(meta.track ?? ''),
    car: String(meta.car ?? ''),
    lapTimeS: Number(meta.lap_time_s) || 0,
    source: String(meta.source ?? ''),
    complete: meta.complete === true,
    valid: meta.valid !== false,
    fuelL: Number.isFinite(Number(meta.fuel_l)) ? Number(meta.fuel_l) : null,
    gridStepM: gridStep,
    lengthM: (length! - 1) * gridStep,
    channels: out,
  }
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
  for (let i = 0; i < values.length; i += decimate) {
    const x = box.padding + (i / lastIndex) * innerW
    const y = box.height - box.padding - ((values[i]! - yMin) / span) * innerH
    parts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
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
