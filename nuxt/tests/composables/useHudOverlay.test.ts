import { describe, it, expect, vi } from 'vitest'
import { useHudOverlay } from '~/composables/useHudOverlay'

function makeApi() {
  const cbs: { placement?: (a: boolean) => void; scale?: (s: unknown) => void } = {}
  const api = {
    hudOverlayGetSettings: vi.fn().mockResolvedValue({ enabled: true, locked: true, scale: 1.4, bounds: null }),
    onHudOverlayPlacement: vi.fn((cb: (a: boolean) => void) => { cbs.placement = cb; return () => { cbs.placement = undefined } }),
    onHudOverlayScale: vi.fn((cb: (s: unknown) => void) => { cbs.scale = cb; return () => { cbs.scale = undefined } }),
  }
  return { api, cbs }
}

describe('useHudOverlay', () => {
  it('start imposta isElectron e la scala iniziale, e si iscrive agli eventi', () => {
    const { api } = makeApi()
    const hud = useHudOverlay('tyres', () => api)
    hud.start(1.2)
    expect(hud.isElectron.value).toBe(true)
    expect(hud.scale.value).toBe(1.2)
    expect(api.onHudOverlayPlacement).toHaveBeenCalled()
    expect(api.onHudOverlayScale).toHaveBeenCalled()
  })

  it('la scala iniziale fuori range viene clampata', () => {
    const { api } = makeApi()
    const hud = useHudOverlay('tyres', () => api)
    hud.start(5)
    expect(hud.scale.value).toBe(1.6)
  })

  it('l\'evento placement aggiorna isPlacing', () => {
    const { api, cbs } = makeApi()
    const hud = useHudOverlay('sectors', () => api)
    hud.start(1)
    cbs.placement!(true)
    expect(hud.isPlacing.value).toBe(true)
    cbs.placement!(false)
    expect(hud.isPlacing.value).toBe(false)
  })

  it('l\'evento scale aggiorna la scala (clampata)', () => {
    const { api, cbs } = makeApi()
    const hud = useHudOverlay('tyres', () => api)
    hud.start(1)
    cbs.scale!(1.3)
    expect(hud.scale.value).toBe(1.3)
    cbs.scale!(0.1)
    expect(hud.scale.value).toBe(0.6)
  })

  it('loadSettings legge la scala persistita', async () => {
    const { api } = makeApi()
    const hud = useHudOverlay('tyres', () => api)
    const settings = await hud.loadSettings()
    expect(api.hudOverlayGetSettings).toHaveBeenCalledWith('tyres')
    expect(hud.scale.value).toBe(1.4)
    expect(settings).toMatchObject({ scale: 1.4 })
  })

  it('stop rimuove gli iscritti', () => {
    const off = vi.fn()
    const api = {
      onHudOverlayPlacement: vi.fn(() => off),
      onHudOverlayScale: vi.fn(() => off),
    }
    const hud = useHudOverlay('tyres', () => api)
    hud.start(1)
    hud.stop()
    expect(off).toHaveBeenCalledTimes(2)
  })

  it('in web mode (nessuna API) non lancia e resta inerte', async () => {
    const hud = useHudOverlay('tyres', () => null)
    expect(() => hud.start(1.2)).not.toThrow()
    expect(hud.isElectron.value).toBe(false)
    expect(hud.scale.value).toBe(1.2)
    await expect(hud.loadSettings()).resolves.toBeNull()
    expect(() => hud.stop()).not.toThrow()
  })
})
