import { BOOT_LEAVE_MS, BOOT_SCREEN_ID } from '../../shared/spaLoading'

// PIP-640: the browser loading screen (shared/spaLoading.ts) stays over the app until the first real screen is
// ready, so there is a single loader and no jump. Nothing to do in the desktop app, which has no such screen.

// The app is mounted and its own backdrop (same look, same clock) is underneath: hide the loading screen's copy.
export function handBootBackdropToApp(doc: Document = document): void {
  doc.getElementById(BOOT_SCREEN_ID)?.classList.add('has-app')
}

// The first screen is ready: the logo fades out while the interface fades in, then the loading screen goes.
export function dismissBootScreen(doc: Document = document): void {
  const boot = doc.getElementById(BOOT_SCREEN_ID)
  if (!boot || boot.classList.contains('is-leaving')) return
  boot.classList.add('has-app', 'is-leaving')
  const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  setTimeout(() => boot.remove(), reduced ? 0 : BOOT_LEAVE_MS + 50)
}

// After "Accedi" the loader logo starts where the login logo was and glides to its own place.
export const LOGO_GLIDE_MS = 700
// Minimum time the loader stays after a login, so the glide ends and the laser shows before the dashboard.
export const LOGIN_LOADER_MIN_MS = LOGO_GLIDE_MS + 500

type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
// Transform that puts the loader logo (to) exactly over the login logo (from): same centre, same size.
export function logoGlideStart(from: Box, to: Box): string {
  if (!to.width || !to.height) return ''
  const dx = from.left + from.width / 2 - (to.left + to.width / 2)
  const dy = from.top + from.height / 2 - (to.top + to.height / 2)
  return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(from.width / to.width).toFixed(4)})`
}

// The start loader stays at least this long after the page opened: a fast reload must not flash it for half a
// second. The first screen after it waits for the rest (bootHoldLeft).
export const BOOT_MIN_VISIBLE_MS = 1300
export function bootHoldLeft(doc: Document = document, nowMs: number = performance.now()): number {
  return doc.getElementById(BOOT_SCREEN_ID) ? Math.max(0, BOOT_MIN_VISIBLE_MS - nowMs) : 0
}

// When the first screen is the login, the loader logo does not fade: it glides up into the login logo's place
// (the login logo stays hidden until it arrives), the laser fades away, and the form fades in around it.
export const BOOT_GLIDE_MS = 800
const BOOT_GLIDE_HOLD_MS = 250
export function glideBootLogoTo(target: Element | null, doc: Document = document): void {
  const boot = doc.getElementById(BOOT_SCREEN_ID)
  const logo = boot?.querySelector<HTMLElement>('.rc-boot__inner img')
  if (!boot || boot.classList.contains('is-leaving') || boot.classList.contains('is-gliding')) return
  if (!logo || !target || doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    dismissBootScreen(doc)
    return
  }
  boot.classList.add('has-app', 'is-gliding')
  logo.style.transition = `transform ${BOOT_GLIDE_MS}ms cubic-bezier(.65,0,.25,1), filter ${BOOT_GLIDE_MS}ms ease-out`
  logo.getBoundingClientRect()
  logo.style.transform = logoGlideStart(target.getBoundingClientRect(), logo.getBoundingClientRect())
  setTimeout(() => boot.remove(), BOOT_GLIDE_MS + BOOT_GLIDE_HOLD_MS)
}
