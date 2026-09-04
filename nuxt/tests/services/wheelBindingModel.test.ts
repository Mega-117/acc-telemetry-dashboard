import { describe, expect, it } from 'vitest'
import {
  createGamepadSnapshot,
  formatWheelBinding,
  matchingWheelActions,
  normalizeWheelBinding,
  wheelBindingsOverlap,
  wheelSnapshotSignature,
} from '../../app/services/controls/wheelBindingModel'

describe('wheelBindingModel', () => {
  it('normalizes bindings and detects same-device subset conflicts', () => {
    const single = normalizeWheelBinding({ deviceId: ' wheel ', buttons: [4, 2, 4] })
    expect(single).toEqual({ deviceId: 'wheel', deviceLabel: 'wheel', buttons: [2, 4] })
    expect(wheelBindingsOverlap(single, { deviceId: 'wheel', deviceLabel: 'wheel', buttons: [2] })).toBe(true)
    expect(wheelBindingsOverlap(single, { deviceId: 'other', deviceLabel: 'other', buttons: [2] })).toBe(false)
    expect(normalizeWheelBinding({ deviceId: 'wheel', buttons: [1, 2, 3] })).toBeNull()
  })

  it('builds stable differential snapshots from button state', () => {
    const gamepad = {
      connected: true,
      id: 'Fanatec',
      index: 0,
      buttons: [{ pressed: false, value: 0 }, { pressed: true, value: 1 }],
    } as Gamepad
    const snapshot = createGamepadSnapshot([gamepad], 'test')
    expect(snapshot).toEqual({
      mode: 'test',
      devices: [{ deviceId: 'Fanatec::0', deviceLabel: 'Fanatec', buttons: [1] }],
    })
    expect(wheelSnapshotSignature(snapshot)).toBe(wheelSnapshotSignature(snapshot))
  })

  it('matches combinations and formats their visible label', () => {
    const binding = { deviceId: 'wheel::0', deviceLabel: 'Wheel', buttons: [1, 3] }
    expect(matchingWheelActions({
      togglePalette: binding,
      nextAction: null,
      activateAction: null,
    }, {
      mode: 'test',
      devices: [{ deviceId: 'wheel::0', deviceLabel: 'Wheel', buttons: [1, 3, 5] }],
    })).toEqual(['togglePalette'])
    expect(formatWheelBinding(binding)).toBe('Wheel · Pulsante 2 + Pulsante 4')
    expect(formatWheelBinding(null)).toBe('Non assegnato')
  })
})
