import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOverlayInteractionContract } from '~/composables/useOverlayInteractionContract'

class FakeElement {
  rect: { x: number, y: number, width: number, height: number }
  control: boolean
  constructor(rect: { x: number, y: number, width: number, height: number }, control = false) {
    this.rect = rect
    this.control = control
  }
  getBoundingClientRect() { return this.rect }
  closest(selector: string) { return this.control && selector === '.control' ? this : null }
}

function makeClassList() {
  const values = new Set<string>()
  return {
    toggle: (name: string, active: boolean) => active ? values.add(name) : values.delete(name),
    contains: (name: string) => values.has(name),
  }
}

function installDom() {
  const surface = new FakeElement({ x: 5, y: 6, width: 200, height: 100 })
  const control = new FakeElement({ x: 140, y: 75, width: 50, height: 20 }, true)
  const listeners = new Map<string, Set<(event: any) => void>>()
  const classList = makeClassList()
  const fakeDocument = {
    body: {},
    documentElement: { classList },
    querySelectorAll: (selector: string) => {
      if (!selector) throw new DOMException('The provided selector is empty.', 'SyntaxError')
      return selector === '.surface' ? [surface] : selector === '.control' ? [control] : []
    },
  }
  const fakeWindow = {
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0) as unknown as number,
    cancelAnimationFrame: (id: number) => clearTimeout(id),
    addEventListener: (name: string, callback: (event: any) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name)!.add(callback)
    },
    removeEventListener: (name: string, callback: (event: any) => void) => listeners.get(name)?.delete(callback),
    dispatch: (name: string, event: any = {}) => listeners.get(name)?.forEach(callback => callback(event)),
  }
  vi.stubGlobal('Element', FakeElement)
  vi.stubGlobal('document', fakeDocument)
  vi.stubGlobal('window', fakeWindow)
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('MutationObserver', class {
    constructor(_callback: MutationCallback) {}
    observe() {}
    disconnect() {}
  })
  return { surface, control, classList, fakeWindow }
}

function makeApi() {
  let pointerListener: ((state: any) => void) | null = null
  const api = {
    overlayInteractionUpdateContract: vi.fn().mockResolvedValue(true),
    overlayInteractionClearContract: vi.fn().mockResolvedValue(true),
    overlayInteractionPointerButton: vi.fn().mockResolvedValue(true),
    onOverlayInteractionPointerState: vi.fn((listener: (state: any) => void) => {
      pointerListener = listener
      return () => { pointerListener = null }
    }),
  }
  return { api, emitPointer: (state: any) => pointerListener?.(state) }
}

describe('useOverlayInteractionContract', () => {
  beforeEach(() => installDom())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('pubblica surface e controlli come rettangoli distinti', async () => {
    const { api } = makeApi()
    const interaction = useOverlayInteractionContract({ getApi: () => api })
    interaction.start({ surfaceSelector: '.surface', controlSelector: '.control' })
    await new Promise(resolve => setTimeout(resolve, 5))

    expect(api.overlayInteractionUpdateContract).toHaveBeenCalledWith(expect.objectContaining({
      interactive: true,
      visualRects: [{ x: 5, y: 6, width: 200, height: 100 }],
      surfaceRects: [{ x: 5, y: 6, width: 200, height: 100 }],
      controlRects: [{ x: 140, y: 75, width: 50, height: 20 }],
    }))
    interaction.stop()
  })

  it('rende espliciti hover e cursore senza dipendere dal target mousemove', () => {
    const { api, emitPointer } = makeApi()
    const interaction = useOverlayInteractionContract({ getApi: () => api })
    interaction.start({ surfaceSelector: '.surface', controlSelector: '.control' })
    emitPointer({
      cursorVisible: true,
      surfaceHovered: true,
      controlHovered: false,
      placementActive: false,
      x: 50,
      y: 40,
    })
    expect(interaction.pointerState.cursorVisible).toBe(true)
    expect((document.documentElement.classList as any).contains('overlay-pointer-surface-hovered')).toBe(true)
    expect((document.documentElement.classList as any).contains('overlay-software-cursor-active')).toBe(true)
    interaction.stop()
  })

  it('notifica pointerdown solo sui controlli e pulisce il contratto', () => {
    const { control, surface, fakeWindow } = installDom()
    const { api } = makeApi()
    const interaction = useOverlayInteractionContract({ getApi: () => api })
    interaction.start({ surfaceSelector: '.surface', controlSelector: '.control' })
    fakeWindow.dispatch('pointerdown', { target: surface })
    fakeWindow.dispatch('pointerdown', { target: control })
    fakeWindow.dispatch('pointerup')
    expect(api.overlayInteractionPointerButton.mock.calls).toEqual([[true], [false]])
    interaction.stop()
    expect(api.overlayInteractionClearContract).toHaveBeenCalled()
  })

  it('supporta una superficie solo cursore senza catturare click', async () => {
    const { surface, fakeWindow } = installDom()
    const { api } = makeApi()
    const interaction = useOverlayInteractionContract({ getApi: () => api })
    interaction.start({ surfaceSelector: '.surface', controlSelector: '' })
    await new Promise(resolve => setTimeout(resolve, 5))

    expect(api.overlayInteractionUpdateContract).toHaveBeenCalledWith(expect.objectContaining({
      interactive: true,
      surfaceRects: [{ x: 5, y: 6, width: 200, height: 100 }],
      controlRects: [],
    }))
    expect(() => fakeWindow.dispatch('pointerdown', { target: surface })).not.toThrow()
    expect(api.overlayInteractionPointerButton).not.toHaveBeenCalled()
    interaction.stop()
  })
})
