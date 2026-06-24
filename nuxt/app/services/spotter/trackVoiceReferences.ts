import type { SpotterVoiceId } from '~/composables/useSpotterVoiceSettings'

export interface TrackVoiceReference {
  id: string
  track: string
  type?: string
  normalized_car_position: number
  label?: string
  text?: string
  audio_path?: string
  audio_voice?: SpotterVoiceId | string
  enabled?: boolean
}

export function normalizeTrackName(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

export function crossedReferencePoint(previous: number, current: number, target: number) {
  if (previous <= current) return previous < target && target <= current
  return target > previous || target <= current
}

export function filterPlayableTrackVoiceReferences(
  points: TrackVoiceReference[],
  voice: SpotterVoiceId,
) {
  return points
    .filter(point =>
      point.enabled !== false &&
      point.type === 'braking_reference' &&
      !!point.audio_path &&
      (point.audio_voice || 'if_sara') === voice,
    )
    .sort((a, b) => a.normalized_car_position - b.normalized_car_position)
}

