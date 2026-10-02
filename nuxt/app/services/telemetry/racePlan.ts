import { commonValue, type CommonLive } from './commonLive'
import { featureAvailability } from './featureAvailability'

export function calculateRacePlan(input: {
  durationMinutes: number | null; lapSeconds: number | null; fuelPerLap: number | null
  reserveLaps: number; stops: number
}) {
  const positive = (value: number | null): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
  const laps = positive(input.durationMinutes) && positive(input.lapSeconds)
    ? Math.ceil(input.durationMinutes * 60 / input.lapSeconds) : null
  const valid = laps !== null && Number.isSafeInteger(laps) && laps > 0 && laps <= 100_000
    && Number.isInteger(input.reserveLaps) && input.reserveLaps >= 0 && input.reserveLaps <= 100
    && Number.isInteger(input.stops) && input.stops >= 0 && input.stops < laps && input.stops <= 20
  if (!valid) return { laps: null, fuel: null, stints: [] }
  const count = input.stops + 1
  const stints = Array.from({ length: count }, (_, index) => {
    const stintLaps = Math.floor(laps / count) + (index < laps % count ? 1 : 0)
    const liters = positive(input.fuelPerLap) ? (stintLaps + input.reserveLaps) * input.fuelPerLap : null
    return { id: index + 1, laps: stintLaps, fuel: liters !== null && Number.isFinite(liters) ? Math.ceil(liters * 10) / 10 : null }
  })
  // Reserve is explicitly per stint. Totals must equal the displayed loads.
  return { laps, stints, fuel: stints.every(stint => stint.fuel !== null)
    ? Math.round(stints.reduce((sum, stint) => sum + stint.fuel!, 0) * 10) / 10 : null }
}

export function racePlanLiveInputs(live: CommonLive | null | undefined, gameId: string) {
  if (!live || live.gameId !== gameId || !live.connected || !live.fresh || live.lifecycle === 'off' || live.lifecycle === 'replay') return null
  const lap = featureAvailability(live, { capabilities: ['lap_timing'], fields: { last_lap_time: 'ms' } }).available
    ? commonValue(live, 'last_lap_time', 'ms') : null
  const fuel = featureAvailability(live, { capabilities: ['fuel'], fields: { fuel_per_lap: 'L/lap' } }).available
    ? commonValue(live, 'fuel_per_lap', 'L/lap') : null
  return { track: live.identity?.track ?? '', car: live.identity?.car ?? '', variant: live.identity?.variant ?? null,
    lapSeconds: lap !== null && lap > 0 ? lap / 1000 : null, fuelPerLap: fuel !== null && fuel > 0 ? fuel : null }
}
