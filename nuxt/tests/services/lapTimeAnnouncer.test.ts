import { describe, expect, it } from 'vitest'
import {
  LAP_TIME_AUDIO_DEFAULT_SPEED,
  LAP_TIME_AUDIO_MAX_TENTHS,
  LAP_TIME_AUDIO_MIN_TENTHS,
  buildLapTimeVoiceCatalog,
  buildLapTimeVoiceEntry,
  lapTimeTenthsFromMs,
  lapTimeToBricks,
  lapTimeVoiceFilename,
  lapTimeVoicePath,
  lapTimeVoiceText,
  resolveLapTimeVoiceEntry,
  timeBrickPath,
} from '~/services/overlay/lapTimeAnnouncer'

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

describe('lapTimeAnnouncer (PIP-155 full lap-time WAV)', () => {
  it('converte i millisecondi al primo decimo senza arrotondare', () => {
    expect(lapTimeTenthsFromMs(90_999)).toBe(909)
    expect(lapTimeTenthsFromMs(124_599)).toBe(1245)
    expect(lapTimeTenthsFromMs(0)).toBeNull()
    expect(lapTimeTenthsFromMs(null)).toBeNull()
  })

  it('genera le frasi approvate per i tempi giro', () => {
    expect(lapTimeVoiceText(909)).toBe('uno, trenta, punto nove.')
    expect(lapTimeVoiceText(1245)).toBe('due, zero quattro, punto cinque.')
    expect(lapTimeVoiceText(1303)).toBe('due, dieci, punto tre.')
  })

  it('nomina i file WAV interi in modo deterministico per voce', () => {
    expect(lapTimeVoiceFilename(909, 'if_sara')).toBe('lap-time-0909-if_sara.wav')
    expect(lapTimeVoicePath(1245, 'im_nicola')).toBe('/voice/qualifying/lap-time-1245-im_nicola.wav')
  })

  it('costruisce catalogo e entry con speed default', () => {
    expect(buildLapTimeVoiceEntry(909, 'if_sara')).toMatchObject({
      key: 'lap-time-0909',
      tenths: 909,
      speed: LAP_TIME_AUDIO_DEFAULT_SPEED,
      text: 'uno, trenta, punto nove.',
    })
    expect(buildLapTimeVoiceCatalog('if_sara', 900, 902).map(row => row.key)).toEqual([
      'lap-time-0900',
      'lap-time-0901',
      'lap-time-0902',
    ])
  })

  it('risolve solo tempi validi nel range pre-generato', () => {
    expect(resolveLapTimeVoiceEntry(90_999, true, 'if_sara')?.filename).toBe('lap-time-0909-if_sara.wav')
    expect(resolveLapTimeVoiceEntry(90_999, false, 'if_sara')).toBeNull()
    expect(resolveLapTimeVoiceEntry((LAP_TIME_AUDIO_MIN_TENTHS - 1) * 100, true, 'if_sara')).toBeNull()
    expect(resolveLapTimeVoiceEntry((LAP_TIME_AUDIO_MAX_TENTHS + 1) * 100, true, 'if_sara')).toBeNull()
  })
})
