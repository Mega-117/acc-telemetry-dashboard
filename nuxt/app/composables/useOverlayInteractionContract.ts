import { reactive } from 'vue'

export interface OverlayPointerState {
  overlayKey: string
  cursorVisible: boolean
  surfaceHovered: boolean
  controlHovered: boolean
  placementActive: boolean
  x: number | null
  y: number | null
  cursor: string
}

interface OverlayInteractionContractOptions {
  getApi: () => any | null
  isForcedCapture?: () => boolean
}

interface StartInteractionContractOptions {
  surfaceSelector: string
  controlSelector: string
}

const EMPTY_POINTER_STATE: OverlayPointerState = {
  overlayKey: '',
  cursorVisible: false,
  surfaceHovered: false,
  controlHovered: false,
  placementActive: false,
  x: null,
  y: null,
  cursor: 'default',
}

function rectPayload(element: Element) {
  const rect = element.getBoundingClientRect()
  if (!(rect.width > 0 && rect.height > 0)) return null
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }
}

function collectRects(selector: string): Array<{ x: number, y: number, width: number, height: number }> {
  if (!selector || typeof document === 'undefined') return []
  return Array.from(document.querySelectorAll(selector))
    .map(rectPayload)
    .filter((rect): rect is NonNullable<typeof rect> => !!rect)
}

/**
 * Contratto dichiarativo renderer -> main per overlay non attivanti.
 *
 * Il main decide passthrough e z-order con coordinate DIP globali. Il renderer
 * dichiara soltanto geometria DOM e visualizza lo stato puntatore sintetico.
 */
export function useOverlayInteractionContract(options: OverlayInteractionContractOptions) {
  const pointerState = reactive<OverlayPointerState>({ ...EMPTY_POINTER_STATE })
  let selectors: StartInteractionContractOptions | null = null
  let resizeObserver: ResizeObserver | null = null
  let mutationObserver: MutationObserver | null = null
  let removePointerListener: (() => void) | null = null
  let scheduledFrame: number | null = null
  let started = false

  function api(): any | null {
    return options.getApi()
  }

  function applyDocumentPointerClasses() {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle(
      'overlay-pointer-surface-hovered',
      pointerState.surfaceHovered,
    )
    document.documentElement.classList.toggle(
      'overlay-software-cursor-active',
      pointerState.cursorVisible && !pointerState.placementActive,
    )
  }

  function applyPointerState(next: Partial<OverlayPointerState>) {
    Object.assign(pointerState, EMPTY_POINTER_STATE, next)
    applyDocumentPointerClasses()
  }

  function publishContract() {
    scheduledFrame = null
    if (!started || !selectors) return
    const surfaceRects = collectRects(selectors.surfaceSelector)
    const controlRects = collectRects(selectors.controlSelector)
    void api()?.overlayInteractionUpdateContract?.({
      interactive: true,
      forcedCapture: options.isForcedCapture?.() === true,
      visualRects: surfaceRects,
      surfaceRects,
      controlRects,
      cursor: 'default',
    })
  }

  function scheduleRefresh() {
    if (typeof window === 'undefined' || scheduledFrame !== null) return
    scheduledFrame = window.requestAnimationFrame(publishContract)
  }

  function observeCurrentElements() {
    resizeObserver?.disconnect()
    if (typeof ResizeObserver === 'undefined' || !selectors) return
    resizeObserver = new ResizeObserver(scheduleRefresh)
    const observed = new Set<Element>()
    for (const selector of [selectors.surfaceSelector, selectors.controlSelector]) {
      if (!selector) continue
      for (const element of document.querySelectorAll(selector)) {
        if (observed.has(element)) continue
        observed.add(element)
        resizeObserver.observe(element)
      }
    }
  }

  function refresh() {
    observeCurrentElements()
    scheduleRefresh()
  }

  function handlePointerDown(event: PointerEvent) {
    if (!selectors?.controlSelector || !(event.target instanceof Element)) return
    if (!event.target.closest(selectors.controlSelector)) return
    void api()?.overlayInteractionPointerButton?.(true)
  }

  function handlePointerUp() {
    void api()?.overlayInteractionPointerButton?.(false)
  }

  function start(nextSelectors: StartInteractionContractOptions) {
    stop()
    selectors = nextSelectors
    started = true
    const bridge = api()
    if (!bridge?.overlayInteractionUpdateContract) return

    if (typeof bridge.onOverlayInteractionPointerState === 'function') {
      removePointerListener = bridge.onOverlayInteractionPointerState(applyPointerState)
    }
    window.addEventListener('resize', refresh, true)
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('pointerup', handlePointerUp, true)
    window.addEventListener('pointercancel', handlePointerUp, true)
    mutationObserver = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some((mutation) => {
        const target = mutation.target
        return !(target instanceof Element && target.closest('.overlay-software-cursor'))
      })
      if (hasRelevantMutation) refresh()
    })
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    })
    refresh()
  }

  function stop() {
    started = false
    if (scheduledFrame !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(scheduledFrame)
      scheduledFrame = null
    }
    resizeObserver?.disconnect()
    resizeObserver = null
    mutationObserver?.disconnect()
    mutationObserver = null
    removePointerListener?.()
    removePointerListener = null
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', refresh, true)
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('pointerup', handlePointerUp, true)
      window.removeEventListener('pointercancel', handlePointerUp, true)
    }
    if (selectors) void api()?.overlayInteractionClearContract?.()
    selectors = null
    applyPointerState(EMPTY_POINTER_STATE)
  }

  return {
    pointerState,
    start,
    stop,
    refresh,
  }
}
