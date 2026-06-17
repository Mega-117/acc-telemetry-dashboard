// Scenari ridotti (PIP-98): pausa/ripresa/fine-step rimossi (ridondanti coi
// feedback visivi e col bip), avvio fuso nell'intro del primo step.
// 'lastMinute' (PIP-99): avviso a T-60s sugli step lunghi.
// 'stepStart' identifica i WAV per-step.
export type QualifyingVoiceScenario = 'sessionComplete' | 'lastMinute' | 'stepStart'

export type QualifyingVoiceId = 'if_sara' | 'im_nicola'

export interface QualifyingVoicePhrase {
  id: string
  scenario: QualifyingVoiceScenario
  voice: QualifyingVoiceId
  speed: number
  text: string
}

export const QUALIFYING_VOICE_AUDIO_DIR = '/voice/qualifying'

export const qualifyingVoiceOptions: Array<{ id: QualifyingVoiceId; label: string }> = [
  { id: 'if_sara', label: 'Sara' },
  { id: 'im_nicola', label: 'Nicola' }
]

export function resolveQualifyingVoiceId(value: unknown): QualifyingVoiceId {
  return value === 'im_nicola' ? 'im_nicola' : 'if_sara'
}

export function getQualifyingVoiceAudioPath(scenario: QualifyingVoiceScenario, voice: QualifyingVoiceId) {
  return `${QUALIFYING_VOICE_AUDIO_DIR}/${scenario}-${voice}.wav`
}

/** Path for a step-specific intro WAV (one per training+step id combo, per voice). */
export function getStepStartAudioPath(trainingId: string, stepId: string, voice: QualifyingVoiceId) {
  return `${QUALIFYING_VOICE_AUDIO_DIR}/step-${trainingId}-${stepId}-${voice}.wav`
}

export const qualifyingVoicePhrases: QualifyingVoicePhrase[] = [
  {
    id: 'session_complete_1',
    scenario: 'sessionComplete',
    voice: 'if_sara',
    speed: 1.2,
    text: "allenamento completato, ottimo lavoro. ora fatti un recap a mente: cosa e' andato bene e su cosa lavorare la prossima volta."
  },
  {
    id: 'last_minute_1',
    scenario: 'lastMinute',
    voice: 'if_sara',
    speed: 1.2,
    text: 'ultimo minuto. chiudilo bene.'
  }
]

export function getRandomQualifyingVoicePhrase(
  scenario: QualifyingVoiceScenario,
  random: () => number = Math.random
) {
  const phrases = qualifyingVoicePhrases.filter((phrase) => phrase.scenario === scenario)
  if (!phrases.length) return null
  return phrases[Math.floor(random() * phrases.length)]!
}
