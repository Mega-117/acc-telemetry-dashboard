import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStandingsState } from '../../app/composables/useStandingsState'
import type { StandingsStateEnvelope } from '../../app/services/overlay/standingsPresentation'

const available: StandingsStateEnvelope = {
  status: 'available',
  reason: null,
  snapshot: {
    freshness: { generated_at_ms: 1000, ttl_ms: 5000 },
    session: { focused_car_index: 1, is_replay: false },
    cars: [],
  },
}

describe('useStandingsState', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('legge l’envelope validato dal bridge', async () => {
    const api = { getStandingsState: vi.fn().mockResolvedValue(available) }
    const standings = useStandingsState(() => api)

    await standings.refresh()

    expect(api.getStandingsState).toHaveBeenCalledOnce()
    expect(standings.state.value).toEqual(available)
  })

  it('il push unavailable resetta lo snapshot e stop rimuove il listener', async () => {
    let listener: ((value: unknown) => void) | null = null
    const off = vi.fn()
    const api = {
      getStandingsState: vi.fn().mockResolvedValue(available),
      onStandingsStateUpdate: vi.fn((callback: (value: unknown) => void) => {
        listener = callback
        return off
      }),
    }
    const standings = useStandingsState(() => api)
    standings.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(standings.state.value.status).toBe('available')

    listener!({ status: 'unavailable', reason: 'stale', snapshot: null })
    expect(standings.state.value).toEqual({ status: 'unavailable', reason: 'stale', snapshot: null })

    standings.stop()
    expect(off).toHaveBeenCalledOnce()
  })

  it('degrada su bridge assente, errori e envelope non validi', async () => {
    const missing = useStandingsState(() => null)
    await missing.refresh()
    expect(missing.state.value.reason).toBe('bridge-unavailable')

    const failing = useStandingsState(() => ({ getStandingsState: vi.fn().mockRejectedValue(new Error('denied')) }))
    await failing.refresh()
    expect(failing.state.value.reason).toBe('bridge-error')

    const malformed = useStandingsState(() => ({ getStandingsState: vi.fn().mockResolvedValue({ status: 'available' }) }))
    await malformed.refresh()
    expect(malformed.state.value.reason).toBe('invalid-bridge-envelope')
  })

  it('esegue il pull periodico di sicurezza e lo ferma', async () => {
    vi.useFakeTimers()
    const api = { getStandingsState: vi.fn().mockResolvedValue(available) }
    const standings = useStandingsState(() => api, 250)
    standings.start()
    await Promise.resolve()
    expect(api.getStandingsState).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(api.getStandingsState).toHaveBeenCalledTimes(3)

    standings.stop()
    await vi.advanceTimersByTimeAsync(500)
    expect(api.getStandingsState).toHaveBeenCalledTimes(3)
  })
})
