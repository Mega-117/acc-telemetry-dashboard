// Developer tools never ship in the installed desktop bundle (Engineering
// Principle 4). Voice Lab stays: normal users manage voice references there.
export const DESKTOP_KEPT_DEV_ROUTES = ['/dev-voice-lab']

export function isDesktopExcludedRoute(path: string): boolean {
  if (DESKTOP_KEPT_DEV_ROUTES.includes(path)) return false
  return path === '/dev' || path.startsWith('/dev-') || path.startsWith('/dev/')
}

export function removeDesktopExcludedPages<T extends { path: string }>(pages: T[]): void {
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    if (isDesktopExcludedRoute(pages[index]!.path)) pages.splice(index, 1)
  }
}
