import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'
import { useStandingsState } from '~/composables/useStandingsState'
import {
  isHudWindowActive,
  resetHudWindowActivityForTests,
  watchHudWindowActivity,
} from '~/services/overlay/hudWindowActivity'

function makeApi() {
  let visibility: ((visible: boolean) => void) | null = null
  let fastPush: ((state: unknown) => void) | null = null
  const api = {
    onHudOverlayVisibility: vi.fn((callback: (visible: boolean) => void) => { visibility = callback }),
    getFastState: vi.fn(async () => null),
    onFastStateUpdate: vi.fn((callback: (state: unknown) => void) => { fastPush = callback; return () => { fastPush = null } }),
    getLiveState: vi.fn(async () => null),
    getStandingsState: vi.fn(async () => ({ status: 'unavailable', reason: 'test', snapshot: null })),
  }
  return {
    api,
    setVisible: (visible: boolean) => visibility?.(visible),
    pushFast: (state: unknown = null) => fastPush?.(state),
  }
}

beforeEach(() => {
  resetHudWindowActivityForTests()
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
})
afterEach(() => { vi.useRealTimers() })

describe('hudWindowActivity (PIP-427)', () => {
  it('is active by default and stays active where the main process sends nothing', () => {
    expect(isHudWindowActive()).toBe(true)
    const stop = watchHudWindowActivity(() => null, () => {})
    watchHudWindowActivity(() => ({}), () => {})
    expect(isHudWindowActive()).toBe(true)
    stop()
  })

  it('subscribes once per window and notifies only real changes', () => {
    const { api, setVisible } = makeApi()
    const first = vi.fn()
    const second = vi.fn()
    const removeFirst = watchHudWindowActivity(() => api, first)
    watchHudWindowActivity(() => api, second)
    expect(api.onHudOverlayVisibility).toHaveBeenCalledTimes(1)

    setVisible(true)
    expect(first).not.toHaveBeenCalled()
    setVisible(false)
    expect(isHudWindowActive()).toBe(false)
    setVisible(false)
    expect(first.mock.calls).toEqual([[false]])
    removeFirst()
    setVisible(true)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second.mock.calls).toEqual([[false], [true]])
  })
})

describe('pollers of a hidden HUD do no work and resume from a fresh pull', () => {
  it('fast state: no polling while hidden, immediate pull on reveal', async () => {
    const { api, setVisible } = makeApi()
    const poller = useFastStatePoller(() => api)
    await poller.startFastStatePolling()
    expect(api.getFastState).toHaveBeenCalledTimes(1)

    setVisible(false)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(api.getFastState).toHaveBeenCalledTimes(1)

    setVisible(true)
    expect(api.getFastState).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(250)
    expect(api.getFastState).toHaveBeenCalledTimes(3)

    poller.stopFastStatePolling()
    setVisible(false); setVisible(true)
    expect(api.getFastState).toHaveBeenCalledTimes(3)
  })

  it('fast state: polling is only the safety net of the push', async () => {
    const { api, pushFast } = makeApi()
    const poller = useFastStatePoller(() => api)
    await poller.startFastStatePolling()
    // Pushes keep flowing: every poll would be a duplicate.
    for (let elapsed = 0; elapsed < 3_000; elapsed += 100) {
      pushFast()
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(api.getFastState).toHaveBeenCalledTimes(1)
    // The push goes silent: polling resumes before the 2 s freshness threshold.
    await vi.advanceTimersByTimeAsync(1_250)
    expect(api.getFastState.mock.calls.length).toBeGreaterThanOrEqual(2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(api.getFastState.mock.calls.length).toBeGreaterThanOrEqual(5)
    poller.stopFastStatePolling()
  })

  it('fast state: windows without a push channel keep the 250 ms polling', async () => {
    const { api } = makeApi()
    const poller = useFastStatePoller(() => ({ getFastState: api.getFastState }))
    await poller.startFastStatePolling()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(api.getFastState).toHaveBeenCalledTimes(5)
    poller.stopFastStatePolling()
  })

  it('live state and standings follow the same rule', async () => {
    const { api, setVisible } = makeApi()
    const live = useLiveStatePoller(() => api)
    const standings = useStandingsState(() => api)
    live.startLiveStatePolling()
    standings.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.getLiveState).toHaveBeenCalledTimes(1)
    expect(api.getStandingsState).toHaveBeenCalledTimes(1)

    setVisible(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.getLiveState).toHaveBeenCalledTimes(1)
    expect(api.getStandingsState).toHaveBeenCalledTimes(1)

    setVisible(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.getLiveState).toHaveBeenCalledTimes(2)
    expect(api.getStandingsState).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(api.getLiveState).toHaveBeenCalledTimes(3)

    live.stopLiveStatePolling()
    standings.stop()
  })
})
