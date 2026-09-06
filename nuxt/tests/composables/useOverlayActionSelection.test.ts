// @vitest-environment jsdom
import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOverlayActionSelection } from '~/composables/useOverlayActionSelection'

describe('shared overlay selection', () => {
  let scope: ReturnType<typeof effectScope>
  let nav: ReturnType<typeof useOverlayActionSelection>
  let root: HTMLElement
  let enabled: boolean
  beforeEach(() => {
    root = document.createElement('main')
    root.innerHTML = '<button data-overlay-wheel-action="back">Menu</button><button data-overlay-wheel-action="disabled" disabled>No</button><div inert><button data-overlay-wheel-action="inert">No</button></div><button data-overlay-wheel-action="start">Start</button>'
    document.body.append(root)
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    enabled = true
    scope = effectScope()
    nav = scope.run(() => useOverlayActionSelection(ref(root), () => enabled))!
    nav.first()
  })
  afterEach(() => { scope.stop(); root.remove(); vi.restoreAllMocks() })
  it('cycles in visual order skipping disabled/inert controls and activates only the highlighted action', () => {
    const click = vi.fn()
    root.lastElementChild!.addEventListener('click', click)
    nav.next(); expect(nav.selectedId.value).toBe('start')
    nav.activate(); expect(click).toHaveBeenCalledTimes(1)
    nav.next(); expect(nav.selectedId.value).toBe('back')
    expect(root.querySelectorAll('[data-overlay-selected]')).toHaveLength(1)
    nav.select('removed'); nav.activate()
    expect(nav.selectedId.value).toBe('back'); expect(click).toHaveBeenCalledTimes(1)
  })
  it('mouse movement selects, leaving keeps selection, stationary mouse cannot undo wheel navigation', () => {
    const event = { target: root.lastElementChild, screenX: 20, screenY: 30, movementX: 1, movementY: 0 } as unknown as PointerEvent
    nav.pointerMove(event); expect(nav.selectedId.value).toBe('start')
    nav.next(); expect(nav.selectedId.value).toBe('back')
    nav.pointerMove(event); expect(nav.selectedId.value).toBe('back')
    nav.pointerMove({ ...event, screenX: 21 } as PointerEvent); expect(nav.selectedId.value).toBe('start')
    nav.pointerMove({ ...event, screenX: 22, target: root } as unknown as PointerEvent)
    expect(nav.selectedId.value).toBe('start')
  })
  it('synthetic movement has the same selection but layout/visibility changes do not count as movement', () => {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => root.lastElementChild) })
    const state = { movementRevision: 1, x: 5, y: 5, surfaceHovered: true } as any
    nav.syntheticPointer(state); expect(nav.selectedId.value).toBe('back')
    nav.syntheticPointer({ ...state, movementRevision: 2 }); expect(nav.selectedId.value).toBe('start')
    nav.next(); nav.syntheticPointer({ ...state, movementRevision: 2, x: 9 })
    expect(nav.selectedId.value).toBe('back')
    nav.syntheticPointer({ ...state, movementRevision: 3, surfaceHovered: false })
    nav.syntheticPointer({ ...state, movementRevision: 3 }); expect(nav.selectedId.value).toBe('back')
    nav.syntheticPointer({ ...state, movementRevision: 4 }); expect(nav.selectedId.value).toBe('start')
  })
  it('updates after accordion changes and removes navigation during timers', async () => {
    root.querySelector('[inert]')!.removeAttribute('inert')
    nav.next(); expect(nav.selectedId.value).toBe('inert')
    root.querySelector('[data-overlay-wheel-action="inert"]')!.parentElement!.setAttribute('inert', '')
    nav.refresh(); expect(nav.selectedId.value).toBe('back')
    enabled = false; nav.refresh(); await nextTick()
    expect(nav.selectedId.value).toBeNull()
    expect(root.querySelectorAll('[data-overlay-selected]')).toHaveLength(0)
  })
});
