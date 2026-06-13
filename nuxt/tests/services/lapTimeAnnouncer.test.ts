import { describe, expect, it } from 'vitest'
import { lapTimeToBricks, timeBrickPath } from '~/services/overlay/lapTimeAnnouncer'

describe('lapTimeAnnouncer (PIP-101)', () => {
  it('tempo standard: "uno quarantanove e tre" (1:49.32)', () => {
    expect(lapTimeToBricks(109_320, true)).toEqual(['num-1', 'num-49', 'e', 'num-3'])
  })

  it('arrotondamento ai decimi: 1:49.362 -> "e quattro"', () => {
    expect(lapTimeToBricks(109_362, true)).toEqual(['num-1', 'num-49', 'e', 'num-4'])
  })

  it('giro non valido: prefisso invalid prima del tempo', () => {
    expect(lapTimeToBricks(109_320, false)).toEqual(['invalid', 'num-1', 'num-49', 'e', 'num-3'])
  })

  it('sotto il minuto: niente mattoncino dei minuti', () => {
    expect(lapTimeToBricks(49_500, true)).toEqual(['num-49', 'e', 'num-5'])
  })

  it('decimi zero: dice comunque "e zero"', () => {
    expect(lapTimeToBricks(110_023, true)).toEqual(['num-1', 'num-50', 'e', 'num-0'])
  })

  it('arrotondamento che trabocca il secondo: 1:49.96 -> "uno cinquanta e zero"', () => {
    expect(lapTimeToBricks(109_960, true)).toEqual(['num-1', 'num-50', 'e', 'num-0'])
  })

  it('trabocco del minuto: 1:59.97 -> "due zero e zero"', () => {
    expect(lapTimeToBricks(119_970, true)).toEqual(['num-2', 'num-0', 'e', 'num-0'])
  })

  it('tempo nullo: solo l eventuale "non valido", nessun numero', () => {
    expect(lapTimeToBricks(null, true)).toEqual([])
    expect(lapTimeToBricks(0, true)).toEqual([])
    expect(lapTimeToBricks(null, false)).toEqual(['invalid'])
  })

  it('i path dei mattoncini seguono il naming del generatore', () => {
    expect(timeBrickPath('num-49', 'if_sara')).toBe('/voice/qualifying/time-num-49-if_sara.wav')
    expect(timeBrickPath('invalid', 'im_nicola')).toBe('/voice/qualifying/time-invalid-im_nicola.wav')
  })
})
