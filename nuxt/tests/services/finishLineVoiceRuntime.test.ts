import { describe, expect, it } from 'vitest'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import { createFinishLineVoiceRuntime } from '~/services/spotter/finishLineVoiceRuntime'
import { createPressureRecommendationVoiceRuntime } from '~/services/spotter/pressureRecommendationVoiceRuntime'

function frame(lap: number, session = 'server-a', extra: Record<string, unknown> = {}): FastOverlayState {
  return {
    isFresh: true, isLive: true, dataSource: 'local', lapsCompleted: lap,
    context: { sessionUid: session, track: 'Imola', sessionType: 0, sessionIndex: 0 },
    lastLapTimeMs: 101_917, info: { lapsCompleted: lap, lastLapTimeMs: 101_917, lastLapValid: true },
    tyreSetup: { pressureRecommendation: {
      sessionId: session, stintNumber: 1, sourceCompletedLaps: lap, completedLaps: lap,
      status: lap >= 3 ? 'ready' : 'waiting_for_laps', eligible: lap >= 3, needsAdjustment: lap >= 3,
    } }, ...extra,
  } as FastOverlayState
}
function setup() {
  const events: string[] = []
  const laps: { id: string, time: number, valid: boolean }[] = []
  const pressure = createPressureRecommendationVoiceRuntime({
    getVoice: () => 'if_sara', enqueue: cue => { events.push(cue.source); return true },
  })
  const runtime = createFinishLineVoiceRuntime({ pressure, announceLap: (id, time, valid) => {
    events.push('lap-time'); laps.push({ id, time, valid })
  } })
  return { runtime, events, laps }
}

describe('coherent finish-line audio', () => {
  it('announces every lap after changing server, even with identical track and session type', () => {
    const { runtime, laps, events } = setup()
    for (const session of ['server-a', 'server-b']) {
      for (let lap = 0; lap <= 3; lap++) runtime.update(frame(lap, session))
    }
    expect(laps).toHaveLength(6)
    expect(new Set(laps.map(lap => lap.id)).size).toBe(6)
    expect(events).toEqual(['lap-time', 'lap-time', 'lap-time', 'pressure-warning', 'lap-time', 'lap-time', 'lap-time', 'pressure-warning'])
  })
  it('recovers a stale boundary without losing the third-lap warning or duplicating it', () => {
    const { runtime, events } = setup()
    runtime.update(frame(2))
    runtime.update(frame(0, 'server-a', { isFresh: false, context: null }))
    runtime.update(frame(3))
    runtime.update(frame(3))
    runtime.update(frame(4))
    expect(events).toEqual(['lap-time', 'pressure-warning', 'lap-time'])
  })
  it('matches a delayed third-lap recommendation after the lap time', () => {
    const { runtime, events } = setup()
    runtime.update(frame(2))
    runtime.update(frame(3, 'server-a', { tyreSetup: frame(2).tyreSetup }))
    expect(events).toEqual(['lap-time'])
    runtime.update(frame(3))
    expect(events).toEqual(['lap-time', 'pressure-warning'])
  })
  it('does not replay history on startup or reconnect', () => {
    const { runtime, events } = setup()
    runtime.update(frame(3))
    runtime.update(frame(3))
    runtime.reset()
    runtime.update(frame(3))
    expect(events).toEqual([])
    runtime.update(frame(4))
    expect(events).toEqual(['lap-time'])
  })
  it('keeps silent pressure plans silent, including plans that become ready only at lap four', () => {
    for (const status of ['within_tolerance', 'waiting_for_stable_pressure']) {
      const { runtime, events } = setup()
      runtime.update(frame(2))
      const third = frame(3)
      Object.assign(third.tyreSetup.pressureRecommendation!, { status, eligible: false, needsAdjustment: false })
      runtime.update(third)
      runtime.update(frame(4))
      expect(events).toEqual(['lap-time', 'lap-time'])
    }
  })
  it('uses completed-lap validity and waits for a missing time without losing the lap', () => {
    const { runtime, laps } = setup()
    runtime.update(frame(0))
    runtime.update(frame(1, 'server-a', { lastLapTimeMs: null, info: null }))
    expect(laps).toEqual([])
    runtime.update(frame(1, 'server-a', { lapValid: true, info: { lapsCompleted: 1, lastLapTimeMs: 170_000, lastLapValid: false } }))
    expect(laps).toMatchObject([{ time: 170_000, valid: false }])
  })
  it('handles a counter restart and ignores focused-car telemetry', () => {
    const { runtime, laps } = setup()
    runtime.update(frame(0)); runtime.update(frame(1))
    runtime.update(frame(2, 'server-a', { dataSource: 'focused' }))
    runtime.update(frame(0)); runtime.update(frame(1))
    expect(laps).toHaveLength(2)
    expect(laps[0]!.id).not.toBe(laps[1]!.id)
  })
})
