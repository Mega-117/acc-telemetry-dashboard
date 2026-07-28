export interface OverlayInteractionRegionsOptions {
  setMousePassthrough: (ignore: boolean) => void
  isInteractionForced?: () => boolean
  onInteractionChange?: (interactive: boolean) => void
  getDocument?: () => Document | null
  getWindow?: () => Window | null
}

function defaultDocument(): Document | null {
  return typeof document === 'undefined' ? null : document
}

function defaultWindow(): Window | null {
  return typeof window === 'undefined' ? null : window
}

/**
 * Hit-test esplicito sulle coordinate inoltrate da Electron. Quando una
 * BrowserWindow ignora il mouse, `event.target` non e' un contratto affidabile:
 * Chromium riceve il movimento, ma il target puo' restare document/root.
 */
export function matchesOverlayInteractionRegion(
  selector: string,
  clientX: number,
  clientY: number,
  sourceDocument: Document | null = defaultDocument(),
): boolean {
  if (!selector || !sourceDocument) return false
  const elements = typeof sourceDocument.elementsFromPoint === 'function'
    ? sourceDocument.elementsFromPoint(clientX, clientY)
    : []
  return elements.some(element => (
    typeof element.closest === 'function' && !!element.closest(selector)
  ))
}

/**
 * Capability condivisa per overlay click-through: soltanto le regioni
 * dichiarate riattivano la cattura del mouse; il resto continua verso ACC.
 */
export function createOverlayInteractionRegions(options: OverlayInteractionRegionsOptions) {
  let selector: string | null = null
  let lastInteractive: boolean | null = null

  function isForced(): boolean {
    return options.isInteractionForced?.() === true
  }

  function applyInteractive(interactive: boolean): void {
    if (interactive === lastInteractive) return
    lastInteractive = interactive
    options.onInteractionChange?.(interactive)
    options.setMousePassthrough(!interactive)
  }

  function updateFromPoint(clientX: number, clientY: number): void {
    if (!selector) return
    if (isForced()) {
      applyInteractive(true)
      return
    }
    applyInteractive(matchesOverlayInteractionRegion(
      selector,
      clientX,
      clientY,
      options.getDocument?.() ?? defaultDocument(),
    ))
  }

  function handleMouseMove(event: MouseEvent): void {
    updateFromPoint(event.clientX, event.clientY)
  }

  function reset(): void {
    lastInteractive = null
    if (!selector) return
    applyInteractive(isForced())
  }

  function start(nextSelector: string): void {
    const hostWindow = options.getWindow?.() ?? defaultWindow()
    if (selector && hostWindow) {
      hostWindow.removeEventListener('mousemove', handleMouseMove, true)
    }
    selector = nextSelector
    reset()
    hostWindow?.addEventListener('mousemove', handleMouseMove, true)
  }

  function stop(): void {
    const hostWindow = options.getWindow?.() ?? defaultWindow()
    hostWindow?.removeEventListener('mousemove', handleMouseMove, true)
    if (selector && !isForced()) applyInteractive(false)
    selector = null
    lastInteractive = null
  }

  return {
    start,
    stop,
    reset,
    updateFromPoint,
  }
}
