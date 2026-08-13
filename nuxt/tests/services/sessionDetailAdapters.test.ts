import { describe, expect, it } from 'vitest'
import { loadSessionDetailViewModel } from '~/services/session-detail/loadSessionDetailViewModel'
import { autoSelectComparisonStints } from '~/services/session-detail/sessionCompareService'
import { buildSessionDetailLaps, buildSessionDetailStint } from '~/services/session-detail/sessionComparisonTableService'
import type { FullSession, StintData } from '~/types/telemetry'

const formatLapTime = (value: number | null | undefined) => value == null ? '—' : `${value}ms`

function buildStint(): StintData {
  return {
    stint_number: 2,
    type: 'Race',
    fuel_start: 45,
    avg_clean_lap: 91_500,
    stint_drive_time_ms: 0,
    laps: [
      {
        lap_number: 1,
        lap_time_ms: 92_000,
        elapsed_time_ms: 92_000,
        fuel_start: 45,
        fuel_remaining: 42,
        air_temp: 24,
        road_temp: 31,
        rain_intensity: 'No Rain',
        track_grip_status: 'Fast',
        is_valid: true,
        is_first_stint_lap: true,
        has_pit_stop: false,
        pit_out_lap: false,
        sectors_reliable: true,
        sector_times_ms: [30_000, 31_000, 31_000]
      },
      {
        lap_number: 2,
        lap_time_ms: 93_000,
        elapsed_time_ms: 185_000,
        fuel_start: 42,
        fuel_remaining: 39,
        air_temp: 25,
        road_temp: 32,
        rain_intensity: 'No Rain',
        track_grip_status: 'Fast',
        is_valid: false,
        is_first_stint_lap: false,
        has_pit_stop: true,
        pit_out_lap: false,
        sectors_reliable: true,
        sector_times_ms: [31_000, 31_000, 31_000]
      }
    ]
  }
}

function buildFullSession(stints: StintData[]): FullSession {
  return {
    session_info: {
      track: 'spa',
      car: 'ferrari_296_gt3',
      driver: 'Driver',
      session_type: 2,
      date_start: '2026-08-13T10:00:00Z',
      date_end: '2026-08-13T11:00:00Z',
      start_air_temp: 24,
      start_road_temp: 31,
      start_track_grip: 'Fast',
      start_weather: 'Clear',
      session_best_lap: 92_000,
      avg_clean_lap: 93_000,
      total_drive_time_ms: 185_000,
      laps_total: 2,
      laps_valid: 1,
      laps_invalid: 1
    },
    stints,
    ownerId: 'owner-1',
    ownerEmail: 'driver@example.invalid'
  }
}

describe('session detail adapters', () => {
  it('normalizes canonical laps into the shared table and chart contract', () => {
    const [lap] = buildSessionDetailLaps(buildStint().laps, formatLapTime)

    expect(lap).toMatchObject({
      lap: 1,
      lapNumber: 1,
      time: '92000ms',
      lapTime: '92000ms',
      lapTimeMs: 92_000,
      valid: true,
      pit: false,
      fuel: 42,
      air: 24,
      grip: 'Fast'
    })
  })

  it('builds one uniform stint summary and excludes invalid pit laps from its best', () => {
    expect(buildSessionDetailStint(buildStint(), formatLapTime)).toMatchObject({
      number: 2,
      type: 'R',
      laps: 2,
      validLapsCount: 1,
      best: '92000ms',
      bestMs: 92_000,
      avgWarning: true,
      durationMs: 185_000
    })
  })

  it('preserves race-first automatic comparison selection', () => {
    const qualify = { ...buildStint(), stint_number: 1, type: 'Qualify' }
    const race = { ...buildStint(), stint_number: 2, type: 'Race' }

    expect(autoSelectComparisonStints({
      primarySession: { stints: [{ number: 7 }] },
      secondarySession: buildFullSession([qualify, race]),
      bestRaceStint: { number: 7 },
      bestQualyStint: null
    })).toEqual({ primaryStint: 7, secondaryStint: 2 })
  })

  it('normalizes permission errors without weakening the current-user contract', async () => {
    const result = await loadSessionDetailViewModel({
      sessionId: 'session-1',
      currentUser: { value: { displayName: 'Enrico' } },
      telemetryGateway: {
        getSessionDetail: async () => Promise.reject({ code: 'permission-denied' })
      }
    })

    expect(result).toMatchObject({
      fullSession: null,
      currentUserNickname: 'Enrico',
      loadError: 'Sessione non condivisa o accesso negato'
    })
  })
})
