// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, provide, ref } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import TrackMapHud from '~/components/overlay/TrackMapHud.vue'
import { PRESENTATION_VISIBLE } from '~/composables/usePresentationVisibility'
import { advanceTrackMapMotion, type TrackMapView } from '~/services/overlay/trackMapPresentation'
vi.mock('~/services/overlay/trackMapPresentation', async importOriginal => {
  const actual = await importOriginal<typeof import('~/services/overlay/trackMapPresentation')>()
  return { ...actual, advanceTrackMapMotion: vi.fn(actual.advanceTrackMapMotion) }
})
let callbacks: Map<number, FrameRequestCallback>, serial: number, at: number
const cleanup: Array<() => void> = []
beforeEach(() => {
  callbacks = new Map(); serial = 0; at = 0; vi.clearAllMocks()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { callbacks.set(++serial, cb); return serial })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
})
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); vi.unstubAllGlobals() })
function mount() {
  const visible = ref(true)
  const view = ref<TrackMapView>({ outlinePath: '', caption: null, markers: [], dots: [{
    carIndex: 1, spline: 0.2, x: 20, y: 0, diameter: 24, fill: '#fff', text: '', opacity: 1,
    label: null, zIndex: 1, isLocal: true, pulse: true,
  }] })
  const outline = Array.from({ length: 1001 }, (_, x) => ({ x, y: 0 }))
  const app = createApp(defineComponent({ setup() {
    provide(PRESENTATION_VISIBLE, visible)
    return () => h(TrackMapHud, { view: view.value, outline })
  } }))
  const host = document.createElement('div'); document.body.append(host); app.mount(host)
  cleanup.push(() => { app.unmount(); host.remove() })
  return { visible, view, host, app }
}
async function frame(ms = 1000 / 144) {
  at += ms; const pending = [...callbacks.values()]; callbacks.clear()
  pending.forEach(cb => cb(at)); await nextTick()
}
it('sleeps when settled, wakes for a changed target, ignores caption-only updates', async () => {
  const { view } = mount()
  expect(callbacks.size).toBe(0)
  view.value = { ...view.value, caption: 'Sosta 30 s' }; await nextTick()
  expect(callbacks.size).toBe(0)
  view.value.dots[0]!.spline = 0.23; await nextTick()
  expect(callbacks.size).toBe(1)
  for (let i = 0; i < 300; i++) await frame()
  expect(callbacks.size).toBe(0)
  const last = vi.mocked(advanceTrackMapMotion).mock.results.at(-1)!.value
  expect(last['car:1']).toBe(0.23)
})
it.each([60, 144, 240])('limits work to about 60 steps/s at %i Hz while following new telemetry', async hz => {
  const { view } = mount()
  for (let i = 0; i < hz; i++) {
    view.value.dots[0]!.spline += 0.0001; await nextTick(); await frame(1000 / hz)
  }
  expect(vi.mocked(advanceTrackMapMotion).mock.calls.length).toBeGreaterThanOrEqual(58)
  expect(vi.mocked(advanceTrackMapMotion).mock.calls.length).toBeLessThanOrEqual(61)
})
it('suspends while hidden, resumes on current position, handles removal and cleans up', async () => {
  const { view, visible, host, app } = mount()
  view.value.dots[0]!.spline = 0.23; await nextTick(); await frame()
  visible.value = false; await nextTick(); expect(callbacks.size).toBe(0)
  view.value.dots[0]!.spline = 0.8; await nextTick(); await frame()
  visible.value = true; await nextTick()
  expect(host.querySelector('.track-map__item')!.getAttribute('style')).toContain('800px')
  view.value.dots = []; await nextTick(); await frame()
  expect(host.querySelector('.track-map__item')).toBeNull()
  expect(callbacks.size).toBe(0)
  app.unmount(); expect(callbacks.size).toBe(0)
})
