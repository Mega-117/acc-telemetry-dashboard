import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('HUD cold-route performance contract', () => {
  const tabs = readSource('app/components/layout/TabsBarRouter.vue')
  const plugin = readSource('app/plugins/hud-route-performance.client.ts')
  const middleware = readSource('app/middleware/hud-access.ts')
  const page = readSource('app/pages/hud.vue')

  it('connects click, router resolution, middleware, setup, paint, and refresh marks', () => {
    expect(tabs).toContain("startHudRouteTiming('hud-tab-click'")
    expect(tabs).toContain("markHudRoutePhase('click')")
    expect(plugin).toContain("markHudRoutePhase('navigation-start'")
    expect(plugin).toContain("markHudRoutePhase('route-resolved'")
    expect(middleware).toContain("markHudRoutePhase('middleware-start')")
    expect(middleware).toContain("markHudRoutePhase('auth-settled')")
    expect(middleware).toContain("markHudRoutePhase('middleware-end')")
    expect(page).toContain("markHudRouteModulePhase('route-module-evaluated')")
    expect(page).toContain("markHudRoutePhase('setup-start')")
    expect(page).toContain("markHudRoutePhase('mounted')")
    expect(page).toContain("markHudRoutePhase('next-paint')")
    expect(page).toContain("markHudRoutePhase('refresh-complete')")
  })

  it('keeps the timing output non-visual and screen-reader observable', () => {
    expect(page).toContain('data-testid="hud-performance-summary"')
    expect(page).toContain('class="hud-sr-only"')
    expect(page).toContain('aria-live="polite"')
  })

  it('prefetches HUD once after Panoramica has painted and gone idle', () => {
    expect(plugin).toContain("preloadRouteComponents('/hud')")
    expect(plugin).toContain('await afterHudNextPaint()')
    expect(plugin).toContain('window.requestIdleCallback')
    expect(plugin).toContain("setHudRoutePrefetchState('scheduled')")
    expect(plugin).toContain("setHudRoutePrefetchState('complete', durationMs)")
    expect(plugin).toContain("setHudRoutePrefetchState('failed')")
    expect(plugin).toContain("shouldScheduleHudRoutePrefetch(router.currentRoute.value.path, 'not-started')")
    expect(plugin).not.toContain("router.currentRoute.value.path !== '/panoramica'")
    expect(plugin).not.toMatch(/retry|setInterval/i)
  })

  it('does not introduce settings, identity, or telemetry payload fields', () => {
    const instrumentation = readSource('app/utils/hudRoutePerformance.ts')
    expect(instrumentation).not.toMatch(/\b(?:uid|email|token|settingsSnapshot|telemetryPayload)\s*:/i)
    expect(instrumentation).toContain("console.info('[HUD_PERF]'")
  })
})
