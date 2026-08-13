import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOverlayTelemetrySource } from '../../app/composables/useOverlayTelemetrySource'

describe('useOverlayTelemetrySource', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('combina pull/push focused con fast state e rilascia entrambi i listener', async () => {
    vi.useFakeTimers()
    const offFast = vi.fn()
    const offFocused = vi.fn()
    let pushFocused: ((value: unknown) => void) | null = null
    const api = {
      getFastState: vi.fn().mockResolvedValue({
        ts: Date.now() / 1000,
        is_live: true,
        speed_kmh: 0,
        gear: 0,
        gas: 0.4,
        brake: 0.1,
        fuel_l: 62,
      }),
      onFastStateUpdate: vi.fn(() => offFast),
      getFocusedCarState: vi.fn().mockResolvedValue({
        status: 'available',
        reason: null,
        snapshot: {
          freshness: { generated_at_ms: Date.now(), ttl_ms: 5000 },
          session: {
            local_car_index: 1023,
            focused_car_index: 1024,
            is_replay: false,
            session_type: 1,
          },
          cars: [
            {
              car_index: 1023,
              car_class: null,
              drivers: [],
              has_identity: true,
              has_realtime: true,
            },
            {
              car_index: 1024,
              car_class: null,
              drivers: [],
              has_identity: true,
              has_realtime: true,
              kmh: 181,
              gear: 4,
              laps: 2,
              delta_ms: -400,
              car_location: 1,
              current_lap: { lap_type: 'regular' },
            },
          ],
        },
      }),
      onFocusedCarStateUpdate: vi.fn((callback: (value: unknown) => void) => {
        pushFocused = callback
        return offFocused
      }),
    }
    const telemetry = useOverlayTelemetrySource(() => api)

    telemetry.startFastStatePolling()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(api.getFastState).toHaveBeenCalledOnce()
    expect(api.getFocusedCarState).toHaveBeenCalledOnce()
    expect(telemetry.source.value).toBe('focused')
    expect(telemetry.fastState.value).toMatchObject({
      speedKmh: 181,
      gear: 4,
      gas: null,
      fuelL: null,
      info: { delta: { ms: -400, ratio: 0.8, available: true } },
    })

    pushFocused?.({
      status: 'available',
      reason: null,
      snapshot: {
        freshness: { generated_at_ms: Date.now(), ttl_ms: 5000 },
        session: {
          local_car_index: 1023,
          focused_car_index: 1024,
          is_replay: false,
          session_type: 2,
        },
        focused_pit_exit_traffic: { available: true, reason: null, count: 2 },
        cars: [
          {
            car_index: 1024,
            car_class: null,
            drivers: [],
            has_identity: true,
            has_realtime: true,
            kmh: 204,
            gear: 5,
            laps: 2,
            delta_ms: -200,
            car_location: 1,
            current_lap: { lap_type: 'regular' },
          },
        ],
      },
    })
    expect(telemetry.fastState.value).toMatchObject({
      speedKmh: 204,
      gear: 5,
      info: { delta: { ms: -200, ratio: 0.4, available: true }, pitExitTraffic: 2 },
    })
    expect(api.getFocusedCarState).toHaveBeenCalledOnce()

    pushFocused?.({ status: 'unavailable', reason: 'stale', snapshot: null })
    await Promise.resolve()
    expect(telemetry.source.value).toBe('focused')
    expect(telemetry.fastState.value).toMatchObject({
      speedKmh: null,
      gear: null,
      gas: null,
      brake: null,
      fuelL: null,
    })

    telemetry.stopFastStatePolling()
    expect(offFast).toHaveBeenCalledOnce()
    expect(offFocused).toHaveBeenCalledOnce()
  })
})
