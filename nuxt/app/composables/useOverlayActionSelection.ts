import { nextTick, ref, watch, type Ref } from 'vue'
import { nextOverlayActionId, resolveOverlayActivation } from '~/services/overlay/overlayActionNavigation'
import type { OverlayPointerState } from './useOverlayInteractionContract'

const SELECTOR = 'button[data-overlay-wheel-action]'

/** One selection for native pointer, non-focusable Electron pointer and wheel input. */
export function useOverlayActionSelection(root: Ref<HTMLElement | null>, enabled: () => boolean) {
  const selectedId = ref<string | null>(null)
  let movementRevision: number | undefined
  let nativePoint: string | null = null

  function available() {
    if (!enabled() || !root.value) return []
    return Array.from(root.value.querySelectorAll<HTMLButtonElement>(SELECTOR)).filter(button =>
      !button.disabled && !button.closest('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]')
      && button.getClientRects().length > 0 && getComputedStyle(button).visibility !== 'hidden',
    )
  }

  function paint() {
    root.value?.querySelectorAll<HTMLButtonElement>(SELECTOR).forEach(button => {
      const selected = enabled() && button.dataset.overlayWheelAction === selectedId.value
      button.toggleAttribute('data-overlay-selected', selected)
      if (selected) button.setAttribute('aria-current', 'true')
      else button.removeAttribute('aria-current')
    })
  }

  function select(id: string | null, focus = false) {
    selectedId.value = id
    paint()
    if (focus) available().find(button => button.dataset.overlayWheelAction === id)?.focus({ preventScroll: true })
  }
  function first() { select(available()[0]?.dataset.overlayWheelAction || null) }
  function next() {
    select(nextOverlayActionId(selectedId.value, available().map(button => button.dataset.overlayWheelAction!)), true)
  }
  function activate() {
    const buttons = available()
    const decision = resolveOverlayActivation(selectedId.value, buttons.map(button => button.dataset.overlayWheelAction!))
    select(decision.selectedId)
    if (decision.activateId) buttons.find(button => button.dataset.overlayWheelAction === decision.activateId)?.click()
    void nextTick(refresh)
  }
  function refresh() {
    if (!available().some(button => button.dataset.overlayWheelAction === selectedId.value)) first()
    else paint()
  }
  function fromTarget(target: EventTarget | null) {
    const button = target instanceof Element ? target.closest<HTMLButtonElement>(SELECTOR) : null
    if (button && available().includes(button)) select(button.dataset.overlayWheelAction!)
  }
  function pointerMove(event: PointerEvent) {
    const point = `${event.screenX}:${event.screenY}`
    if (point === nativePoint || (!event.movementX && !event.movementY)) { nativePoint = point; return }
    nativePoint = point
    fromTarget(event.target)
  }
  function syntheticPointer(state: OverlayPointerState) {
    const previous = movementRevision
    movementRevision = state.movementRevision
    // Visibility/layout changes are not mouse movement. First sample seeds the baseline.
    if (previous === undefined || previous === movementRevision || !state.surfaceHovered || state.x === null || state.y === null) return
    fromTarget(document.elementFromPoint(state.x, state.y))
  }
  function resetPointer() { nativePoint = null }
  watch(selectedId, paint, { flush: 'post' })
  return { selectedId, available, select, first, next, activate, refresh, pointerMove, syntheticPointer, resetPointer, focus: fromTarget }
}
