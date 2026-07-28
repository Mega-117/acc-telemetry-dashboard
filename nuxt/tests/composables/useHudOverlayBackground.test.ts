import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useHudOverlayBackground } from '../../app/composables/useHudOverlayBackground'
import type { HudOverlaySettings } from '../../app/composables/useHudOverlay'

describe('useHudOverlayBackground', () => {
  it('uses the shared default and reacts only to the overlay settings passed in', () => {
    const settings = ref<HudOverlaySettings | null>(null)
    const { backgroundOpacity } = useHudOverlayBackground(settings)

    expect(backgroundOpacity.value).toBe(0.8)

    settings.value = {
      enabled: true,
      locked: true,
      scale: 1,
      backgroundOpacity: 0.35,
      bounds: null,
    }

    expect(backgroundOpacity.value).toBe(0.35)
  })

  it('normalizes persisted values before exposing them to the background layer', () => {
    const settings = ref<HudOverlaySettings | null>({
      enabled: true,
      locked: true,
      scale: 1,
      backgroundOpacity: 2,
      bounds: null,
    })
    const { backgroundOpacity } = useHudOverlayBackground(settings)

    expect(backgroundOpacity.value).toBe(1)
  })
})
