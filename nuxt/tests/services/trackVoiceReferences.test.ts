import { describe, expect, it } from 'vitest'
import {
  clampTimingOffsetSec,
  advanceTrackVoiceReferenceTick,
  buildReferenceSaveEntry,
  crossedReferencePoint,
  effectiveReferencePosition,
  filterPlayableTrackVoiceReferences,
  isLapCountIncrement,
  normalizedSpeedPerSecond,
  normalizeTrackName,
  normalizeTrackVoiceSpeed,
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

  it('normalizes legacy voice speeds to the nearest supported option', () => {
    expect(normalizeTrackVoiceSpeed(0.8)).toBe(1)
    expect(normalizeTrackVoiceSpeed(1.15)).toBe(1.25)
    expect(normalizeTrackVoiceSpeed(1.6)).toBe(1.5)
    expect(normalizeTrackVoiceSpeed(3)).toBe(2)
    expect(normalizeTrackVoiceSpeed(undefined)).toBe(1.25)
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

  it('clamps timing offsets at the finish line instead of wrapping (PIP-216)', () => {
    expect(effectiveReferencePosition({ normalized_car_position: 0.02, timing_offset_sec: -3 }, 0.02)).toBe(0)
    expect(effectiveReferencePosition({ normalized_car_position: 0.98, timing_offset_sec: 2 }, 0.02)).toBeCloseTo(1, 4)
    expect(effectiveReferencePosition({ normalized_car_position: 0.98, timing_offset_sec: 2 }, 0.02)).toBeLessThan(1)
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

describe('buildReferenceSaveEntry (PIP-223)', () => {
  const legacyPoint: TrackVoiceReference = {
    id: 'legacy',
    track: 'Spa',
    type: 'braking_reference',
    normalized_car_position: 0.3,
    text: 'frena tardi',
    audio_path: '/nicola.wav',
    audio_voice: 'im_nicola',
  }

  it('keeps the legacy wav when editing with the other voice selected', () => {
    const editedRow = { ...legacyPoint, text: 'testo nuovo', audio_voice: 'if_sara', audio_path: '', audio_paths: undefined }
    const saved = buildReferenceSaveEntry(legacyPoint, editedRow, 'if_sara')
    expect(saved.audio_paths).toEqual({ im_nicola: '/nicola.wav' })
    expect(saved.text).toBe('testo nuovo')
    expect(resolveTrackVoiceReferenceAudioPath(saved, 'im_nicola')).toBe('/nicola.wav')
  })

  it('migrates a legacy point without audio_voice using the default voice', () => {
    const point = { ...legacyPoint, audio_voice: undefined }
    const saved = buildReferenceSaveEntry(point, { ...point, audio_path: '', audio_paths: undefined }, 'im_nicola')
    expect(saved.audio_paths).toEqual({ if_sara: '/nicola.wav' })
  })

  it('treats an explicit audio_paths on the edited entry as authoritative', () => {
    const multiVoice = { ...legacyPoint, audio_path: '', audio_voice: undefined, audio_paths: { if_sara: '/sara.wav', im_nicola: '/nicola-2.wav' } }
    const cleared = buildReferenceSaveEntry(multiVoice, { ...multiVoice, audio_paths: { if_sara: '/sara.wav' } }, 'im_nicola')
    expect(cleared.audio_paths).toEqual({ if_sara: '/sara.wav' })
    expect(cleared.audio_path).toBe('')
    expect(cleared.audio_voice).toBe('im_nicola')
  })

  it('points audio_path at the requested voice when its wav exists', () => {
    const multiVoice = { ...legacyPoint, audio_path: '', audio_voice: undefined, audio_paths: { if_sara: '/sara.wav', im_nicola: '/nicola-2.wav' } }
    const saved = buildReferenceSaveEntry(multiVoice, { ...multiVoice }, 'if_sara')
    expect(saved.audio_path).toBe('/sara.wav')
    expect(saved.audio_voice).toBe('if_sara')
    expect(saved.audio_paths).toEqual({ if_sara: '/sara.wav', im_nicola: '/nicola-2.wav' })
  })
})

describe('advanceTrackVoiceReferenceTick (PIP-216)', () => {
  const ref = (id: string, position: number, timingOffsetSec = 0): TrackVoiceReference => ({
    id,
    track: 'Spa',
    type: 'braking_reference',
    normalized_car_position: position,
    audio_path: `/${id}.wav`,
    timing_offset_sec: timingOffsetSec,
  })
  const tick = (input: Partial<Parameters<typeof advanceTrackVoiceReferenceTick>[0]>) =>
    advanceTrackVoiceReferenceTick({
      previous: 0,
      current: 0,
      elapsedMs: 250,
      playedIds: new Set<string>(),
      references: [],
      ...input,
    })

  it('announces every point crossed in a single tick, in crossing order', () => {
    const outcome = tick({ previous: 0.30, current: 0.34, references: [ref('b', 0.33), ref('a', 0.31)] })
    expect(outcome.toAnnounce.map(point => point.id)).toEqual(['a', 'b'])
    expect([...outcome.playedIds].sort()).toEqual(['a', 'b'])
  })

  it('never repeats a point already played in the lap', () => {
    const outcome = tick({ previous: 0.30, current: 0.34, playedIds: new Set(['a']), references: [ref('a', 0.31), ref('b', 0.33)] })
    expect(outcome.toAnnounce.map(point => point.id)).toEqual(['b'])
  })

  it('treats a small backward step as jitter, not as a lap wrap', () => {
    const outcome = tick({ previous: 0.50, current: 0.45, playedIds: new Set(['a']), references: [ref('a', 0.48), ref('z', 0.99)] })
    expect(outcome.toAnnounce).toEqual([])
    expect([...outcome.playedIds]).toEqual(['a'])
  })

  it('on a real wrap announces the missed end-of-lap point once and restarts the per-lap set', () => {
    const outcome = tick({
      previous: 0.98,
      current: 0.02,
      playedIds: new Set(['mid']),
      references: [ref('mid', 0.5), ref('line', 0.9966), ref('start', 0.01)],
    })
    expect(outcome.toAnnounce.map(point => point.id)).toEqual(['line', 'start'])
    expect([...outcome.playedIds]).toEqual(['start'])
  })

  it('does not repeat an end-of-lap point already played before the wrap', () => {
    const outcome = tick({ previous: 0.98, current: 0.02, playedIds: new Set(['line']), references: [ref('line', 0.9966)] })
    expect(outcome.toAnnounce).toEqual([])
    expect(outcome.playedIds.size).toBe(0)
  })

  it('consumes points skipped by a stale-data jump without announcing them late', () => {
    const outcome = tick({ previous: 0.10, current: 0.40, references: [ref('a', 0.2), ref('b', 0.3)] })
    expect(outcome.toAnnounce).toEqual([])
    expect([...outcome.playedIds].sort()).toEqual(['a', 'b'])
  })
})
