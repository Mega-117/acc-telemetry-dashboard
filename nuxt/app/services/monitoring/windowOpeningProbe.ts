export interface WindowOpeningProbeApi {
  onOpeningDiagnosticProbe?: (callback: (payload: { id?: unknown }) => void) => (() => void)
  publishOpeningDiagnostic?: (payload: { version: 1, phase: string, id?: string }) => void
}

/** No timer or cloud access: only the primary mounted app answers a main-process challenge. */
export function installWindowOpeningProbe(api?: WindowOpeningProbeApi) {
  let mounted = false
  let disposed = false
  if (!api?.onOpeningDiagnosticProbe || !api.publishOpeningDiagnostic) return { mounted: () => {}, dispose: () => {} }
  const publish = (phase: string, id?: string) => {
    try { api.publishOpeningDiagnostic?.({ version: 1, phase, ...(id ? { id } : {}) }) } catch { /* diagnostics cannot break startup */ }
  }
  let unsubscribe: (() => void) | undefined
  try {
    unsubscribe = api.onOpeningDiagnosticProbe((payload) => {
      if (disposed || !mounted || typeof payload?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(payload.id)) return
      publish('reply', payload.id)
    })
    publish('capability')
  } catch { /* older/partial preload: leave the UI usable */ }
  return {
    mounted: () => { if (!disposed) { mounted = true; publish('mounted') } },
    dispose: () => { disposed = true; try { unsubscribe?.() } catch { /* already destroyed */ } },
  }
}
