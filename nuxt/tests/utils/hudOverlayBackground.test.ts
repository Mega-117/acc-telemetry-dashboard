import { describe, expect, it } from 'vitest'
import {
  HUD_OVERLAY_BACKGROUND_DEFAULT_OPACITY,
  backgroundOpacityToTransparency,
  backgroundTransparencyToOpacity,
  getHudOverlayBackgroundDefaultOpacity,
  normalizeHudOverlayBackgroundOpacity,
  supportsHudOverlayBackground,
} from '../../app/utils/hudOverlayBackground'

describe('hudOverlayBackground', () => {
  it('declares only overlays that opt into the shared background capability', () => {
    expect(supportsHudOverlayBackground('info')).toBe(true)
    expect(supportsHudOverlayBackground('tyres')).toBe(true)
    expect(supportsHudOverlayBackground('standings')).toBe(true)
    expect(supportsHudOverlayBackground('sectors')).toBe(true)
    // Dashboard v3 (28/10): opaque by default, the slider lowers only the panel background.
    expect(supportsHudOverlayBackground('dashboard')).toBe(true)
    expect(getHudOverlayBackgroundDefaultOpacity('dashboard')).toBe(1)
    expect(supportsHudOverlayBackground('trackmap')).toBe(false)
  })

  it('normalizes opacity with the per-overlay default', () => {
    expect(HUD_OVERLAY_BACKGROUND_DEFAULT_OPACITY).toBe(0.8)
    expect(normalizeHudOverlayBackgroundOpacity(undefined)).toBe(0.8)
    expect(getHudOverlayBackgroundDefaultOpacity('standings')).toBe(0.5)
    expect(normalizeHudOverlayBackgroundOpacity(undefined, 'standings')).toBe(0.5)
    // Sectors defaults to its opaque panel: 0% transparency in the settings slider.
    expect(getHudOverlayBackgroundDefaultOpacity('sectors')).toBe(1)
    expect(backgroundOpacityToTransparency(undefined, 'sectors')).toBe(0)
    // Tyres too (Classic and Race): today's opaque panel until the pilot lowers it.
    expect(getHudOverlayBackgroundDefaultOpacity('tyres')).toBe(1)
    expect(backgroundOpacityToTransparency(undefined, 'tyres')).toBe(0)
    expect(normalizeHudOverlayBackgroundOpacity(-1)).toBe(0)
    expect(normalizeHudOverlayBackgroundOpacity(2)).toBe(1)
    expect(normalizeHudOverlayBackgroundOpacity(0.347)).toBe(0.35)
  })

  it('converts the shared transparency slider without changing content opacity', () => {
    expect(backgroundOpacityToTransparency(0.8)).toBe(20)
    expect(backgroundOpacityToTransparency(0.35)).toBe(65)
    expect(backgroundTransparencyToOpacity(20)).toBe(0.8)
    expect(backgroundTransparencyToOpacity(65)).toBe(0.35)
  })
})
