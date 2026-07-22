import { describe, expect, it } from 'vitest'
import {
  CHATTERBOX_DEFAULT_PROSODY,
  CHATTERBOX_PROSODY_PRESETS,
  resolveChatterboxProsody,
} from '../../shared/chatterboxProsody'

describe('Chatterbox prosody', () => {
  it('espone quattro preset distinti con default naturale', () => {
    expect(CHATTERBOX_PROSODY_PRESETS.map(preset => preset.id)).toEqual([
      'natural',
      'calm',
      'energetic',
      'dramatic',
    ])
    expect(CHATTERBOX_DEFAULT_PROSODY).toMatchObject({ exaggeration: 0.5, cfgWeight: 0.5 })
  })

  it('usa i default quando i parametri non sono presenti', () => {
    expect(resolveChatterboxProsody({})).toEqual({ exaggeration: 0.5, cfgWeight: 0.5 })
  })

  it('accetta valori nel range e rifiuta valori non validi', () => {
    expect(resolveChatterboxProsody({ exaggeration: 0.7, cfgWeight: 0.3 })).toEqual({ exaggeration: 0.7, cfgWeight: 0.3 })
    expect(resolveChatterboxProsody({ exaggeration: 1.1, cfgWeight: 0.3 })).toBeNull()
    expect(resolveChatterboxProsody({ exaggeration: 0.5, cfgWeight: 'non-numero' })).toBeNull()
  })
})
