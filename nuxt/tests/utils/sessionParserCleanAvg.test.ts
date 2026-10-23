import { describe, expect, it } from 'vitest'
import { extractMetadata } from '~/utils/sessionParser'

// PIP-591 (X-A04-07): il ricalcolo nel browser usa lo stesso campione del logger e del
// riepilogo Python: giri entro il 115% del best di sessione, da cui media e conteggio.
function raw(lapTimes: number[], sessionBest: number, storedAvg: number) {
  return {
    static_data: { sectorCount: 3 },
    session_info: {
      track: 'silverstone', car_model: 'ferrari_296_gt3', session_type: 2, date_start: '2026-10-24T10:00:00Z',
      session_best_lap: sessionBest, laps_total: lapTimes.length, laps_valid: lapTimes.length,
    },
    stints: [{
      stint_number: 1, type: 'Race', fuel_start: 60, avg_clean_lap: storedAvg,
      laps: lapTimes.map((lapTime, index) => ({
        lap_number: index + 1, lap_time_ms: lapTime, fuel_start: 60 - index * 2, fuel_remaining: 59 - index * 2,
        air_temp: 21, road_temp: 28, track_grip_status: 'Optimum', is_valid: true, has_pit_stop: false, pit_out_lap: false,
      })),
    }],
  }
}

describe('session parser clean AVG (PIP-591)', () => {
  it('one clean lap among slow ones does not become a five-lap historical AVG', () => {
    const { summary } = extractMetadata(raw([100000, 130000, 130000, 130000, 130000], 100000, 100000), { forceRawRebuild: true, allowLegacyFallback: true })
    expect(summary.best_avg_race_ms ?? null).toBeNull()
  })

  it('the published average is recomputed from the counted laps', () => {
    const { summary } = extractMetadata(raw([110000, 110000, 110000, 110000, 110000, 125000], 100000, 112500), { forceRawRebuild: true, allowLegacyFallback: true })
    expect(summary.best_avg_race_ms).toBe(110000)
  })
})
