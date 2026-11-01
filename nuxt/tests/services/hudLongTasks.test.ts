import { describe, expect, it } from 'vitest'
import {
  cleanLabel, componentLabel, coveredMs, createHudLongFrameAggregator, HUD_LONG_FRAME_HEARTBEAT_MS, HUD_LONG_FRAME_REPORT_MS,
  installHudLongFrameReporter, scriptLabel,
} from '~/services/overlay/hudLongTasks'

describe('hudLongTasks (PIP-702)', () => {
  it('attributes a slow frame to the components updating inside it, when it is reported', () => {
    const agg = createHudLongFrameAggregator('loaf', 0)
    agg.update('DashboardHud', 100, 220)
    agg.update('TrackMap', 210, 260)
    agg.update('Sectors', 400, 410) // outside the frame
    agg.frame({ start: 100, duration: 150, blockingDuration: 90, renderStart: 220,
      scripts: [{ label: 'applyState@IPCRenderer.on', duration: 110 }] })
    agg.frame({ start: 1000, duration: 60 })
    expect(agg.take(30_000)).toEqual({
      frames: 2, maxMs: 150, totalMs: 210, blockingMs: 90, scriptMs: 110, renderMs: 30, layoutMs: 0, unattributedMs: 40, attributedMs: 150,
      top: ['120ms DashboardHud', '40ms TrackMap'], scripts: ['110ms applyState@IPCRenderer.on'],
      periodMs: 30_000, source: 'loaf',
    })
    expect(agg.take(31_000)).toBeNull()
  })

  it('keeps the attribution of an early frame through 30 s of normal 20 Hz updates', () => {
    const agg = createHudLongFrameAggregator('loaf', 0)
    agg.update('DashboardHud', 2_000, 2_180)
    agg.frame({ start: 2_000, duration: 200 })
    for (let t = 2_200; t < 30_000; t += 50) agg.update('Sectors', t, t + 1)
    expect(agg.take(30_000)).toMatchObject({ attributedMs: 180, top: ['180ms DashboardHud'] })
  })

  it('separates layout from script and keeps what neither covers as unattributed', () => {
    const agg = createHudLongFrameAggregator('loaf', 0)
    // 200 ms frame: 60 ms of scripts, layout from 150 to 200, 90 ms covered by nothing.
    agg.frame({ start: 0, duration: 200, renderStart: 140, styleAndLayoutStart: 150,
      scripts: [{ label: 'a', duration: 40 }, { label: 'b', duration: 20 }] })
    expect(agg.take(30_000)).toMatchObject({ scriptMs: 60, layoutMs: 50, renderMs: 60, unattributedMs: 90 })
  })

  it('counts nested components once (union) and names both as candidates', () => {
    expect(coveredMs([{ start: 0, end: 80 }, { start: 0, end: 90 }, { start: 95, end: 120 }], 0, 100)).toBe(95)
    const agg = createHudLongFrameAggregator('loaf', 0)
    agg.update('Child', 0, 80)
    agg.update('Parent', 0, 90)
    agg.frame({ start: 0, duration: 100 })
    expect(agg.take(30_000)).toMatchObject({ attributedMs: 90, top: ['90ms Parent', '80ms Child'] })
  })

  it('sends a heartbeat every 5 minutes with nothing to report, and a last summary on page hide', () => {
    const agg = createHudLongFrameAggregator('longtask', 0)
    expect(agg.take(30_000)).toBeNull()
    expect(agg.take(HUD_LONG_FRAME_HEARTBEAT_MS)).toMatchObject({ frames: 0, source: 'longtask', periodMs: HUD_LONG_FRAME_HEARTBEAT_MS })
    // Page hide always leaves a last row, with or without slow frames (short sessions too).
    expect(agg.take(HUD_LONG_FRAME_HEARTBEAT_MS + 10, true)).toMatchObject({ frames: 0, final: true })
    agg.frame({ start: 10, duration: 70 })
    expect(agg.take(HUD_LONG_FRAME_HEARTBEAT_MS + 20, true)).toMatchObject({ frames: 1, maxMs: 70, final: true })
  })

  it('ignores invalid input and keeps the update buffer bounded', () => {
    const agg = createHudLongFrameAggregator('loaf', 0)
    agg.update('Bad', 10, 5)
    agg.frame({ start: Number.NaN, duration: 60 })
    agg.frame({ start: 0, duration: 0 })
    expect(agg.take(30_000)).toBeNull()
    for (let i = 0; i < 10_000; i++) agg.update('Many', i, i + 1)
    agg.frame({ start: 9_990, duration: 60 })
    expect(agg.take(60_000)?.top).toEqual(['10ms Many'])
  })

  it('labels carry no paths or user data', () => {
    expect(componentLabel({ __name: 'DashboardHud' })).toBe('DashboardHud')
    expect(componentLabel({ name: 'C:\\Users\\me/Hud.vue' })).toBe('Hud.vue')
    expect(componentLabel({ name: 'C:\\Users\\me\\Hud.vue' })).toBe('Hud.vue')
    expect(componentLabel({})).toBe('anonymous')
    expect(componentLabel(null)).toBe('anonymous')
    expect(scriptLabel({ sourceFunctionName: 'applyState', invoker: 'IPCRenderer.on' })).toBe('applyState@IPCRenderer.on')
    expect(scriptLabel({ invokerType: 'user-callback' })).toBe('user-callback')
    expect(cleanLabel('x'.repeat(80))).toHaveLength(40)
  })
})

describe('installHudLongFrameReporter (PIP-702)', () => {
  function browser(types: string[]) {
    const observed: string[] = []
    let callback: ((list: { getEntries(): unknown[] }) => void) | null = null
    class FakeObserver {
      static supportedEntryTypes = types
      constructor(cb: typeof callback) { callback = cb }
      observe(options: { type: string }) { observed.push(options.type) }
      disconnect() {}
      takeRecords() { return [] }
    }
    let clock = 0
    let tick: (() => void) | null = null
    let hide: (() => void) | null = null
    const hooks: Record<string, (this: unknown) => void> = {}
    const reports: unknown[] = []
    const installed = installHudLongFrameReporter({
      Observer: FakeObserver as never, now: () => clock,
      setInterval: (fn) => { tick = fn; return 1 }, clearInterval: () => { tick = null },
      onPageHide: (fn) => { hide = fn }, mixin: (h) => Object.assign(hooks, h), report: (r) => { reports.push(r) },
    })
    return { installed, observed, reports, hooks,
      emit: (entries: unknown[]) => callback?.({ getEntries: () => entries }),
      at: (ms: number) => { clock = ms }, tick: () => tick?.(), hide: () => hide?.() }
  }
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))

  it('observes the real entry type and reports a slow frame with its component and script', async () => {
    const b = browser(['long-animation-frame', 'longtask'])
    expect(b.installed).toBe(true)
    expect(b.observed).toEqual(['long-animation-frame'])
    const component = { $options: { __name: 'DashboardHud' } }
    b.at(100); b.hooks.beforeUpdate!.call(component)
    b.at(220); b.hooks.updated!.call(component)
    b.emit([{ startTime: 100, duration: 150, blockingDuration: 100, renderStart: 230,
      scripts: [{ duration: 110, sourceFunctionName: 'applyState', invoker: 'IPCRenderer.on' }] }])
    b.at(HUD_LONG_FRAME_REPORT_MS); b.tick(); await flush()
    expect(b.reports).toEqual([expect.objectContaining({ frames: 1, source: 'loaf', top: ['120ms DashboardHud'],
      scripts: ['110ms applyState@IPCRenderer.on'], renderMs: 20 })])
  })

  it('falls back to long tasks, reports the last frames on page hide, and refuses without support', async () => {
    const b = browser(['longtask'])
    expect(b.observed).toEqual(['longtask'])
    b.emit([{ startTime: 5, duration: 80 }])
    b.hide(); await flush()
    expect(b.reports).toEqual([expect.objectContaining({ frames: 1, maxMs: 80, source: 'longtask' })])
    expect(browser([]).installed).toBe(false)
  })
})
