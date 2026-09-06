// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const initial = () => ({ available: true, bindings: { togglePalette: null, nextAction: null, activateAction: null }, devices: [], capture: null, lastError: null, ambiguousDeviceIds: [] })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}

describe('wheel configuration lifecycle', () => {
  let api: any
  beforeEach(() => {
    vi.resetModules()
    const states = new Map()
    vi.stubGlobal('useState', (key: string, init: () => unknown) => {
      if (!states.has(key)) states.set(key, ref(init()))
      return states.get(key)
    })
    api = {
      controlsGetState: vi.fn().mockResolvedValue(initial()),
      controlsReportSnapshot: vi.fn().mockResolvedValue(initial()),
      controlsBeginCapture: vi.fn(),
      controlsCancelCapture: vi.fn().mockResolvedValue(initial()),
      controlsClearBinding: vi.fn(),
      onControlsState: vi.fn().mockReturnValue(() => {}),
    }
    ;(window as any).electronAPI = api
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); delete (window as any).electronAPI })

  it('waits for pending assignment before cleanup shared by page and panel', async () => {
    const { useWheelInputBridge } = await import('../../app/composables/useWheelInputBridge')
    const pending = deferred<any>()
    api.controlsBeginCapture.mockReturnValue(pending.promise)
    const page = useWheelInputBridge()
    const panel = useWheelInputBridge()
    const begin = panel.beginCapture('togglePalette')
    await Promise.resolve()
    page.setTestMode(true)
    const leave = page.finishConfiguration()
    const unmount = panel.finishConfiguration()
    expect(leave).toBe(unmount)
    expect(page.testMode.value).toBe(false)
    expect(api.controlsCancelCapture).toHaveBeenCalledTimes(1)
    pending.resolve({ ...initial(), capture: { action: 'togglePalette' } })
    await begin
    await leave
    expect(api.controlsCancelCapture).toHaveBeenCalledTimes(2)
    expect(panel.state.value.capture).toBeNull()
  })

  it('handles begin rejection and still cancels; cleanup rejection does not escape', async () => {
    const { useWheelInputBridge } = await import('../../app/composables/useWheelInputBridge')
    const bridge = useWheelInputBridge()
    api.controlsBeginCapture.mockRejectedValue(new Error('ipc'))
    await bridge.beginCapture('togglePalette')
    api.controlsCancelCapture.mockRejectedValue(new Error('ipc'))
    await expect(bridge.finishConfiguration()).resolves.toBeUndefined()
    expect(bridge.state.value.lastError).toBe('controls_unavailable')
  })

  it('keeps the binding returned on failed persistence and uses runtime test matches', async () => {
    const { useWheelInputBridge } = await import('../../app/composables/useWheelInputBridge')
    const binding = { deviceId: 'wheel', deviceLabel: 'wheel', button: 1 }
    api.controlsClearBinding.mockResolvedValue({ ...initial(), bindings: { ...initial().bindings, togglePalette: binding }, lastError: 'settings_write_failed', ambiguousDeviceIds: ['wheel'], testMatches: [] })
    const bridge = useWheelInputBridge()
    await bridge.clearBinding('togglePalette')
    bridge.setTestMode(true)
    expect(bridge.state.value.bindings.togglePalette).toEqual(binding)
    expect(bridge.testedActions.value).toEqual([])
  })

  it('does not apply a late snapshot response after cancellation', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { getGamepads: () => [] })
    const pending = deferred<any>()
    api.controlsReportSnapshot.mockReturnValue(pending.promise)
    const { useWheelInputBridge } = await import('../../app/composables/useWheelInputBridge')
    const bridge = useWheelInputBridge()
    await bridge.start()
    await bridge.finishConfiguration()
    pending.resolve({ ...initial(), capture: { action: 'togglePalette' } })
    await Promise.resolve()
    expect(bridge.state.value.capture).toBeNull()
    bridge.stop()
  })

  it('native owner suppresses browser snapshots and carries the device selection', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { getGamepads: vi.fn(() => []) })
    api.controlsGetState.mockResolvedValue({ ...initial(), inputBackend: 'native' })
    api.controlsBeginCapture.mockResolvedValue({ ...initial(), inputBackend: 'native' })
    const { useWheelInputBridge } = await import('../../app/composables/useWheelInputBridge')
    const bridge = useWheelInputBridge()
    await bridge.start()
    await bridge.beginCapture('nextAction', 'raw:b')
    await vi.advanceTimersByTimeAsync(32)
    expect(api.controlsReportSnapshot).not.toHaveBeenCalled()
    expect(api.controlsBeginCapture).toHaveBeenCalledWith('nextAction', 'raw:b')
    bridge.stop()
  })
})
