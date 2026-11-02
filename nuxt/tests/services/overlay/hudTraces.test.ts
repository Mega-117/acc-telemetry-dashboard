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

  it('a valid lap with a missing sector is reported', () => {
    expect(sectorLapTrace(lap(true, [sector(1, 37160, 37447), sector(2, null, 38545), sector(3, 29520, 29485)]), 'bestSector'))
      .toMatchObject({ ok: false, problem: 'missing_delta' })
  })

  it('nothing while a lap is running', () => {
    expect(sectorLapTrace({ mode: 'running', lap: 4, lapValid: true, sectors: [] }, 'bestSector')).toBeNull()
  })
})
