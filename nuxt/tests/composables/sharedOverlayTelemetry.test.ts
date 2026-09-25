import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, shallowRef, watchEffect } from 'vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useStandingsState } from '~/composables/useStandingsState'
import { stableComputed, retainUnchanged } from '~/services/overlay/stableTelemetry'
import { buildDashboardPresentation, DEFAULT_DASHBOARD_OPTIONS } from '~/utils/dashboardPresentation'

describe('shared overlay telemetry', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000) })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('six region bridges share one read/listener, release independently and dispose the last lease', async () => {
    let push!: (value: unknown) => void
    const off = vi.fn()
    const api = {
      getFastState: vi.fn(async () => ({ ts: Date.now() / 1000, is_live: true, speed_kmh: 12 })),
      onFastStateUpdate: vi.fn(cb => { push = cb; return off }),
    }
    const consumers = Array.from({ length: 6 }, () => useFastStatePoller(() => ({ ...api })))
    await Promise.all(consumers.map(c => c.startFastStatePolling()))
    expect(api.getFastState).toHaveBeenCalledTimes(1)
    expect(api.onFastStateUpdate).toHaveBeenCalledTimes(1)
    expect(consumers[0]!.fastState.value).toBe(consumers[5]!.fastState.value)
    consumers[0]!.stopFastStatePolling()
    consumers[0]!.stopFastStatePolling()
    expect(off).not.toHaveBeenCalled()
    for (let i = 0; i < 20; i++) {
      push({ ts: Date.now() / 1000, is_live: true, speed_kmh: 20 })
      await vi.advanceTimersByTimeAsync(50)
    }
    expect(api.getFastState).toHaveBeenCalledTimes(1)
    expect(consumers[0]!.fastState.value.speedKmh).toBe(12)
    expect(consumers[5]!.fastState.value.speedKmh).toBe(20)
    consumers.slice(1).forEach(c => c.stopFastStatePolling())
    expect(off).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    await consumers[0]!.startFastStatePolling()
    expect(api.getFastState).toHaveBeenCalledTimes(2)
    consumers[0]!.stopFastStatePolling()
  })

  it('a late pull cannot overwrite push, and a hung pull cannot prevent expiry', async () => {
    let resolve!: (value: unknown) => void
    let push!: (value: unknown) => void
    const api = {
      getFastState: vi.fn(() => new Promise(r => { resolve = r })),
      onFastStateUpdate: (cb: typeof push) => { push = cb; return vi.fn() },
    }
    const consumer = useFastStatePoller(() => api)
    const ready = consumer.startFastStatePolling()
    push({ ts: 100, is_live: true, speed_kmh: 30 })
    resolve({ ts: 99, is_live: true, speed_kmh: 1 })
    await ready
    expect(consumer.fastState.value.speedKmh).toBe(30)
    await vi.advanceTimersByTimeAsync(2250)
    expect(api.getFastState).toHaveBeenCalledTimes(2)
    expect(consumer.fastState.value.isFresh).toBe(false)
    consumer.stopFastStatePolling()
    resolve({ ts: Date.now() / 1000, is_live: true, speed_kmh: 99 })
    await Promise.resolve()
    expect(consumer.fastState.value.isFresh).toBe(false)
  })

  it('standings and focused channels remain independent, with coalesced reads and symmetric cleanup', async () => {
    const envelope = { status: 'available', snapshot: { cars: [] } }
    const off = vi.fn()
    const api = {
      getStandingsState: vi.fn(async () => envelope),
      onStandingsStateUpdate: vi.fn(() => off),
      getFocusedCarState: vi.fn(async () => envelope),
      onFocusedCarStateUpdate: vi.fn(() => off),
    }
    const first = useStandingsState(() => api)
    const second = useStandingsState(() => ({ ...api }))
    const focused = useStandingsState(() => api, 250, { pull: 'getFocusedCarState', subscribe: 'onFocusedCarStateUpdate' })
    first.start(); second.start(); focused.start()
    await Promise.all([first.refresh(), second.refresh(), focused.refresh()])
    expect(api.getStandingsState).toHaveBeenCalledTimes(1)
    expect(api.getFocusedCarState).toHaveBeenCalledTimes(1)
    first.stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.getStandingsState).toHaveBeenCalledTimes(2)
    expect(api.getFocusedCarState).toHaveBeenCalledTimes(5)
    second.stop(); focused.stop()
    expect(off).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('manual standings refresh does not create a polling loop', async () => {
    const state = useStandingsState(() => ({ getStandingsState: async () => null }))
    await state.refresh()
    expect(vi.getTimerCount()).toBe(0)
    state.stop()
  })

  it('preserves unchanged branches but never suppresses exact telemetry changes or removed fields', () => {
    const previous = { tyres: [{ pressure: 27.001 }], info: { fuel: 30 }, removed: true }
    const next = retainUnchanged(previous, { tyres: [{ pressure: 27.002 }], info: { fuel: 30 } } as typeof previous)
    expect(next.info).toBe(previous.info)
    expect(next.tyres).not.toBe(previous.tyres)
    expect(next).not.toHaveProperty('removed')
    expect(retainUnchanged(next, structuredClone(next))).toBe(next)
    expect(retainUnchanged({ a: [] }, { a: {} })).toEqual({ a: {} })
  })

  it('Vue presentation consumers skip identical displayed speed while alarms and changed speed propagate', async () => {
    const poller = useFastStatePoller(() => ({ getFastState: async () => ({ ts: 100, is_live: true, speed_kmh: 10.1 }) }))
    await poller.startFastStatePolling()
    const raw = shallowRef(poller.fastState.value)
    const model = stableComputed(() => buildDashboardPresentation(raw.value, DEFAULT_DASHBOARD_OPTIONS))
    const render = vi.fn(() => model.value)
    const stop = watchEffect(render)
    raw.value = { ...raw.value, speedKmh: 10.2 }
    await nextTick()
    expect(render).toHaveBeenCalledTimes(1)
    raw.value = { ...raw.value, speedKmh: 11.2 }
    await nextTick()
    expect(render).toHaveBeenCalledTimes(2)
    raw.value = { ...raw.value, pitLimiterOn: true }
    await nextTick()
    expect(render).toHaveBeenCalledTimes(3)
    stop(); poller.stopFastStatePolling()
  })
})
