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
  audio_paths?: Partial<Record<SpotterVoiceId | string, string>>
  enabled?: boolean
  timing_offset_sec?: number | null
}

export function normalizeTrackName(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

export function crossedReferencePoint(previous: number, current: number, target: number) {
  if (previous <= current) return previous < target && target <= current
  return target > previous || target <= current
}

export function forwardNormalizedDelta(previous: number, current: number) {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return 0
  if (current >= previous) return current - previous
  return 1 - previous + current
}

export function normalizedSpeedPerSecond(previous: number, current: number, elapsedMs: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  return forwardNormalizedDelta(previous, current) / (elapsedMs / 1000)
}

export function clampTimingOffsetSec(value: unknown) {
  const rounded = Math.round(Number(value) || 0)
  return Math.max(-3, Math.min(3, rounded))
}

export function wrapNormalizedPosition(value: number) {
  if (!Number.isFinite(value)) return 0
  return ((value % 1) + 1) % 1
}

export function effectiveReferencePosition(point: Pick<TrackVoiceReference, 'normalized_car_position' | 'timing_offset_sec'>, speedPerSecond: number) {
  const offsetSec = clampTimingOffsetSec(point.timing_offset_sec)
  if (offsetSec === 0 || !Number.isFinite(speedPerSecond) || speedPerSecond <= 0) {
    return wrapNormalizedPosition(point.normalized_car_position)
  }
  return wrapNormalizedPosition(point.normalized_car_position + offsetSec * speedPerSecond)
}

export function resolveTrackVoiceReferenceAudioPath(
  point: TrackVoiceReference,
  voice: SpotterVoiceId,
) {
  const multiVoicePath = point.audio_paths?.[voice]?.trim()
  if (multiVoicePath) return multiVoicePath

  const legacyVoice = point.audio_voice || 'if_sara'
  if (point.audio_path && legacyVoice === voice) return point.audio_path
  return ''
}

export function filterPlayableTrackVoiceReferences(
  points: TrackVoiceReference[],
  voice: SpotterVoiceId,
) {
  return points
    .map(point => ({
      ...point,
      audio_path: resolveTrackVoiceReferenceAudioPath(point, voice),
      audio_voice: voice,
    }))
    .filter(point => point.enabled !== false && point.type === 'braking_reference' && !!point.audio_path)
    .sort((a, b) => a.normalized_car_position - b.normalized_car_position)
}
