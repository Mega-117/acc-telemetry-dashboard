import { describe, expect, it } from 'vitest'
import {
  clampTimingOffsetSec,
  crossedReferencePoint,
  effectiveReferencePosition,
  filterPlayableTrackVoiceReferences,
  isLapCountIncrement,
  normalizedSpeedPerSecond,
  normalizeTrackName,
  resolveTrackVoiceReferenceAudioPath,
  shouldArmTrackVoiceReferences,
  type TrackVoiceReference,
} from '~/services/spotter/trackVoiceReferences'

const points: TrackVoiceReference[] = [
  { id: 'late', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.7, audio_path: '/late.wav', audio_voice: 'if_sara' },
  { id: 'disabled', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.2, audio_path: '/disabled.wav', audio_voice: 'if_sara', enabled: false },
  { id: 'wrong-voice', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.3, audio_path: '/wrong.wav', audio_voice: 'im_nicola' },
  { id: 'multi-voice', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.35, audio_paths: { if_sara: '/sara.wav', im_nicola: '/nicola.wav' } },
  { id: 'missing-audio', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.4, audio_voice: 'if_sara' },
  { id: 'early', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.1, audio_path: '/early.wav', audio_voice: 'if_sara' },
  { id: 'other-type', track: 'Spa', type: 'note', normalized_car_position: 0.5, audio_path: '/note.wav', audio_voice: 'if_sara' },
]

describe('trackVoiceReferences', () => {
  it('normalizes track names for matching telemetry labels', () => {
    expect(normalizeTrackName(' Spa ')).toBe('spa')
    expect(normalizeTrackName(null)).toBe('')
  })

  it('keeps only playable braking references for the selected voice, sorted by position', () => {
    expect(filterPlayableTrackVoiceReferences(points, 'if_sara').map(point => point.id)).toEqual(['early', 'multi-voice', 'late'])
  })
  it('resolves per-voice paths before falling back to legacy audio fields', () => {
    expect(resolveTrackVoiceReferenceAudioPath(points[4]!, 'if_sara')).toBe('')
    expect(resolveTrackVoiceReferenceAudioPath(points[3]!, 'if_sara')).toBe('/sara.wav')
    expect(resolveTrackVoiceReferenceAudioPath(points[3]!, 'im_nicola')).toBe('/nicola.wav')
    expect(resolveTrackVoiceReferenceAudioPath(points[0]!, 'if_sara')).toBe('/late.wav')
  })

  it('keeps timing offset zero on the recorded reference point', () => {
    expect(effectiveReferencePosition({ normalized_car_position: 0.5, timing_offset_sec: 0 }, 0.02)).toBe(0.5)
    expect(effectiveReferencePosition({ normalized_car_position: 0.5 }, 0.02)).toBe(0.5)
  })

  it('clamps timing offsets to the supported presets', () => {
    expect(clampTimingOffsetSec(-15)).toBe(-10)
    expect(clampTimingOffsetSec(15)).toBe(10)
    expect(clampTimingOffsetSec(-10)).toBe(-10)
    expect(clampTimingOffsetSec(10)).toBe(10)
    expect(clampTimingOffsetSec(2.6)).toBe(3)
  })

  it('applies integer timing offsets using normalized speed', () => {
    expect(effectiveReferencePosition({ normalized_car_position: 0.5, timing_offset_sec: -3 }, 0.02)).toBeCloseTo(0.44)
    expect(effectiveReferencePosition({ normalized_car_position: 0.5, timing_offset_sec: 2 }, 0.02)).toBeCloseTo(0.54)
  })

  it('wraps timing offsets across the finish line', () => {
    expect(effectiveReferencePosition({ normalized_car_position: 0.02, timing_offset_sec: -3 }, 0.02)).toBeCloseTo(0.96)
    expect(effectiveReferencePosition({ normalized_car_position: 0.98, timing_offset_sec: 2 }, 0.02)).toBeCloseTo(0.02)
  })

  it('estimates normalized speed from position deltas, including wrap', () => {
    expect(normalizedSpeedPerSecond(0.1, 0.2, 1000)).toBeCloseTo(0.1)
    expect(normalizedSpeedPerSecond(0.95, 0.05, 1000)).toBeCloseTo(0.1)
  })

  it('arms references level-triggered from the first completed lap (PIP-220)', () => {
    expect(shouldArmTrackVoiceReferences(null)).toBe(false)
    expect(shouldArmTrackVoiceReferences(undefined)).toBe(false)
    expect(shouldArmTrackVoiceReferences(0)).toBe(false)
    expect(shouldArmTrackVoiceReferences(1)).toBe(true)
    expect(shouldArmTrackVoiceReferences(7)).toBe(true)
    expect(shouldArmTrackVoiceReferences(Number.NaN)).toBe(false)
  })

  it('treats only fresh numeric increases as lap increments, not stale-data recoveries', () => {
    expect(isLapCountIncrement(0, 1)).toBe(true)
    expect(isLapCountIncrement(3, 4)).toBe(true)
    expect(isLapCountIncrement(1, 1)).toBe(false)
    expect(isLapCountIncrement(2, 1)).toBe(false)
    expect(isLapCountIncrement(null, 1)).toBe(false)
    expect(isLapCountIncrement(1, null)).toBe(false)
    expect(isLapCountIncrement(undefined, 2)).toBe(false)
  })

  it('detects reference crossings, including finish-line wrap', () => {
    expect(crossedReferencePoint(0.1, 0.4, 0.3)).toBe(true)
    expect(crossedReferencePoint(0.1, 0.4, 0.5)).toBe(false)
    expect(crossedReferencePoint(0.92, 0.08, 0.97)).toBe(true)
    expect(crossedReferencePoint(0.92, 0.08, 0.04)).toBe(true)
    expect(crossedReferencePoint(0.92, 0.08, 0.5)).toBe(false)
  })
})
