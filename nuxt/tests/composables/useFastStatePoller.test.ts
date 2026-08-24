import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useFastStatePoller } from '~/composables/useFastStatePoller'

function freshTs() {
  return Date.now() / 1000
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function makeState(overrides: Record<string, any> = {}) {
  return {
    ts: freshTs(),
    is_live: true,
    local_driver: {
      car_index: 17,
      first_name: 'Enrico',
      last_name: 'Saiani',
      position: 4,
    },
    is_engine_running: true,
    pit_limiter_on: false,
    session_type: 0,
    flag: 2,
    speed_kmh: 132.4,
    gas: 0.7,
    brake: 0.1,
    current_tyre_set: 3,
    tyre_set_available: true,
    tyre_compound: 'DRY',
    rain_intensity: 0,
    rain_intensity_10min: 1,
    rain_intensity_30min: 3,
    lap_pressure_avg: {
      status: 'available',
      current_tyre_set: 3,
      last_average: { lap: 4, tyre_set: 3, values: { FL: 27.0, FR: 27.1, RL: 27.2, RR: 27.3 } },
    },
    track_reference_phase: 'active',
    track_references_eligible: true,
    tyres: [
      { id: 'FL', wheel_slip: 0.4, wheel_slip_scaled: 4, slip_band: 'white', pressure_psi: 27.1, pressure_loss_psi: 0.04, core_temp_c: 78.2, brake_temp_c: 410.2, brake_compound: 1, pad_life_pct: 99.7, disc_life_pct: 99.9 },
      { id: 'FR', wheel_slip: 1.2, wheel_slip_scaled: 12, slip_band: 'green', slip_state: 'ok', pressure_psi: 27.3, core_temp_c: 78.4 },
      { id: 'RL', wheel_slip: 1.45, wheel_slip_scaled: 14.5, slip_band: 'yellow', slip_state: 'limit', slip_ratio: 0.02, pressure_psi: 27.8, core_temp_c: 79.1 },
      { id: 'RR', wheel_slip: 1.8, wheel_slip_scaled: 18, slip_band: 'red', slip_state: 'lockup', slip_ratio: -0.08, pressure_psi: 28.0, core_temp_c: 79.4 },
    ],
    ...overrides,
  }
}

describe('useFastStatePoller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('normalizza fast_state fresco e attiva il widget gomme', async () => {
    const api = { getFastState: vi.fn(async () => makeState()) }
    const { fastState, isFastStateActive, startFastStatePolling } = useFastStatePoller(() => api)

    startFastStatePolling()
    await flushPromises()

    expect(isFastStateActive.value).toBe(true)
    expect(fastState.value.speedKmh).toBe(132.4)
    expect(fastState.value.sessionType).toBe(0)
    expect(fastState.value.localDriver).toEqual({
      carIndex: 17,
      firstName: 'Enrico',
      lastName: 'Saiani',
      position: 4,
    })
    expect(fastState.value.flag).toBe(2)
    expect(fastState.value.gas).toBe(0.7)
    expect(fastState.value.isEngineRunning).toBe(true)
    expect(fastState.value.pitLimiterOn).toBe(false)
    expect(fastState.value.currentTyreSet).toBe(3)
    expect(fastState.value.tyreCompound).toBe('DRY')
    expect(fastState.value.rainIntensity30Min).toBe(3)
    expect(fastState.value.lapPressureAverage).toEqual({
      status: 'available', lap: 4, tyreSet: 3,
      values: { FL: 27.0, FR: 27.1, RL: 27.2, RR: 27.3 },
    })
    expect(fastState.value.trackReferencePhase).toBe('active')
    expect(fastState.value.trackReferencesEligible).toBe(true)
    expect(fastState.value.tyres.map(t => t.id)).toEqual(['FL', 'FR', 'RL', 'RR'])
    expect(fastState.value.tyres.map(t => t.slipBand)).toEqual(['white', 'green', 'yellow', 'red'])
    expect(fastState.value.tyres.map(t => t.slipState)).toEqual(['ok', 'ok', 'limit', 'lockup'])
    expect(fastState.value.tyres[2]?.slipRatio).toBe(0.02)
    expect(fastState.value.tyres[2]?.wheelSlipScaled).toBe(14.5)
    expect(fastState.value.tyres[0]?.brakeTempC).toBe(410.2)
    expect(fastState.value.tyres[0]?.pressureLossPsi).toBe(0.04)
    expect(fastState.value.tyres[0]?.brakeCompound).toBe(1)
    expect(fastState.value.tyres[0]?.padLifePct).toBe(99.7)
    expect(fastState.value.tyres[0]?.discLifePct).toBe(99.9)
  })

  it('normalizza il danno opzionale e resta compatibile quando manca', async () => {
    const damage = {
      version: 1,
      body: {
        front: { percentage: 24, repair_time_ms: 6780 }, rear: { percentage: 21, repair_time_ms: 2400 },
        left: { percentage: 0, repair_time_ms: 0 }, right: { percentage: 68, repair_time_ms: 7800 },
        repair_time_ms: 9180,
      },
      suspension: {
        FL: { percentage: 16 }, FR: { percentage: 28 }, RL: { percentage: 7 }, RR: { percentage: 19 },
        repair_time_ms: 12800,
      },
      total_repair_time_ms: 21980,
      event_seq: 4,
      event_ts: 12.5,
    }
    const api = { getFastState: vi.fn(async () => makeState({ damage })) }
    const { fastState, startFastStatePolling } = useFastStatePoller(() => api)

    await startFastStatePolling()

    expect(fastState.value.damage).toMatchObject({
      body: { front: { percentage: 24, repairTimeMs: 6780 }, repairTimeMs: 9180 },
      suspension: { FR: { percentage: 28 }, repairTimeMs: 12800 },
      totalRepairTimeMs: 21980, eventSeq: 4, eventTs: 12.5,
    })

    api.getFastState.mockResolvedValueOnce(makeState({ damage: undefined }))
    await vi.advanceTimersByTimeAsync(250)
    expect(fastState.value.damage).toBeNull()
  })

  it('espone una promise che si risolve solo dopo il primo snapshot', async () => {
    let resolveSnapshot: ((state: any) => void) | null = null
    const api = {
      getFastState: vi.fn(() => new Promise(resolve => { resolveSnapshot = resolve })),
    }
    const { fastState, startFastStatePolling } = useFastStatePoller(() => api)

    let firstPollCompleted = false
    const firstPoll = startFastStatePolling().then(() => { firstPollCompleted = true })
    await flushPromises()
    expect(firstPollCompleted).toBe(false)
    expect(fastState.value.localDriver).toBeNull()

    resolveSnapshot!(makeState())
    await firstPoll
    expect(firstPollCompleted).toBe(true)
    expect(fastState.value.localDriver?.carIndex).toBe(17)
  })

  it('normalizza il contratto centralizzato Info e il contesto Target', async () => {
    const api = {
      getFastState: vi.fn(async () => makeState({
        laps_completed: 7,
        current_lap_time_ms: 44_321,
        last_lap_time_ms: 91_234,
        best_lap_time_ms: 90_999,
        lap_valid: true,
        context: {
          track: 'monza',
          car: 'ferrari_296_gt3',
          session_type: 2,
          session_index: 3,
          session_uid: 'session-42',
          server_id: null,
        },
        info: {
          delta: { ms: -456, available: true, side: 'negative', ratio: 1.4, purple: true },
          stint_time_left_ms: 1_200_000,
          fuel_label: 'Q-Fuel',
          fuel_needed_l: 2.7,
          fuel_left_time_ms: 960_000,
          fuel_left_reference_lap_ms: 90_000,
          incidents: 5,
          grip: 'Green',
          pit_exit_traffic: null,
          optimal_lap_time_ms: 90_500,
          best_lap_time_ms: 90_999,
          damage_time_ms: 3_200,
          current_lap_time_ms: 44_321,
          last_lap_time_ms: 91_234,
          lap_valid: true,
          last_lap_valid: false,
          laps_completed: 7,
        },
      })),
    }
    const { fastState, startFastStatePolling } = useFastStatePoller(() => api)

    startFastStatePolling()
    await flushPromises()

    expect(fastState.value.context).toEqual({
      track: 'monza',
      car: 'ferrari_296_gt3',
      sessionType: 2,
      sessionIndex: 3,
      sessionUid: 'session-42',
      serverId: null,
    })
    expect(fastState.value.info?.delta).toEqual({
      ms: -456, available: true, side: 'negative', ratio: 1, purple: true,
    })
    expect(fastState.value.info?.fuelNeededL).toBe(2.7)
    expect(fastState.value.info?.fuelLeftReferenceLapMs).toBe(90_000)
    expect(fastState.value.info?.pitExitTraffic).toBeNull()
    expect(fastState.value.info?.lastLapValid).toBe(false)
    expect(fastState.value.lapsCompleted).toBe(7)
  })

  it('degrada in modo sicuro se la fase riferimenti non e riconosciuta', async () => {
    const api = { getFastState: vi.fn(async () => makeState({ track_reference_phase: 'mystery', track_references_eligible: 1 })) }
    const { fastState, startFastStatePolling } = useFastStatePoller(() => api)

    startFastStatePolling()
    await flushPromises()

    expect(fastState.value.trackReferencePhase).toBeNull()
    expect(fastState.value.trackReferencesEligible).toBe(false)
  })

  it('normalizza sector_hud nello stesso fast snapshot e preserva validita assente', async () => {
    const api = {
      getFastState: vi.fn(async () => makeState({
        lap_valid: undefined,
        info: { lap_valid: undefined },
        sector_hud: {
          version: 1,
          mode: 'last_lap',
          lap: 8,
          last_lap_time_ms: 91_234,
          hold_until_ts: 123.5,
          sectors: [1, 2, 3].map(index => ({ index, state: 'complete', color: 'red' })),
        },
      })),
    }
    const { fastState, startFastStatePolling } = useFastStatePoller(() => api)

    startFastStatePolling()
    await flushPromises()

    expect(fastState.value.lapValid).toBeNull()
    expect(fastState.value.info?.lapValid).toBeNull()
    expect(fastState.value.sectorHud).toMatchObject({
      mode: 'last_lap',
      lap: 8,
      lastLapTimeMs: 91_234,
      lapValid: null,
      holdUntilTs: 123.5,
    })
  })

  it('degrada a sessione sconosciuta quando session_type manca o non e numerico', async () => {
    const api = { getFastState: vi.fn(async () => makeState({ session_type: 'race' })) }
    const { fastState, startFastStatePolling } = useFastStatePoller(() => api)

    startFastStatePolling()
    await flushPromises()

    expect(fastState.value.sessionType).toBeNull()
  })

  it('nasconde il widget se fast_state e stantio', async () => {
    const api = { getFastState: vi.fn(async () => makeState({ ts: freshTs() - 10 })) }
    const { fastState, isFastStateActive, startFastStatePolling } = useFastStatePoller(() => api)

    startFastStatePolling()
    await flushPromises()

    expect(isFastStateActive.value).toBe(false)
    expect(fastState.value.tyres).toEqual([])
  })

  it('non avvia polling se Electron API non espone getFastState', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { isFastStateActive, startFastStatePolling } = useFastStatePoller(() => ({}))

    await startFastStatePolling()

    expect(isFastStateActive.value).toBe(false)
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('usa il push del main senza aspettare il tick successivo', async () => {
    let pushCallback: ((state: any) => void) | null = null
    const unsubscribe = vi.fn()
    const api = {
      getFastState: vi.fn(async () => null),
      onFastStateUpdate: vi.fn((cb: (state: any) => void) => { pushCallback = cb; return unsubscribe }),
    }
    const { fastState, startFastStatePolling, stopFastStatePolling } = useFastStatePoller(() => api)

    startFastStatePolling()
    await flushPromises()
    expect(api.onFastStateUpdate).toHaveBeenCalled()

    pushCallback!(makeState({ speed_kmh: 201.6 }))
    expect(fastState.value.speedKmh).toBe(201.6)
    expect(fastState.value.tyres).toHaveLength(4)

    stopFastStatePolling()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
