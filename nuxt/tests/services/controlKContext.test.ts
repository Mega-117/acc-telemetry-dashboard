import { describe, expect, it } from 'vitest'
import { resolveControlKContext, type ControlKContextInput } from '~/services/overlay/controlKContext'

// Values observed on 19/10 in a multiplayer box, cockpit view, engine off: final_ff 0.0003.
const cockpitInBox: ControlKContextInput = {
  isLive: true, speedKmh: 0, isSetupMenuVisible: false, isEngineRunning: false, finalFf: 0.0003, hudDriving: true,
}
const at = (patch: Partial<ControlKContextInput>, previous: 'pause' | 'drive' | null = null) =>
  resolveControlKContext({ ...cockpitInBox, ...patch }, previous)

describe('Control K context (PIP-556): cockpit = Guida, menus = Pausa', () => {
  it('is Guida in the cockpit, even stopped in the box with the engine off', () => {
    expect(at({})).toBe('drive')
    expect(at({ isEngineRunning: true, finalFf: 0 })).toBe('drive')
    expect(at({ speedKmh: 140, finalFf: 0 })).toBe('drive')
  })

  it('is Pausa in the ESC menu (force feedback zeroed), setup screen and offline pause', () => {
    expect(at({ finalFf: 0 })).toBe('pause')
    expect(at({ finalFf: 0.00005 })).toBe('pause')
    expect(at({ isSetupMenuVisible: true })).toBe('pause')
    expect(at({ isLive: false, speedKmh: null })).toBe('pause')
  })

  it('uses hud_driving only when force feedback is unknown, else keeps the previous context', () => {
    expect(at({ finalFf: null, hudDriving: false })).toBe('pause')
    expect(at({ finalFf: null, hudDriving: true })).toBe('drive')
    expect(at({ finalFf: null, hudDriving: null }, 'drive')).toBe('drive')
    expect(at({ finalFf: Number.NaN, hudDriving: null }, 'pause')).toBe('pause')
    expect(at({ finalFf: null, hudDriving: null })).toBe('pause')
  })
})
