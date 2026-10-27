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
