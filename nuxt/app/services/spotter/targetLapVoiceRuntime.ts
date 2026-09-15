import type { FastOverlayState } from '~/composables/useFastStatePoller'
import type { SpotterVoiceId } from '~/composables/useSpotterVoiceSettings'
import { QUALIFYING_VOICE_AUDIO_DIR } from '~/config/qualifyingVoiceNotifications'
import { advanceCompletedLapHold, createCompletedLapHoldState } from '~/utils/completedLapHold'
import { completedLapHoldSample } from '~/utils/completedLapHoldSample'
import { evaluateInfoTarget, type InfoTargetSettings } from '~/utils/infoPresentation'
import type { VoiceCue } from '../audio/voicePlaybackQueue'

/** The same completed snapshot/evaluator as the HUD, owned by the hidden audio renderer. */
export function createTargetLapVoiceRuntime(options: {
  getTarget: () => InfoTargetSettings | null
  getVoice: () => SpotterVoiceId
  canAnnounce: () => boolean
  enqueue: (cue: VoiceCue) => boolean
  now?: () => number
}) {
  const now = options.now ?? (() => performance.now())
  let state = createCompletedLapHoldState()
  let sequence = 0

  function reset() { state = createCompletedLapHoldState() }

  function update(frame: FastOverlayState) {
    if (!frame.isLive || frame.dataSource === 'focused') { reset(); return }
    const previous = state
    state = advanceCompletedLapHold(state, completedLapHoldSample(frame), now())
    if (state.holdStartedAtMs === null || state.holdStartedAtMs === previous.holdStartedAtMs
      && state.observedLapsCompleted === previous.observedLapsCompleted) return
    // Resolve even when muted: enabling the switch never replays an old lap.
    const outcome = evaluateInfoTarget(state.heldLapTimeMs, state.heldLapValid === true, options.getTarget())
    if (outcome === 'neutral' || !options.canAnnounce()) return
    const snapshot = state
    const scenarioId = outcome === 'inside' ? 'targetInside' : 'targetOutside'
    options.enqueue({
      id: `target-lap-${++sequence}`,
      source: 'target-lap',
      scenarioId,
      path: `${QUALIFYING_VOICE_AUDIO_DIR}/${scenarioId}-${options.getVoice()}.wav`,
      // Let an ongoing phrase finish; drop queued feedback once it is obsolete.
      canPlay: () => options.canAnnounce() && state.contextKey === snapshot.contextKey
        && state.observedLapsCompleted === snapshot.observedLapsCompleted
        && state.holdStartedAtMs === snapshot.holdStartedAtMs
        && now() < snapshot.holdUntilMs!,
    })
  }
  return { update, reset }
}
