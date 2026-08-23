import { describe, expect, it } from 'vitest'
import { presentVoiceRuntimeMessage } from '~/services/spotter/voiceRuntimePresentation'

describe('voiceRuntimePresentation', () => {
  it.each([
    undefined,
    '',
    'fetch failed',
    'Failed to fetch',
    'NetworkError when attempting to fetch resource',
    'ECONNREFUSED 127.0.0.1:5112',
  ])('nasconde il dettaglio tecnico %p', (message) => {
    expect(presentVoiceRuntimeMessage(message)).toBe('Motore vocale non disponibile.')
  })

  it('mantiene i messaggi operativi comprensibili', () => {
    expect(presentVoiceRuntimeMessage('Motore in avvio.')).toBe('Motore in avvio.')
  })

  it('supporta il fallback specifico dello stato', () => {
    expect(presentVoiceRuntimeMessage(null, 'Motore vocale non pronto.'))
      .toBe('Motore vocale non pronto.')
  })
})
