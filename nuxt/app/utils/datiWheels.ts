// PIP-663: the Dati page reads the car wheel by wheel (how is my front left?), not metric by metric.
// Pure builders shared by the recorded lap (Giri) and the live view (In diretta).
import { brakeColor, pressureColor, tyreColor, type BrakePad } from '~/utils/temperatureColor'
import type { LapTelemetry, WheelValues } from '~/types/telemetry'

export type WheelId = 'FL' | 'FR' | 'RL' | 'RR'
export const WHEEL_IDS: readonly WheelId[] = ['FL', 'FR', 'RL', 'RR']
export const WHEEL_NAMES: Record<WheelId, string> = { FL: 'Ant. sinistra', FR: 'Ant. destra', RL: 'Post. sinistra', RR: 'Post. destra' }

export interface WheelMetric { label: string, value: string, color: string | null, detail?: string, hint?: string }
export interface WheelCard { id: WheelId, name: string, metrics: WheelMetric[] }

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export const fixed = (v: number | null | undefined, digits = 1, suffix = '') => finite(v) ? `${v.toFixed(digits)}${suffix}` : '--'
const degrees = (v: number | null | undefined) => finite(v) ? `${Math.round(v)}°` : '--'
// Each reading shows on its own: a missing low or high becomes "--", not a hidden pair.
const range = (low?: number | null, high?: number | null) => finite(low) || finite(high) ? `${finite(low) ? Math.round(low) : '--'}–${finite(high) ? Math.round(high) : '--'}°` : undefined
const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined
const PADS: Record<string, BrakePad> = { standard: 'standard', endurance: 'endurance', wet: 'wet', qualy: 'qualy' }
const padOf = (name?: string | null) => PADS[String(name ?? '').toLowerCase()]
const at = (values: WheelValues | undefined, i: number) => values?.[i] ?? null

/** Four wheel cards for a recorded lap; with no per-lap summary every value is "--". */
export function recordedWheels(tel?: LapTelemetry): WheelCard[] {
  const wet = !!tel?.tyre?.wet
  return WHEEL_IDS.map((id, i) => {
    const axle = i < 2 ? 'front' : 'rear'
    const pad = padOf(axle === 'front' ? tel?.brakes?.front_pad : tel?.brakes?.rear_pad)
    const pressure = at(tel?.pressure?.avg, i), loss = at(tel?.pressure?.loss, i)
    const tyre = at(tel?.tyre_temp?.avg, i), brake = at(tel?.brake_temp?.avg, i)
    return { id, name: WHEEL_NAMES[id], metrics: [
      { label: 'Pressione', value: fixed(pressure, 1, ' psi'), color: pressureColor(pressure, wet),
        detail: join(finite(at(tel?.pressure?.high, i)) && `max ${fixed(at(tel?.pressure?.high, i))}`, finite(loss) && loss > 0 && `calo ${fixed(loss, 2)}`),
        hint: 'Pressione media a caldo nel giro: il colore la confronta con la finestra di Correggi pressioni' },
      { label: 'Gomma', value: degrees(tyre), color: tyreColor(tyre, wet), detail: range(at(tel?.tyre_temp?.low, i), at(tel?.tyre_temp?.high, i)),
        hint: 'Temperatura media della gomma nel giro, sotto la più bassa e la più alta' },
      { label: 'Freno', value: degrees(brake), color: brakeColor(brake, axle, pad), detail: range(at(tel?.brake_temp?.low, i), at(tel?.brake_temp?.high, i)),
        hint: 'Temperatura media del disco nel giro; le fasce dipendono dalle pastiglie montate' },
      { label: 'Usura', value: fixed(at(tel?.brakes?.pad_life, i), 1, '%'), color: null, detail: finite(at(tel?.brakes?.disc_life, i)) ? `disco ${fixed(at(tel?.brakes?.disc_life, i), 1, '%')}` : undefined,
        hint: 'Vita rimasta della pastiglia (e del disco)' },
    ] }
  })
}

export interface LiveWheel {
  pressurePsi?: number | null, pressureLossPsi?: number | null, coreTempC?: number | null, brakeTempC?: number | null
  padLifePct?: number | null, discLifePct?: number | null, pad?: BrakePad
  correction?: { text: string, color?: string | null }
}

/** Four wheel cards for the live car: same reading order as the recorded lap. */
export function liveWheels(wheel: (id: WheelId) => LiveWheel | undefined, wet: boolean): WheelCard[] {
  return WHEEL_IDS.map((id, i) => {
    const w = wheel(id)
    const loss = w?.pressureLossPsi
    return { id, name: WHEEL_NAMES[id], metrics: [
      { label: 'Pressione', value: fixed(w?.pressurePsi, 1, ' psi'), color: pressureColor(w?.pressurePsi, wet),
        detail: finite(loss) && loss > 0 ? `calo ${fixed(loss, 2)}` : undefined, hint: 'Pressione adesso: il colore la confronta con la finestra di Correggi pressioni' },
      { label: 'Correzione', value: w?.correction?.text ?? '--', color: w?.correction?.color ?? null, hint: 'Aria da aggiungere (+) o togliere (−) al prossimo pit stop' },
      { label: 'Gomma', value: degrees(w?.coreTempC), color: tyreColor(w?.coreTempC, wet), hint: 'Temperatura della gomma adesso' },
      { label: 'Freno', value: degrees(w?.brakeTempC), color: brakeColor(w?.brakeTempC, i < 2 ? 'front' : 'rear', w?.pad), hint: 'Temperatura del disco adesso' },
      { label: 'Usura', value: fixed(w?.padLifePct, 0, '%'), color: null, detail: finite(w?.discLifePct) ? `disco ${fixed(w?.discLifePct, 1, '%')}` : undefined, hint: 'Vita rimasta della pastiglia (e del disco)' },
    ] }
  })
}

/** "+1.733" / "−0.120" seconds against a reference, "" when either side is missing. */
export function deltaSeconds(value: number | null | undefined, reference: number | null | undefined): string {
  if (!finite(value) || !finite(reference) || value <= 0 || reference <= 0) return ''
  const diff = (value - reference) / 1000
  return Math.abs(diff) < 0.0005 ? '±0.000' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(3)}`
}
