import { describe, expect, it } from 'vitest'
import {
  createGamepadSnapshot,
  formatWheelBinding,
  matchingWheelActions,
  normalizeWheelBinding,
  wheelBindingsCollide,
  wheelSnapshotSignature,
} from '../../app/services/controls/wheelBindingModel'

describe('wheelBindingModel', () => {
  it('normalizes a single button and rejects anything else', () => {
    expect(normalizeWheelBinding({ deviceId: ' wheel ', button: 4 }))
      .toEqual({ deviceId: 'wheel', deviceLabel: 'wheel', button: 4 })
    expect(normalizeWheelBinding({ deviceId: 'wheel', button: -1 })).toBeNull()
    expect(normalizeWheelBinding({ deviceId: '', button: 1 })).toBeNull()
    expect(normalizeWheelBinding({ deviceId: 'wheel' })).toBeNull()
  })

  it('collides only on the same button of the same device', () => {
    const binding = { deviceId: 'wheel', deviceLabel: 'wheel', button: 2 }
    expect(wheelBindingsCollide(binding, { deviceId: 'wheel', deviceLabel: 'wheel', button: 2 })).toBe(true)
    expect(wheelBindingsCollide(binding, { deviceId: 'wheel', deviceLabel: 'wheel', button: 3 })).toBe(false)
    expect(wheelBindingsCollide(binding, { deviceId: 'other', deviceLabel: 'other', button: 2 })).toBe(false)
    expect(wheelBindingsCollide(binding, null)).toBe(false)
  })

  it('identifies a device by name only, so a replug keeps the binding valid', () => {
    const gamepad = {
      connected: true,
      id: 'Fanatec Wheel',
      index: 2,
      buttons: [{ pressed: false, value: 0 }, { pressed: true, value: 1 }, { pressed: false, value: 0.8 }],
    } as Gamepad
    const snapshot = createGamepadSnapshot([gamepad], 'test')
    expect(snapshot).toEqual({
      mode: 'test',
      devices: [{ deviceId: 'Fanatec Wheel', deviceLabel: 'Fanatec Wheel', buttons: [1, 2] }],
    })
    expect(wheelSnapshotSignature(snapshot)).toBe(wheelSnapshotSignature(snapshot))
  })

  it('names an unnamed pad after its slot and skips disconnected ones', () => {
    const pads = [
      { connected: false, id: 'Ghost', index: 0, buttons: [] },
      { connected: true, id: '', index: 1, buttons: [{ pressed: true, value: 1 }] },
    ] as unknown as Gamepad[]
    expect(createGamepadSnapshot(pads).devices).toEqual([
      { deviceId: 'Gamepad 2', deviceLabel: 'Gamepad 2', buttons: [0] },
    ])
  })

  it('highlights a bound button while it is held, and labels it for the driver', () => {
    const binding = { deviceId: 'Wheel', deviceLabel: 'Wheel', button: 3 }
    expect(matchingWheelActions({
      togglePalette: binding,
      nextAction: null,
      activateAction: null,
    }, {
      mode: 'test',
      devices: [{ deviceId: 'Wheel', deviceLabel: 'Wheel', buttons: [3, 9] }],
    })).toEqual(['togglePalette'])
    expect(formatWheelBinding(binding)).toBe('Wheel · Pulsante 4')
    expect(formatWheelBinding(null)).toBe('Non assegnato')
  })
})
