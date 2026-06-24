import { describe, expect, it } from 'vitest'
import {
  crossedReferencePoint,
  filterPlayableTrackVoiceReferences,
  normalizeTrackName,
  resolveTrackVoiceReferenceAudioPath,
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

  it('detects reference crossings, including finish-line wrap', () => {
    expect(crossedReferencePoint(0.1, 0.4, 0.3)).toBe(true)
    expect(crossedReferencePoint(0.1, 0.4, 0.5)).toBe(false)
    expect(crossedReferencePoint(0.92, 0.08, 0.97)).toBe(true)
    expect(crossedReferencePoint(0.92, 0.08, 0.04)).toBe(true)
    expect(crossedReferencePoint(0.92, 0.08, 0.5)).toBe(false)
  })
})
