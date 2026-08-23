import { describe, expect, it } from 'vitest'
import { buildSessionDisplayModel } from '~/services/session-detail/buildSessionDisplayModel'
import type { FullSession, LapData } from '~/types/telemetry'

function lap(number: number, time: number, fuel: number): LapData {
  return {
    lap_number: number,
    lap_time_ms: time,
    elapsed_time_ms: time * number,
    fuel_start: fuel,
    fuel_remaining: fuel - 1,
    air_temp: 24,
    road_temp: 31,
    rain_intensity: 'No Rain',
    track_grip_status: 'Fast',
    is_valid: true,
    is_first_stint_lap: number === 1,
    has_pit_stop: false,
    pit_out_lap: false,
    sectors_reliable: true,
    sector_times_ms: [38_000, 38_000, time - 76_000]
  }
}

function session(): FullSession {
  const laps = [114_060, 116_000, 116_200, 117_000, 118_150].map((time, index) => lap(index + 1, time, 35 - index * 2))
  return {
    session_info: {
      track: 'nurburgring', car: 'ferrari_296_gt3', driver: 'Driver', session_type: 2,
      date_start: '2026-05-30T15:56:03Z', date_end: '2026-05-30T16:20:00Z',
      start_air_temp: 24, start_road_temp: 31, start_track_grip: 'Fast', start_weather: 'Clear',
      session_best_lap: 114_060, avg_clean_lap: 116_282, total_drive_time_ms: 581_410,
      laps_total: 5, laps_valid: 5, laps_invalid: 0
    },
    stints: [{
      stint_number: 1, type: 'Race', fuel_start: 35, avg_clean_lap: 116_282,
      stint_drive_time_ms: 581_410, laps
    }],
    ownerId: 'owner-1', ownerEmail: 'driver@example.invalid'
  }
}

describe('buildSessionDisplayModel', () => {
  it('shows raw Race best and AVG below 40 L without promoting historical records', () => {
    const result = buildSessionDisplayModel({
      sessionId: 'session-35l', fullSession: session(), maxReasonableLapMs: 300_000,
      formatLapTime: (value) => value ? `${value}ms` : '-',
      formatCarName: (value) => value,
      formatDateFull: (value) => value,
      formatTime: (value) => value,
      getSessionTypeLabel: () => 'race'
    })

    expect(result.bestRace).toBe('114060ms')
    expect(result.stints[0]).toMatchObject({
      bestMs: 114_060,
      avgMs: 116_282,
      best: '114060ms',
      avg: '116282ms',
      avgWarning: false
    })
  })
})
