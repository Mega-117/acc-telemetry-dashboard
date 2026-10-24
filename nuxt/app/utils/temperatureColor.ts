// PIP-613: colours of the Dati panel. Temperatures use the one ACC Drive scale of the app
// (utils/tyreTemperaturePresentation.ts): tyres with its dry/wet bands, brakes with the same
// scale on ACC Drive's per axle and pad limits. Pressures against the Correggi pressioni window.
import { bandedTemperatureColor, temperatureRangesFor, tyreTemperatureColor } from '~/utils/tyreTemperaturePresentation'

type Band = readonly [min: number, max: number]
export type TemperatureBands = readonly [lightBlue: Band, green: Band, yellow: Band, orange: Band]

export type BrakePad = 'standard' | 'endurance' | 'wet' | 'qualy'
// ACC Drive ColorPickerManager.CreateBrakeColorSets.
const FRONT: Record<Exclude<BrakePad, 'qualy'>, TemperatureBands> = {
  standard: [[71, 180], [181, 490], [491, 580], [581, 850]],
  endurance: [[71, 180], [181, 430], [431, 530], [531, 850]],
  wet: [[71, 72], [73, 490], [491, 700], [701, 850]],
}
const REAR: Record<Exclude<BrakePad, 'qualy'>, TemperatureBands> = {
  standard: [[61, 140], [141, 490], [491, 570], [571, 850]],
  endurance: [[61, 140], [141, 279], [280, 490], [491, 850]],
  wet: [[61, 90], [91, 400], [401, 650], [651, 850]],
}

/** Brake bands for one axle; the qualifying pad uses the standard ones. */
export function brakeBands(axle: 'front' | 'rear', pad: BrakePad | null | undefined): TemperatureBands {
  const set = axle === 'front' ? FRONT : REAR
  return set[pad === 'endurance' || pad === 'wet' ? pad : 'standard']
}

const missing = (value: number | null | undefined): value is null | undefined => typeof value !== 'number' || !Number.isFinite(value)

/** Tyre temperature colour, null for a missing value (the cell shows "--"). */
export function tyreColor(value: number | null | undefined, wet = false): string | null {
  return missing(value) ? null : tyreTemperatureColor(value, wet ? 'WET' : 'DRY')
}

/** Brake temperature colour on the axle and pad limits, null for a missing value. */
export function brakeColor(value: number | null | undefined, axle: 'front' | 'rear', pad: BrakePad | null | undefined): string | null {
  return missing(value) ? null : bandedTemperatureColor(value, temperatureRangesFor(brakeBands(axle, pad)))
}

// Hot pressure windows of Correggi pressioni (logger_core/tyre_pressure_recommendation.py,
// ACCEPTED_BANDS_TENTHS): keep the two in step.
export const PRESSURE_WINDOW_PSI: Record<'dry' | 'wet', readonly [number, number]> = { dry: [27.0, 27.2], wet: [30.5, 30.7] }
const PRESSURE_NEAR_PSI = 0.3
const PRESSURE_FAR_PSI = 0.8

/**
 * Colour of a hot tyre pressure against the Correggi pressioni window: green inside (or within
 * 0.3 psi), yellow within 0.8 psi, then light blue when too low, red when too high.
 */
export function pressureColor(value: number | null | undefined, wet = false): string | null {
  if (missing(value)) return null
  const [min, max] = PRESSURE_WINDOW_PSI[wet ? 'wet' : 'dry']
  const off = value < min ? min - value : value > max ? value - max : 0
  if (off <= PRESSURE_NEAR_PSI + 1e-9) return 'rgb(0, 200, 0)'
  if (off <= PRESSURE_FAR_PSI + 1e-9) return 'rgb(230, 230, 0)'
  return value < min ? 'rgb(0, 170, 220)' : 'rgb(255, 60, 40)'
}
