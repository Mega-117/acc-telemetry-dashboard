import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  finishHudRouteTiming,
  formatHudRouteTimingSummary,
  getCompletedHudRouteTimings,
  markHudRoutePhase,
  resetHudRoutePerformanceState,
  setHudRoutePrefetchState,
  shouldScheduleHudRoutePrefetch,
  startHudRouteTiming,
} from '~/utils/hudRoutePerformance'

function installPerformanceClock() {
  let now = 0
  const marks = new Map<string, number>()
  const measures: string[] = []
  vi.stubGlobal('performance', {
    now: () => now,
    mark: (name: string) => { marks.set(name, now) },
    measure: (name: string, start: string, end: string) => {
      if (!marks.has(start) || !marks.has(end)) throw new Error('missing mark')
      measures.push(name)
    },
  } as unknown as Performance)
  return {
    at(value: number) { now = value },
    marks,
    measures,
  }
}

describe('HUD route performance instrumentation', () => {
  beforeEach(() => {
    resetHudRoutePerformanceState()
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetHudRoutePerformanceState()
  })

  it('records ordered non-sensitive phases and the two user budgets', () => {
    const clock = installPerformanceClock()
    startHudRouteTiming('hud-tab-click', 'development')
    markHudRoutePhase('click')
    clock.at(12)
    markHudRoutePhase('middleware-start')
    clock.at(18)
    markHudRoutePhase('auth-settled')
    clock.at(25)
    markHudRoutePhase('route-resolved')
    clock.at(40)
    markHudRoutePhase('setup-start')
    clock.at(75)
    markHudRoutePhase('mounted')
    clock.at(120)
    markHudRoutePhase('next-paint')
    clock.at(340)
    markHudRoutePhase('refresh-complete')

    const summary = finishHudRouteTiming({ apiReady: true, refreshSucceeded: true })

    expect(summary.clickToShellMs).toBe(120)
    expect(summary.clickToSettingsMs).toBe(340)
    expect(summary.phaseOffsetsMs['auth-settled']).toBe(18)
    expect(summary).not.toHaveProperty('uid')
    expect(summary).not.toHaveProperty('email')
    expect(clock.measures).toEqual([
      'acc:hud:hud-1:click-to-shell',
      'acc:hud:hud-1:click-to-settings',
    ])
    expect(getCompletedHudRouteTimings()).toEqual([summary])
    expect(formatHudRouteTimingSummary(summary)).toContain('route 25ms')
    expect(formatHudRouteTimingSummary(summary)).toContain('shell 120ms')
  })

  it('keeps the first observation for duplicate lifecycle callbacks', () => {
    const clock = installPerformanceClock()
    startHudRouteTiming('router', 'packaged')
    markHudRoutePhase('navigation-start')
    clock.at(30)
    markHudRoutePhase('mounted')
    clock.at(90)
    markHudRoutePhase('mounted')
    markHudRoutePhase('next-paint')
    markHudRoutePhase('refresh-complete')

    const summary = finishHudRouteTiming({ apiReady: false, refreshSucceeded: true })
    expect(summary.phaseOffsetsMs.mounted).toBe(30)
    expect(summary.clickToShellMs).toBe(90)
  })

  it('captures prefetch state at navigation start without redefining the run', () => {
    installPerformanceClock()
    setHudRoutePrefetchState('complete', 83.26)
    startHudRouteTiming('hud-tab-click', 'development')
    markHudRoutePhase('click')
    markHudRoutePhase('next-paint')
    markHudRoutePhase('refresh-complete')

    const summary = finishHudRouteTiming({ apiReady: true, refreshSucceeded: true })
    expect(summary.prefetchStatusAtStart).toBe('complete')
    expect(summary.prefetchDurationMsAtStart).toBe(83.3)
  })

  it('schedules prefetch only once and only from interactive Panoramica', () => {
    expect(shouldScheduleHudRoutePrefetch('/panoramica', 'not-started')).toBe(true)
    expect(shouldScheduleHudRoutePrefetch('/panoramica/', 'not-started')).toBe(true)
    expect(shouldScheduleHudRoutePrefetch('/panoramica', 'scheduled')).toBe(false)
    expect(shouldScheduleHudRoutePrefetch('/panoramica', 'running')).toBe(false)
    expect(shouldScheduleHudRoutePrefetch('/panoramica', 'complete')).toBe(false)
    expect(shouldScheduleHudRoutePrefetch('/hud', 'not-started')).toBe(false)
  })

  it('degrades without the Performance API and never blocks navigation', () => {
    vi.stubGlobal('performance', undefined)
    expect(() => {
      startHudRouteTiming('direct')
      markHudRoutePhase('mounted')
      markHudRoutePhase('next-paint')
      markHudRoutePhase('refresh-complete')
      finishHudRouteTiming({ apiReady: false, refreshSucceeded: false })
    }).not.toThrow()
  })
})
