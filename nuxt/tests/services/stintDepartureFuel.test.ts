import { describe, expect, it } from 'vitest'
import { stintDepartureFuel } from '~/services/telemetry/raceFuelClassification'
import { recordedSessionForDetail } from '~/services/session-detail/recordedSessionAdapter'
import { extractMetadata } from '~/utils/sessionParser'

// PIP-649, real case (Mike83, Indianapolis 22/10): refuel 8.83 -> 58.72 L inside stint 2's first lap.
const lap = (n: number, ms: number, fuelStart: number, fuelRemaining: number) => ({ lap_number: n, lap_time_ms: ms, is_valid: true,
  has_pit_stop: false, pit_out_lap: false, fuel_start: fuelStart, fuel_remaining: fuelRemaining, air_temp: 20, road_temp: 25, track_grip_status: 'Optimum' })
const session = () => ({ static_data: { sectorCount: 3 },
  session_info: { track: 'indianapolis', car: 'bmw_m4_gt3', session_type: 2, date_start: '2026-10-22T21:51:24Z', laps_total: 4 },
  stints: [
    { stint_number: 1, type: 'Qualify', fuel_start: 12, laps: [lap(1, 104255, 12, 10.4), lap(2, 104900, 10.4, 8.83)] },
    { stint_number: 2, type: 'Qualify', fuel_start: 8.8, laps: [lap(3, 140000, 8.83, 58.72), lap(4, 103857, 58.72, 56.1)] }
  ] })

describe('stintDepartureFuel (PIP-649)', () => {
  it('uses the fuel the car left with when the first lap ends 2 L higher', () => {
    expect(stintDepartureFuel(session().stints[1])).toBe(58.7)
  })
  it('review: a previous stint load does not hide the refuel; missing readings are not zero (same as the logger)', () => {
    expect(stintDepartureFuel({ fuel_start: 120, laps: [lap(1, 1, 8.83, 58.72)] })).toBe(58.7)
    expect(stintDepartureFuel({ fuel_start: 20, laps: [{ fuel_start: null, fuel_remaining: 21 }] })).toBe(20)
    expect(stintDepartureFuel({ fuel_start: null, laps: [{ fuel_start: null, fuel_remaining: 30 }] })).toBeNull()
    // Rounded as saved: 8.8 -> 20.04 is 20.0, so qualifying now and after a recalculation.
    expect(stintDepartureFuel({ fuel_start: 8.8, laps: [{ fuel_remaining: 20.04 }] })).toBe(20)
  })
  it('keeps fuel_start for normal stints, small jumps and missing data', () => {
    expect(stintDepartureFuel(session().stints[0])).toBe(12)
    expect(stintDepartureFuel({ fuel_start: 30, laps: [lap(1, 1, 30, 31.9)] })).toBe(30)
    expect(stintDepartureFuel({ fuel_start: 30, laps: [] })).toBe(30)
    expect(stintDepartureFuel(null)).toBeNull()
  })
  it('falls back to the stint fuel_start when the first lap has no fuel_start', () => {
    expect(stintDepartureFuel({ fuel_start: 8.8, laps: [{ fuel_remaining: 58.72 }] })).toBe(58.7)
  })
  it('session detail shows stint 2 as Race with its departure fuel, raw untouched', () => {
    const raw = session()
    const detail = recordedSessionForDetail(raw)!
    expect(detail.stints[1]).toMatchObject({ type: 'Race', fuel_start: 58.7 })
    expect(raw.stints[1]).toMatchObject({ type: 'Qualify', fuel_start: 8.8 })
    const clean = { ...session(), stints: [session().stints[0]] }
    expect(recordedSessionForDetail(clean)).toBe(clean)
  })
  it('the recomputed summary files the 1:43.857 as race best, not qualifying', () => {
    const { summary, summarySource } = extractMetadata(session(), { allowLegacyFallback: true, forceRawRebuild: true })
    expect(summarySource).toBe('legacy_fallback')
    expect(summary.best_race_ms).toBe(103857)
    expect(summary.best_qualy_ms).toBe(104255)
  })
})
