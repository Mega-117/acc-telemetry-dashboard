import { describe, expect, it } from 'vitest'
import {
  COACH_STATE_SCHEMA,
  POST_CORNER_OFFSET,
  advancePostCorner,
  coachPhraseKey,
  coachPhrasePath,
  createPostCornerState,
  magnitudeBucket,
  normalizeCoachState,
  resolveCoachOverride,
  type CoachFocus,
} from '~/services/spotter/coachVoiceController'
import type { TrackVoiceReference } from '~/services/spotter/trackVoiceReferences'

const FOCUS: CoachFocus = {
  cornerId: 3,
  cornerName: 'Bruxelles',
  apexNormPos: 0.42,
  metric: 'brake_point',
  direction: 'later',
  magnitude: 22,
  timeLostS: 0.14,
}

function makeReference(id: string, position: number, audioPath = `acc-voice://references/spa/${id}.wav`): TrackVoiceReference {
  return {
    id,
    track: 'Spa',
    car: '',
    type: 'braking_reference',
    normalized_car_position: position,
    label: id,
    text: 'frase di prova lunga',
    enabled: true,
    audio_path: audioPath,
  } as unknown as TrackVoiceReference
}

describe('normalizeCoachState', () => {
  it('accetta lo schema v1 e scarta il resto', () => {
    expect(normalizeCoachState(null)).toBeNull()
    expect(normalizeCoachState({ schema: 'altro' })).toBeNull()
    const state = normalizeCoachState({
      schema: COACH_STATE_SCHEMA,
      track: 'spa',
      car: 'ferrari_296_gt3',
      laps_observed: 4,
      last_lap_outcome: 'improved',
      focus: {
        corner_id: 3, apex_norm_pos: 0.42, metric: 'brake_point',
        direction: 'later', magnitude: 22, time_lost_s: 0.14,
      },
    })
    expect(state).not.toBeNull()
    expect(state?.focus?.cornerId).toBe(3)
    expect(state?.lastLapOutcome).toBe('improved')
  })

  it('focus malformato -> stato valido ma senza focus', () => {
    const state = normalizeCoachState({
      schema: COACH_STATE_SCHEMA,
      track: 'spa',
      car: 'x',
      focus: { corner_id: 1, apex_norm_pos: 7, metric: 'boh', direction: 'later' },
    })
    expect(state).not.toBeNull()
    expect(state?.focus).toBeNull()
  })
})

describe('frasi coach', () => {
  it('chiave = metrica_direzione_bucket e path per voce', () => {
    expect(coachPhraseKey(FOCUS)).toBe('brake_point_later_small')
    expect(coachPhraseKey({ ...FOCUS, magnitude: 60 })).toBe('brake_point_later_big')
    expect(coachPhrasePath('outcome_improved', 'im_nicola'))
      .toBe('acc-voice://coach/outcome_improved-im_nicola.wav')
  })

  it('bucket per metrica con soglie dedicate', () => {
    expect(magnitudeBucket('brake_point', 20)).toBe('small')
    expect(magnitudeBucket('brake_point', 40)).toBe('big')
    expect(magnitudeBucket('vmin', 6)).toBe('small')
    expect(magnitudeBucket('vmin', 12)).toBe('big')
  })
})

describe('resolveCoachOverride', () => {
  it('sceglie il marker piu vicino a monte dell apex della curva-focus', () => {
    const references = [
      makeReference('lontano', 0.30),
      makeReference('giusto', 0.40),
      makeReference('oltre_apex', 0.43),
    ]
    const override = resolveCoachOverride(FOCUS, references, 'if_sara')
    expect(override?.referenceId).toBe('giusto')
    expect(override?.correctionPath).toBe('acc-voice://coach/brake_point_later_small-if_sara.wav')
    expect(override?.fallbackPath).toContain('giusto')
  })

  it('nessun marker in finestra o niente focus -> nessun override', () => {
    expect(resolveCoachOverride(FOCUS, [makeReference('lontano', 0.1)], 'if_sara')).toBeNull()
    expect(resolveCoachOverride(null, [makeReference('giusto', 0.40)], 'if_sara')).toBeNull()
  })
})

describe('advancePostCorner', () => {
  it('suona una volta al superamento di apex+offset, poi tace fino al giro dopo', () => {
    let state = createPostCornerState()
    const input = { focus: FOCUS, outcome: 'improved' as const, voice: 'im_nicola' }
    const trigger = FOCUS.apexNormPos + POST_CORNER_OFFSET

    let step = advancePostCorner(state, { ...input, position: trigger - 0.01 })
    state = step.state
    expect(step.path).toBeNull()

    step = advancePostCorner(state, { ...input, position: trigger + 0.005 })
    state = step.state
    expect(step.path).toBe('acc-voice://coach/outcome_improved-im_nicola.wav')

    // stesso giro: non risuona
    step = advancePostCorner(state, { ...input, position: trigger + 0.02 })
    state = step.state
    expect(step.path).toBeNull()

    // fine giro realistica (polling 250ms: si passa vicino a 1.0) poi wrap
    for (const position of [0.7, 0.95]) {
      step = advancePostCorner(state, { ...input, position })
      state = step.state
    }
    step = advancePostCorner(state, { ...input, position: 0.01 })
    state = step.state
    expect(step.path).toBeNull()
    step = advancePostCorner(state, { ...input, position: trigger - 0.005 })
    state = step.state
    step = advancePostCorner(state, { ...input, position: trigger + 0.005 })
    expect(step.path).not.toBeNull()
  })

  it('senza focus o senza esito resta muto', () => {
    let state = createPostCornerState()
    let step = advancePostCorner(state, { position: 0.1, focus: null, outcome: 'improved', voice: 'x' })
    state = step.state
    step = advancePostCorner(state, { position: 0.9, focus: null, outcome: 'improved', voice: 'x' })
    expect(step.path).toBeNull()
    step = advancePostCorner(state, { position: 0.95, focus: FOCUS, outcome: null, voice: 'x' })
    expect(step.path).toBeNull()
  })

  it('il jitter di posizione (passo indietro piccolo) non azzera il giro', () => {
    let state = createPostCornerState()
    const input = { focus: FOCUS, outcome: 'worse' as const, voice: 'if_sara' }
    const trigger = FOCUS.apexNormPos + POST_CORNER_OFFSET
    for (const position of [trigger - 0.01, trigger + 0.005]) {
      const step = advancePostCorner(state, { ...input, position })
      state = step.state
    }
    // jitter indietro di 0.01: NON e' un wrap
    let step = advancePostCorner(state, { ...input, position: trigger - 0.005 })
    state = step.state
    step = advancePostCorner(state, { ...input, position: trigger + 0.01 })
    expect(step.path).toBeNull()
  })
})
