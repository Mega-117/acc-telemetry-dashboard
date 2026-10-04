import type { FullSession, SessionDocument } from '~/types/telemetry'
import { filterHistory, historyBest } from '~/services/projections/vehicleHistory'
import { calculateTheoreticalTimes } from '~/services/telemetry/theoreticalTimesCalculator'
import { sessionDetailTrackId } from './recordedSessionAdapter'

/** EVO references belong to this vehicle/layout, not an inferred ACC class. */
export function vehicleSessionReferences(session: FullSession, history: SessionDocument[], grip: string,
  temperature: number, fuel: number) {
  const best = historyBest(filterHistory(history, 'evo', { car: session.session_info.car }, sessionDetailTrackId(session)), grip)
  const result = calculateTheoreticalTimes(best, grip, temperature, fuel)
  if (!Number.isFinite(temperature)) {
    // No current temperature => keep recorded historic facts, omit conversion.
    result.theoQualy = result.theoRace = result.theoAvgRace = null
    for (const reference of [result.qualyReference, result.raceReference, result.avgRaceReference]) {
      reference.stintTemp = Number.NaN
      reference.adjustedMs = reference.adjustmentMs = reference.tempDiff = null
    }
  }
  return result
}
