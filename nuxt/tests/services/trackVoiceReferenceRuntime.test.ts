import { describe, expect, it } from 'vitest'
import {
  advanceTrackVoiceReferenceRuntime,
  createTrackVoiceReferenceRuntimeState,
  type TrackVoiceReferenceRuntimeInput,
} from '~/services/spotter/trackVoiceReferenceRuntime'
import type { TrackVoiceReference } from '~/services/spotter/trackVoiceReferences'

const references: TrackVoiceReference[] = [
  { id: 'start', track: 'spa', normalized_car_position: 0.1 },
  { id: 'middle', track: 'spa', normalized_car_position: 0.5 },
]

function step(overrides: Partial<TrackVoiceReferenceRuntimeInput> = {}): TrackVoiceReferenceRuntimeInput {
  return {
    phase: 'active',
    eligible: true,
    legacyLapsCompleted: 0,
    position: 0,
    now: 0,
    references,
    ...overrides,
  }
}

describe('trackVoiceReferenceRuntime (PIP-228)', () => {
  it('stays silent on outlap and starts in the first flying lap', () => {
    let state = createTrackVoiceReferenceRuntimeState()
    state = advanceTrackVoiceReferenceRuntime(state, step({ phase: 'outlap', eligible: false, position: 0.95, now: 1000 })).state
    expect(state.armed).toBe(false)

    state = advanceTrackVoiceReferenceRuntime(state, step({ phase: 'active', position: 0.02, now: 1250 })).state
    const firstFlying = advanceTrackVoiceReferenceRuntime(state, step({ phase: 'active', position: 0.12, now: 1500 }))
    expect(firstFlying.toAnnounce.map(point => point.id)).toEqual(['start'])
  })

  it('disarms on return to garage even when completed laps remains high', () => {
    let state = advanceTrackVoiceReferenceRuntime(
      createTrackVoiceReferenceRuntimeState(),
      step({ phase: 'active', legacyLapsCompleted: 4, position: 0.4, now: 1000 }),
    ).state
    state = advanceTrackVoiceReferenceRuntime(
      state,
      step({ phase: 'garage', eligible: false, legacyLapsCompleted: 4, position: 0.03, now: 1250 }),
    ).state
    expect(state.armed).toBe(false)
  })

  it('suspends a pass-through and resumes without repeating points', () => {
    let state = advanceTrackVoiceReferenceRuntime(createTrackVoiceReferenceRuntimeState(), step({ position: 0.05, now: 1000 })).state
    let result = advanceTrackVoiceReferenceRuntime(state, step({ position: 0.12, now: 1250 }))
    expect(result.toAnnounce.map(point => point.id)).toEqual(['start'])
    state = result.state

    state = advanceTrackVoiceReferenceRuntime(state, step({ phase: 'pit_lane_active', eligible: false, position: 0.2, now: 1500 })).state
    result = advanceTrackVoiceReferenceRuntime(state, step({ phase: 'active', position: 0.25, now: 1750 }))
    expect(result.toAnnounce).toEqual([])
    expect([...result.state.playedIds]).toContain('start')
  })

  it('arms immediately for a grid start or runtime reload already on track', () => {
    const result = advanceTrackVoiceReferenceRuntime(
      createTrackVoiceReferenceRuntimeState(),
      step({ phase: 'active', legacyLapsCompleted: 0, position: 0.4, now: 1000 }),
    )
    expect(result.state.armed).toBe(true)
  })
})
