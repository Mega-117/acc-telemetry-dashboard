import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { placeFloating, type FloatingOptions, type FloatingPlace } from '~/utils/floatingPlacement'

// PIP-641: keeps a floating panel (teleported to <body>) attached to its control while it is open: placed after it
// renders (its real size), followed on scroll and resize, closed by a press outside both or by Escape.
export function useFloatingPanel(anchor: Ref<HTMLElement | null>, panel: Ref<HTMLElement | null>, open: Ref<boolean>,
  options: FloatingOptions, close: () => void) {
  const place = ref<FloatingPlace | null>(null)

  function update() {
    if (!open.value || !anchor.value || !panel.value) return
    place.value = placeFloating(anchor.value.getBoundingClientRect(), { width: panel.value.offsetWidth, height: panel.value.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }, options)
  }
  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node | null
    if (target && (anchor.value?.contains(target) || panel.value?.contains(target))) return
    close()
  }
  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    close()
    anchor.value?.focus()
  }
  function listen(on: boolean) {
    if (on) {
      window.addEventListener('scroll', update, true)
      window.addEventListener('resize', update)
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKey, true)
      return
    }
    window.removeEventListener('scroll', update, true)
    window.removeEventListener('resize', update)
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKey, true)
  }

  watch(open, async (isOpen) => {
    listen(false)
    if (!isOpen) { place.value = null; return }
    await nextTick()
    update()
    listen(true)
  })
  onBeforeUnmount(() => listen(false))

  // Until it is measured the panel is laid out hidden at the top-left, so its size is real when it is placed.
  // A phone sheet is held by its bottom edge: its height may still change once it takes the full width.
  const style = () => {
    const p = place.value
    if (!p) return { left: '0px', top: '0px', visibility: 'hidden' as const }
    const width = p.width ? { width: `${p.width}px` } : {}
    return p.placement === 'sheet'
      ? { left: `${p.left}px`, top: 'auto', bottom: `${p.left}px`, ...width }
      : { left: `${p.left}px`, top: `${p.top}px`, ...width }
  }
  return { place, style, update }
}
