import { describe, expect, it, vi } from 'vitest'
import { createSurfaceRegionBridge } from '~/services/overlay/surfaceRegionBridge'

describe('surface region bridge', () => {
  it('binds placement requests to its region and isolates lock events', () => {
    const listeners: Array<(event: any) => void> = []
    const api = { hudOverlaySetPlacement: vi.fn(), hudOverlayGetPlacement: vi.fn(),
      onOverlaySurfaceEvent: (fn: (event: any) => void) => { listeners.push(fn); return vi.fn() } }
    const region = createSurfaceRegionBridge(api, 'training')
    region.hudOverlaySetPlacement('info', true)
    region.hudOverlayGetPlacement()
    expect(api.hudOverlaySetPlacement).toHaveBeenCalledWith('training', true)
    expect(api.hudOverlayGetPlacement).toHaveBeenCalledWith('training')
    const changed = vi.fn(); region.onHudOverlayPlacement(changed)
    listeners.forEach(fn => fn({ id: 'info', channel: 'hud-overlay:placement', payload: true }))
    expect(changed).not.toHaveBeenCalled()
    listeners.forEach(fn => fn({ id: 'training', channel: 'hud-overlay:placement', payload: true }))
    expect(changed).toHaveBeenCalledWith(true)
  })
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
