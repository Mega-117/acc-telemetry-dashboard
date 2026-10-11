/** Loaded only by the development preview. No reference to the real IPC bridge. */
export function createQuickPanelPreview() {
  return {
    pressure: {
      state: 'unavailable', reason: 'pit_pause_required', consumed: false,
      qaAvailable: true, qaActive: true,
      recommendation: { completed_laps: 3, valid_laps: 3, required_valid_laps: 1, compound: 'DRY', wheels: {} },
      preview: ['FL', 'FR', 'RL', 'RR'].map((wheel, index) => ({
        wheel, averagePsi: 26.3 + index * 0.1, totalLossPsi: 0.4,
        compensatedPsi: 26.7 + index * 0.1, targetPsi: 26.9, clicks: 2 - index,
      })),
    },
    api: {
      trainingOverlayPreviewSetupFuel: async () => ({
        available: true, sessionType: 2,
        plan: { ok: true, contextKey: 'visual-preview', totalLitres: 48 },
      }),
      trainingOverlayGetPitwallState: async () => ({
        state: 'open', roomId: 'visual-preview', available: true, reason: null,
      }),
      friendRequestsGet: async () => ({
        session: 'visual-preview', busy: false, error: null,
        requests: [
          { id: 'demo-1', personId: 'demo-1', nickname: 'Pilota dimostrativo · Endurance Racing Team' },
          { id: 'demo-2', personId: 'demo-2', nickname: 'Secondo pilota' },
          { id: 'demo-3', personId: 'demo-3', nickname: 'Terzo pilota' },
        ],
      }),
    },
  }
}

/** Capture also blocks programmatic wheel-action clicks, which ignore HTML inert. */
export function blockQuickPanelPreviewAction(event: Event, preview: boolean) {
  if (!preview) return
  event.preventDefault()
  event.stopImmediatePropagation()
}
