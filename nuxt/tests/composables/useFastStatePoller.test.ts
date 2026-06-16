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
    speed_kmh: 132.4,
    gas: 0.7,
    brake: 0.1,
    tyres: [
      { id: 'FL', wheel_slip: 0.4, wheel_slip_scaled: 4, slip_band: 'white', pressure_psi: 27.1, core_temp_c: 78.2 },
      { id: 'FR', wheel_slip: 1.2, wheel_slip_scaled: 12, slip_band: 'green', pressure_psi: 27.3, core_temp_c: 78.4 },
      { id: 'RL', wheel_slip: 1.45, wheel_slip_scaled: 14.5, slip_band: 'yellow', pressure_psi: 27.8, core_temp_c: 79.1 },
      { id: 'RR', wheel_slip: 1.8, wheel_slip_scaled: 18, slip_band: 'red', pressure_psi: 28.0, core_temp_c: 79.4 },
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
    expect(fastState.value.gas).toBe(0.7)
    expect(fastState.value.tyres.map(t => t.id)).toEqual(['FL', 'FR', 'RL', 'RR'])
    expect(fastState.value.tyres.map(t => t.slipBand)).toEqual(['white', 'green', 'yellow', 'red'])
    expect(fastState.value.tyres[2]?.wheelSlipScaled).toBe(14.5)
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
