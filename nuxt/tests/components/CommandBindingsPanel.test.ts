// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CommandBindingsPanel from '~/components/settings/CommandBindingsPanel.vue'

const mock = vi.hoisted(() => ({ bridge: null as any }))
vi.mock('~/composables/useWheelInputBridge', () => ({ useWheelInputBridge: () => mock.bridge }))

beforeEach(() => {
  mock.bridge = {
    state: ref({ available: true, devices: [{ deviceLabel: 'Wheel' }], ambiguousDeviceIds: [], capture: null, lastError: null,
      bindings: { togglePalette: { deviceId: 'Wheel', deviceLabel: 'Wheel', button: 3 }, nextAction: null, activateAction: null } }),
    testMode: ref(false), testedActions: ref([]), beginCapture: vi.fn(), cancelCapture: vi.fn(), clearBinding: vi.fn(), setTestMode: vi.fn(), finishConfiguration: vi.fn().mockResolvedValue(undefined),
  }
})

describe('CommandBindingsPanel', () => {
  it('warns about ambiguous devices without hiding existing bindings', () => {
    mock.bridge.state.value.ambiguousDeviceIds = ['Wheel']
    const wrapper = mount(CommandBindingsPanel)
    expect(wrapper.get('[role="alert"]').text()).toContain('Seleziona il dispositivo')
    expect(wrapper.text()).toContain('Wheel · Pulsante 4')
    expect(wrapper.findAll('.is-tested')).toHaveLength(0)
    wrapper.unmount()
    expect(mock.bridge.finishConfiguration).toHaveBeenCalledTimes(1)
  })

  it('shows failed save and ambiguous capture messages and routes controls', async () => {
    mock.bridge.state.value.lastError = 'settings_write_failed'
    const wrapper = mount(CommandBindingsPanel)
    expect(wrapper.get('[role="alert"]').text()).toContain('non è stato salvato')
    expect(wrapper.text()).toContain('Wheel · Pulsante 4')
    await wrapper.findAll('button').find(button => button.text() === 'Rimuovi')!.trigger('click')
    expect(mock.bridge.clearBinding).toHaveBeenCalledWith('togglePalette')
    await wrapper.findAll('button').find(button => button.text() === 'Assegna')!.trigger('click')
    expect(mock.bridge.beginCapture).toHaveBeenCalledWith('togglePalette', '')
    mock.bridge.state.value.lastError = 'capture_ambiguous'
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="alert"]').text()).toContain('più pulsanti')
    mock.bridge.state.value.capture = { action: 'togglePalette' }
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button').find(button => button.text() === 'Annulla')!.trigger('click')
    expect(mock.bridge.cancelCapture).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('distinguishes names by capabilities and captures only one local key on release', async () => {
    mock.bridge.state.value.inputBackend = 'native'
    mock.bridge.state.value.devices = [
      { deviceId: 'raw:a', deviceLabel: 'FANATEC', buttonCount: 63 },
      { deviceId: 'raw:b', deviceLabel: 'FANATEC', buttonCount: 108 },
    ]
    mock.bridge.captureKey = vi.fn()
    const wrapper = mount(CommandBindingsPanel)
    expect(wrapper.findAll('option').map(o => o.text())).toEqual(['Rileva automaticamente', 'Tastiera', 'FANATEC · 63 pulsanti', 'FANATEC · 108 pulsanti'])
    await wrapper.get('select').setValue('raw:b')
    await wrapper.findAll('button').find(b => b.text() === 'Assegna')!.trigger('click')
    expect(mock.bridge.beginCapture).toHaveBeenLastCalledWith('togglePalette', 'raw:b')
    mock.bridge.state.value.capture = { action: 'togglePalette', deviceId: 'keyboard:system' }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' }))
    expect(mock.bridge.captureKey).not.toHaveBeenCalled()
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'F8' }))
    expect(mock.bridge.captureKey).toHaveBeenCalledWith(119)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', ctrlKey: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'K', ctrlKey: true }))
    expect(mock.bridge.captureKey).toHaveBeenCalledTimes(1)
    await wrapper.get('select').setValue('keyboard:system')
    expect(mock.bridge.cancelCapture).toHaveBeenCalled()
    wrapper.unmount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'F8' }))
    expect(mock.bridge.captureKey).toHaveBeenCalledTimes(1)
  })
})
