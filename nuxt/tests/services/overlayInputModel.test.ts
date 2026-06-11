import { describe, expect, it } from 'vitest'
import { resolveOverlayKeyboardCommand } from '~/services/overlay/overlayInputModel'

describe('overlayInputModel', () => {
  it('mappa i comandi tastiera overlay V1', () => {
    expect(resolveOverlayKeyboardCommand({ key: 'k', ctrlKey: true })).toBe('toggle')
    expect(resolveOverlayKeyboardCommand({ key: 'n', ctrlKey: true })).toBe('primary')
    expect(resolveOverlayKeyboardCommand({ key: 'b', ctrlKey: true })).toBe('back')
    expect(resolveOverlayKeyboardCommand({ key: 'ArrowUp', ctrlKey: true })).toBe('previous')
    expect(resolveOverlayKeyboardCommand({ key: 'ArrowDown', ctrlKey: true })).toBe('next')
    expect(resolveOverlayKeyboardCommand({ key: ',', ctrlKey: true })).toBe('previous')
    expect(resolveOverlayKeyboardCommand({ key: '.', ctrlKey: true })).toBe('next')
    expect(resolveOverlayKeyboardCommand({ key: 'm', ctrlKey: true })).toBe('mute')
  })

  it('mantiene lo stop su comando protetto', () => {
    expect(resolveOverlayKeyboardCommand({ key: 'l', ctrlKey: true, altKey: true })).toBe('stop-hold')
    expect(resolveOverlayKeyboardCommand({ key: 'Backspace', ctrlKey: true })).toBe('stop-hold')
  })

  it('mappa lo stop two-step V2 su Ctrl+Alt+S', () => {
    expect(resolveOverlayKeyboardCommand({ key: 's', ctrlKey: true, altKey: true })).toBe('stop')
    expect(resolveOverlayKeyboardCommand({ key: 'S', ctrlKey: true, altKey: true })).toBe('stop')
    expect(resolveOverlayKeyboardCommand({ key: 's', ctrlKey: true })).toBeNull()
    expect(resolveOverlayKeyboardCommand({ key: 's', altKey: true })).toBeNull()
  })

  it('ignora combinazioni non ufficiali o modificate', () => {
    expect(resolveOverlayKeyboardCommand({ key: 'n' })).toBeNull()
    expect(resolveOverlayKeyboardCommand({ key: 'n', ctrlKey: true, shiftKey: true })).toBeNull()
    expect(resolveOverlayKeyboardCommand({ key: 'n', ctrlKey: true, metaKey: true })).toBeNull()
    expect(resolveOverlayKeyboardCommand({ key: 'x', ctrlKey: true })).toBeNull()
  })
})
