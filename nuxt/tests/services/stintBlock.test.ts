// dev.10 (user 05/11): the stint of "Tu" under the Telemetria map.
import { describe, expect, it } from 'vitest'
import { stintFacts, type StintLapRow } from '~/services/telemetry/stintBlock'

// Monza 04/11 race, stint 1 (the real values of the session): 7 laps, lap 4 invalid, lap 7 into the pits.
const monza: StintLapRow[] = [
  [1, 114845, true, 0], [2, 108340, true, 2.99], [3, 108060, true, 3.0], [4, 106982, false, 2.99],
  [5, 107252, true, 2.99], [6, 107295, true, 2.97], [7, 115160, true, 2.89],
].map(([n, ms, valid, used]) => ({ lap_number: n as number, lap_time_ms: ms as number, is_valid: valid as boolean, stint: 1, stint_fuel: 41,
  fuel_used: used as number, has_pit_stop: n === 7, pit_out_lap: false, air_temp: 22, road_temp: 30 }))
const stint2: StintLapRow[] = [{ lap_number: 8, lap_time_ms: 168412, is_valid: true, stint: 2, stint_fuel: 35, pit_out_lap: true, fuel_used: 2.99 }]

describe('stint block (dev.10)', () => {
  it('the Monza 04/11 stint: 5 clean laps, their average, best, valid/invalid without the pit lap, fuel', () => {
    const f = stintFacts([...monza, ...stint2], 5, 106_748)!
    expect(f).toMatchObject({ stint: 1, kind: 'race', startFuelL: 41, laps: 7, valid: 5, invalid: 1, cleanCount: 5,
      avgMs: Math.round((114845 + 108340 + 108060 + 107252 + 107295) / 5), bestMs: 107252, theoreticalMs: 106748, airC: 22, roadC: 30 })
    expect(f.endFuelL).toBeCloseTo(41 - 17.83, 2)
    expect(f.fuelPerLapL).toBeCloseTo((2.99 + 3.0 + 2.99 + 2.97) / 4, 3)   // clean laps that burned something
  })
  it('Codex 05/11: the end fuel is the last lap\'s own reading (the uncounted out lap burned too)', () => {
    const rows: StintLapRow[] = [{ lap_number: 1, lap_time_ms: 101000, is_valid: true, stint_fuel: 50, fuel_used: 3, fuel_remaining: 44 }]
    expect(stintFacts(rows, 1)!.endFuelL).toBe(44)
  })
  it('fewer than 5 clean laps: no average (as the Sessione page); a theoretical lap slower than the best is not shown', () => {
    const f = stintFacts(monza.slice(0, 4), 2, 109_000)!
    expect(f.avgMs).toBeNull()
    expect(f.cleanCount).toBe(3)
    expect(f.theoreticalMs).toBeNull()
  })
  it('the stint of Tu, not the first one; a qualifying stint; unknown pieces stay unknown', () => {
    const f = stintFacts([...monza, ...stint2], 8)!
    expect(f).toMatchObject({ stint: 2, laps: 1, valid: 0, invalid: 0, cleanCount: 0, bestMs: null })
    const quali = stintFacts([{ lap_number: 1, lap_time_ms: 101000, is_valid: true, stint_fuel: 9 }], 1)!
    expect(quali).toMatchObject({ stint: 1, kind: 'qualify', endFuelL: null, fuelPerLapL: null, airC: null })
    expect(stintFacts(monza, 99)).toBeNull()
  })
})
