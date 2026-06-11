export type OverlayInputCommand =
  | 'toggle'
  | 'primary'
  | 'back'
  | 'previous'
  | 'next'
  | 'mute'
  | 'stop-hold'

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
  if (!event.altKey && (key === 'arrowup' || key === ',')) return 'previous'
  if (!event.altKey && (key === 'arrowdown' || key === '.')) return 'next'
  if ((event.altKey && key === 'l') || (!event.altKey && key === 'backspace')) return 'stop-hold'

  return null
}
