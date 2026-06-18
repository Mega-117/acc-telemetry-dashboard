import { describe, it, expect, vi } from 'vitest'
import { useHudOverlay } from '~/composables/useHudOverlay'

function makeApi() {
  return {
    hudOverlayGetSettings: vi.fn().mockResolvedValue({ enabled: true, bounds: null }),
    hudOverlaySetMousePassthrough: vi.fn(),
    hudOverlaySetSize: vi.fn(),
    hudOverlayConfirmPlacement: vi.fn().mockResolvedValue({ enabled: true, bounds: { x: 1, y: 2, width: 3, height: 4 } }),
  }
}

describe('useHudOverlay', () => {
  it('passa l\'overlayId corretto a tutte le chiamate IPC', async () => {
    const api = makeApi()
    const hud = useHudOverlay('tyres', () => api)

    await hud.loadSettings()
    expect(api.hudOverlayGetSettings).toHaveBeenCalledWith('tyres')

    hud.setPassthrough(true)
    expect(api.hudOverlaySetMousePassthrough).toHaveBeenCalledWith('tyres', true)
  })

  it('enterPlacement attiva il placement e cattura il mouse', () => {
    const api = makeApi()
    const hud = useHudOverlay('sectors', () => api)

    hud.enterPlacement()
    expect(hud.isPlacing.value).toBe(true)
    expect(api.hudOverlaySetMousePassthrough).toHaveBeenCalledWith('sectors', false)
  })

  it('confirmPlacement conferma, esce dal placement e torna click-through', async () => {
    const api = makeApi()
    const hud = useHudOverlay('tyres', () => api)

    hud.enterPlacement()
    await hud.confirmPlacement()

    expect(api.hudOverlayConfirmPlacement).toHaveBeenCalledWith('tyres')
    expect(hud.isPlacing.value).toBe(false)
    expect(api.hudOverlaySetMousePassthrough).toHaveBeenLastCalledWith('tyres', true)
  })

  it('requestSize invia dimensioni arrotondate, ignora misure non valide', () => {
    const api = makeApi()
    const hud = useHudOverlay('tyres', () => api)

    hud.requestSize({ width: 100.2, height: 50.9 })
    expect(api.hudOverlaySetSize).toHaveBeenCalledWith('tyres', { width: 101, height: 51 })

    api.hudOverlaySetSize.mockClear()
    hud.requestSize({ width: 0, height: 0 })
    expect(api.hudOverlaySetSize).not.toHaveBeenCalled()
  })

  it('hover toggle il passthrough solo fuori dal placement', () => {
    const api = makeApi()
    const hud = useHudOverlay('tyres', () => api)

    hud.onSurfaceEnter()
    expect(api.hudOverlaySetMousePassthrough).toHaveBeenLastCalledWith('tyres', false)
    hud.onSurfaceLeave()
    expect(api.hudOverlaySetMousePassthrough).toHaveBeenLastCalledWith('tyres', true)

    // In placement l'hover non deve toccare il passthrough.
    api.hudOverlaySetMousePassthrough.mockClear()
    hud.enterPlacement()
    api.hudOverlaySetMousePassthrough.mockClear()
    hud.onSurfaceLeave()
    expect(api.hudOverlaySetMousePassthrough).not.toHaveBeenCalled()
  })

  it('start misura e sincronizza la dimensione in Electron', () => {
    const api = makeApi()
    const hud = useHudOverlay('tyres', () => api)
    const el = { getBoundingClientRect: () => ({ width: 240, height: 150 }) } as unknown as HTMLElement

    hud.start(el)
    expect(hud.isElectron.value).toBe(true)
    expect(api.hudOverlaySetSize).toHaveBeenCalledWith('tyres', { width: 240, height: 150 })
    hud.stop()
  })

  it('in web mode (nessuna API) non lancia e resta inerte', async () => {
    const hud = useHudOverlay('tyres', () => null)

    expect(() => hud.start(null)).not.toThrow()
    expect(hud.isElectron.value).toBe(false)
    hud.setPassthrough(true)
    hud.requestSize({ width: 10, height: 10 })
    await expect(hud.confirmPlacement()).resolves.toBeUndefined()
    await expect(hud.loadSettings()).resolves.toBeNull()
  })
})
