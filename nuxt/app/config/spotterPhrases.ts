import spotterPhrasesJson from './spotterPhrases.json'

// I template spotter (chiavi x varianti, slot {delta}/{sector}) vivono in
// spotterPhrases.json: un'unica fonte letta sia dal runtime TS sia dal
// generatore di frammenti Python (scripts/generate_spotter_bricks.py), così
// testo a schermo e mattoncini audio non possono divergere (PIP-103).
export type SpotterPhraseKey =
  | 'aheadGaining'
  | 'aheadLosing'
  | 'aheadStable'
  | 'behindClosing'
  | 'behindDropping'
  | 'behindStable'
  | 'attackWindow'

export const spotterPhrases: Record<SpotterPhraseKey, string[]> =
  spotterPhrasesJson as Record<SpotterPhraseKey, string[]>
