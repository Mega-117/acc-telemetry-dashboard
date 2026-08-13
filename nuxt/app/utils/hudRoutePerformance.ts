export const HUD_ROUTE_PHASES = [
  'click',
  'navigation-start',
  'middleware-start',
  'auth-settled',
  'middleware-end',
  'route-module-evaluated',
  'route-resolved',
  'setup-start',
  'mounted',
  'next-paint',
  'refresh-complete',
] as const

export type HudRoutePhase = typeof HUD_ROUTE_PHASES[number]
export type HudRouteBuildMode = 'development' | 'packaged' | 'unknown'
export type HudRoutePrefetchStatus = 'not-started' | 'scheduled' | 'running' | 'complete' | 'failed'

interface ActiveHudRouteTiming {
  runId: string
  source: 'hud-tab-click' | 'router' | 'direct'
  buildMode: HudRouteBuildMode
  startedAt: number
  phases: Partial<Record<HudRoutePhase, number>>
  markNames: Partial<Record<HudRoutePhase, string>>
  finished: boolean
  prefetchStatusAtStart: HudRoutePrefetchStatus
  prefetchDurationMsAtStart: number | null
}

export interface HudRouteTimingSummary {
  runId: string
  source: ActiveHudRouteTiming['source']
  buildMode: HudRouteBuildMode
  prefetchStatusAtStart: HudRoutePrefetchStatus
  prefetchDurationMsAtStart: number | null
  phaseOffsetsMs: Partial<Record<HudRoutePhase, number>>
  clickToShellMs: number | null
  clickToSettingsMs: number | null
  apiReady: boolean
  refreshSucceeded: boolean
}

interface HudRoutePerformanceState {
  sequence: number
  active: ActiveHudRouteTiming | null
  completed: HudRouteTimingSummary[]
  prefetchStatus: HudRoutePrefetchStatus
  prefetchDurationMs: number | null
}

const STATE_KEY = '__ACC_HUD_ROUTE_PERFORMANCE__'
const MAX_COMPLETED_RUNS = 24

type HudPerformanceGlobal = typeof globalThis & {
  [STATE_KEY]?: HudRoutePerformanceState
}

function getState(): HudRoutePerformanceState {
  const root = globalThis as HudPerformanceGlobal
  if (!root[STATE_KEY]) {
    root[STATE_KEY] = {
      sequence: 0,
      active: null,
      completed: [],
      prefetchStatus: 'not-started',
      prefetchDurationMs: null,
    }
  }
  return root[STATE_KEY]
}

function performanceApi(): Performance | null {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance
    : null
}

function nowMs(): number {
  return performanceApi()?.now() ?? Date.now()
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10
}

function markNative(run: ActiveHudRouteTiming, phase: HudRoutePhase): void {
  const api = performanceApi()
  if (!api || typeof api.mark !== 'function') return
  const name = `acc:hud:${run.runId}:${phase}`
  try {
    api.mark(name)
    run.markNames[phase] = name
  } catch {
    // Instrumentation is best-effort and must never block HUD navigation.
  }
}

function ensureActiveTiming(
  source: ActiveHudRouteTiming['source'] = 'direct',
  buildMode: HudRouteBuildMode = 'unknown',
): ActiveHudRouteTiming {
  const state = getState()
  if (state.active && !state.active.finished) return state.active
  return startHudRouteTiming(source, buildMode)
}

export function startHudRouteTiming(
  source: ActiveHudRouteTiming['source'],
  buildMode: HudRouteBuildMode = 'unknown',
): ActiveHudRouteTiming {
  const state = getState()
  state.sequence += 1
  const run: ActiveHudRouteTiming = {
    runId: `hud-${state.sequence}`,
    source,
    buildMode,
    startedAt: nowMs(),
    phases: {},
    markNames: {},
    finished: false,
    prefetchStatusAtStart: state.prefetchStatus,
    prefetchDurationMsAtStart: state.prefetchDurationMs,
  }
  state.active = run
  return run
}

export function markHudRoutePhase(
  phase: HudRoutePhase,
  options: {
    source?: ActiveHudRouteTiming['source']
    buildMode?: HudRouteBuildMode
  } = {},
): void {
  const run = ensureActiveTiming(options.source, options.buildMode)
  if (run.phases[phase] !== undefined) return
  run.phases[phase] = nowMs()
  markNative(run, phase)
}

export function finishHudRouteTiming(context: {
  apiReady: boolean
  refreshSucceeded: boolean
}): HudRouteTimingSummary {
  const state = getState()
  const run = ensureActiveTiming()
  const baseline = run.phases.click ?? run.phases['navigation-start'] ?? run.startedAt
  const phaseOffsetsMs: Partial<Record<HudRoutePhase, number>> = {}

  for (const phase of HUD_ROUTE_PHASES) {
    const timestamp = run.phases[phase]
    if (timestamp !== undefined) phaseOffsetsMs[phase] = roundMs(timestamp - baseline)
  }

  const nextPaint = run.phases['next-paint']
  const refreshComplete = run.phases['refresh-complete']
  const summary: HudRouteTimingSummary = {
    runId: run.runId,
    source: run.source,
    buildMode: run.buildMode,
    prefetchStatusAtStart: run.prefetchStatusAtStart,
    prefetchDurationMsAtStart: run.prefetchDurationMsAtStart,
    phaseOffsetsMs,
    clickToShellMs: nextPaint === undefined ? null : roundMs(nextPaint - baseline),
    clickToSettingsMs: refreshComplete === undefined ? null : roundMs(refreshComplete - baseline),
    apiReady: context.apiReady,
    refreshSucceeded: context.refreshSucceeded,
  }

  const api = performanceApi()
  if (api && typeof api.measure === 'function') {
    const startMark = run.markNames.click ?? run.markNames['navigation-start']
    for (const [label, phase] of [['shell', 'next-paint'], ['settings', 'refresh-complete']] as const) {
      const endMark = run.markNames[phase]
      if (!startMark || !endMark) continue
      try { api.measure(`acc:hud:${run.runId}:click-to-${label}`, startMark, endMark) } catch { /* best effort */ }
    }
  }

  run.finished = true
  state.completed.push(summary)
  if (state.completed.length > MAX_COMPLETED_RUNS) state.completed.shift()
  console.info('[HUD_PERF]', JSON.stringify(summary))
  return summary
}

export function formatHudRouteTimingSummary(summary: HudRouteTimingSummary): string {
  const shell = summary.clickToShellMs === null ? 'n/a' : `${summary.clickToShellMs}ms`
  const settings = summary.clickToSettingsMs === null ? 'n/a' : `${summary.clickToSettingsMs}ms`
  const phase = (name: HudRoutePhase) => {
    const value = summary.phaseOffsetsMs[name]
    return value === undefined ? 'n/a' : `${value}ms`
  }
  return [
    `HUD performance ${summary.runId}`,
    `middleware ${phase('middleware-start')}`,
    `auth ${phase('auth-settled')}`,
    `route ${phase('route-resolved')}`,
    `setup ${phase('setup-start')}`,
    `mounted ${phase('mounted')}`,
    `shell ${shell}`,
    `settings ${settings}`,
    `prefetch ${summary.prefetchStatusAtStart}`,
  ].join(', ')
}

export function setHudRoutePrefetchState(
  status: HudRoutePrefetchStatus,
  durationMs: number | null = null,
): void {
  const state = getState()
  state.prefetchStatus = status
  state.prefetchDurationMs = durationMs === null ? null : roundMs(durationMs)
}

export function getHudRoutePrefetchState(): {
  status: HudRoutePrefetchStatus
  durationMs: number | null
} {
  const state = getState()
  return { status: state.prefetchStatus, durationMs: state.prefetchDurationMs }
}

export function shouldScheduleHudRoutePrefetch(
  routePath: string,
  status: HudRoutePrefetchStatus,
): boolean {
  const normalizedPath = routePath.replace(/\/+$/, '') || '/'
  return normalizedPath === '/panoramica' && status === 'not-started'
}

export function getCompletedHudRouteTimings(): readonly HudRouteTimingSummary[] {
  return getState().completed
}

export function afterHudNextPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve()
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/** @internal Test isolation only. */
export function resetHudRoutePerformanceState(): void {
  const root = globalThis as HudPerformanceGlobal
  delete root[STATE_KEY]
}
