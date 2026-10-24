// PIP-613: colour of a tyre or brake temperature, as the ACC Drive telemetry panel shows it:
// one continuous scale blue -> light blue -> green -> yellow -> orange -> red over four bands
// (light blue, green, yellow, orange). Below the first band it is blue, above the last red.
// Band limits are per case: dry or wet tyres, front or rear brakes and pad compound.

export type TemperatureBands = readonly [lightBlue: Band, green: Band, yellow: Band, orange: Band]
type Band = readonly [min: number, max: number]

export const TYRE_BANDS: Record<'dry' | 'wet', TemperatureBands> = {
  dry: [[51, 65], [66, 85], [86, 99], [100, 120]],
  wet: [[15, 24], [25, 65], [66, 85], [86, 100]],
}

export type BrakePad = 'standard' | 'endurance' | 'wet' | 'qualy'
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

/** Position 0..200 inside a band, or null when the value is outside it. */
function step(value: number, [min, max]: Band): number | null {
  return value >= min && value <= max ? Math.round(200 / (max - min) * (value - min)) : null
}

/** CSS colour of a temperature on the given bands; null for a missing value. */
export function temperatureColor(value: number | null | undefined, bands: TemperatureBands): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const t = Math.trunc(value)
  const [lightBlue, green, yellow, orange] = bands
  let r = 0, g = 0, b = 0
  if (t > orange[1]) r = 255 // above the scale: red
  let s = step(t, orange)
  if (s !== null) { r = 255; g = 255 - s } // yellow -> orange
  s = step(t, yellow)
  if (s !== null) { r = s; g = 255 } // green -> yellow
  s = step(t, green)
  if (s !== null) { g = 200; b = 200 - s } // light blue -> green
  s = step(t, lightBlue)
  if (s !== null) { g = s; b = 200 } // blue -> light blue
  if (t < lightBlue[0]) b = 200 // below the scale: blue
  // Gaps between integer bands (e.g. 65.5 truncated stays inside), never black.
  if (r === 0 && g === 0 && b === 0) return null
  return `rgb(${r}, ${g}, ${b})`
}
