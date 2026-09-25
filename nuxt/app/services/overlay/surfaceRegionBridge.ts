const EVENTS: Record<string, string> = {
  onHudOverlayPlacement: 'hud-overlay:placement',
  onHudOverlayScale: 'hud-overlay:scale',
  onHudOverlaySettings: 'hud-overlay:settings',
  onHudOverlayDiagnostics: 'hud-overlay:diagnostics',
  onOverlayInteractionPointerState: 'overlay-interaction:pointer-state',
  onTrainingOverlayCommand: 'training-overlay-command',
  onPitwallIntentState: 'pitwall:intent-state',
}

export function createSurfaceRegionBridge(api: any, id: string) {
  const bridge = { ...api }
  bridge.overlayRegionId = id
  for (const [method, channel] of Object.entries(EVENTS)) {
    bridge[method] = (callback: (payload: unknown) => void) => api.onOverlaySurfaceEvent((event: any) => {
      if (event.id === id && event.channel === channel) callback(event.payload)
    })
  }
  bridge.overlayInteractionUpdateContract = (contract: unknown) => api.overlaySurfaceInteraction(id, 'update', contract)
  bridge.overlayInteractionClearContract = () => api.overlaySurfaceInteraction(id, 'clear')
  bridge.overlayInteractionPointerButton = (down: boolean) => api.overlaySurfaceInteraction(id, 'button', down)
  return bridge
}
