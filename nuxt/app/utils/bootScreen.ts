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
