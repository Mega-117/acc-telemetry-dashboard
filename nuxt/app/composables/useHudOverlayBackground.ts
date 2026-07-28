import { computed, type Ref } from 'vue'
import type { HudOverlaySettings } from '~/composables/useHudOverlay'
import { normalizeHudOverlayBackgroundOpacity } from '~/utils/hudOverlayBackground'

export function useHudOverlayBackground(settings: Ref<HudOverlaySettings | null>) {
  const backgroundOpacity = computed(() =>
    normalizeHudOverlayBackgroundOpacity(settings.value?.backgroundOpacity),
  )

  return { backgroundOpacity }
}
