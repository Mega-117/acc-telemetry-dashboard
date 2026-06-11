import { describe, expect, it } from 'vitest'
import { formatSpotterDelta, formatSpotterSector, resolveDemoKeySector } from '~/services/spotter/spotterFormatters'

describe('spotterFormatters', () => {
  it('formatta i millisecondi in parlato a decimi troncati', () => {
    expect(formatSpotterDelta(80)).toBe('meno di un decimo')
    expect(formatSpotterDelta(120)).toBe('un decimo')
    expect(formatSpotterDelta(250)).toBe('due decimi')
    expect(formatSpotterDelta(380)).toBe('tre decimi')
  })

  it('formatta i secondi senza millesimi', () => {
    expect(formatSpotterDelta(950)).toBe('nove decimi')
    expect(formatSpotterDelta(1000)).toBe('un secondo')
    expect(formatSpotterDelta(1300)).toBe('un secondo e tre')
    expect(formatSpotterDelta(1580)).toBe('un secondo e cinque')
    expect(formatSpotterDelta(2400)).toBe('oltre due secondi')
  })

  it('formatta i settori in italiano', () => {
    expect(formatSpotterSector(1)).toBe('uno')
    expect(formatSpotterSector(2)).toBe('due')
    expect(formatSpotterSector(3)).toBe('tre')
    expect(formatSpotterSector(null)).toBe('nessun settore chiaro')
  })

  it('sceglie settore demo piu forte o debole', () => {
    expect(resolveDemoKeySector([31000, 30000, 32000], 'strongest')).toBe(2)
    expect(resolveDemoKeySector([31000, 30000, 32000], 'weakest')).toBe(3)
    expect(resolveDemoKeySector([31000], 'strongest')).toBeNull()
  })
})
