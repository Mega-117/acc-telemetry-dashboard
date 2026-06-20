import { describe, expect, it } from 'vitest'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { prepareSummaryForUpload } from '~/services/sync/sessionUploadService'

function makeLegacyRaceRaw(overrides: Record<string, unknown> = {}) {
  return {
    session_info: {
      track: 'spa',
      date_start: '2026-06-01T10:00:00',
      car_model: 'amr_v8_vantage_gt3',
      session_type: 2,
      laps_total: 6,
      laps_valid: 6,
      session_best_lap: 137000,
      avg_clean_lap: 138000,
      total_drive_time_ms: 900000
    },
    stints: [
      {
        fuel_start: 65,
        avg_clean_lap: 138000,
        laps: [
          { lap_time_ms: 137900, is_valid: true, fuel_start: 65, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' },
          { lap_time_ms: 137500, is_valid: true, fuel_start: 64, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' },
          { lap_time_ms: 137000, is_valid: true, fuel_start: 63, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' },
          { lap_time_ms: 138200, is_valid: true, fuel_start: 62, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' },
          { lap_time_ms: 138100, is_valid: true, fuel_start: 61, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' },
          { lap_time_ms: 138300, is_valid: true, fuel_start: 60, air_temp: 20, road_temp: 28, track_grip_status: 'Opt' }
        ]
      }
    ],
    summary: {
      best_rules_version: 1,
      best_race_ms: null,
      best_by_grip: null
    },
    ...overrides
  }
}

describe('prepareSummaryForUpload', () => {
  it('ricalcola un JSON locale legacy dai raw/stint prima di caricarlo come V5', () => {
    const prepared = prepareSummaryForUpload(makeLegacyRaceRaw())

    expect(prepared.ok).toBe(true)
    if (!prepared.ok) throw new Error('expected uploadable summary')

    expect(prepared.summarySource).toBe('legacy_fallback')
    expect(prepared.summary.best_rules_version).toBe(BEST_RULES_VERSION)
    expect(prepared.summary.best_race_ms).toBe(137000)
    expect(prepared.summary.best_by_grip.Optimum.raceBestByFuelBucket['60-80'].timeMs).toBe(137000)
    expect(prepared.summary.best_by_grip.Optimum.raceAvgByFuelBucket['60-80'].timeMs).toBe(138000)
  })

  it('salta un JSON locale legacy senza stints invece di promuovere solo il numero versione', () => {
    const prepared = prepareSummaryForUpload(makeLegacyRaceRaw({ stints: [] }))

    expect(prepared.ok).toBe(false)
    if (prepared.ok) throw new Error('expected skipped legacy local summary')
    expect(prepared.reason).toBe('legacy_local_requires_reprocess')
  })
})