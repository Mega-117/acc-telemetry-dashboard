import { describe, it, expect, vi } from 'vitest'
import { useHudOverlay } from '~/composables/useHudOverlay'

function makeApi() {
  const cbs: { placement?: (a: boolean) => void; format?: (f: unknown) => void } = {}
  const api = {
    hudOverlayGetSettings: vi.fn().mockResolvedValue({ enabled: true, locked: true, format: 'large', bounds: null }),
    onHudOverlayPlacement: vi.fn((cb: (a: boolean) => void) => { cbs.placement = cb; return () => { cbs.placement = undefined } }),
    onHudOverlayFormat: vi.fn((cb: (f: unknown) => void) => { cbs.format = cb; return () => { cbs.format = undefined } }),
  }
  return { api, cbs }
}

describe('useHudOverlay', () => {
  it('start imposta isElectron e il formato iniziale, e si iscrive agli eventi', () => {
    const { api } = makeApi()
    const hud = useHudOverlay('tyres', () => api)
    hud.start('small')
    expect(hud.isElectron.value).toBe(true)
    expect(hud.format.value).toBe('small')
    expect(api.onHudOverlayPlacement).toHaveBeenCalled()
    expect(api.onHudOverlayFormat).toHaveBeenCalled()
  })

  it('formato iniziale non valido ricade su medium', () => {
    const { api } = makeApi()
    const hud = useHudOverlay('tyres', () => api)
    hud.start('gigante')
    expect(hud.format.value).toBe('medium')
  })

  it('l\'evento placement aggiorna isPlacing', () => {
    const { api, cbs } = makeApi()
    const hud = useHudOverlay('sectors', () => api)
    hud.start('medium')
    cbs.placement!(true)
    expect(hud.isPlacing.value).toBe(true)
    cbs.placement!(false)
    expect(hud.isPlacing.value).toBe(false)
  })

  it('l\'evento format aggiorna il formato', () => {
    const { api, cbs } = makeApi()
    const hud = useHudOverlay('tyres', () => api)
    hud.start('medium')
    cbs.format!('large')
    expect(hud.format.value).toBe('large')
    cbs.format!('rumenta')
    expect(hud.format.value).toBe('medium')
  })

  it('loadSettings legge il formato persistito', async () => {
    const { api } = makeApi()
    const hud = useHudOverlay('tyres', () => api)
    const settings = await hud.loadSettings()
    expect(api.hudOverlayGetSettings).toHaveBeenCalledWith('tyres')
    expect(hud.format.value).toBe('large')
    expect(settings).toMatchObject({ format: 'large' })
  })

  it('stop rimuove gli iscritti', () => {
    const off = vi.fn()
    const api = {
      onHudOverlayPlacement: vi.fn(() => off),
      onHudOverlayFormat: vi.fn(() => off),
    }
    const hud = useHudOverlay('tyres', () => api)
    hud.start('medium')
    hud.stop()
    expect(off).toHaveBeenCalledTimes(2)
  })

  it('in web mode (nessuna API) non lancia e resta inerte', async () => {
    const hud = useHudOverlay('tyres', () => null)
    expect(() => hud.start('large')).not.toThrow()
    expect(hud.isElectron.value).toBe(false)
    // il formato dalla query si applica comunque (per il fallback web)
    expect(hud.format.value).toBe('large')
    await expect(hud.loadSettings()).resolves.toBeNull()
    expect(() => hud.stop()).not.toThrow()
  })
})
