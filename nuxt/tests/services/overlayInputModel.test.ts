import { describe, expect, it } from 'vitest'
import { resolveOverlayKeyboardCommand } from '~/services/overlay/overlayInputModel'

describe('overlayInputModel', () => {
  it('mappa i comandi tastiera overlay V2.1', () => {
    expect(resolveOverlayKeyboardCommand({ key: 'k', ctrlKey: true })).toBe('toggle')
    expect(resolveOverlayKeyboardCommand({ key: 'n', ctrlKey: true })).toBe('primary')
    expect(resolveOverlayKeyboardCommand({ key: 'b', ctrlKey: true })).toBe('back')
    expect(resolveOverlayKeyboardCommand({ key: 'm', ctrlKey: true })).toBe('mute')
  })

  it('previous/next rimossi (PIP-96): frecce, virgola e punto senza effetto', () => {
    expect(resolveOverlayKeyboardCommand({ key: 'ArrowUp', ctrlKey: true })).toBeNull()
    expect(resolveOverlayKeyboardCommand({ key: 'ArrowDown', ctrlKey: true })).toBeNull()
    expect(resolveOverlayKeyboardCommand({ key: ',', ctrlKey: true })).toBeNull()
    expect(resolveOverlayKeyboardCommand({ key: '.', ctrlKey: true })).toBeNull()
  })

  it('stop-hold da tastiera rimosso (PIP-96): resta solo lo stop two-step', () => {
    expect(resolveOverlayKeyboardCommand({ key: 'l', ctrlKey: true, altKey: true })).toBeNull()
    expect(resolveOverlayKeyboardCommand({ key: 'Backspace', ctrlKey: true })).toBeNull()
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
