export type SurfaceHealthState = { epoch: number; presentationRevision: number }

// Native hidden windows may suspend requestAnimationFrame even without timer
// throttling. Flush layout on two timer turns before allowing the native reveal.
function layoutTurn(callback: FrameRequestCallback) {
  return window.setTimeout(() => {
    document.documentElement.getBoundingClientRect()
    callback(performance.now())
  }, 32)
}

/** Acknowledge prepared layout; never require a visible window to become ready. */
export function createSurfaceHealthReporter(
  report: (epoch: number, revision: number, healthy: boolean) => Promise<unknown>,
  frame: (callback: FrameRequestCallback) => number = layoutTurn,
  cancelFrame: (id: number) => void = id => window.clearTimeout(id),
) {
  let state: SurfaceHealthState | null = null
  let painted: SurfaceHealthState | null = null
  let request: number | null = null
  let stopped = false
  const send = () => {
    if (!stopped && painted) void report(painted.epoch, painted.presentationRevision, true).catch(() => {})
  }
  const timer = setInterval(send, 1000)
  function update(next: SurfaceHealthState) {
    if (stopped || (state?.epoch === next.epoch && state.presentationRevision === next.presentationRevision)) return
    state = { epoch: next.epoch, presentationRevision: next.presentationRevision }
    painted = null
    if (request !== null) cancelFrame(request)
    request = frame(() => {
      request = frame(() => { request = null; painted = state; send() })
    })
  }
  function stop() {
    stopped = true
    clearInterval(timer)
    if (request !== null) cancelFrame(request)
    request = null
  }
  function fail() {
    stop()
    if (state) void report(state.epoch, state.presentationRevision, false).catch(() => {})
  }
  return { update, stop, fail }
}
