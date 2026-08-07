import type { FastStateTyre } from '~/composables/useFastStatePoller'

export type BrakeCompound = 0 | 1 | 2 | 3
export type BrakeTemperatureBand = 'missing' | 'blue' | 'lightBlue' | 'green' | 'yellow' | 'orange' | 'red'

interface BrakeColorRanges {
  lightBlue: readonly [number, number]
  green: readonly [number, number]
  yellow: readonly [number, number]
  orange: readonly [number, number]
}

const STANDARD_FRONT: BrakeColorRanges = {
  lightBlue: [71, 180], green: [181, 490], yellow: [491, 580], orange: [581, 850],
}
const ENDURANCE_FRONT: BrakeColorRanges = {
  lightBlue: [71, 180], green: [181, 430], yellow: [431, 530], orange: [531, 850],
}
const WET_FRONT: BrakeColorRanges = {
  lightBlue: [71, 72], green: [73, 490], yellow: [491, 700], orange: [701, 850],
}
const STANDARD_REAR: BrakeColorRanges = {
  lightBlue: [61, 140], green: [141, 490], yellow: [491, 570], orange: [571, 850],
}
const ENDURANCE_REAR: BrakeColorRanges = {
  lightBlue: [61, 140], green: [141, 279], yellow: [280, 490], orange: [491, 850],
}
const WET_REAR: BrakeColorRanges = {
  lightBlue: [61, 90], green: [91, 400], yellow: [401, 650], orange: [651, 850],
}

function rangesFor(wheelId: FastStateTyre['id'], compound: number | null): BrakeColorRanges {
  const front = wheelId === 'FL' || wheelId === 'FR'
  if (compound === 1) return front ? ENDURANCE_FRONT : ENDURANCE_REAR
  if (compound === 2) return front ? WET_FRONT : WET_REAR
  // ACC Drive maps both Standard (0) and Qualy (3) to the Standard table.
  return front ? STANDARD_FRONT : STANDARD_REAR
}

function roundToEven(value: number): number {
  const floor = Math.floor(value)
  const fraction = value - floor
  if (fraction < 0.5) return floor
  if (fraction > 0.5) return floor + 1
  return floor % 2 === 0 ? floor : floor + 1
}

function bandProgress(temp: number, range: readonly [number, number]): number | null {
  const [min, max] = range
  if (temp < min || temp > max) return null
  return roundToEven((200 / (max - min)) * (temp - min))
}

function rgb(r: number, g: number, b: number): string {
  return `rgb(${r}, ${g}, ${b})`
}

export function brakeTemperatureBand(
  tempC: number | null,
  wheelId: FastStateTyre['id'],
  compound: number | null,
): BrakeTemperatureBand {
  if (tempC === null || !Number.isFinite(tempC)) return 'missing'
  const temp = Math.trunc(tempC)
  const ranges = rangesFor(wheelId, compound)
  if (temp > ranges.orange[1]) return 'red'
  if (bandProgress(temp, ranges.orange) !== null) return 'orange'
  if (bandProgress(temp, ranges.yellow) !== null) return 'yellow'
  if (bandProgress(temp, ranges.green) !== null) return 'green'
  if (bandProgress(temp, ranges.lightBlue) !== null) return 'lightBlue'
  return 'blue'
}

export function brakeTemperatureColor(
  tempC: number | null,
  wheelId: FastStateTyre['id'],
  compound: number | null,
): string {
  if (tempC === null || !Number.isFinite(tempC)) return 'rgb(20, 43, 208)'
  const temp = Math.trunc(tempC)
  const ranges = rangesFor(wheelId, compound)

  if (temp > ranges.orange[1]) return rgb(255, 0, 0)

  const orange = bandProgress(temp, ranges.orange)
  if (orange !== null) return rgb(255, 255 - orange, 0)

  const yellow = bandProgress(temp, ranges.yellow)
  if (yellow !== null) return rgb(yellow, 255, 0)

  const green = bandProgress(temp, ranges.green)
  if (green !== null) return rgb(0, 200, 200 - green)

  const lightBlue = bandProgress(temp, ranges.lightBlue)
  if (lightBlue !== null) return rgb(0, lightBlue, 200)

  return rgb(0, 0, 200)
}

export const ACC_DRIVE_BRAKE_COLOR_RANGES = {
  standard: { front: STANDARD_FRONT, rear: STANDARD_REAR },
  endurance: { front: ENDURANCE_FRONT, rear: ENDURANCE_REAR },
  wet: { front: WET_FRONT, rear: WET_REAR },
} as const
