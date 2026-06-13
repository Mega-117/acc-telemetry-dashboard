import { spotterPhrases, type SpotterPhraseKey } from '~/config/spotterPhrases'
import { formatSpotterDelta, formatSpotterSector, type SpotterSector } from './spotterFormatters'

export interface SpotterPhraseRenderInput {
  key: SpotterPhraseKey
  deltaMs?: number | null
  sector?: SpotterSector | null
  random?: () => number
}

const FALLBACK_TEMPLATE = 'Spotter attivo.'

/**
 * Sceglie una variante della frase e ne ritorna indice + template. L'indice è
 * la chiave per ricostruire gli stessi mattoncini audio (PIP-103): testo a
 * schermo e voce restano sulla stessa variante.
 */
export function pickSpotterVariant(
  key: SpotterPhraseKey,
  random: () => number = Math.random
): { index: number; template: string } {
  const phrases = spotterPhrases[key] || []
  if (!phrases.length) return { index: 0, template: FALLBACK_TEMPLATE }
  const index = Math.min(Math.floor(random() * phrases.length), phrases.length - 1)
  return { index, template: phrases[index] || phrases[0]! }
}

/** Riempie gli slot {delta}/{sector} di un template con il parlato finito. */
export function fillSpotterTemplate(
  template: string,
  deltaMs?: number | null,
  sector?: SpotterSector | null
): string {
  return template
    .replaceAll('{delta}', formatSpotterDelta(deltaMs))
    .replaceAll('{sector}', formatSpotterSector(sector))
}

export function renderSpotterPhrase(input: SpotterPhraseRenderInput): string {
  const { template } = pickSpotterVariant(input.key, input.random)
  return fillSpotterTemplate(template, input.deltaMs, input.sector)
}
