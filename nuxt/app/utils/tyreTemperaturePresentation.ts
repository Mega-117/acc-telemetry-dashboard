export type TyreTemperatureCompound = 'DRY' | 'WET'

interface TemperatureRange {
  min: number
  max: number
  from: readonly [number, number, number]
  to: readonly [number, number, number]
}

const BLUE = [0, 0, 200] as const
const CYAN = [0, 200, 200] as const
const GREEN = [0, 200, 0] as const
const YELLOW = [255, 255, 0] as const
const RED = [255, 0, 0] as const

// ACC Drive ColorPickerManager.CreateTyreColorSets (verified from local IL).
const DRY_RANGES: readonly TemperatureRange[] = [
  { min: 51, max: 65, from: BLUE, to: CYAN },
  { min: 66, max: 85, from: CYAN, to: GREEN },
  { min: 86, max: 99, from: [0, 255, 0], to: YELLOW },
  { min: 100, max: 120, from: YELLOW, to: RED },
]

const WET_RANGES: readonly TemperatureRange[] = [
  { min: 15, max: 24, from: BLUE, to: CYAN },
  { min: 25, max: 65, from: CYAN, to: GREEN },
  { min: 66, max: 85, from: [0, 255, 0], to: YELLOW },
  { min: 86, max: 100, from: YELLOW, to: RED },
]

function interpolateChannel(from: number, to: number, ratio: number) {
  return Math.round(from + (to - from) * ratio)
}

export function tyreTemperatureColor(
  temperatureC: number | null,
  compound: TyreTemperatureCompound = 'DRY',
): string {
  if (temperatureC === null || !Number.isFinite(temperatureC)) return '#6b7280'

  const ranges = compound === 'WET' ? WET_RANGES : DRY_RANGES
  const integerTemperature = Math.trunc(temperatureC)
  if (integerTemperature < ranges[0]!.min) return 'rgb(0, 0, 200)'
  if (integerTemperature > ranges[ranges.length - 1]!.max) return 'rgb(255, 0, 0)'

  const range = ranges.find(item => integerTemperature >= item.min && integerTemperature <= item.max)
  if (!range) return integerTemperature < ranges[1]!.min ? 'rgb(0, 200, 200)' : 'rgb(0, 200, 0)'

  const ratio = (integerTemperature - range.min) / (range.max - range.min)
  const [fromR, fromG, fromB] = range.from
  const [toR, toG, toB] = range.to
  return `rgb(${interpolateChannel(fromR, toR, ratio)}, ${interpolateChannel(fromG, toG, ratio)}, ${interpolateChannel(fromB, toB, ratio)})`
}
