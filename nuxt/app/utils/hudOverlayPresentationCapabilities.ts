export type HudOverlayPresentationId = 'tyres' | 'sectors' | 'dashboard' | 'info'
export type HudOverlayPresentationControl =
  | 'layout'
  | 'deltaReference'
  | 'sectorPrevious'
  | 'sectorBest'
  | 'sectorCurrentLap'

type PresentationRegistry = Record<
  HudOverlayPresentationId,
  Record<string, readonly HudOverlayPresentationControl[]>
>

export const HUD_OVERLAY_PRESENTATION_CAPABILITIES: PresentationRegistry = {
  tyres: {
    classic: ['layout'],
    advanced: ['layout'],
  },
  sectors: {
    classic: ['layout', 'deltaReference', 'sectorPrevious', 'sectorBest'],
    compact: ['layout', 'deltaReference', 'sectorCurrentLap'],
  },
  dashboard: {
    classic: [],
  },
  info: {
    classic: [],
  },
}

export function supportsHudOverlayPresentationControl(
  overlayId: HudOverlayPresentationId,
  variant: string,
  control: HudOverlayPresentationControl,
): boolean {
  const variants = HUD_OVERLAY_PRESENTATION_CAPABILITIES[overlayId]
  const controls = variants[variant] ?? variants.classic ?? []
  return controls.includes(control)
}
