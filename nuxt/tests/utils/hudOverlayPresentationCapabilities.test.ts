import { describe, expect, it } from 'vitest'
import {
  supportsHudOverlayPresentationControl,
  type HudOverlayPresentationControl,
} from '~/utils/hudOverlayPresentationCapabilities'

describe('hudOverlayPresentationCapabilities', () => {
  it('mantiene layout e riferimento delta visibili in entrambi i layout Settori', () => {
    for (const variant of ['classic', 'compact']) {
      expect(supportsHudOverlayPresentationControl('sectors', variant, 'layout')).toBe(true)
      expect(supportsHudOverlayPresentationControl('sectors', variant, 'deltaReference')).toBe(true)
    }
  })

  it('espone le opzioni settore visuali soltanto nel Classico', () => {
    for (const control of ['sectorPrevious', 'sectorBest'] as HudOverlayPresentationControl[]) {
      expect(supportsHudOverlayPresentationControl('sectors', 'classic', control)).toBe(true)
      expect(supportsHudOverlayPresentationControl('sectors', 'compact', control)).toBe(false)
    }
  })

  it('degrada una variante sconosciuta alle capacità Classico del relativo HUD', () => {
    expect(supportsHudOverlayPresentationControl('sectors', 'future', 'sectorPrevious')).toBe(true)
    expect(supportsHudOverlayPresentationControl('tyres', 'future', 'layout')).toBe(true)
  })
})
