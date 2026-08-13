import { preloadRouteComponents } from '#app'
import {
  afterHudNextPaint,
  getHudRoutePrefetchState,
  markHudRoutePhase,
  setHudRoutePrefetchState,
  shouldScheduleHudRoutePrefetch,
} from '~/utils/hudRoutePerformance'

export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  const buildMode = import.meta.dev ? 'development' : 'packaged'

  async function waitForOverviewIdle(): Promise<void> {
    await afterHudNextPaint()
    await new Promise<void>((resolve) => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => resolve(), { timeout: 1200 })
      } else {
        window.setTimeout(resolve, 150)
      }
    })
  }

  function scheduleHudRoutePrefetch(): void {
    const current = getHudRoutePrefetchState()
    if (!shouldScheduleHudRoutePrefetch(router.currentRoute.value.path, current.status)) return
    setHudRoutePrefetchState('scheduled')

    void (async () => {
      await waitForOverviewIdle()
      if (!shouldScheduleHudRoutePrefetch(router.currentRoute.value.path, 'not-started')) {
        setHudRoutePrefetchState('not-started')
        return
      }

      setHudRoutePrefetchState('running')
      const startedAt = performance.now()
      try {
        await preloadRouteComponents('/hud')
        const durationMs = performance.now() - startedAt
        setHudRoutePrefetchState('complete', durationMs)
        console.info('[HUD_PERF]', JSON.stringify({ type: 'prefetch', status: 'complete', durationMs: Math.round(durationMs * 10) / 10 }))
      } catch {
        setHudRoutePrefetchState('failed')
        console.warn('[HUD_PERF] HUD route prefetch failed; navigation will use the normal route loader')
      }
    })()
  }

  router.beforeEach((to) => {
    if (to.path !== '/hud') return
    markHudRoutePhase('navigation-start', { source: 'router', buildMode })
  })

  router.beforeResolve((to) => {
    if (to.path !== '/hud') return
    markHudRoutePhase('route-resolved', { source: 'router', buildMode })
  })

  router.afterEach(scheduleHudRoutePrefetch)

  nuxtApp.hook('app:mounted', scheduleHudRoutePrefetch)
})
