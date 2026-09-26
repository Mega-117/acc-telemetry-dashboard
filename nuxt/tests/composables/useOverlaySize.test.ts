// @vitest-environment jsdom
import { ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useOverlaySize } from '~/composables/useOverlaySize'

let controller: ReturnType<typeof useOverlaySize>
it('uses a compact placement preview instead of the old work area', async () => {
  const { root, api } = setup()
  root.innerHTML = '<section class="placement-work-area"></section>'
  await controller.applyOverlaySize('placement', true)
  expect(api.trainingOverlaySetSize).toHaveBeenCalledWith({ preset: 'placement', width: 334, height: 150 })
  expect(controller.cardSize.value).toBeNull()
})
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

it('expands to the preferred horizontal width and returns to vertical without stale size', async () => {
  const { root, surface, api } = setup(300)
  controller.cleanup()
  let horizontal = true
  controller = useOverlaySize(() => api, () => 'launcher', ref(root), () => horizontal ? 810 : 472)
  surface.style.setProperty('--overlay-preferred-content-width', '760px')
  await controller.applyOverlaySize('launcher', true)
  expect(api.trainingOverlaySetSize).toHaveBeenLastCalledWith({ preset: 'launcher', width: 810, height: 450 })
  horizontal = false
  surface.style.removeProperty('--overlay-preferred-content-width')
  await controller.applyOverlaySize('launcher', true)
  expect(api.trainingOverlaySetSize).toHaveBeenLastCalledWith({ preset: 'launcher', width: 332, height: 450 })
})

it('keeps the card inside native bounds when a monitor is narrower than the horizontal layout', async () => {
  const { root, surface, api } = setup(300)
  controller.cleanup()
  api.trainingOverlaySetSize.mockImplementation(async size => ({ ...size, width: 640 }))
  controller = useOverlaySize(() => api, () => 'launcher', ref(root), () => 810)
  surface.style.setProperty('--overlay-preferred-content-width', '760px')
  await controller.applyOverlaySize('launcher', true)
  expect(controller.cardSize.value?.width).toBe(620)
})
