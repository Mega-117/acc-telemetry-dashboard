// @vitest-environment jsdom
import { ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useOverlaySize } from '~/composables/useOverlaySize'

let controller: ReturnType<typeof useOverlaySize>
afterEach(() => { controller?.cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '' })
function setup(height = 950, displayHeight = 1080) {
  document.body.innerHTML = '<div id="root"><section class="overlay-card"><div class="overlay-content"><div class="launcher-tools"></div></div></section></div>'
  const root = document.querySelector<HTMLElement>('#root')!
  const surface = root.querySelector<HTMLElement>('.overlay-content')!
  surface.getBoundingClientRect = () => ({ width: 282, height: 400 } as DOMRect)
  Object.defineProperty(surface, 'scrollHeight', { configurable: true, get: () => height })
  const api = { trainingOverlaySetSize: vi.fn(async (size: any) => ({ ...size, height: Math.min(size.height, displayHeight) })), trainingOverlayCommitSize: vi.fn() }
  controller = useOverlaySize(() => api, () => 'launcher', ref(root))
  return { root, surface, api, setHeight: (value: number) => { height = value } }
}
it('expands fuel beyond 780px and honours actual display limit without duplicate IPC', async () => {
  const { api } = setup(1250, 1080)
  await controller.applyOverlaySize()
  expect(api.trainingOverlaySetSize).toHaveBeenCalledWith({ preset: 'launcher', width: 332, height: 1300 })
  expect(controller.cardSize.value?.height).toBe(1060)
  await controller.applyOverlaySize('launcher', true)
  expect(controller.cardSize.value?.height).toBe(1060)
  expect(api.trainingOverlaySetSize).toHaveBeenCalledTimes(1)
})
it('observes natural content and details changes even while root size is fixed', async () => {
  vi.useFakeTimers()
  const observe = vi.fn(), disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class { observe = observe; disconnect = disconnect })
  const { root, surface, api } = setup()
  controller.connectResizeObserver()
  expect(observe).toHaveBeenCalledWith(surface.firstElementChild)
  surface.firstElementChild!.append(document.createElement('details'))
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(50)
  expect(api.trainingOverlaySetSize).toHaveBeenCalled()
  expect(observe).toHaveBeenCalledWith(root)
  controller.cleanup()
  expect(disconnect).toHaveBeenCalled()
})
