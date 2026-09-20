import { describe, expect, it, vi } from 'vitest'
import { createSurfaceRegionBridge } from '~/services/overlay/surfaceRegionBridge'

describe('surface region bridge', () => {
  it('isolates settings and pointer events even with a frozen preload API', () => {
    const listeners: Array<(event: any) => void> = []
    const api = Object.freeze({
      onHudOverlaySettings: vi.fn(),
      onOverlaySurfaceEvent: (callback: (event: any) => void) => { listeners.push(callback); return vi.fn() },
      overlaySurfaceInteraction: vi.fn(),
    })
    const tyre = createSurfaceRegionBridge(api, 'tyres')
    const info = createSurfaceRegionBridge(api, 'info')
    const tyreChanged = vi.fn(); const infoChanged = vi.fn()
    tyre.onHudOverlaySettings(tyreChanged)
    info.onHudOverlaySettings(infoChanged)
    listeners.forEach(fn => fn({ id: 'info', channel: 'hud-overlay:settings', payload: { scale: 1.5 } }))
    expect(infoChanged).toHaveBeenCalledWith({ scale: 1.5 })
    expect(tyreChanged).not.toHaveBeenCalled()
    info.overlayInteractionUpdateContract({ controlRects: [] })
    expect(api.overlaySurfaceInteraction).toHaveBeenCalledWith('info', 'update', { controlRects: [] })
    tyre.overlayInteractionClearContract()
    expect(api.overlaySurfaceInteraction).toHaveBeenCalledWith('tyres', 'clear')
  })
})
