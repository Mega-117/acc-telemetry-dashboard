import { describe, expect, it } from 'vitest'
import { canBeginAutoCapture, captureSourceReady, commandErrorText } from '~/services/controls/commandCapture'
import { EMPTY_WHEEL_BINDINGS, type WheelControlsState } from '~/services/controls/wheelBindingModel'

const base = (over: Partial<WheelControlsState> = {}): WheelControlsState => ({
  available: true, bindings: { ...EMPTY_WHEEL_BINDINGS }, devices: [], capture: null, lastError: null, ambiguousDeviceIds: [], ...over,
})

describe('commandCapture (PIP-571)', () => {
  it('source readiness follows the per-source readers, or the global status when absent', () => {
    expect(captureSourceReady(base({ inputStatus: 'ready' }), null)).toBe(true)
    expect(captureSourceReady(base({ inputStatus: 'starting' }), null)).toBe(false)
    const sources = { keyboard: { status: 'ready' as const, reason: null }, controller: { status: 'unavailable' as const, reason: 'x' } }
    expect(captureSourceReady(base({ sources }), 'keyboard')).toBe(true)
    expect(captureSourceReady(base({ sources }), 'controller')).toBe(false)
    expect(captureSourceReady(base({ sources }), null)).toBe(true)
  })

  it('auto capture needs the runtime, a reader, a device (or the native backend) and no capture/test in progress', () => {
    expect(canBeginAutoCapture(base({ inputStatus: 'ready', devices: [{ deviceId: 'w', deviceLabel: 'W', buttons: [] }] }), false)).toBe(true)
    expect(canBeginAutoCapture(base({ inputStatus: 'ready', inputBackend: 'native' }), false)).toBe(true)
    expect(canBeginAutoCapture(base({ inputStatus: 'ready' }), false)).toBe(false)
    expect(canBeginAutoCapture(base({ available: false, inputBackend: 'native' }), false)).toBe(false)
    expect(canBeginAutoCapture(base({ inputBackend: 'native', capture: { action: 'nextAction' } }), false)).toBe(false)
    expect(canBeginAutoCapture(base({ inputBackend: 'native' }), true)).toBe(false)
  })

  it('maps reasons to the same sentences as Impostazioni', () => {
    expect(commandErrorText(null)).toBe('')
    expect(commandErrorText('binding_conflict')).toMatch(/già assegnato/)
    expect(commandErrorText('mystery')).toBe('Comando non salvato. Riprova.')
  })
})
