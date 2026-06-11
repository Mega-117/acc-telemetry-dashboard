import { ref } from 'vue'

const STOP_HOLD_CONFIRM_MS = 2_000
const STOP_CONFIRM_AUTO_CANCEL_MS = 5_000

/**
 * @description Implements the press-and-hold gesture for stopping an active training session.
 * Drives a progress ref from 0 to 100 over STOP_HOLD_CONFIRM_MS using requestAnimationFrame,
 * then fires the onStopExecuted callback when the hold completes.
 * @param canStop - Guard that must return true before any stop action is processed.
 * @param onStopExecuted - Called once the hold threshold is reached and the session is to be stopped.
 * @param onDebugEvent - Receives debug strings for event tracing in development.
 * @returns Object with stopHoldProgress ref, isShortcutStopConfirmOpen ref, and stop-hold interaction functions.
 */
export function useStopHold(
  canStop: () => boolean,
  onStopExecuted: () => void,
  onDebugEvent: (msg: string) => void,
) {
  const stopHoldProgress = ref(0)
  const isShortcutStopConfirmOpen = ref(false)
  let stopHoldFrame: number | null = null
  let stopHoldStartedAt = 0
  let isKeyboardStopHolding = false
  let confirmAutoCancelHandle: ReturnType<typeof setTimeout> | null = null

  function clearConfirmAutoCancel() {
    if (confirmAutoCancelHandle) { clearTimeout(confirmAutoCancelHandle); confirmAutoCancelHandle = null }
  }

  function cancelStopHold() {
    if (typeof window !== 'undefined' && stopHoldFrame !== null) {
      window.cancelAnimationFrame(stopHoldFrame)
    }
    stopHoldFrame = null
    stopHoldStartedAt = 0
    isKeyboardStopHolding = false
    stopHoldProgress.value = 0
  }

  function closeShortcutStopConfirm() {
    clearConfirmAutoCancel()
    isShortcutStopConfirmOpen.value = false
  }

  function executeStop() {
    onDebugEvent('stop eseguito')
    cancelStopHold()
    closeShortcutStopConfirm()
    onStopExecuted()
  }

  function tick() {
    if (typeof window === 'undefined' || !stopHoldStartedAt) return
    const elapsedMs = Date.now() - stopHoldStartedAt
    stopHoldProgress.value = Math.max(0, Math.min(1, elapsedMs / STOP_HOLD_CONFIRM_MS))
    if (stopHoldProgress.value >= 1) { executeStop(); return }
    stopHoldFrame = window.requestAnimationFrame(tick)
  }

  function startStopHold(source: 'pointer' | 'keyboard' = 'pointer') {
    if (!canStop()) return
    if (stopHoldStartedAt) return
    onDebugEvent(`stop hold start (${source})`)
    isKeyboardStopHolding = source === 'keyboard'
    closeShortcutStopConfirm()
    cancelStopHold()
    isKeyboardStopHolding = source === 'keyboard'
    stopHoldStartedAt = Date.now()
    stopHoldFrame = window.requestAnimationFrame(tick)
  }

  function openShortcutStopConfirm() {
    if (!canStop()) return
    onDebugEvent('stop conferma shortcut aperta')
    cancelStopHold()
    isShortcutStopConfirmOpen.value = true
    clearConfirmAutoCancel()
    confirmAutoCancelHandle = setTimeout(() => {
      onDebugEvent('stop conferma annullata per timeout')
      closeShortcutStopConfirm()
    }, STOP_CONFIRM_AUTO_CANCEL_MS)
  }

  // Two-step da volante/tastiera: prima pressione apre la conferma,
  // seconda pressione dello stesso comando esegue lo stop, timeout annulla.
  function handleGlobalStop() {
    if (!canStop()) return
    onDebugEvent('comando stop globale')
    if (isShortcutStopConfirmOpen.value) { executeStop(); return }
    openShortcutStopConfirm()
  }

  function handleKeyboardStopHold(label = 'stop shortcut') {
    if (!canStop()) return
    onDebugEvent(`${label} down`)
    startStopHold('keyboard')
  }

  function handleKeyboardStopRelease() {
    if (!isKeyboardStopHolding) return
    cancelStopHold()
  }

  return {
    stopHoldProgress,
    isShortcutStopConfirmOpen,
    isKeyboardStopHolding: () => isKeyboardStopHolding,
    startStopHold,
    cancelStopHold,
    closeShortcutStopConfirm,
    openShortcutStopConfirm,
    handleGlobalStop,
    handleKeyboardStopHold,
    handleKeyboardStopRelease,
    executeStop,
  }
}
