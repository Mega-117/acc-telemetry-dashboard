export const WHEEL_CONTROL_ACTIONS = ['togglePalette', 'nextAction', 'activateAction'] as const
export type WheelControlAction = typeof WHEEL_CONTROL_ACTIONS[number]

export interface WheelBinding {
  deviceId: string
  deviceLabel: string
  buttons: readonly number[]
}

export interface WheelDeviceSnapshot {
  deviceId: string
  deviceLabel: string
  buttons: readonly number[]
}

export interface WheelInputSnapshot {
  mode: 'active' | 'test'
  devices: WheelDeviceSnapshot[]
}

export interface WheelControlsState {
  available: boolean
  bindings: Record<WheelControlAction, WheelBinding | null>
  devices: WheelDeviceSnapshot[]
  capture: null | {
    action: WheelControlAction
    deviceId: string | null
    stage: 'waiting-release' | 'collecting'
    buttons: readonly number[]
  }
  lastError: string | null
  operation?: { ok: boolean; reason?: string; conflictingAction?: WheelControlAction; saved?: boolean }
  testMatches?: WheelControlAction[]
}

export const EMPTY_WHEEL_BINDINGS: Record<WheelControlAction, null> = {
  togglePalette: null,
  nextAction: null,
  activateAction: null,
}

export function normalizeButtonIndexes(buttons: unknown): number[] {
  if (!Array.isArray(buttons)) return []
  return [...new Set(buttons.filter((button): button is number => (
    Number.isInteger(button) && button >= 0
  )))].sort((left, right) => left - right)
}

export function normalizeWheelBinding(binding: unknown): WheelBinding | null {
  if (!binding || typeof binding !== 'object') return null
  const candidate = binding as Partial<WheelBinding>
  const deviceId = typeof candidate.deviceId === 'string' ? candidate.deviceId.trim() : ''
  const deviceLabel = typeof candidate.deviceLabel === 'string' ? candidate.deviceLabel.trim() : ''
  const buttons = normalizeButtonIndexes(candidate.buttons)
  if (!deviceId || buttons.length < 1 || buttons.length > 2) return null
  return { deviceId, deviceLabel: deviceLabel || deviceId, buttons }
}

export function wheelBindingsOverlap(left: WheelBinding | null, right: WheelBinding | null): boolean {
  if (!left || !right || left.deviceId !== right.deviceId) return false
  const leftButtons = new Set(left.buttons)
  const rightButtons = new Set(right.buttons)
  return left.buttons.every(button => rightButtons.has(button))
    || right.buttons.every(button => leftButtons.has(button))
}

export function createGamepadSnapshot(
  gamepads: ArrayLike<Gamepad | null>,
  mode: 'active' | 'test' = 'active',
): WheelInputSnapshot {
  const devices: WheelDeviceSnapshot[] = []
  for (const gamepad of Array.from(gamepads)) {
    if (!gamepad?.connected) continue
    const deviceId = `${gamepad.id || 'Gamepad'}::${gamepad.index}`
    devices.push({
      deviceId,
      deviceLabel: gamepad.id || `Gamepad ${gamepad.index + 1}`,
      buttons: gamepad.buttons
        .map((button, index) => button.pressed || button.value >= 0.5 ? index : -1)
        .filter(index => index >= 0),
    })
  }
  return { mode, devices }
}

export function wheelSnapshotSignature(snapshot: WheelInputSnapshot): string {
  return JSON.stringify(snapshot)
}

export function matchingWheelActions(
  bindings: Record<WheelControlAction, WheelBinding | null>,
  snapshot: WheelInputSnapshot,
): WheelControlAction[] {
  const pressedByDevice = new Map(snapshot.devices.map(device => [
    device.deviceId,
    new Set(device.buttons),
  ]))
  return WHEEL_CONTROL_ACTIONS.filter((action) => {
    const binding = bindings[action]
    if (!binding) return false
    const pressed = pressedByDevice.get(binding.deviceId)
    return !!pressed && binding.buttons.every(button => pressed.has(button))
  })
}

export function formatWheelBinding(binding: WheelBinding | null): string {
  if (!binding) return 'Non assegnato'
  const buttons = binding.buttons.map(button => `Pulsante ${button + 1}`).join(' + ')
  return `${binding.deviceLabel} · ${buttons}`
}
