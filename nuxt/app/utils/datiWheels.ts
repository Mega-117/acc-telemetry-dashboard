// PIP-663: the Dati page reads the car wheel by wheel (how is my front left?), not metric by metric.
// Pure builders shared by the recorded lap (Giri) and the live view (In diretta).
import { brakeColor, pressureColor, tyreColor, type BrakePad } from '~/utils/temperatureColor'
import type { LapTelemetry, WheelValues } from '~/types/telemetry'
import { useI18n, type TranslationKey } from '~/i18n'

export type WheelId = 'FL' | 'FR' | 'RL' | 'RR'
export const WHEEL_IDS: readonly WheelId[] = ['FL', 'FR', 'RL', 'RR']
const WHEEL_NAME_KEYS: Record<WheelId, TranslationKey> = { FL: 'data.wheel.fl', FR: 'data.wheel.fr', RL: 'data.wheel.rl', RR: 'data.wheel.rr' }
/** Wheel name in the interface language. */
export const wheelName = (id: WheelId) => useI18n().t(WHEEL_NAME_KEYS[id])

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
  const { t } = useI18n()
  return WHEEL_IDS.map((id, i) => {
    const axle = i < 2 ? 'front' : 'rear'
    const pad = padOf(axle === 'front' ? tel?.brakes?.front_pad : tel?.brakes?.rear_pad)
    const pressure = at(tel?.pressure?.avg, i), loss = at(tel?.pressure?.loss, i)
    const tyre = at(tel?.tyre_temp?.avg, i), brake = at(tel?.brake_temp?.avg, i)
    return { id, name: wheelName(id), metrics: [
      { label: t('data.metric.pressure'), value: fixed(pressure, 1, ' psi'), color: pressureColor(pressure, wet),
        detail: join(finite(at(tel?.pressure?.high, i)) && `max ${fixed(at(tel?.pressure?.high, i))}`, finite(loss) && loss > 0 && `${t('data.metric.drop')} ${fixed(loss, 2)}`),
        hint: t('data.metric.pressureHint') },
      { label: t('data.metric.tyre'), value: degrees(tyre), color: tyreColor(tyre, wet), detail: range(at(tel?.tyre_temp?.low, i), at(tel?.tyre_temp?.high, i)),
        hint: t('data.metric.tyreHint') },
      { label: t('data.metric.brake'), value: degrees(brake), color: brakeColor(brake, axle, pad), detail: range(at(tel?.brake_temp?.low, i), at(tel?.brake_temp?.high, i)),
        hint: t('data.metric.brakeHint') },
      { label: t('data.metric.wear'), value: fixed(at(tel?.brakes?.pad_life, i), 1, '%'), color: null, detail: finite(at(tel?.brakes?.disc_life, i)) ? `${t('data.metric.disc')} ${fixed(at(tel?.brakes?.disc_life, i), 1, '%')}` : undefined,
        hint: t('data.metric.wearHint') },
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
  const { t } = useI18n()
  return WHEEL_IDS.map((id, i) => {
    const w = wheel(id)
    const loss = w?.pressureLossPsi
    return { id, name: wheelName(id), metrics: [
      { label: t('data.metric.pressure'), value: fixed(w?.pressurePsi, 1, ' psi'), color: pressureColor(w?.pressurePsi, wet),
        detail: finite(loss) && loss > 0 ? `${t('data.metric.drop')} ${fixed(loss, 2)}` : undefined, hint: t('data.metric.pressureLiveHint') },
      { label: t('data.metric.correction'), value: w?.correction?.text ?? '--', color: w?.correction?.color ?? null, hint: t('data.metric.correctionHint') },
      { label: t('data.metric.tyre'), value: degrees(w?.coreTempC), color: tyreColor(w?.coreTempC, wet), hint: t('data.metric.tyreLiveHint') },
      { label: t('data.metric.brake'), value: degrees(w?.brakeTempC), color: brakeColor(w?.brakeTempC, i < 2 ? 'front' : 'rear', w?.pad), hint: t('data.metric.brakeLiveHint') },
      { label: t('data.metric.wear'), value: fixed(w?.padLifePct, 0, '%'), color: null, detail: finite(w?.discLifePct) ? `${t('data.metric.disc')} ${fixed(w?.discLifePct, 1, '%')}` : undefined, hint: t('data.metric.wearHint') },
    ] }
  })
}

/** "+1.733" / "−0.120" seconds against a reference, "" when either side is missing. */
export function deltaSeconds(value: number | null | undefined, reference: number | null | undefined): string {
  if (!finite(value) || !finite(reference) || value <= 0 || reference <= 0) return ''
  const diff = (value - reference) / 1000
  return Math.abs(diff) < 0.0005 ? '±0.000' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(3)}`
}
