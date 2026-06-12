// Input model V2.1 (PIP-96): 4 comandi globali (toggle/primary/mute/stop)
// + back come scorciatoia locale da desk. Previous/next e stop-hold da
// tastiera rimossi: in guida non erano raggiungibili (solo-focus) e in
// selezione confondevano; la selezione al desk si fa col mouse.
export type OverlayInputCommand =
  | 'toggle'
  | 'primary'
  | 'back'
  | 'mute'
  | 'stop'

export interface OverlayKeyboardLike {
  key: string
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

export function resolveOverlayKeyboardCommand(event: OverlayKeyboardLike): OverlayInputCommand | null {
  const key = event.key.toLowerCase()
  if (!event.ctrlKey || event.metaKey || event.shiftKey) return null

  if (!event.altKey && key === 'k') return 'toggle'
  if (!event.altKey && key === 'n') return 'primary'
  if (!event.altKey && key === 'b') return 'back'
  if (!event.altKey && key === 'm') return 'mute'
  if (event.altKey && key === 's') return 'stop'

  return null
}
