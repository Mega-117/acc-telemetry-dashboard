import { describe, expect, it } from 'vitest'
import { renderSpotterPhrase } from '~/services/spotter/spotterPhraseRenderer'

describe('spotterPhraseRenderer', () => {
  it('sostituisce delta e settore', () => {
    const text = renderSpotterPhrase({
      key: 'aheadGaining',
      deltaMs: 250,
      sector: 2,
      random: () => 0,
    })

    expect(text).toContain('due decimi')
    expect(text).toContain('settore due')
    expect(text).not.toContain('{delta}')
    expect(text).not.toContain('{sector}')
  })

  it('renderizza frasi stabili senza placeholder', () => {
    const text = renderSpotterPhrase({ key: 'behindStable', random: () => 0 })
    expect(text).toBe('Gap stabile dietro. Nessuna pressione immediata.')
  })
})
