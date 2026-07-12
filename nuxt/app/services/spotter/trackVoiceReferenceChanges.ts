const TRACK_VOICE_REFERENCE_CHANNEL = 'acc-track-voice-references-changed'

function createChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  return new BroadcastChannel(TRACK_VOICE_REFERENCE_CHANNEL)
}

export function publishTrackVoiceReferencesChanged() {
  const channel = createChannel()
  if (!channel) return false
  channel.postMessage({ type: 'voice-points-changed' })
  channel.close()
  return true
}

export function subscribeTrackVoiceReferencesChanged(onChange: () => void) {
  const channel = createChannel()
  if (!channel) return () => {}
  const listener = () => onChange()
  channel.addEventListener('message', listener)
  return () => {
    channel.removeEventListener('message', listener)
    channel.close()
  }
}
