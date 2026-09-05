import { computed, readonly } from 'vue'
import {
  createGamepadSnapshot,
  EMPTY_WHEEL_BINDINGS,
  matchingWheelActions,
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

let animationFrame: number | null = null
let removeStateListener: (() => void) | null = null
let lastSignature = ''

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
  }))
  const testMode = useState<boolean>('wheel-controls-test-mode', () => false)
  const currentSnapshot = useState<WheelInputSnapshot>('wheel-controls-snapshot', () => ({
    mode: 'active',
    devices: [],
  }))

  const applyState = (next: WheelControlsState | null | undefined) => {
    if (next) state.value = next
  }

  // The renderer stays a mute sensor: it forwards whatever the pads report and lets the
  // main process decide what counts as a press, so that rule lives in exactly one place.
  // The loop always reschedules itself, so a momentarily missing bridge cannot kill it.
  const poll = () => {
    const api = controlsApi()
    if (api && typeof navigator.getGamepads === 'function') {
      const snapshot = createGamepadSnapshot(navigator.getGamepads(), testMode.value ? 'test' : 'active')
      currentSnapshot.value = snapshot
      const signature = wheelSnapshotSignature(snapshot)
      if (signature !== lastSignature) {
        lastSignature = signature
        void api.controlsReportSnapshot(snapshot).then(applyState)
      }
    }
    animationFrame = window.requestAnimationFrame(poll)
  }

  const start = async () => {
    const api = controlsApi()
    if (!api || animationFrame !== null) return false
    applyState(await api.controlsGetState())
    removeStateListener = api.onControlsState(applyState)
    lastSignature = ''
    animationFrame = window.requestAnimationFrame(poll)
    return true
  }

  const stop = () => {
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
    animationFrame = null
    removeStateListener?.()
    removeStateListener = null
    lastSignature = ''
  }

  const beginCapture = async (action: WheelControlAction) => {
    const api = controlsApi()
    if (!api) return
    testMode.value = false
    applyState(await api.controlsBeginCapture(action))
  }

  const cancelCapture = async () => {
    const api = controlsApi()
    if (!api) return
    applyState(await api.controlsCancelCapture())
  }

  const clearBinding = async (action: WheelControlAction) => {
    const api = controlsApi()
    if (!api) return
    applyState(await api.controlsClearBinding(action))
  }

  const setTestMode = (enabled: boolean) => {
    testMode.value = enabled
    lastSignature = ''
  }

  const testedActions = computed(() => testMode.value
    ? matchingWheelActions(state.value.bindings, currentSnapshot.value)
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
  }
}
