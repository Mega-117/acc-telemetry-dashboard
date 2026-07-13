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
    session_type: 0,
    speed_kmh: 132.4,
    gas: 0.7,
    brake: 0.1,
    track_reference_phase: 'active',
    track_references_eligible: true,
    tyres: [
      { id: 'FL', wheel_slip: 0.4, wheel_slip_scaled: 4, slip_band: 'white', pressure_psi: 27.1, core_temp_c: 78.2 },
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
    expect(fastState.value.gas).toBe(0.7)
    expect(fastState.value.trackReferencePhase).toBe('active')
    expect(fastState.value.trackReferencesEligible).toBe(true)
    expect(fastState.value.tyres.map(t => t.id)).toEqual(['FL', 'FR', 'RL', 'RR'])
    expect(fastState.value.tyres.map(t => t.slipBand)).toEqual(['white', 'green', 'yellow', 'red'])
    expect(fastState.value.tyres.map(t => t.slipState)).toEqual(['ok', 'ok', 'limit', 'lockup'])
    expect(fastState.value.tyres[2]?.slipRatio).toBe(0.02)
    expect(fastState.value.tyres[2]?.wheelSlipScaled).toBe(14.5)
  })

  it('degrada in modo sicuro se la fase riferimenti non e riconosciuta', async () => {
    const api = { getFastState: vi.fn(async () => makeState({ track_reference_phase: 'mystery', track_references_eligible: 1 })) }
    const { fastState, startFastStatePolling } = useFastStatePoller(() => api)

    startFastStatePolling()
    await flushPromises()

    expect(fastState.value.trackReferencePhase).toBeNull()
    expect(fastState.value.trackReferencesEligible).toBe(false)
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

    startFastStatePolling()
    await flushPromises()

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
