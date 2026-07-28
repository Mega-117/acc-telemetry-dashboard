import { describe, expect, it, vi } from 'vitest'
import {
  createOverlayInteractionRegions,
  matchesOverlayInteractionRegion,
} from '~/composables/useOverlayInteractionRegions'

function fakeElement(matches: boolean): Element {
  return {
    closest: vi.fn(() => matches ? ({}) : null),
  } as unknown as Element
}

describe('overlay interaction regions', () => {
  it('risolve la regione dalle coordinate senza dipendere da event.target', () => {
    const sourceDocument = {
      elementsFromPoint: vi.fn(() => [fakeElement(true)]),
    } as unknown as Document

    expect(matchesOverlayInteractionRegion('.control', 12, 34, sourceDocument)).toBe(true)
    expect(sourceDocument.elementsFromPoint).toHaveBeenCalledWith(12, 34)
  })

  it('abilita il mouse soltanto dentro la regione e deduplica gli IPC', () => {
    let inside = false
    const setMousePassthrough = vi.fn()
    const sourceDocument = {
      elementsFromPoint: vi.fn(() => [fakeElement(inside)]),
    } as unknown as Document
    const controller = createOverlayInteractionRegions({
      setMousePassthrough,
      getDocument: () => sourceDocument,
      getWindow: () => null,
    })

    controller.start('.control')
    controller.updateFromPoint(10, 10)
    inside = true
    controller.updateFromPoint(10, 10)
    controller.updateFromPoint(10, 10)
    inside = false
    controller.updateFromPoint(20, 20)

    expect(setMousePassthrough.mock.calls).toEqual([
      [true],
      [false],
      [true],
    ])
  })

  it('mantiene la cattura durante il posizionamento e ripristina il passthrough', () => {
    let forced = false
    const setMousePassthrough = vi.fn()
    const controller = createOverlayInteractionRegions({
      setMousePassthrough,
      isInteractionForced: () => forced,
      getDocument: () => ({ elementsFromPoint: () => [] }) as unknown as Document,
      getWindow: () => null,
    })

    controller.start('.control')
    forced = true
    controller.reset()
    controller.updateFromPoint(0, 0)
    forced = false
    controller.reset()

    expect(setMousePassthrough.mock.calls).toEqual([
      [true],
      [false],
      [true],
    ])
  })
})
