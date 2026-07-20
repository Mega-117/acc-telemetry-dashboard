/**
 * @description Validazione del copione frasi coach (PIP-259). Logica pura,
 * usata dall'endpoint di salvataggio: le CHIAVI sono un contratto col motore
 * coach (PIP-255/256) e non si aggiungono/rimuovono da UI; ogni testo deve
 * avere almeno 3 parole (Kokoro distorce i testi corti — stessa regola
 * bloccante dello script di generazione PIP-257).
 */

export const COACH_PHRASE_MIN_WORDS = 3

export interface CoachVoicePhrase {
  key: string
  text: string
  speed?: number
  enabled?: boolean
}

export interface CoachVoiceScriptDoc {
  defaultSpeed?: number
  voices?: string[]
  phrases: CoachVoicePhrase[]
  [extra: string]: unknown
}

export function coachPhraseWordCount(text: string): number {
  return String(text ?? '').replace(/,/g, ' ').split(/\s+/).filter(Boolean).length
}

export interface CoachScriptValidation {
  ok: boolean
  errors: string[]
  normalized: CoachVoiceScriptDoc | null
}

/**
 * Valida un aggiornamento del copione coach contro la versione esistente:
 * stesso set di chiavi (ne' aggiunte ne' rimosse), testi con almeno
 * COACH_PHRASE_MIN_WORDS parole, speed opzionale in [0.5, 2].
 * Ritorna il documento normalizzato (testi trimmati, struttura esistente
 * preservata) o gli errori.
 */
export function validateCoachVoiceScriptUpdate(
  existing: CoachVoiceScriptDoc,
  incoming: unknown,
): CoachScriptValidation {
  const errors: string[] = []
  const body = incoming as CoachVoiceScriptDoc | null
  if (!body || typeof body !== 'object' || !Array.isArray(body.phrases)) {
    return { ok: false, errors: ['Formato non valido: serve phrases[]'], normalized: null }
  }
  const expectedKeys = new Set(existing.phrases.map(phrase => phrase.key))
  const incomingKeys = new Set<string>()
  const normalizedPhrases: CoachVoicePhrase[] = []

  for (const phrase of body.phrases) {
    const key = String(phrase?.key ?? '')
    const text = String(phrase?.text ?? '').trim()
    if (!expectedKeys.has(key)) {
      errors.push(`Chiave sconosciuta: "${key}" (le chiavi sono un contratto col motore)`)
      continue
    }
    if (incomingKeys.has(key)) {
      errors.push(`Chiave duplicata: "${key}"`)
      continue
    }
    incomingKeys.add(key)
    const words = coachPhraseWordCount(text)
    if (words < COACH_PHRASE_MIN_WORDS) {
      errors.push(`"${key}": ${words} parole, minimo ${COACH_PHRASE_MIN_WORDS} ("${text}")`)
    }
    const normalized: CoachVoicePhrase = { key, text, enabled: phrase.enabled !== false }
    if (phrase.speed !== undefined) {
      const speed = Number(phrase.speed)
      if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
        errors.push(`"${key}": speed fuori range [0.5, 2]`)
      } else {
        normalized.speed = speed
      }
    }
    normalizedPhrases.push(normalized)
  }
  for (const key of expectedKeys) {
    if (!incomingKeys.has(key)) errors.push(`Chiave mancante: "${key}"`)
  }
  if (errors.length) return { ok: false, errors, normalized: null }
  // struttura esistente preservata: cambia solo il contenuto delle frasi
  const orderedPhrases = existing.phrases.map(
    phrase => normalizedPhrases.find(p => p.key === phrase.key)!,
  )
  return { ok: true, errors: [], normalized: { ...existing, phrases: orderedPhrases } }
}
