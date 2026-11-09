// dev.14 plan, point 7 (PIP-742): how long a page of the main window takes to appear after a click,
// from the router's start to the second frame painted after the route changed. Numbers only: the
// page is a code from a closed list, never the path (session ids live in the path).

export const SLOW_PAGE_MS = 1000

const PAGES: Array<[RegExp, number]> = [
  [/^\/(?:panoramica)?\/?$/, 1],
  [/^\/sessioni\/?$/, 2],
  [/^\/sessioni\/.+/, 3],
  [/^\/piste(?:\/|$)/, 4],
  [/^\/pitwall\/?$/, 5],
  [/^\/spotter\/?$/, 6],
  [/^\/hud\/?$/, 7],
  [/^\/dati\/?$/, 8],
  [/^\/statistiche\/?$/, 9],
  [/^\/impostazioni\/?$/, 10],
  [/^\/profilo\/?$/, 11],
  [/^\/piloti(?:\/|$)/, 12],
  [/^\/giro\/?$/, 13],
  [/^\/area-pilota\/?$/, 14],
]

// Windows of their own (HUDs, Ctrl+K, hidden runtimes) and dev pages are not navigations of the main window.
const NOT_A_PAGE = /(?:overlay|^\/runtime-bootstrap|^\/spotter-audio-runtime|^\/dev|^\/test-hud|^\/admin)/

/** The page's code, 0 for any other page of the main window, null when it is not a main-window page. */
export function pageCode(path: string): number | null {
  if (typeof path !== 'string' || NOT_A_PAGE.test(path)) return null
  for (const [pattern, code] of PAGES) if (pattern.test(path)) return code
  return 0
}

/** One start time per navigation (the router's own `to` object), so overlapping navigations never mix. */
export function createNavigationClock(now: () => number) {
  const started = new WeakMap<object, number>()
  return {
    start(navigation: object) { started.set(navigation, now()) },
    take(navigation: object): number | null {
      const at = started.get(navigation)
      started.delete(navigation)
      return at ?? null
    },
  }
}

export type PageShown ={ page: number, ms: number, slow: number }

/**
 * PIP-755: the window's first page shown is its start-up (the app opening the Panoramica after
 * the account answers), not a click: R2 08/11 had only those as KO, 5-23 s after the start.
 * True once per window, for the first navigation that is actually painted.
 */
export function createStartupMark() {
  let shown = false
  return (): boolean => {
    const first = !shown
    shown = true
    return first
  }
}

export function pageShown(path: string, startedAt: number, paintedAt: number): PageShown | null {
  const page = pageCode(path)
  if (page === null || !Number.isFinite(startedAt) || !Number.isFinite(paintedAt) || paintedAt < startedAt) return null
  const ms = Math.round(paintedAt - startedAt)
  return { page, ms, slow: ms >= SLOW_PAGE_MS ? 1 : 0 }
}

/** The diary note of a page shown (PIP-742), with `startup` (PIP-755): 1 for the window's first page. */
export function pageTimingNote(shown: PageShown, startup: boolean) {
  return { event: shown.slow ? 'page.slow' as const : 'page.shown' as const, page: shown.page, ms: shown.ms, startup: startup ? 1 : 0 }
}
