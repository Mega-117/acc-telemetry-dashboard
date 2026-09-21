// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, onMounted, provide, ref, watch } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESENTATION_VISIBLE, usePresentationInterval, useWindowPresentationVisibility } from '~/composables/usePresentationVisibility'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useStandingsState } from '~/composables/useStandingsState'
import { useLiveStatePoller } from '~/composables/useLiveStatePoller'
import { stableComputed } from '~/services/overlay/stableTelemetry'
import { useTimedHudPager } from '~/composables/useTimedHudPager'
const cleanup: Array<() => void> = []
function mount(setup: () => any, visible = ref(true)) {
  let value: any
  const Child = defineComponent({ setup() { value = setup(); return () => h('span') } })
  const app = createApp(defineComponent({ setup() { provide(PRESENTATION_VISIBLE, visible); return () => h(Child) } }))
  const host = document.createElement('div'); document.body.append(host); app.mount(host)
  cleanup.push(() => { app.unmount(); host.remove() }); return value
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T12:00:00Z')) })
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); delete (window as any).electronAPI; vi.useRealTimers() })
describe('presentation visibility', () => {
  it('expires a temporary HUD page on resume without hidden progress ticks', () => {
    const visible = ref(true)
    const pager = mount(() => useTimedHudPager({ defaultPage: 'race', temporaryDurationMs: 1000 }), visible)
    pager.selectPage('setup'); vi.advanceTimersByTime(200)
    visible.value = false; const before = pager.progress.value
    vi.advanceTimersByTime(2000)
    expect(pager.progress.value).toBe(before)
    expect(vi.getTimerCount()).toBe(0)
    visible.value = true
    expect(pager.activePage.value).toBe('race'); expect(pager.progress.value).toBe(0)
  })
  it('stops timers and resumes once without replaying hidden ticks', () => {
    const visible = ref(false), tick = vi.fn()
    const activity = mount(() => { const a = usePresentationInterval(tick, 100); onMounted(a.start); return a }, visible)
    vi.advanceTimersByTime(1000); expect(tick).not.toHaveBeenCalled()
    visible.value = true; expect(tick).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(200); expect(tick).toHaveBeenCalledTimes(3)
    visible.value = false; vi.advanceTimersByTime(5000); expect(tick).toHaveBeenCalledTimes(3)
    visible.value = true; expect(tick).toHaveBeenCalledTimes(4)
    activity.stop(); visible.value = false; visible.value = true
    vi.advanceTimersByTime(1000); expect(tick).toHaveBeenCalledTimes(4)
  })
  it('freezes HUD calculations while shared background audio continues, then resumes latest', async () => {
    let push: (v: any) => void = () => {}
    const unsubscribe = vi.fn()
    const api = { getFastState: vi.fn(async () => ({ ts: Date.now() / 1000, is_live: true, speed_kmh: 10 })),
      onFastStateUpdate: vi.fn(cb => { push = cb; return unsubscribe }) }
    const visible = ref(true), build = vi.fn((v: number | null) => v)
    const hud = mount(() => { const p = useFastStatePoller(() => api); const view = stableComputed(() => build(p.fastState.value.speedKmh)); watch(view, () => {}, { immediate: true }); return { p, view } }, visible)
    const audio = mount(() => useFastStatePoller(() => ({ ...api }), true), ref(false))
    await hud.p.startFastStatePolling(); await audio.startFastStatePolling(); await nextTick()
    expect(api.getFastState).toHaveBeenCalledTimes(1)
    visible.value = false; await nextTick(); build.mockClear()
    push({ ts: Date.now() / 1000, is_live: true, speed_kmh: 45 }); await nextTick()
    expect(audio.fastState.value.speedKmh).toBe(45); expect(hud.p.fastState.value.speedKmh).toBe(10)
    expect(build).not.toHaveBeenCalled()
    visible.value = true; await nextTick(); expect(hud.view.value).toBe(45)
    expect(api.onFastStateUpdate).toHaveBeenCalledTimes(1)
    hud.p.stopFastStatePolling(); expect(unsubscribe).not.toHaveBeenCalled()
    audio.stopFastStatePolling(); expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
  it('ignores a live-lap request completed after hide and reads fresh on resume', async () => {
    let resolve: (v: any) => void = () => {}
    const api = { getLiveState: vi.fn(() => new Promise(r => { resolve = r })) }, visible = ref(true)
    const p = mount(() => useLiveStatePoller(() => api), visible)
    p.startLiveStatePolling(); visible.value = false
    resolve({ ts: new Date().toISOString(), current_lap: 1 }); await nextTick(); await nextTick()
    expect(p.liveLap.value.currentLap).toBe(null)
    visible.value = true; resolve({ ts: new Date().toISOString(), current_lap: 4 })
    await nextTick(); await nextTick(); expect(p.liveLap.value.currentLap).toBe(4)
  })
  it('stops standings clock/pulls hidden and resumes current time', async () => {
    const visible = ref(true), api = { getStandingsState: vi.fn(async () => ({ status: 'unavailable', reason: 'test' })) }
    const p = mount(() => useStandingsState(() => api), visible)
    p.start(); await nextTick(); visible.value = false; const before = p.nowMs.value
    vi.advanceTimersByTime(10000); await p.refresh()
    expect(api.getStandingsState).toHaveBeenCalledTimes(1); expect(p.nowMs.value).toBe(before)
    visible.value = true; await nextTick()
    expect(api.getStandingsState).toHaveBeenCalledTimes(2); expect(p.nowMs.value).toBe(Date.now())
  })
  it('shares native events, ignores focus and stale initial visibility replies', async () => {
    let reply: (v: boolean) => void = () => {}, push: (v: boolean) => void = () => {}
    const unsub = vi.fn()
    ;(window as any).electronAPI = { getPresentationVisibility: () => new Promise(r => { reply = r }), onPresentationVisibility: vi.fn(cb => { push = cb; return unsub }) }
    const first = mount(() => useWindowPresentationVisibility()), second = mount(() => useWindowPresentationVisibility())
    push(false); reply(true); await nextTick(); await nextTick()
    expect(first.value).toBe(false); expect(second.value).toBe(false)
    expect((window as any).electronAPI.onPresentationVisibility).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('focus')); expect(first.value).toBe(false)
    push(true); expect(first.value).toBe(true)
    cleanup.splice(0).forEach(fn => fn()); expect(unsub).toHaveBeenCalledTimes(1)
  })
})
