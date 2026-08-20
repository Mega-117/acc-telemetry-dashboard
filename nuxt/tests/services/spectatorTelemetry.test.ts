import { describe, expect, it } from 'vitest'
import type { FastOverlayState } from '../../app/composables/useFastStatePoller'
import type { StandingsStateEnvelope } from '../../app/services/overlay/standingsPresentation'
import {
  emptyFocusedInfoDeltaAccumulator,
  routeOverlayTelemetry,
  trackFocusedInfoDelta,
} from '../../app/services/overlay/spectatorTelemetry'

const local = {
  dataSource: 'local',
  context: {
    track: 'kyalami',
    car: 'amr_v8_vantage_gt3',
    sessionType: 2,
    sessionIndex: 0,
    sessionUid: 'weekend',
    serverId: 'server',
  },
  info: null,
  speedKmh: 0,
  gear: 0,
  gas: 0.7,
  brake: 0.2,
  fuelL: 62,
  tyres: [{ id: 'FL', pressurePsi: 27.4 }],
} as FastOverlayState

function envelope(focusedCarIndex = 1024): StandingsStateEnvelope {
  return {
    status: 'available',
    reason: null,
    snapshot: {
      freshness: { generated_at_ms: 1_786_000_000_000, ttl_ms: 5000 },
      session: {
        local_car_index: 1023,
        focused_car_index: focusedCarIndex,
        is_replay: false,
        session_index: 0,
        session_type: 10,
        session_time_ms: 60_000,
        session_end_time_ms: 600_000,
        best_session_lap_ms: 88_000,
        weather: { rain_level: 0 },
      },
      cars: [
        {
          car_index: 1023,
          car_class: null,
          drivers: [{ first_name: 'Enrico', last_name: 'Saiani' }],
          has_identity: true,
          has_realtime: true,
          kmh: 0,
          gear: 0,
        },
        {
          car_index: 1024,
          car_class: null,
          drivers: [{ first_name: 'Jakub', last_name: 'Ivanko' }],
          has_identity: true,
          has_realtime: true,
          position: 1,
          laps: 3,
          spline_position: 0.812,
          kmh: 239,
          gear: 5,
          car_location: 1,
          stint_elapsed_ms: 75_000,
          current_lap_ms: 44_000,
          last_lap_ms: 112_267,
          best_lap_ms: 110_912,
          current_lap: {
            time_ms: 44_000,
            splits_ms: [30_000, null, null],
            is_invalid: false,
            lap_type: 'regular',
          },
          last_lap: {
            time_ms: 112_267,
            splits_ms: [31_000, 38_000, 43_267],
            is_invalid: false,
          },
          best_lap: {
            time_ms: 110_912,
            splits_ms: [29_800, 37_500, 43_612],
            is_invalid: false,
          },
        },
      ],
    },
  }
}

describe('spectator telemetry routing', () => {
  it('mantiene la telemetria locale quando il focus coincide con il pilota utente', () => {
    const result = routeOverlayTelemetry(local, envelope(1023))
    expect(result.source).toBe('local')
    expect(result.fastState).toBe(local)
    expect(result.sectorHud).toBeNull()
  })

  it('fonde i fatti Info broadcast anche quando il focus coincide con il pilota utente', () => {
    const localWithInfo = {
      ...local,
      info: {
        delta: { ms: -120, available: true, side: 'negative', ratio: 0.24, purple: false },
        stintTimeLeftMs: 951_000,
        fuelLabel: 'Last-Stint',
        fuelNeededL: null,
        fuelLeftTimeMs: 2_100_000,
        fuelLeftReferenceLapMs: 90_000,
        incidents: 0,
        grip: 'Optimum',
        pitExitTraffic: null,
        optimalLapTimeMs: null,
        bestLapTimeMs: 90_000,
        damageTimeMs: 0,
        currentLapTimeMs: 45_000,
        lastLapTimeMs: 90_000,
        lapValid: true,
        lastLapValid: true,
        lapsCompleted: 3,
      },
    } as FastOverlayState
    const state = envelope(1023)
    state.snapshot!.cars[0].stint_elapsed_ms = 413_000
    state.snapshot!.focused_pit_exit_traffic = {
      available: true,
      reason: null,
      count: 2,
      rear_window: 0.07,
      front_window: 0.03,
    }

    const result = routeOverlayTelemetry(localWithInfo, state)

    expect(result.source).toBe('local')
    expect(result.fastState.info).toMatchObject({
      stintTimeLeftMs: 413_000,
      pitExitTraffic: 2,
      fuelLabel: 'Last-Stint',
      fuelLeftTimeMs: 2_100_000,
      grip: 'Optimum',
    })
  })

  it('sostituisce il timer stint locale con placeholder se il broadcast non lo prova', () => {
    const localWithInfo = {
      ...local,
      info: {
        delta: { ms: 0, available: false, side: 'zero', ratio: 0, purple: false },
        stintTimeLeftMs: 951_000,
      },
    } as FastOverlayState

    expect(routeOverlayTelemetry(localWithInfo, envelope(1023)).fastState.info?.stintTimeLeftMs).toBeNull()
  })

  it('riproduce a 50 Hz i fatti broadcast senza sovrascrivere gli altri campi Info locali', () => {
    const localWithInfo = {
      ...local,
      info: {
        delta: { ms: -120, available: true, side: 'negative', ratio: 0.24, purple: false },
        stintTimeLeftMs: null,
        fuelLabel: 'Last-Stint',
        fuelNeededL: 3.5,
        fuelLeftTimeMs: 2_100_000,
        fuelLeftReferenceLapMs: 90_000,
        incidents: 4,
        grip: 'Optimum',
        pitExitTraffic: null,
        optimalLapTimeMs: 89_500,
        bestLapTimeMs: 90_000,
        damageTimeMs: 1_200,
        currentLapTimeMs: 45_000,
        lastLapTimeMs: 90_000,
        lapValid: true,
        lastLapValid: true,
        lapsCompleted: 3,
      },
    } as FastOverlayState

    const samples = Array.from({ length: 50 }, (_, index) => {
      const state = envelope(1023)
      state.snapshot!.freshness.generated_at_ms += index * 20
      state.snapshot!.cars[0].stint_elapsed_ms = index * 20
      state.snapshot!.focused_pit_exit_traffic = index < 25
        ? { available: false, reason: 'not-at-pit-exit', count: null, rear_window: 0.07, front_window: 0.03 }
        : { available: true, reason: null, count: 2, rear_window: 0.07, front_window: 0.03 }
      return routeOverlayTelemetry(localWithInfo, state).fastState.info
    })

    expect(samples[0]).toMatchObject({ stintTimeLeftMs: 0, pitExitTraffic: null })
    expect(samples[24]).toMatchObject({ stintTimeLeftMs: 480, pitExitTraffic: null })
    expect(samples[25]).toMatchObject({ stintTimeLeftMs: 500, pitExitTraffic: 2 })
    expect(samples[49]).toMatchObject({
      stintTimeLeftMs: 980,
      pitExitTraffic: 2,
      fuelLabel: 'Last-Stint',
      fuelLeftTimeMs: 2_100_000,
      incidents: 4,
      grip: 'Optimum',
      optimalLapTimeMs: 89_500,
      damageTimeMs: 1_200,
    })
  })

  it('usa soltanto i campi UDP provati per la macchina osservata', () => {
    const result = routeOverlayTelemetry(local, envelope())
    expect(result.source).toBe('focused')
    expect(result.focusedCar).toMatchObject({ car_index: 1024, position: 1 })
    expect(result.fastState).toMatchObject({
      dataSource: 'focused',
      speedKmh: 239,
      gear: 5,
      lapsCompleted: 3,
      normalizedCarPosition: 0.812,
      currentLapTimeMs: 44_000,
      lastLapTimeMs: 112_267,
      bestLapTimeMs: 110_912,
      sessionTimeLeftMs: 600_000,
      sessionType: 2,
      info: { stintTimeLeftMs: 75_000 },
    })
  })

  it('usa session_end_time_ms come countdown ACC senza sottrarre session_time_ms', () => {
    const first = envelope()
    expect(routeOverlayTelemetry(local, first).fastState.sessionTimeLeftMs).toBe(600_000)

    first.snapshot!.session.session_time_ms = 120_000
    expect(routeOverlayTelemetry(local, first).fastState.sessionTimeLeftMs).toBe(600_000)

    delete first.snapshot!.session.session_time_ms
    expect(routeOverlayTelemetry(local, first).fastState.sessionTimeLeftMs).toBeNull()
  })

  it('non presenta fisica locale come appartenente al pilota osservato', () => {
    const state = routeOverlayTelemetry(local, envelope()).fastState
    expect(state.gas).toBeNull()
    expect(state.brake).toBeNull()
    expect(state.fuelL).toBeNull()
    expect(state.rpm).toBeNull()
    expect(state.tyres).toEqual([])
    expect(state.info).toMatchObject({
      stintTimeLeftMs: 75_000,
      fuelLabel: 'Stint-Fuel',
      fuelNeededL: null,
      fuelLeftReferenceLapMs: null,
      optimalLapTimeMs: null,
      damageTimeMs: null,
      incidents: null,
      delta: { available: false },
    })
  })

  it('mantiene il placeholder Stint se il core non ha osservato un inizio affidabile', () => {
    const state = envelope()
    delete state.snapshot!.cars[1].stint_elapsed_ms
    expect(routeOverlayTelemetry(local, state).fastState.info?.stintTimeLeftMs).toBeNull()
  })

  it('mantiene Q-Fuel fuori gara senza inventare dati fuel remoti', () => {
    const state = envelope()
    state.snapshot!.session.session_type = 4
    const info = routeOverlayTelemetry(local, state).fastState.info
    expect(info).toMatchObject({
      fuelLabel: 'Q-Fuel',
      fuelNeededL: null,
      fuelLeftTimeMs: null,
      fuelLeftReferenceLapMs: null,
    })
    expect(routeOverlayTelemetry(local, state).fastState.sessionType).toBe(1)
  })

  it('usa Delta e Pit Exit soltanto dal payload della macchina osservata', () => {
    const state = envelope()
    const focused = state.snapshot!.cars[1]
    focused.delta_ms = -400
    state.snapshot!.focused_pit_exit_traffic = {
      available: true,
      reason: null,
      count: 3,
      rear_window: 0.07,
      front_window: 0.03,
    }

    const info = routeOverlayTelemetry(local, state).fastState.info

    expect(info?.delta).toMatchObject({ ms: -400, available: true, side: 'negative', purple: false })
    expect(info?.pitExitTraffic).toBe(3)
  })

  it('applica colori e gate ACC Drive al Delta focused senza fallback locale', () => {
    const delta = (
      sessionType: number,
      overrides: Record<string, unknown>,
    ) => {
      const state = envelope()
      state.snapshot!.session.session_type = sessionType
      Object.assign(state.snapshot!.cars[1], {
        delta_ms: -400,
        predicted_lap_ms: 87_500,
        engine_running: true,
        car_location: 1,
        ...overrides,
      })
      return routeOverlayTelemetry(local, state).fastState.info!.delta
    }

    expect(delta(4, {})).toMatchObject({ side: 'negative', purple: true })
    expect(delta(10, {})).toMatchObject({ side: 'negative', purple: true })
    expect(delta(2, {})).toMatchObject({ purple: false })
    expect(delta(4, { delta_ms: 400, predicted_lap_ms: 88_500 })).toMatchObject({
      side: 'positive', purple: false,
    })
    expect(delta(4, { delta_ms: 0 })).toMatchObject({ side: 'zero', purple: false })
    expect(delta(4, { predicted_lap_ms: 79_000 })).toMatchObject({ purple: false })
    expect(delta(4, { engine_running: undefined })).toMatchObject({ purple: false })
    expect(delta(4, { predicted_lap_ms: undefined })).toMatchObject({ purple: false })
    expect(delta(4, { car_location: 2 })).toMatchObject({ available: false, purple: false })

    const missingBest = envelope()
    missingBest.snapshot!.cars[1].delta_ms = -400
    missingBest.snapshot!.cars[1].predicted_lap_ms = 87_500
    missingBest.snapshot!.cars[1].engine_running = true
    delete missingBest.snapshot!.session.best_session_lap_ms
    expect(routeOverlayTelemetry(local, missingBest).fastState.info!.delta.purple).toBe(false)
  })

  it('accumula il rapporto Delta per giro e resetta su giro e pit lane', () => {
    const state = envelope()
    const focused = state.snapshot!.cars[1]
    focused.delta_ms = -400
    let tracked = trackFocusedInfoDelta(emptyFocusedInfoDeltaAccumulator(), state, focused)
    expect(tracked.delta).toMatchObject({ ms: -400, ratio: 0.8 })

    focused.delta_ms = -200
    tracked = trackFocusedInfoDelta(tracked.accumulator, state, focused)
    expect(tracked.delta).toMatchObject({ ms: -200, ratio: 0.4 })

    focused.delta_ms = 0
    tracked = trackFocusedInfoDelta(tracked.accumulator, state, focused)
    expect(tracked.delta.available).toBe(false)
    focused.delta_ms = -100
    tracked = trackFocusedInfoDelta(tracked.accumulator, state, focused)
    expect(tracked.delta.ratio).toBe(0.2)

    focused.laps = 4
    tracked = trackFocusedInfoDelta(tracked.accumulator, state, focused)
    expect(tracked.delta.ratio).toBe(0.2)

    focused.car_location = 2
    tracked = trackFocusedInfoDelta(tracked.accumulator, state, focused)
    expect(tracked.accumulator.key).toBeNull()
    expect(tracked.delta.available).toBe(false)
  })

  it('costruisce i tre settori dai soli split current/last/best ricevuti', () => {
    const hud = routeOverlayTelemetry(local, envelope()).sectorHud
    expect(hud).toMatchObject({
      mode: 'running',
      currentSectorIndex: 1,
      currentLapTimeMs: 44_000,
      lastLapTimeMs: 112_267,
      bestLapTimeMs: 110_912,
      lapValid: true,
    })
    expect(hud?.sectors).toEqual([
      expect.objectContaining({ index: 1, state: 'complete', currentMs: 30_000, referenceMs: 31_000, deltaMs: -1000 }),
      expect.objectContaining({ index: 2, state: 'running', currentMs: null, referenceMs: 38_000 }),
      expect.objectContaining({ index: 3, state: 'pending', currentMs: null, bestReferenceMs: 43_612 }),
    ])
  })

  it('resta fail-closed se il provider focused diventa stale durante l osservazione', () => {
    const result = routeOverlayTelemetry(local, {
      status: 'unavailable',
      reason: 'stale',
      snapshot: null,
    }, true)
    expect(result.source).toBe('focused')
    expect(result.fastState).toMatchObject({
      dataSource: 'focused',
      speedKmh: null,
      gear: null,
      gas: null,
      brake: null,
      fuelL: null,
      tyres: [],
    })
  })

  it('usa il locale se nessun focus remoto e mai stato provato', () => {
    const result = routeOverlayTelemetry(local, {
      status: 'unavailable',
      reason: 'not-started',
      snapshot: null,
    })
    expect(result.source).toBe('local')
    expect(result.fastState).toBe(local)
  })
})
