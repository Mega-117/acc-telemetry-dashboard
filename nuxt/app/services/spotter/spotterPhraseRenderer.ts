import { spotterPhrases, type SpotterPhraseKey } from '~/config/spotterPhrases'
import { formatSpotterDelta, formatSpotterSector, type SpotterSector } from './spotterFormatters'

export interface SpotterPhraseRenderInput {
  key: SpotterPhraseKey
  deltaMs?: number | null
  sector?: SpotterSector | null
  random?: () => number
}

export function renderSpotterPhrase(input: SpotterPhraseRenderInput): string {
  const phrases = spotterPhrases[input.key] || []
  const fallback = 'Spotter attivo.'
  const random = input.random || Math.random
  const template = phrases.length
    ? phrases[Math.floor(random() * phrases.length)] || phrases[0]!
    : fallback

  return template
    .replaceAll('{delta}', formatSpotterDelta(input.deltaMs))
    .replaceAll('{sector}', formatSpotterSector(input.sector))
}
