import { installHudLongFrameReporter, type HudLongFrameReport } from '~/services/overlay/hudLongTasks'

type LongFrameApi = { reportHudLongTasks?: (report: HudLongFrameReport) => Promise<unknown> }

/**
 * PIP-702: only in the HUD window (overlay-surface) of the desktop app: slow-frame summaries
 * for the diary (see services/overlay/hudLongTasks.ts). Nothing runs in the site or other windows.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const api = (window as unknown as { electronAPI?: LongFrameApi }).electronAPI
  const onSurface = window.location.pathname.replace(/\/$/, '').endsWith('/overlay-surface')
  const report = api?.reportHudLongTasks
  if (!onSurface || typeof report !== 'function') return
  installHudLongFrameReporter({
    Observer: typeof PerformanceObserver === 'function' ? PerformanceObserver as never : undefined,
    now: () => performance.now(),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: id => window.clearInterval(id as number),
    onPageHide: fn => window.addEventListener('pagehide', fn, { once: true }),
    mixin: hooks => nuxtApp.vueApp.mixin(hooks),
    report: summary => report.call(api, summary),
  })
})
