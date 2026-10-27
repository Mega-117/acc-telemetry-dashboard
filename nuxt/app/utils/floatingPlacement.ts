// PIP-641: where a floating panel (race menu, date picker) goes next to the control that opened it. It floats above
// everything (fixed, in <body>): it never stretches a modal or a card, and the backdrop blur works under it. It opens
// below, or above when there is no room below; it stays inside the window; on a phone a sheet uses the full width
// at the bottom of the screen.

export interface Box { left: number, top: number, right: number, bottom: number, width: number, height: number }
export interface FloatingOptions { align: 'start' | 'end', gap?: number, margin?: number, sheetBelow?: number }
export interface FloatingPlace { left: number, top: number, width?: number, placement: 'below' | 'above' | 'sheet' }

export function placeFloating(anchor: Box, panel: { width: number, height: number }, viewport: { width: number, height: number },
  options: FloatingOptions): FloatingPlace {
  const gap = options.gap ?? 6
  const margin = options.margin ?? 8
  if (options.sheetBelow && viewport.width < options.sheetBelow) {
    return { left: margin, top: Math.max(margin, viewport.height - panel.height - margin), width: viewport.width - margin * 2, placement: 'sheet' }
  }
  const roomBelow = viewport.height - anchor.bottom - gap - margin
  const roomAbove = anchor.top - gap - margin
  const above = panel.height > roomBelow && roomAbove > roomBelow
  const top = above ? anchor.top - gap - panel.height : anchor.bottom + gap
  const wanted = options.align === 'end' ? anchor.right - panel.width : anchor.left
  const left = Math.min(Math.max(margin, wanted), viewport.width - panel.width - margin)
  return { left, top: Math.max(margin, Math.min(top, viewport.height - panel.height - margin)), placement: above ? 'above' : 'below' }
}
