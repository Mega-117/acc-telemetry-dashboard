// Spotter a frammenti pre-generati (PIP-103, stile lap-time PIP-101): le frasi
// templated vengono spezzate in "mattoncini" (parti letterali + valori finiti
// di {delta}/{sector}) e concatenate a runtime da WAV Kokoro pregenerati. Zero
// motore TTS sul PC utente, offline, nessuna risorsa rubata al gioco.
//
// Le parti letterali si ricavano dagli stessi template di spotterPhrases.json
// con lo stesso split del generatore Python: l'id di un mattoncino letterale è
// `lit-{key}-{variante}-{indiceParte}`, quindi i due lati non possono divergere.

import { spotterPhrases, type SpotterPhraseKey } from '~/config/spotterPhrases'
import spotterSlots from '~/config/spotterSlots.json'
import type { SpotterSector } from './spotterFormatters'

export const SPOTTER_BRICK_DIR = '/voice/spotter'

const SLOT_SPLIT_RE = /(\{delta\}|\{sector\})/

type SpotterToken =
  | { kind: 'lit'; index: number; text: string }
  | { kind: 'slot'; slot: 'delta' | 'sector' }

/** Pulisce una parte letterale: via spazi/punteggiatura iniziali, spazi finali. */
function cleanChunk(part: string): string {
  return part.replace(/^[\s.,;:]+/, '').replace(/\s+$/, '')
}

/**
 * Tokenizza un template in parti letterali (non vuote) e slot, in ordine.
 * L'indice della parte letterale è la sua posizione nello split con cattura,
 * così combacia con l'enumerazione del generatore Python.
 */
export function tokenizeSpotterTemplate(template: string): SpotterToken[] {
  const parts = template.split(SLOT_SPLIT_RE)
  const tokens: SpotterToken[] = []
  parts.forEach((part, index) => {
    if (part === '{delta}') tokens.push({ kind: 'slot', slot: 'delta' })
    else if (part === '{sector}') tokens.push({ kind: 'slot', slot: 'sector' })
    else {
      const text = cleanChunk(part)
      if (text) tokens.push({ kind: 'lit', index, text })
    }
  })
  return tokens
}

/** Id del mattoncino per il valore di {delta}, allineato a formatSpotterDelta. */
export function deltaBrickId(ms: number | null | undefined): string {
  const value = Math.abs(Math.trunc(ms || 0))
  if (value < 100) return 'delta-lt1'
  if (value >= 2000) return 'delta-over2'

  const seconds = Math.floor(value / 1000)
  const tenths = Math.floor((value % 1000) / 100)

  if (seconds <= 0) return `delta-t${Math.max(1, tenths)}`
  if (tenths <= 0) return 'delta-1s'
  return `delta-1s-t${tenths}`
}

/** Id del mattoncino per il valore di {sector}, allineato a formatSpotterSector. */
export function sectorBrickId(sector: SpotterSector | null | undefined): string {
  return `sector-${sector ?? 'none'}`
}

export interface SpotterBricksInput {
  messageKey: SpotterPhraseKey
  messageVariant?: number
  deltaMs?: number | null
  sector?: SpotterSector | null
}

/** Sequenza ordinata di id mattoncino per un evento spotter (variante fissata). */
export function spotterEventToBricks(input: SpotterBricksInput): string[] {
  const variants = spotterPhrases[input.messageKey] || []
  if (!variants.length) return []
  const variant = Math.min(Math.max(0, input.messageVariant ?? 0), variants.length - 1)
  const template = variants[variant]
  if (!template) return []

  const ids: string[] = []
  for (const token of tokenizeSpotterTemplate(template)) {
    if (token.kind === 'lit') ids.push(`lit-${input.messageKey}-${variant}-${token.index}`)
    else if (token.slot === 'delta') ids.push(deltaBrickId(input.deltaMs))
    else ids.push(sectorBrickId(input.sector))
  }
  return ids
}

/** Manifest completo id -> testo di tutti i mattoncini (per test e debug). */
export function collectSpotterBricks(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(spotterPhrases) as SpotterPhraseKey[]) {
    spotterPhrases[key].forEach((template, variant) => {
      for (const token of tokenizeSpotterTemplate(template)) {
        if (token.kind === 'lit') out[`lit-${key}-${variant}-${token.index}`] = token.text
      }
    })
  }
  for (const [id, text] of Object.entries(spotterSlots.deltas)) out[`delta-${id}`] = text
  for (const [id, text] of Object.entries(spotterSlots.sectors)) out[`sector-${id}`] = text
  return out
}

export function spotterBrickPath(id: string, voice: string): string {
  return `${SPOTTER_BRICK_DIR}/sp-${id}-${voice}.wav`
}
