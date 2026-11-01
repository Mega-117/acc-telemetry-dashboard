// PIP-667: the one list of spoken voices. Every clip is `<key>-<voiceId>.wav`; the language of the
// interface decides which pair speaks (Italian: Sara/Nicola, English: Heart/Michael). The pilot's choice
// is kept as "the woman" or "the man": switching language keeps the same kind of voice.

export type VoiceLanguage = 'it' | 'en'
export type VoiceGender = 'female' | 'male'

export const VOICE_CATALOG = [
  { id: 'if_sara', label: 'Sara', language: 'it', gender: 'female', image: '/images/voices/sara.png' },
  { id: 'im_nicola', label: 'Nicola', language: 'it', gender: 'male', image: '/images/voices/nicola.png' },
  // Until their own pictures exist (user decision 31/10: two new images), Heart and Michael show Sara's and Nicola's.
  { id: 'af_heart', label: 'Heart', language: 'en', gender: 'female', image: '/images/voices/sara.png' },
  { id: 'am_michael', label: 'Michael', language: 'en', gender: 'male', image: '/images/voices/nicola.png' },
] as const satisfies ReadonlyArray<{ id: string, label: string, language: VoiceLanguage, gender: VoiceGender, image: string }>

export type VoiceId = typeof VOICE_CATALOG[number]['id']
export type VoiceEntry = typeof VOICE_CATALOG[number]

export const VOICE_IDS: readonly VoiceId[] = VOICE_CATALOG.map(voice => voice.id)
export const DEFAULT_VOICE_ID: VoiceId = 'if_sara'

export function isVoiceId(value: unknown): value is VoiceId {
  return typeof value === 'string' && (VOICE_IDS as readonly string[]).includes(value)
}

export function voiceEntry(id: VoiceId): VoiceEntry {
  return VOICE_CATALOG.find(voice => voice.id === id) ?? VOICE_CATALOG[0]
}

export function voiceLanguage(id: VoiceId): VoiceLanguage {
  return voiceEntry(id).language
}

export function voicesForLanguage(language: VoiceLanguage): VoiceEntry[] {
  return VOICE_CATALOG.filter(voice => voice.language === language)
}

/** The voice of `language` of the same kind (woman/man) as `value`; unknown values give the woman. */
export function voiceForLanguage(value: unknown, language: VoiceLanguage): VoiceId {
  const gender = isVoiceId(value) ? voiceEntry(value).gender : 'female'
  return (VOICE_CATALOG.find(voice => voice.language === language && voice.gender === gender) ?? VOICE_CATALOG[0]).id
}
