import type { FastOverlayState } from '~/composables/useFastStatePoller'
import type { VoiceCue } from '~/services/audio/voicePlaybackQueue'
import { commonContextKey } from '~/services/telemetry/commonLive'
import { featureAvailability, TELEMETRY_FEATURES } from '~/services/telemetry/featureAvailability'

export function audioContextKey(frame: FastOverlayState): string | null {
  if (frame.commonLive) return commonContextKey(frame.commonLive)
  return frame.context ? JSON.stringify(['acc', frame.context.sessionUid, frame.context.track, frame.context.car]) : null
}

export function audioFeatureAvailable(frame: FastOverlayState, feature: keyof typeof TELEMETRY_FEATURES): boolean {
  // Legacy ACC retains its existing source-specific evaluators.
  if (!frame.commonLive || frame.commonLive.gameId === 'acc') return frame.isFresh
  return frame.isLive && featureAvailability(frame.commonLive, TELEMETRY_FEATURES[feature]).available
}

/** Recheck immediately before playback, including fallback after async errors. */
export function bindAudioCue(cue: VoiceCue, getFrame: () => FastOverlayState): VoiceCue {
  const key = audioContextKey(getFrame())
  return { ...cue, canPlay: () => key !== null && key === audioContextKey(getFrame())
    && getFrame().isFresh && getFrame().isLive && (cue.canPlay?.() ?? true) }
}
