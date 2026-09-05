import { computed, readonly } from 'vue'
import {
  createGamepadSnapshot,
  EMPTY_WHEEL_BINDINGS,
  wheelSnapshotSignature,
  type WheelControlAction,
  type WheelControlsState,
  type WheelInputSnapshot,
} from '~/services/controls/wheelBindingModel'

interface WheelControlsApi {
  controlsGetState: () => Promise<WheelControlsState>
  controlsBeginCapture: (action: WheelControlAction) => Promise<WheelControlsState>
  controlsCancelCapture: () => Promise<WheelControlsState>
  controlsClearBinding: (action: WheelControlAction) => Promise<WheelControlsState>
  controlsReportSnapshot: (snapshot: WheelInputSnapshot) => Promise<WheelControlsState>
  onControlsState: (callback: (state: WheelControlsState) => void) => () => void
}

const WHEEL_POLL_INTERVAL_MS = 8

let pollTimer: number | null = null
let removeStateListener: (() => void) | null = null
let lastSignature = ''
// All composable consumers share the same IPC owner and configuration queue.
let configurationQueue: Promise<void> = Promise.resolve()
let cleanupPromise: Promise<void> | null = null
let stateEpoch = 0

function controlsApi(): WheelControlsApi | null {
  if (typeof window === 'undefined') return null
  const api = (window as Window & { electronAPI?: Partial<WheelControlsApi> }).electronAPI
  return api?.controlsReportSnapshot && api.controlsGetState ? api as WheelControlsApi : null
}

export function useWheelInputBridge() {
  const state = useState<WheelControlsState>('wheel-controls-state', () => ({
    available: false,
    bindings: { ...EMPTY_WHEEL_BINDINGS },
    devices: [],
    capture: null,
    lastError: null,
    ambiguousDeviceIds: [],
  }))
  const testMode = useState<boolean>('wheel-controls-test-mode', () => false)
  const currentSnapshot = useState<WheelInputSnapshot>('wheel-controls-snapshot', () => ({
    mode: 'active',
    devices: [],
  }))

  const applyState = (next: WheelControlsState | null | undefined) => {
    if (next) state.value = next
  }

  const reportError = () => {
    state.value = { ...state.value, lastError: 'controls_unavailable', operation: { ok: false, reason: 'controls_unavailable' } }
  }

  const enqueueConfiguration = (operation: () => Promise<WheelControlsState>) => {
    const epoch = stateEpoch
    configurationQueue = configurationQueue.then(async () => {
      try {
        const result = await operation()
        if (epoch === stateEpoch) applyState(result)
      } catch {
        reportError()
      }
    })
    return configurationQueue
  }

  // The renderer stays a mute sensor: it forwards whatever the pads report and lets the
  // main process decide what counts as a press, so that rule lives in exactly one place.
  // A dedicated timer is independent from paint frames, which may stall while ACC is foreground.
  const poll = () => {
    const api = controlsApi()
    if (api && typeof navigator.getGamepads === 'function') {
      const snapshot = createGamepadSnapshot(navigator.getGamepads(), testMode.value ? 'test' : 'active')
      const sampledAtMs = Date.now()
      currentSnapshot.value = snapshot
      const signature = wheelSnapshotSignature(snapshot)
      if (signature !== lastSignature) {
        lastSignature = signature
        // onControlsState is the canonical stream. Late invoke responses must not
        // resurrect a capture that has already been cancelled.
        void api.controlsReportSnapshot({ ...snapshot, sampledAtMs }).catch(reportError)
      }
    }
  }

  const start = async () => {
    const api = controlsApi()
    if (!api || pollTimer !== null) return false
    applyState(await api.controlsGetState())
    removeStateListener = api.onControlsState(applyState)
    lastSignature = ''
    poll()
    pollTimer = window.setInterval(poll, WHEEL_POLL_INTERVAL_MS)
    return true
  }

  const stop = () => {
    if (pollTimer !== null) window.clearInterval(pollTimer)
    pollTimer = null
    removeStateListener?.()
    removeStateListener = null
    lastSignature = ''
  }

  const beginCapture = async (action: WheelControlAction) => {
    const api = controlsApi()
    if (!api) return
    testMode.value = false
    await enqueueConfiguration(() => api.controlsBeginCapture(action))
  }

  const cancelCapture = async () => {
    const api = controlsApi()
    if (!api) return
    await enqueueConfiguration(() => api.controlsCancelCapture())
  }

  const clearBinding = async (action: WheelControlAction) => {
    const api = controlsApi()
    if (!api) return
    await enqueueConfiguration(() => api.controlsClearBinding(action))
  }

  const setTestMode = (enabled: boolean) => {
    testMode.value = enabled
    lastSignature = ''
  }

  const finishConfiguration = (): Promise<void> => {
    setTestMode(false)
    if (cleanupPromise) return cleanupPromise
    stateEpoch++
    const api = controlsApi()
    if (!api) return Promise.resolve()
    // This is queued after any pending beginCapture, even if its response is slow.
    cleanupPromise = enqueueConfiguration(() => api.controlsCancelCapture())
      .finally(() => { cleanupPromise = null })
    return cleanupPromise
  }

  const testedActions = computed(() => testMode.value
    ? state.value.testMatches ?? []
    : [])

  return {
    state: readonly(state),
    testMode: readonly(testMode),
    testedActions,
    start,
    stop,
    beginCapture,
    cancelCapture,
    clearBinding,
    setTestMode,
    finishConfiguration,
  }
}
