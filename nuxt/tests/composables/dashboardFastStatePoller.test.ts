import { describe, expect, it, vi } from 'vitest'
import { useFastStatePoller } from '~/composables/useFastStatePoller'

describe('Dashboard fast-state normalization', () => {
  it('normalizes every shared Dashboard field and marks fresh data', async () => {
    vi.useFakeTimers()
    const api = {
      getFastState: vi.fn(async () => ({
        ts: Date.now() / 1000, is_live: true, ignition_on: true,
        is_engine_running: true, pit_limiter_on: false, session_type: 2,
        speed_kmh: 144.4, speed_delta_kmh: -2.1, gas: .8, brake: .2,
        rpm: 8120, max_rpm: 9000, gear: 4, fuel_l: 40.2,
        fuel_per_lap_l: 2.7, fuel_laps_remaining: 14.9, fuel_left_time_ms: 531_001,
        session_laps_remaining: 6, session_time_left_ms: 1000,
        engine_map: 2, traction_control: 3, traction_control_2: 1,
        abs: 4, traction_control_in_action: true, abs_in_action: false,
        is_in_pit_lane: false, brake_bias_pct: 54.8, corner_speed_kmh: null,
        direction_lights_left: true, direction_lights_right: false,
        lights_stage: 2, rain_lights: true,
      })),
    }
    const poller = useFastStatePoller(() => api)
    poller.startFastStatePolling()
    await Promise.resolve()
    await Promise.resolve()
    expect(poller.fastState.value).toMatchObject({
      isFresh: true, ignitionOn: true, rpm: 8120, maxRpm: 9000, gear: 4,
      fuelL: 40.2, fuelPerLapL: 2.7, fuelLapsRemaining: 14.9, fuelLeftTimeMs: 531_001,
      sessionLapsRemaining: 6, engineMap: 2, tractionControl: 3,
      tractionControl2: 1, abs: 4, tractionControlInAction: true, absInAction: false,
      isInPitLane: false, brakeBiasPct: 54.8,
      directionLightsLeft: true, lightsStage: 2, rainLights: true,
    })
    poller.stopFastStatePolling()
    vi.useRealTimers()
  })
})
