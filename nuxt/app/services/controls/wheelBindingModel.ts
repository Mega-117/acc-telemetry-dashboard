export const WHEEL_CONTROL_ACTIONS = ['togglePalette', 'nextAction', 'activateAction'] as const
export type WheelControlAction = typeof WHEEL_CONTROL_ACTIONS[number]

export interface WheelBinding {
  deviceId: string
  deviceLabel: string
  button: number
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
  capture: null | { action: WheelControlAction }
  lastError: string | null
  operation?: { ok: boolean; reason?: string; conflictingAction?: WheelControlAction; saved?: boolean }
  testMatches?: WheelControlAction[]
}

export const EMPTY_WHEEL_BINDINGS: Record<WheelControlAction, null> = {
  togglePalette: null,
  nextAction: null,
  activateAction: null,
}

export function normalizeWheelBinding(binding: unknown): WheelBinding | null {
  if (!binding || typeof binding !== 'object') return null
  const candidate = binding as Partial<WheelBinding>
  const deviceId = typeof candidate.deviceId === 'string' ? candidate.deviceId.trim() : ''
  const deviceLabel = typeof candidate.deviceLabel === 'string' ? candidate.deviceLabel.trim() : ''
  const button = candidate.button
  if (!deviceId || !Number.isInteger(button) || (button as number) < 0) return null
  return { deviceId, deviceLabel: deviceLabel || deviceId, button: button as number }
}

export function wheelBindingsCollide(left: WheelBinding | null, right: WheelBinding | null): boolean {
  return !!left && !!right && left.deviceId === right.deviceId && left.button === right.button
}

/**
 * A device keeps its identity across replugs: the slot index is deliberately left out of
 * the id, so a binding saved today still matches after a restart or a different power-on
 * order. Two rigs sharing one product name merge into one id on purpose - pressing that
 * button on either of them means the same thing to the driver.
 */
export function createGamepadSnapshot(
  gamepads: ArrayLike<Gamepad | null>,
  mode: 'active' | 'test' = 'active',
): WheelInputSnapshot {
  const devices: WheelDeviceSnapshot[] = []
  for (const gamepad of Array.from(gamepads)) {
    if (!gamepad?.connected) continue
    const label = (gamepad.id || '').trim() || `Gamepad ${gamepad.index + 1}`
    devices.push({
      deviceId: label,
      deviceLabel: label,
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
    return !!binding && !!pressedByDevice.get(binding.deviceId)?.has(binding.button)
  })
}

export function formatWheelBinding(binding: WheelBinding | null): string {
  if (!binding) return 'Non assegnato'
  return `${binding.deviceLabel} · Pulsante ${binding.button + 1}`
}
