import { describe, expect, it } from 'vitest'
import coachScript from '../../app/config/coachVoiceScript.json'
import {
  COACH_PHRASE_MIN_WORDS,
  coachPhraseWordCount,
  validateCoachVoiceScriptUpdate,
  type CoachVoiceScriptDoc,
} from '../../server/utils/coachVoiceScriptValidate'

const EXISTING = coachScript as unknown as CoachVoiceScriptDoc

function withText(key: string, text: string): CoachVoiceScriptDoc {
  return {
    ...EXISTING,
    phrases: EXISTING.phrases.map(phrase => phrase.key === key ? { ...phrase, text } : phrase),
  }
}

describe('coachPhraseWordCount', () => {
  it('conta le parole ignorando virgole e spazi multipli', () => {
    expect(coachPhraseWordCount('Frena un po\' più tardi')).toBe(5)
    expect(coachPhraseWordCount('Ottimo,  continua   così')).toBe(3)
    expect(coachPhraseWordCount('  ')).toBe(0)
  })
})

describe('validateCoachVoiceScriptUpdate (contro il copione VERO)', () => {
  it('il copione attuale valida contro se stesso (ogni frase >=3 parole)', () => {
    const result = validateCoachVoiceScriptUpdate(EXISTING, EXISTING)
    expect(result.ok).toBe(true)
    expect(result.normalized?.phrases).toHaveLength(EXISTING.phrases.length)
    for (const phrase of EXISTING.phrases) {
      expect(coachPhraseWordCount(phrase.text)).toBeGreaterThanOrEqual(COACH_PHRASE_MIN_WORDS)
    }
  })

  it('rifiuta un testo sotto il minimo di parole (regola Kokoro)', () => {
    const result = validateCoachVoiceScriptUpdate(EXISTING, withText('outcome_improved', 'Bravo'))
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('outcome_improved')
  })

  it('rifiuta chiavi aggiunte, rimosse o duplicate (contratto motore)', () => {
    const added = { ...EXISTING, phrases: [...EXISTING.phrases, { key: 'inventata', text: 'una frase qualsiasi' }] }
    expect(validateCoachVoiceScriptUpdate(EXISTING, added).ok).toBe(false)

    const removed = { ...EXISTING, phrases: EXISTING.phrases.slice(1) }
    expect(validateCoachVoiceScriptUpdate(EXISTING, removed).ok).toBe(false)

    const duplicated = { ...EXISTING, phrases: [EXISTING.phrases[0]!, ...EXISTING.phrases] }
    expect(validateCoachVoiceScriptUpdate(EXISTING, duplicated).ok).toBe(false)
  })

  it('normalizza: trim dei testi, ordine e struttura preservati', () => {
    const result = validateCoachVoiceScriptUpdate(EXISTING, withText('outcome_worse', '  Riprova al prossimo giro  '))
    expect(result.ok).toBe(true)
    const phrase = result.normalized?.phrases.find(p => p.key === 'outcome_worse')
    expect(phrase?.text).toBe('Riprova al prossimo giro')
    expect(result.normalized?.phrases.map(p => p.key)).toEqual(EXISTING.phrases.map(p => p.key))
    expect(result.normalized?.voices).toEqual(EXISTING.voices)
  })

  it('preserva il flag enabled (usa in pista)', () => {
    const toggled = {
      ...EXISTING,
      phrases: EXISTING.phrases.map((p, i) => i === 0 ? { ...p, enabled: false } : p),
    }
    const result = validateCoachVoiceScriptUpdate(EXISTING, toggled)
    expect(result.ok).toBe(true)
    expect(result.normalized?.phrases[0]?.enabled).toBe(false)
    expect(result.normalized?.phrases[1]?.enabled).toBe(true)
  })

  it('speed opzionale validata nel range', () => {
    const bad = {
      ...EXISTING,
      phrases: EXISTING.phrases.map((p, i) => i === 0 ? { ...p, speed: 9 } : p),
    }
    expect(validateCoachVoiceScriptUpdate(EXISTING, bad).ok).toBe(false)
    const good = {
      ...EXISTING,
      phrases: EXISTING.phrases.map((p, i) => i === 0 ? { ...p, speed: 1.2 } : p),
    }
    const result = validateCoachVoiceScriptUpdate(EXISTING, good)
    expect(result.ok).toBe(true)
    expect(result.normalized?.phrases[0]?.speed).toBe(1.2)
  })
})
