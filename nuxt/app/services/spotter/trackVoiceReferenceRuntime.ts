import {
  advanceTrackVoiceReferenceTick,
  shouldArmTrackVoiceReferences,
  shouldDisarmTrackVoiceReferences,
  type TrackVoiceReference,
  type TrackReferencePhase,
} from '~/services/spotter/trackVoiceReferences'

export interface TrackVoiceReferenceRuntimeState {
  armed: boolean
  playedIds: Set<string>
  previousPosition: number | null
  previousTs: number | null
}

export interface TrackVoiceReferenceRuntimeInput {
  phase: TrackReferencePhase | null
  eligible: boolean
  legacyLapsCompleted: number | null
  position: number | null
  now: number
  references: TrackVoiceReference[]
}

export interface TrackVoiceReferenceRuntimeResult {
  state: TrackVoiceReferenceRuntimeState
  toAnnounce: TrackVoiceReference[]
}

export function createTrackVoiceReferenceRuntimeState(): TrackVoiceReferenceRuntimeState {
  return { armed: false, playedIds: new Set(), previousPosition: null, previousTs: null }
}

export function advanceTrackVoiceReferenceRuntime(
  current: TrackVoiceReferenceRuntimeState,
  input: TrackVoiceReferenceRuntimeInput,
): TrackVoiceReferenceRuntimeResult {
  if (shouldDisarmTrackVoiceReferences(input.phase)) {
    return { state: createTrackVoiceReferenceRuntimeState(), toAnnounce: [] }
  }

  let state = current
  if (!state.armed) {
    if (!shouldArmTrackVoiceReferences(input.phase, input.legacyLapsCompleted)) {
      return { state, toAnnounce: [] }
    }
    state = {
      armed: true,
      playedIds: new Set(),
      previousPosition: input.position,
      previousTs: input.now,
    }
    return { state, toAnnounce: [] }
  }

  // Pause/menu and pit pass-through suspend without clearing the per-lap set.
  const authoritativeSuspension = input.phase !== null && !input.eligible
  if (authoritativeSuspension || input.position === null) return { state, toAnnounce: [] }
  if (state.previousPosition === null || state.previousTs === null) {
    return {
      state: { ...state, previousPosition: input.position, previousTs: input.now },
      toAnnounce: [],
    }
  }

  const outcome = advanceTrackVoiceReferenceTick({
    previous: state.previousPosition,
    current: input.position,
    elapsedMs: input.now - state.previousTs,
    playedIds: state.playedIds,
    references: input.references,
  })
  return {
    state: {
      armed: true,
      playedIds: outcome.playedIds,
      previousPosition: input.position,
      previousTs: input.now,
    },
    toAnnounce: outcome.toAnnounce,
  }
}
