import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import { createTargetLapVoiceRuntime } from '~/services/spotter/targetLapVoiceRuntime'
import { createVoicePlaybackQueue, type VoiceCue } from '~/services/audio/voicePlaybackQueue'
import { createFinishLineVoiceRuntime } from '~/services/spotter/finishLineVoiceRuntime'
import { createPressureRecommendationVoiceRuntime } from '~/services/spotter/pressureRecommendationVoiceRuntime'
import { voiceScript } from '~/config/voiceScript'
import { advanceCompletedLapHold, createCompletedLapHoldState } from '~/utils/completedLapHold'
import { completedLapHoldSample } from '~/utils/completedLapHoldSample'
import { evaluateInfoTarget } from '~/utils/infoPresentation'

function frame(lap: number, time: number | null = 90_000, valid: boolean | null = true, extra = {}): FastOverlayState {
  return { isFresh: true, isLive: true, dataSource: 'local', lapsCompleted: lap,
    context: { track: 'Imola', car: 'BMW', sessionType: 0, sessionIndex: 0, sessionUid: 'session-a', serverId: 'server-a' },
    info: { lapsCompleted: lap, lastLapTimeMs: time, lastLapValid: valid, lapValid: false },
    lastLapTimeMs: time, tyreSetup: { pressureRecommendation: null }, ...extra,
  } as FastOverlayState
}
function setup() {
  const cues: VoiceCue[] = []
  const control = { enabled: true, now: 0, target: { active: true, targetTimeMs: 90_000, toleranceMs: 500, keepBetweenSessions: false } }
  const runtime = createTargetLapVoiceRuntime({ getTarget: () => control.target,
    canAnnounce: () => control.enabled, getVoice: () => 'if_sara', now: () => control.now,
    enqueue: cue => { cues.push(cue); return true },
  })
  return { runtime, control, cues }
}

describe('target lap voice shares the compact HUD verdict', () => {
  it.each([[89_000, 'inside'], [90_500, 'inside'], [90_501, 'outside']] as const)('freezes lap %s with the same verdict as the HUD', (time, outcome) => {
    const { runtime, cues, control } = setup()
    runtime.update(frame(0)); runtime.update(frame(1, time)); runtime.update(frame(1, time))
    let hold = advanceCompletedLapHold(createCompletedLapHoldState(), completedLapHoldSample(frame(0)), 0)
    hold = advanceCompletedLapHold(hold, completedLapHoldSample(frame(1, time)), 1)
    expect(evaluateInfoTarget(hold.heldLapTimeMs, hold.heldLapValid === true, control.target)).toBe(outcome)
    expect(cues).toHaveLength(1)
    expect(cues[0]?.scenarioId).toBe(outcome === 'inside' ? 'targetInside' : 'targetOutside')
    control.target.targetTimeMs = 20_000; runtime.update(frame(1, time))
    expect(cues).toHaveLength(1)
  })
  it.each([false, null])('does not rate a lap with completed validity %s', valid => {
    const { runtime, cues } = setup()
    runtime.update(frame(0)); runtime.update(frame(1, 90_000, valid)); expect(cues).toEqual([])
  })
  it.each([null, 0, NaN])('does not invent a missing completed time %s', time => {
    const { runtime, cues } = setup()
    runtime.update(frame(0)); runtime.update(frame(1, time)); runtime.update(frame(1))
    expect(cues).toEqual([])
  })
  it('never replays on startup, reconnect, reset, late target activation or unmute', () => {
    const { runtime, cues, control } = setup()
    runtime.update(frame(3)); runtime.update(frame(3))
    control.enabled = false; runtime.update(frame(4)); control.enabled = true; runtime.update(frame(4))
    control.target.active = false; runtime.update(frame(5)); control.target.active = true; runtime.update(frame(5))
    runtime.update(frame(6, 90_000, true, { isFresh: false })); runtime.update(frame(6))
    runtime.reset(); runtime.update(frame(7)); expect(cues).toEqual([])
    runtime.update(frame(8)); expect(cues).toHaveLength(1)
  })
  it.each([{ isLive: false }, { dataSource: 'focused' }])('does not announce replay/menu/focused-car laps %s', extra => {
    const { runtime, cues } = setup()
    runtime.update(frame(0)); runtime.update(frame(1, 90_000, true, extra)); runtime.update(frame(1))
    expect(cues).toEqual([])
  })
  it('outlap zero is only baseline; rewinds and changed server/car reset it', () => {
    const { runtime, cues } = setup()
    runtime.update(frame(0)); runtime.update(frame(0)); expect(cues).toEqual([])
    runtime.update(frame(1)); expect(cues).toHaveLength(1)
    runtime.update(frame(0)); runtime.update(frame(1)); expect(cues).toHaveLength(2)
    const context = { ...frame(0).context!, serverId: 'server-b', car: 'Ferrari' }
    runtime.update(frame(5, 90_000, true, { context })); expect(cues).toHaveLength(2)
    runtime.update(frame(6, 90_000, true, { context })); expect(cues).toHaveLength(3)
    expect(new Set(cues.map(cue => cue.id)).size).toBe(3)
  })
  it.each(['muted', 'expired', 'context', 'reset', 'next-lap'] as const)('drops queued feedback when %s without interrupting other audio', async reason => {
    const { runtime, cues, control } = setup()
    runtime.update(frame(0)); runtime.update(frame(1)); expect(cues[0]?.canPlay?.()).toBe(true)
    if (reason === 'muted') control.enabled = false
    if (reason === 'expired') control.now = 7000
    if (reason === 'context') runtime.update(frame(1, 90_000, true, { context: null }))
    if (reason === 'reset') runtime.reset()
    if (reason === 'next-lap') runtime.update(frame(2))
    expect(cues[0]?.canPlay?.()).toBe(false)
    const played: string[] = []
    const queue = createVoicePlaybackQueue({ createAudio: path => { played.push(path); return {} as any }, play: async () => 'ended' })
    queue.enqueue(cues[0]!); queue.enqueue({ id: 'other', path: 'pressure.wav', source: 'pressure-warning' })
    await queue.drain(); expect(played).toEqual(['pressure.wav'])
  })
  it('queues the target after lap time and the pressure plan on the same crossing', () => {
    const { runtime, cues } = setup(), order: string[] = []
    const pressure = createPressureRecommendationVoiceRuntime({ getVoice: () => 'if_sara', enqueue: cue => { order.push(cue.source); return true } })
    const finish = createFinishLineVoiceRuntime({ pressure, announceLap: () => order.push('lap-time') })
    const first = frame(2), last = frame(3)
    first.tyreSetup.pressureRecommendation = { sessionId: 'session-a', stintNumber: 1, sourceCompletedLaps: 2, completedLaps: 2, status: 'waiting_for_laps', eligible: false, needsAdjustment: false } as any
    last.tyreSetup.pressureRecommendation = { sessionId: 'session-a', stintNumber: 1, sourceCompletedLaps: 3, completedLaps: 3, status: 'ready', eligible: true, needsAdjustment: true } as any
    finish.update(first); runtime.update(first); finish.update(last); runtime.update(last)
    order.push(...cues.map(cue => cue.source))
    expect(order).toEqual(['lap-time', 'pressure-warning', 'target-lap'])
  })
  it('ships both phrases for both voices as nonempty PCM WAVs', () => {
    for (const id of ['targetInside', 'targetOutside']) {
      // Il copione può cambiare nel Voice Lab, anche per correggere la pronuncia TTS.
      const phrase = voiceScript.scenarios.find(item => item.id === id)
      expect(phrase).toMatchObject({ id, origin: 'system' })
      expect(phrase?.text.trim().length).toBeGreaterThan(0)
      for (const voice of voiceScript.voices) {
        const path = resolve(process.cwd(), `public/voice/qualifying/${id}-${voice}.wav`)
        expect(existsSync(path), path).toBe(true)
        const data = readFileSync(path)
        expect(data.subarray(0, 4).toString()).toBe('RIFF'); expect(data.subarray(8, 12).toString()).toBe('WAVE')
        expect(data.length).toBeGreaterThan(4000)
      }
    }
  })
})
