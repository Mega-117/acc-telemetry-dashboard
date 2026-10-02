import { describe, expect, it } from 'vitest'
import { calculateRacePlan, racePlanLiveInputs } from '~/services/telemetry/racePlan'
import type { CommonLive } from '~/services/telemetry/commonLive'

const input = { durationMinutes: 60, lapSeconds: 120, fuelPerLap: 2.5, reserveLaps: 1, stops: 1 }
const live = (): CommonLive => ({ gameId: 'evo', sessionId: 'one', connected: true, fresh: true, lifecycle: 'live',
  identity: { track: 'Spa', variant: 'GP', car: 'car' }, capabilities: { lap_timing: true, fuel: true }, fields: {
    last_lap_time: { value: 120000, unit: 'ms', availability: 'available' },
    fuel_per_lap: { value: 2.5, unit: 'L/lap', availability: 'available' },
  } })
describe('common manual race plan', () => {
  it('conserves race laps and sums explicit reserves without hidden margins or mandatory stops', () => {
    expect(calculateRacePlan(input)).toEqual({ laps: 30, fuel: 80, stints: [
      { id: 1, laps: 15, fuel: 40 }, { id: 2, laps: 15, fuel: 40 }] })
    const uneven = calculateRacePlan({ ...input, durationMinutes: 61, reserveLaps: 0, stops: 2 })
    expect(uneven.stints.map(stint => stint.laps)).toEqual([11, 10, 10])
    expect(uneven.fuel).toBe(77.5)
  })
  it('keeps lap estimates when consumption is missing and rejects invalid or impossible inputs', () => {
    expect(calculateRacePlan({ ...input, fuelPerLap: null })).toMatchObject({ laps: 30, fuel: null })
    for (const change of [{ lapSeconds: null }, { lapSeconds: 0 }, { durationMinutes: Infinity }, { stops: 30 }, { stops: -1 }, { reserveLaps: NaN }]) {
      expect(calculateRacePlan({ ...input, ...change }).stints).toEqual([])
    }
    expect(calculateRacePlan({ ...input, fuelPerLap: -1 }).fuel).toBeNull()
  })
  it('uses only matching fresh normalized fields and independent capabilities', () => {
    expect(racePlanLiveInputs(live(), 'evo')).toMatchObject({ lapSeconds: 120, fuelPerLap: 2.5, variant: 'GP' })
    expect(racePlanLiveInputs(live(), 'acc')).toBeNull()
    expect(racePlanLiveInputs({ ...live(), fresh: false }, 'evo')).toBeNull()
    expect(racePlanLiveInputs({ ...live(), lifecycle: 'replay' }, 'evo')).toBeNull()
    expect(racePlanLiveInputs({ ...live(), capabilities: { lap_timing: true, fuel: false } }, 'evo')).toMatchObject({ lapSeconds: 120, fuelPerLap: null })
    const wrongUnit = live(); wrongUnit.fields.fuel_per_lap!.unit = 'gallon/lap'
    expect(racePlanLiveInputs(wrongUnit, 'evo')!.fuelPerLap).toBeNull()
  })
})
