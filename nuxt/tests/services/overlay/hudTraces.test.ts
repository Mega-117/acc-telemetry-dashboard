import { describe, expect, it, vi } from 'vitest'
import { createShiftTraceAggregator, type ShiftTraceFrame } from '~/services/overlay/shiftTrace'
import { createValueEpisodeCounter, VALUE_EPISODE_REPORT_MS } from '~/services/overlay/valueEpisodes'
import { controlKContextReason, createControlKContextTracker } from '~/services/overlay/controlKContext'
import { sectorLapTrace } from '~/utils/sectorDeltaPresentation'
import type { SectorHudEntry } from '~/composables/useLiveStatePoller'

describe('PIP-704 hud.shift', () => {
  const frame = (now: number, gear: number, rpm: number, flash: boolean, extra: Partial<ShiftTraceFrame> = {}): ShiftTraceFrame =>
    ({ now, car: 'ferrari_296_gt3', gear, rpm, flash, targetRpm: 7300, ...extra })

  function upshift(feed: (f: ShiftTraceFrame) => void, t: number, gear: number, onsetRpm: number | null, shiftRpm: number) {
    feed(frame(t, gear, 6000, false))
    if (onsetRpm !== null) feed(frame(t + 100, gear, onsetRpm, true))
    feed(frame(t + 300, gear, shiftRpm, onsetRpm !== null))
    feed(frame(t + 350, gear + 1, 5200, false))
  }

  it('every 10 upshifts: medians of flash onset, real shift and lead', () => {
    const report = vi.fn()
    const trace = createShiftTraceAggregator(report)
    for (let i = 0; i < 10; i++) upshift(f => trace.feed(f), i * 1000, 2 + (i % 3), 7160, 7340)
    expect(report).toHaveBeenCalledOnce()
    expect(report.mock.calls[0]![0]).toEqual({ car: 'ferrari_296_gt3', targetRpm: 7300, shifts: 10, flashed: 10,
      onsetRpmMedian: 7160, upshiftRpmMedian: 7340, leadMsMedian: 250, beforeFlash: 0, late: 0 })
  })

  it('counts shifts before the flash and late shifts', () => {
    const report = vi.fn()
    const trace = createShiftTraceAggregator(report, 2)
    upshift(f => trace.feed(f), 0, 3, null, 6800)
    upshift(f => trace.feed(f), 1000, 4, 7150, 7600)
    expect(report.mock.calls[0]![0]).toMatchObject({ shifts: 2, flashed: 1, beforeFlash: 1, late: 1 })
  })

  it('a flash followed by a lift expires after 3 s (Codex): the later shift counts as before the flash', () => {
    const report = vi.fn()
    const trace = createShiftTraceAggregator(report, 1)
    trace.feed(frame(0, 3, 7000, false))
    trace.feed(frame(100, 3, 7160, true))
    trace.feed(frame(500, 3, 6000, false))
    trace.feed(frame(11_000, 3, 7100, false))
    trace.feed(frame(11_050, 4, 5200, false))
    expect(report.mock.calls[0]![0]).toMatchObject({ flashed: 0, beforeFlash: 1, leadMsMedian: null })
  })

  it('a downshift, another car or missing data never counts', () => {
    const report = vi.fn()
    const trace = createShiftTraceAggregator(report, 1)
    trace.feed(frame(0, 4, 7000, false))
    trace.feed(frame(50, 3, 7500, false))
    trace.feed(frame(100, 3, 7000, false))
    trace.feed(frame(150, 4, 6000, false, { car: null }))
    trace.feed(frame(200, 4, 7000, false, { car: 'bmw_m4_gt3' }))
    trace.feed(frame(250, 5, 6000, false, { car: 'bmw_m4_gt3', targetRpm: 7000 }))
    expect(report).not.toHaveBeenCalled()
  })
})

describe('PIP-704 hud.value_episode', () => {
  it('counts a short drop-out between two values, only while watching', () => {
    const report = vi.fn()
    const counter = createValueEpisodeCounter(report, 0)
    counter.feed({ now: 1000, blank: false, watch: true })
    counter.feed({ now: 1100, blank: true, watch: true })
    counter.feed({ now: 1250, blank: false, watch: true })
    // At the line (not watched) a reset is expected.
    counter.feed({ now: 2000, blank: true, watch: false })
    counter.feed({ now: 2100, blank: false, watch: true })
    // A long blank (more than 2 s) is "no data", not a flicker.
    counter.feed({ now: 3000, blank: true, watch: true })
    counter.feed({ now: 6000, blank: false, watch: true })
    counter.final(7000)
    expect(report).toHaveBeenCalledWith({ episodes: 1, maxMs: 150, periodMs: 7000 })
  })

  it('sends at most every 5 minutes and nothing when quiet', () => {
    const report = vi.fn()
    const counter = createValueEpisodeCounter(report, 0)
    counter.feed({ now: 10, blank: false, watch: true })
    counter.feed({ now: 20, blank: true, watch: true })
    counter.feed({ now: 30, blank: false, watch: true })
    expect(report).not.toHaveBeenCalled()
    counter.feed({ now: VALUE_EPISODE_REPORT_MS + 30, blank: false, watch: true })
    expect(report).toHaveBeenCalledOnce()
    counter.final(VALUE_EPISODE_REPORT_MS + 60)
    expect(report).toHaveBeenCalledOnce()
  })
})

describe('PIP-704 ctrlk.context', () => {
  const box = { isLive: true, speedKmh: 0, isEngineRunning: false }

  it('names the evidence that decided the switch', () => {
    expect(controlKContextReason({ ...box, isLive: false })).toBe('no_live')
    expect(controlKContextReason({ ...box, isSetupMenuVisible: true })).toBe('setup_menu')
    expect(controlKContextReason({ ...box, speedKmh: 40 })).toBe('moving')
    expect(controlKContextReason({ ...box, isEngineRunning: true })).toBe('engine')
    expect(controlKContextReason({ ...box, finalFf: 0.3 })).toBe('ffb_on')
    expect(controlKContextReason({ ...box, finalFf: 0 })).toBe('ffb_off')
    expect(controlKContextReason({ ...box, hudDriving: true })).toBe('hud_driving')
    expect(controlKContextReason(box)).toBe('unknown')
  })

  it('reports each committed switch once, with how long weak evidence had to agree', () => {
    const changes: unknown[] = []
    const tracker = createControlKContextTracker('pause', 1500, change => changes.push(change))
    // Stopped in the box after the pressure automation: force feedback alone must settle.
    tracker.update({ ...box, finalFf: 0.3 }, 0)
    tracker.update({ ...box, finalFf: 0.3 }, 1000)
    expect(changes).toEqual([])
    tracker.update({ ...box, finalFf: 0.3 }, 1600)
    tracker.update({ ...box, finalFf: 0.3 }, 2000)
    tracker.update({ ...box, isSetupMenuVisible: true }, 3000)
    expect(changes).toEqual([
      { from: 'pause', to: 'drive', reason: 'ffb_on', settledMs: 1600 },
      { from: 'drive', to: 'pause', reason: 'setup_menu', settledMs: 0 },
    ])
  })

  it('a broken listener never changes the panel', () => {
    const tracker = createControlKContextTracker('pause', 1500, () => { throw new Error('diary down') })
    expect(tracker.update({ ...box, isEngineRunning: true }, 0)).toBe('drive')
  })
})

describe('PIP-704 hud.sector_state', () => {
  const sector = (index: number, currentMs: number | null, bestReferenceMs: number | null): SectorHudEntry => ({
    index, state: currentMs === null ? 'pending' : 'complete', currentMs, referenceMs: null, bestMs: bestReferenceMs,
    deltaMs: null, bestReferenceMs, color: 'white',
  })
  const lap = (lapValid: boolean, sectors: SectorHudEntry[]) => ({ mode: 'last_lap', lap: 4, lapValid, sectors })

  it('first flying lap: 0.000 purple on every sector', () => {
    const trace = sectorLapTrace(lap(true, [sector(1, 37697, null), sector(2, 39005, null), sector(3, 29485, null)]), 'bestSector')
    expect(trace).toEqual({ lap: 4, lapValid: true, firstBest: true, ok: true, problem: null,
      colors: ['purple', 'purple', 'purple'], deltas: [0, 0, 0] })
  })

  it('purple at or under the best, red above', () => {
    const trace = sectorLapTrace(lap(true, [sector(1, 37160, 37447), sector(2, 38545, 38545), sector(3, 29520, 29485)]), 'bestSector')
    expect(trace).toMatchObject({ ok: true, colors: ['purple', 'purple', 'red'], deltas: [-287, 0, 35] })
  })

  it('invalid lap: all white, deltas kept', () => {
    const trace = sectorLapTrace(lap(false, [sector(1, 37160, 37447), sector(2, 39000, 38545), sector(3, 29520, 29485)]), 'bestSector')
    expect(trace).toMatchObject({ ok: true, lapValid: false, colors: ['white', 'white', 'white'], deltas: [-287, 455, 35] })
  })

  it('a lap the logger could not rebuild is not traced (Codex: not a presentation error)', () => {
    expect(sectorLapTrace(lap(true, [sector(1, 37160, 37447), sector(2, null, 38545), sector(3, 29520, 29485)]), 'bestSector')).toBeNull()
    expect(sectorLapTrace(lap(true, []), 'bestSector')).toBeNull()
  })

  it('nothing while a lap is running', () => {
    expect(sectorLapTrace({ mode: 'running', lap: 4, lapValid: true, sectors: [] }, 'bestSector')).toBeNull()
  })
})

describe('02/11 hud.shift health', () => {
  it('says why no hud.shift arrives: frames skipped by reason, upshifts seen, reports sent', () => {
    const trace = createShiftTraceAggregator(() => {}, 2)
    const feed = (gear: number, extra: Partial<ShiftTraceFrame> = {}) =>
      trace.feed({ now: 0, car: 'ferrari_296_gt3', gear, rpm: 7000, flash: false, targetRpm: 7300, ...extra })
    feed(2, { targetRpm: null })
    feed(2, { car: null })
    feed(2, { rpm: null })
    feed(2); feed(3); feed(4)
    expect(trace.takeHealth()).toEqual({ frames: 6, noCar: 1, noTarget: 1, noGearOrRpm: 1, upshifts: 2, reports: 1 })
    expect(trace.takeHealth().frames).toBe(0)
  })
})

describe('PIP-710 hud.shown', () => {
  it('at every completed lap says which lap it shows and how long it held retained data', async () => {
    const { createHudShownTracker } = await import('~/services/overlay/hudShownReport')
    const reports: unknown[] = []
    const tracker = createHudShownTracker(r => reports.push(r))
    tracker.feed({ now: 0, laps: 4, fresh: true, live: true, focused: false })
    tracker.feed({ now: 1_000, laps: 4, fresh: false, live: true, focused: false })   // retained from here
    tracker.feed({ now: 5_200, laps: 5, fresh: false, live: true, focused: false })
    tracker.feed({ now: 6_000, laps: 5, fresh: true, live: true, focused: false })
    tracker.feed({ now: 99_000, laps: 6, fresh: true, live: true, focused: false })
    expect(reports).toEqual([{ laps: 5, retainedMs: 4_200, focused: false }, { laps: 6, retainedMs: 0, focused: false }])
  })

  it('no report when the lap count does not move or the game is not live', async () => {
    const { createHudShownTracker } = await import('~/services/overlay/hudShownReport')
    const reports: unknown[] = []
    const tracker = createHudShownTracker(r => reports.push(r))
    tracker.feed({ now: 0, laps: 4, fresh: true, live: true, focused: false })
    tracker.feed({ now: 1, laps: 4, fresh: true, live: true, focused: false })
    tracker.feed({ now: 2, laps: 5, fresh: true, live: false, focused: false })
    expect(reports).toEqual([])
  })
})

describe('PIP-711 hud.values', () => {
  const frame = (now: number, laps: number, extra: Record<string, unknown> = {}) => ({
    now, laps, fresh: true, live: true, focused: false, ...extra,
  })
  const read = () => ({ inputs: { gear: 3 }, shown: { gear: '3' } })

  it('sends at once, at every completed lap and at most once a minute in between', async () => {
    const { createHudValuesReporter } = await import('~/services/overlay/hudValuesReport')
    const sent: unknown[] = []
    const reporter = createHudValuesReporter((inputs, shown) => sent.push({ inputs, shown }), 60_000)
    reporter.feed(frame(0, 4), read)            // first frame
    reporter.feed(frame(10_000, 4), read)       // too soon
    reporter.feed(frame(20_000, 5), read)       // the line
    reporter.feed(frame(50_000, 5), read)       // too soon
    reporter.feed(frame(80_001, 5), read)       // a minute after the last
    expect(sent).toHaveLength(3)
  })

  it('never while retained, not live or showing another car', async () => {
    const { createHudValuesReporter } = await import('~/services/overlay/hudValuesReport')
    const sent: unknown[] = []
    const reporter = createHudValuesReporter(() => sent.push(1), 60_000)
    reporter.feed(frame(0, 4, { fresh: false }), read)
    reporter.feed(frame(1, 5, { live: false }), read)
    reporter.feed(frame(2, 6, { focused: true }), read)
    expect(sent).toEqual([])
  })

  it('a window with nothing on screen sends nothing, and reads only when a report is due', async () => {
    const { createHudValuesReporter } = await import('~/services/overlay/hudValuesReport')
    const sent: unknown[] = []
    let reads = 0
    const reporter = createHudValuesReporter(() => sent.push(1), 60_000)
    reporter.feed(frame(0, 4), () => { reads += 1; return { inputs: {}, shown: {} } })
    reporter.feed(frame(1, 4), () => { reads += 1; return read() })
    reporter.feed(frame(2, 4), () => { reads += 1; return read() })   // not due: not read
    expect(sent).toHaveLength(1)
    expect(reads).toBe(2)
  })

  it('cleans the inputs: only finite numbers, booleans and null go out', async () => {
    const { cleanValues } = await import('~/services/overlay/hudValuesReport')
    expect(cleanValues({ a: 1, b: Number.NaN, c: 'x', d: undefined, e: null, f: true }))
      .toEqual({ a: 1, d: null, e: null, f: true })
  })

  it('the Info and Dashboard pages report what they draw', async () => {
    const { readFileSync } = await import('node:fs')
    for (const page of ['info-overlay.vue', 'dashboard-overlay.vue', 'tyres-overlay.vue']) {
      const source = readFileSync(`app/pages/${page}`, 'utf8')
      expect(source).toContain("useHudValuesReport('")
    }
    // The texts are read after the render (03/11: before it, the DOM still showed the previous frame).
    expect(readFileSync('app/services/overlay/hudValuesReport.ts', 'utf8')).toContain("{ flush: 'post' }")
  })
})
