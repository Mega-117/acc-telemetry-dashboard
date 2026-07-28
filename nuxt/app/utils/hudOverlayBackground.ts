export const HUD_OVERLAY_BACKGROUND_DEFAULT_OPACITY = 0.8

export type HudOverlayBackgroundId = 'info' | 'tyres'

const HUD_OVERLAY_BACKGROUND_IDS = new Set<HudOverlayBackgroundId>(['info', 'tyres'])

export function supportsHudOverlayBackground(id: string): id is HudOverlayBackgroundId {
  return HUD_OVERLAY_BACKGROUND_IDS.has(id as HudOverlayBackgroundId)
}

export function normalizeHudOverlayBackgroundOpacity(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return HUD_OVERLAY_BACKGROUND_DEFAULT_OPACITY
  return Math.round(Math.min(Math.max(parsed, 0), 1) * 100) / 100
}

export function backgroundOpacityToTransparency(value: unknown): number {
  return Math.round((1 - normalizeHudOverlayBackgroundOpacity(value)) * 100)
}

export function backgroundTransparencyToOpacity(value: unknown): number {
  const parsed = Number(value)
  const percentage = Number.isFinite(parsed)
    ? Math.min(Math.max(Math.round(parsed), 0), 100)
    : 0
  return Math.round((1 - percentage / 100) * 100) / 100
}
