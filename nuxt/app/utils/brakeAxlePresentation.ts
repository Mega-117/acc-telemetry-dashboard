import type { FastStateTyre } from '~/composables/useFastStatePoller'
import {
  brakeTemperatureBand,
  brakeTemperatureColor,
} from '~/utils/brakeTemperaturePresentation'

export const BRAKE_PAD_LIFE_WARNING_PCT = 50

export interface BrakeAxlePresentation {
  temperatureAverageC: number | null
  padLifeAveragePct: number | null
  leftTemperatureColor: string
  rightTemperatureColor: string
  temperatureAnomaly: boolean
  wearAnomaly: boolean
  hasMissingData: boolean
}

function completePairAverage(left: number | null, right: number | null): number | null {
  if (left === null || right === null || !Number.isFinite(left) || !Number.isFinite(right)) return null
  return (left + right) / 2
}

export function buildBrakeAxlePresentation(
  left: FastStateTyre,
  right: FastStateTyre,
): BrakeAxlePresentation {
  const temperatureAverageC = completePairAverage(left.brakeTempC, right.brakeTempC)
  const padLifeAveragePct = completePairAverage(left.padLifePct, right.padLifePct)
  const bands = [
    brakeTemperatureBand(left.brakeTempC, left.id, left.brakeCompound),
    brakeTemperatureBand(right.brakeTempC, right.id, right.brakeCompound),
  ]
  const knownPadLives = [left.padLifePct, right.padLifePct]
    .filter((value): value is number => value !== null && Number.isFinite(value))

  return {
    temperatureAverageC,
    padLifeAveragePct,
    leftTemperatureColor: brakeTemperatureColor(left.brakeTempC, left.id, left.brakeCompound),
    rightTemperatureColor: brakeTemperatureColor(right.brakeTempC, right.id, right.brakeCompound),
    temperatureAnomaly: bands.some(band => band !== 'missing' && band !== 'green'),
    wearAnomaly: knownPadLives.some(value => value < BRAKE_PAD_LIFE_WARNING_PCT),
    hasMissingData: temperatureAverageC === null || padLifeAveragePct === null,
  }
}
